export function getDayType(date = new Date()) {
  const dow = date.getDay();
  if (dow === 0) return 'domenica';
  if (dow === 6) return 'sabato';
  return 'feriale';
}

export function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export async function fetchRoutes() {
  const res = await fetch('/gtfs/routes.json');
  return res.json();
}

const _routeCache = {};
export async function fetchRouteData(routeId) {
  if (_routeCache[routeId]) return _routeCache[routeId];
  const res = await fetch(`/gtfs/routes/${routeId}.json`);
  if (!res.ok) throw new Error(`Route not found: ${routeId}`);
  _routeCache[routeId] = await res.json();
  return _routeCache[routeId];
}

export function getStopsForDirection(routeData, direction, dayType) {
  return routeData?.directions?.[direction]?.[dayType] ?? [];
}

export function getNextDepartures(stops, stopId, date = new Date(), count = 3) {
  const stop = stops.find(s => s.id === stopId);
  if (!stop || !stop.times?.length) return [];
  const nowMins = date.getHours() * 60 + date.getMinutes();
  return stop.times
    .map(timeToMins)
    .filter(t => t >= nowMins)
    .slice(0, count)
    .map(t => ({
      time: minsToTime(t),
      minsFromNow: Math.round(t - nowMins),
    }));
}
