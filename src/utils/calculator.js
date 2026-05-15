import { STATIONS, STATION_TIMES, TOTAL_TRIP_TIME, getEffectiveSchedule } from '../data/schedule';

function minutesToTime(mins) {
  const totalMins = Math.round(mins);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Returns a float 0.0–11.0 representing smooth position along the line
// 0 = Monte Po, 11 = Stesicoro
function interpolatePosition(depMins, direction, nowMins) {
  const elapsed = nowMins - depMins;
  if (elapsed < 0) return null;
  if (elapsed > TOTAL_TRIP_TIME) return null;

  if (direction === 'montePo') {
    for (let i = 0; i < STATION_TIMES.length - 1; i++) {
      if (elapsed < STATION_TIMES[i + 1]) {
        const seg = STATION_TIMES[i + 1] - STATION_TIMES[i];
        const progress = (elapsed - STATION_TIMES[i]) / seg;
        return i + Math.max(0, Math.min(1, progress));
      }
    }
    return STATION_TIMES.length - 1;
  } else {
    // direction 'stesicoro': train goes from idx 11 → idx 0
    for (let j = 11; j > 0; j--) {
      const tJ  = TOTAL_TRIP_TIME - STATION_TIMES[j];
      const tJ1 = TOTAL_TRIP_TIME - STATION_TIMES[j - 1];
      if (elapsed < tJ1) {
        const seg = tJ1 - tJ;
        const progress = seg > 0 ? (elapsed - tJ) / seg : 0;
        return j - Math.max(0, Math.min(1, progress));
      }
    }
    return 0;
  }
}

function currentStationFromMontePo(depMins, nowMins) {
  const elapsed = nowMins - depMins;
  if (elapsed < 0 || elapsed > TOTAL_TRIP_TIME + 1) return null;
  let idx = 0;
  for (let i = 1; i < STATION_TIMES.length; i++) {
    if (elapsed >= STATION_TIMES[i]) idx = i;
  }
  return idx;
}

function currentStationFromStesicoro(depMins, nowMins) {
  const elapsed = nowMins - depMins;
  if (elapsed < 0 || elapsed > TOTAL_TRIP_TIME + 1) return null;
  let idx = 11;
  for (let i = 10; i >= 0; i--) {
    if (elapsed >= TOTAL_TRIP_TIME - STATION_TIMES[i]) idx = i;
  }
  return idx;
}

export function getNextTrains(stationIdx, date = new Date()) {
  const { schedule, nowMins } = getEffectiveSchedule(date);
  const toStesicoro = [];
  const toMontePo = [];

  for (const dep of schedule.montePo) {
    const arrival = dep + STATION_TIMES[stationIdx];
    const diff = arrival - nowMins;
    if (diff >= 0 && diff <= 90) {
      const curIdx = currentStationFromMontePo(dep, nowMins);
      toStesicoro.push({
        minsToArrive: diff,
        secsToArrive: Math.round(diff * 60),
        currentStationIdx: curIdx,
        currentStation: curIdx !== null ? STATIONS[curIdx].name : null,
        interpolatedPos: interpolatePosition(dep, 'montePo', nowMins),
        eta: minutesToTime(arrival),
        direction: 'stesicoro',
      });
      if (toStesicoro.length >= 2) break;
    }
  }

  for (const dep of schedule.stesicoro) {
    const arrival = dep + (TOTAL_TRIP_TIME - STATION_TIMES[stationIdx]);
    const diff = arrival - nowMins;
    if (diff >= 0 && diff <= 90) {
      const curIdx = currentStationFromStesicoro(dep, nowMins);
      toMontePo.push({
        minsToArrive: diff,
        secsToArrive: Math.round(diff * 60),
        currentStationIdx: curIdx,
        currentStation: curIdx !== null ? STATIONS[curIdx].name : null,
        interpolatedPos: interpolatePosition(dep, 'stesicoro', nowMins),
        eta: minutesToTime(arrival),
        direction: 'montePo',
      });
      if (toMontePo.length >= 2) break;
    }
  }

  return { toStesicoro, toMontePo };
}
