import { getDayType, fetchRouteData, timeToMins } from './busCalculator';

let _stopsIndex = null;
let _stopRoutes = null;

export async function loadPlannerData() {
  if (!_stopsIndex) {
    [_stopsIndex, _stopRoutes] = await Promise.all([
      fetch('/gtfs/stops_index.json').then(r => r.json()),
      fetch('/gtfs/stop_routes.json').then(r => r.json()),
    ]);
  }
  return { stopsIndex: _stopsIndex, stopRoutes: _stopRoutes };
}

export function searchStops(query, stopsIndex, max = 8) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  return stopsIndex
    .filter(s => s.name.toLowerCase().includes(q))
    .slice(0, max);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function findNearbyStops(lat, lon, stopsIndex, maxMeters = 400) {
  return stopsIndex
    .map(s => ({ ...s, dist: Math.round(haversine(lat, lon, s.lat, s.lon)) }))
    .filter(s => s.dist <= maxMeters)
    .sort((a, b) => a.dist - b.dist);
}

// Returns list of { routeId, routeShort, direction, originStop, destStop, walkMeters }
export async function findJourneys(originStop, destStop, stopsIndex, stopRoutes, date = new Date()) {
  const dayType = getDayType(date);
  const routesFromOrigin = stopRoutes[originStop.id] ?? [];
  const results = [];

  // For each route departing from origin
  for (const { routeId, short, dir, seq: originSeq } of routesFromOrigin) {
    let routeData;
    try { routeData = await fetchRouteData(routeId); }
    catch { continue; }

    const stops = routeData.directions?.[dir]?.[dayType] ?? [];
    if (!stops.length) continue;

    // Check if destination stop is directly on this route AFTER origin
    const destInRoute = stops.find(s => s.id === destStop.id);
    if (destInRoute) {
      const destSeq = stops.indexOf(destInRoute);
      if (destSeq > originSeq) {
        const originStopData = stops.find(s => s.id === originStop.id);
        if (originStopData) {
          const nowMins = date.getHours() * 60 + date.getMinutes();
          const nextTimes = originStopData.times
            .map(timeToMins)
            .filter(t => t >= nowMins)
            .slice(0, 3);
          if (nextTimes.length) {
            results.push({
              routeId, routeShort: short, direction: dir,
              originStop, destStop,
              walkMeters: 0, walkToStop: null,
              nextDepartures: nextTimes.map(t => {
                const h = Math.floor(t/60)%24, m = t%60;
                return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
              }),
              stops,
            });
          }
        }
      }
    } else {
      // No direct stop — check if any stop on this route is close to destination
      const WALK_LIMIT = 500; // meters
      for (const routeStop of stops) {
        if (routeStop.lat == null) continue;
        const dist = Math.round(haversine(routeStop.lat, routeStop.lon, destStop.lat, destStop.lon));
        if (dist <= WALK_LIMIT) {
          const routeStopSeq = stops.indexOf(routeStop);
          if (routeStopSeq > originSeq) {
            const originStopData = stops.find(s => s.id === originStop.id);
            if (originStopData) {
              const nowMins = date.getHours() * 60 + date.getMinutes();
              const nextTimes = originStopData.times
                .map(timeToMins)
                .filter(t => t >= nowMins)
                .slice(0, 3);
              if (nextTimes.length) {
                results.push({
                  routeId, routeShort: short, direction: dir,
                  originStop, destStop: { ...routeStop, isNearby: true },
                  walkMeters: dist, walkToStop: routeStop,
                  nextDepartures: nextTimes.map(t => {
                    const h = Math.floor(t/60)%24, m = t%60;
                    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                  }),
                  stops,
                });
              }
            }
            break; // one closest stop per route
          }
        }
      }
    }

    if (results.length >= 6) break;
  }

  // Sort by earliest next departure
  return results.sort((a, b) => {
    const at = a.nextDepartures[0] ?? '99:99';
    const bt = b.nextDepartures[0] ?? '99:99';
    return at.localeCompare(bt);
  });
}

