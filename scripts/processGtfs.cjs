/**
 * GTFS processor v2 — groups times by day type (feriale / sabato / domenica).
 * Run: node scripts/processGtfs.cjs
 */
const fs     = require('fs');
const path   = require('path');
const AdmZip = require('adm-zip');

const ZIP_PATH  = path.join(__dirname, '..', 'gtfs_amts.zip');
const OUT_DIR   = path.join(__dirname, '..', 'public', 'gtfs');
const ROUTE_DIR = path.join(OUT_DIR, 'routes');

[OUT_DIR, ROUTE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].replace(/\r/g, '').split(',').map(h => h.replace(/"/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.replace(/\r/g, '').split(',').map(v => v.replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] ?? '');
    return obj;
  });
}

function readEntry(zip, name) {
  return zip.getEntry(name).getData().toString('utf8');
}

function timeToMins(t) {
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function minsToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function getDayType(dateStr) {
  const y = parseInt(dateStr.slice(0,4));
  const mo = parseInt(dateStr.slice(4,6)) - 1;
  const d = parseInt(dateStr.slice(6,8));
  const dow = new Date(y, mo, d).getDay();
  if (dow === 0) return 'domenica';
  if (dow === 6) return 'sabato';
  return 'feriale';
}

console.log('Reading GTFS…');
const zip = new AdmZip(ZIP_PATH);
const routes   = parseCsv(readEntry(zip, 'routes.txt'));
const trips    = parseCsv(readEntry(zip, 'trips.txt'));
const stops    = parseCsv(readEntry(zip, 'stops.txt'));
const calDates = parseCsv(readEntry(zip, 'calendar_dates.txt'));
const stRaw    = readEntry(zip, 'stop_times.txt');

// service_id → majority day type
const svcDayType = {};
const svcDateMap = {};
calDates.forEach(r => {
  if (r.exception_type !== '1') return;
  if (!svcDateMap[r.service_id]) svcDateMap[r.service_id] = [];
  svcDateMap[r.service_id].push(r.date);
});
for (const [sid, dates] of Object.entries(svcDateMap)) {
  const counts = { feriale: 0, sabato: 0, domenica: 0 };
  dates.forEach(d => counts[getDayType(d)]++);
  svcDayType[sid] = Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
}

// date → service_id for today lookup in the app
const dateToSvc = {};
calDates.forEach(r => { if (r.exception_type === '1') dateToSvc[r.date] = r.service_id; });

const stopMap = {};
stops.forEach(s => { stopMap[s.stop_id] = { id: s.stop_id, name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon }; });

const tripMeta = {};
trips.forEach(t => { tripMeta[t.trip_id] = { routeId: t.route_id, svcId: t.service_id, dir: t.direction_id || '0' }; });

console.log('Parsing stop_times…');
const tripStops = {};
const stLines = stRaw.split('\n');
for (let i = 1; i < stLines.length; i++) {
  const cols = stLines[i].replace(/\r/g,'').split(',').map(v => v.replace(/"/g,''));
  if (cols.length < 5) continue;
  const tripId = cols[0], depTime = cols[2], stopId = cols[3], seq = parseInt(cols[4]);
  if (!tripId || !depTime || !stopId) continue;
  if (!tripStops[tripId]) tripStops[tripId] = [];
  tripStops[tripId].push({ stopId, depMins: timeToMins(depTime), seq });
}
for (const tid of Object.keys(tripStops)) tripStops[tid].sort((a,b) => a.seq - b.seq);

console.log(`Service ID types: ${JSON.stringify(svcDayType)}`);

// Aggregate: routeId → dir → dayType → { stopSeq, longest, stopTimes }
const routeAgg = {};
for (const trip of trips) {
  const { trip_id, route_id, service_id, direction_id } = trip;
  const stList = tripStops[trip_id];
  if (!stList || !stList.length) continue;
  const dayType = svcDayType[service_id];
  if (!dayType) continue;
  const dir = direction_id || '0';

  if (!routeAgg[route_id]) routeAgg[route_id] = {};
  if (!routeAgg[route_id][dir]) routeAgg[route_id][dir] = {};
  if (!routeAgg[route_id][dir][dayType]) routeAgg[route_id][dir][dayType] = { stopSeq: [], longest: 0, stopTimes: {} };

  const agg = routeAgg[route_id][dir][dayType];
  if (stList.length > agg.longest) { agg.longest = stList.length; agg.stopSeq = stList.map(s => s.stopId); }
  for (const { stopId, depMins } of stList) {
    if (!agg.stopTimes[stopId]) agg.stopTimes[stopId] = new Set();
    agg.stopTimes[stopId].add(depMins);
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'routes.json'), JSON.stringify(routes.map(r => ({ id: r.route_id, short: r.route_short_name, name: r.route_long_name }))));
fs.writeFileSync(path.join(OUT_DIR, 'calendar.json'), JSON.stringify(dateToSvc));

const DAY_TYPES = ['feriale', 'sabato', 'domenica'];
let written = 0;
for (const [routeId, dirs] of Object.entries(routeAgg)) {
  const out = { id: routeId, directions: {} };
  for (const [dir, dts] of Object.entries(dirs)) {
    out.directions[dir] = {};
    for (const dt of DAY_TYPES) {
      const agg = dts[dt];
      if (!agg) { out.directions[dir][dt] = []; continue; }
      out.directions[dir][dt] = agg.stopSeq.map(sid => {
        const tSet = agg.stopTimes[sid];
        if (!tSet) return null;
        return { id: sid, name: stopMap[sid]?.name ?? sid, lat: stopMap[sid]?.lat, lon: stopMap[sid]?.lon, times: [...tSet].sort((a,b)=>a-b).map(minsToTime) };
      }).filter(Boolean);
    }
  }
  fs.writeFileSync(path.join(ROUTE_DIR, `${routeId}.json`), JSON.stringify(out));
  written++;
}

// ── stops_index.json (id, name, lat, lon) ─────────────────────
const stopsIndex = stops.map(s => ({
  id: s.stop_id, name: s.stop_name,
  lat: +s.stop_lat, lon: +s.stop_lon,
}));
fs.writeFileSync(path.join(OUT_DIR, 'stops_index.json'), JSON.stringify(stopsIndex));

// ── stop_routes.json: stop_id → [{routeId, routeShort, dir, seq}] ─
const stopRoutes = {};
for (const [routeId, dirs] of Object.entries(routeAgg)) {
  const route = routes.find(r => r.route_id === routeId);
  const short = route?.route_short_name ?? routeId;
  for (const [dir, dts] of Object.entries(dirs)) {
    // Use feriale canonical sequence, fall back to any day type
    const agg = dts['feriale'] || dts['sabato'] || dts['domenica'];
    if (!agg) continue;
    agg.stopSeq.forEach((sid, seq) => {
      if (!stopRoutes[sid]) stopRoutes[sid] = [];
      // avoid duplicates
      if (!stopRoutes[sid].some(x => x.routeId === routeId && x.dir === dir)) {
        stopRoutes[sid].push({ routeId, short, dir, seq });
      }
    });
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'stop_routes.json'), JSON.stringify(stopRoutes));

console.log(`Written ${written} routes + routes.json + calendar.json + stops_index.json + stop_routes.json`);
const sizes = fs.readdirSync(ROUTE_DIR).map(f => ({ f, kb: +(fs.statSync(path.join(ROUTE_DIR,f)).size/1024).toFixed(1) })).sort((a,b)=>b.kb-a.kb).slice(0,5);
console.log('Largest:', sizes.map(s=>`${s.f} ${s.kb}KB`).join(', '));
console.log(`stops_index: ${(fs.statSync(path.join(OUT_DIR,'stops_index.json')).size/1024).toFixed(1)}KB, stop_routes: ${(fs.statSync(path.join(OUT_DIR,'stop_routes.json')).size/1024).toFixed(1)}KB`);