// Returns transfer journeys (1 or 2 cambi, up to 3 legs).
// Each result: { type:'transfer', legs:2|3, leg1RouteShort, leg1RouteId, leg1Direction,
//   leg2RouteShort, [leg3RouteShort, transfer2Stop], transferStop, nextDepartures }
export async function findTransferJourneys(originStop, destStop, stopsIndex, stopRoutes, date = new Date()) {
  const dayType = getDayType(date);
  const routesFromOrigin = stopRoutes[originStop.id] ?? [];

  // Fast lookup: stopId → stop object
  const stopsById = {};
  for (const s of stopsIndex) stopsById[s.id] = s;

  // Reverse index: 'routeId|dir' → [stopId, ...]
  const routeToStops = {};
  for (const [sid, routes] of Object.entries(stopRoutes)) {
    for (const r of routes) {
      const k = `${r.routeId}|${r.dir}`;
      if (!routeToStops[k]) routeToStops[k] = [];
      routeToStops[k].push(sid);
    }
  }

  // destRouteKeys: routes that directly reach destination (or within 400m)
  const destRouteKeys = new Set();
  for (const r of (stopRoutes[destStop.id] ?? [])) destRouteKeys.add(`${r.routeId}|${r.dir}`);
  for (const s of stopsIndex) {
    if (s.id === destStop.id) continue;
    if (haversine(s.lat, s.lon, destStop.lat, destStop.lon) <= 400) {
      for (const r of (stopRoutes[s.id] ?? [])) destRouteKeys.add(`${r.routeId}|${r.dir}`);
    }
  }
  if (destRouteKeys.size === 0) return [];

  // twoHopDestRouteKeys: routes that reach, in one more step, a destRoute stop
  const twoHopKeys = new Set();
  for (const dk of destRouteKeys) {
    for (const sid of (routeToStops[dk] ?? [])) {
      for (const r of (stopRoutes[sid] ?? [])) {
        const k = `${r.routeId}|${r.dir}`;
        if (!destRouteKeys.has(k)) twoHopKeys.add(k);
      }
    }
  }

  const results = [];
  const seen = new Set();

  for (const { routeId, short, dir } of routesFromOrigin) {
    if (results.length >= 4) break;
    let routeData;
    try { routeData = await fetchRouteData(routeId); }
    catch { continue; }

    const stops = routeData.directions?.[dir]?.[dayType] ?? [];
    if (!stops.length) continue;

    const originIdx = stops.findIndex(s => s.id === originStop.id);
    if (originIdx === -1) continue;

    const nowMins = date.getHours() * 60 + date.getMinutes();
    const leg1Times = stops[originIdx].times.map(timeToMins).filter(t => t >= nowMins).slice(0, 2);
    if (!leg1Times.length) continue;

    const fmtTimes = leg1Times.map(t => {
      const h = Math.floor(t / 60) % 24, m = t % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });

    for (let i = originIdx + 1; i < stops.length; i++) {
      const t1Stop = stops[i];
      if (!t1Stop) continue;

      for (const r2 of (stopRoutes[t1Stop.id] ?? [])) {
        if (r2.routeId === routeId) continue;
        const r2k = `${r2.routeId}|${r2.dir}`;

        // ── 1-cambio ──────────────────────────────────────
        if (destRouteKeys.has(r2k)) {
          const key = `1|${short}→${r2.short}@${t1Stop.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              type: 'transfer', legs: 2,
              leg1RouteShort: short, leg1RouteId: routeId, leg1Direction: dir,
              leg2RouteShort: r2.short, leg2RouteId: r2.routeId,
              transferStop: t1Stop,
              nextDepartures: fmtTimes,
            });
          }
          if (results.length >= 4) break;
          continue;
        }

        // ── 2-cambi (fallback) ────────────────────────────
        if (results.length === 0 && twoHopKeys.has(r2k)) {
          // find a stop on r2 that connects to destination
          for (const t2sid of (routeToStops[r2k] ?? [])) {
            if (t2sid === t1Stop.id) continue;
            for (const r3 of (stopRoutes[t2sid] ?? [])) {
              if (r3.routeId === r2.routeId) continue;
              if (!destRouteKeys.has(`${r3.routeId}|${r3.dir}`)) continue;
              const t2Stop = stopsById[t2sid];
              if (!t2Stop) continue;
              const key = `2|${short}→${r2.short}→${r3.short}@${t1Stop.id}@${t2sid}`;
              if (!seen.has(key)) {
                seen.add(key);
                results.push({
                  type: 'transfer', legs: 3,
                  leg1RouteShort: short, leg1RouteId: routeId, leg1Direction: dir,
                  leg2RouteShort: r2.short, leg2RouteId: r2.routeId,
                  leg3RouteShort: r3.short, leg3RouteId: r3.routeId,
                  transferStop: t1Stop,
                  transfer2Stop: t2Stop,
                  nextDepartures: fmtTimes,
                });
              }
              if (results.length >= 4) break;
            }
            if (results.length >= 4) break;
          }
        }
      }
      if (results.length >= 4) break;
    }
  }

  return results;
}
