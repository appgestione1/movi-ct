// Correct FCE line order: Monte Po ↔ Milo ↔ ... ↔ Giovanni XXIII ↔ Stesicoro
export const STATIONS = [
  { id: 'monte-po',  name: 'Monte Po',      short: 'Monte Po'  },
  { id: 'milo',      name: 'Milo',           short: 'Milo'      },
  { id: 'fontana',   name: 'Fontana',        short: 'Fontana'   },
  { id: 'nesima',    name: 'Nesima',         short: 'Nesima'    },
  { id: 'sannullo',  name: 'San Nullo',      short: 'S. Nullo'  },
  { id: 'cibali',    name: 'Cibali',         short: 'Cibali'    },
  { id: 'borgo',     name: 'Borgo',          short: 'Borgo'     },
  { id: 'giuffrida', name: 'Giuffrida',      short: 'Giuffrida' },
  { id: 'italia',    name: 'Italia',         short: 'Italia'    },
  { id: 'galatea',   name: 'Galatea',        short: 'Galatea'   },
  { id: 'giovanni',  name: 'Giovanni XXIII', short: 'Giovanni'  },
  { id: 'stesicoro', name: 'Stesicoro',      short: 'Stesicoro' },
];

// Travel time in minutes between consecutive stations (Monte Po → Stesicoro)
const SEGMENT_TIMES = [2.5, 2.5, 2.5, 2.5, 2.0, 2.5, 2.5, 2.0, 2.0, 2.5, 2.5];

// Cumulative minutes from Monte Po to each station
export const STATION_TIMES = SEGMENT_TIMES.reduce(
  (acc, t) => [...acc, acc[acc.length - 1] + t],
  [0]
);
// [0, 2.5, 5, 7, 9, 11.5, 14, 16, 18.5, 21, 23.5, 26]

export const TOTAL_TRIP_TIME = STATION_TIMES[STATION_TIMES.length - 1]; // 26 min

function hm(h, m) { return h * 60 + m; }

function generateDepartures(firstH, firstM, lastH, lastM, freqChanges) {
  const first = hm(firstH, firstM);
  // Last time may be past midnight (e.g. 24:34 stored as minutes > 1440)
  const last = lastH < firstH ? hm(lastH + 24, lastM) : hm(lastH, lastM);
  const deps = [first];
  let cur = first;
  while (true) {
    const freq = freqChanges.find(f => cur < f.until)?.freq ?? freqChanges[freqChanges.length - 1].freq;
    cur += freq;
    if (cur > last) break;
    deps.push(cur);
  }
  return deps;
}

const WD = [{ until: hm(15, 0), freq: 10 }, { until: Infinity, freq: 13 }];
const FX = [{ until: hm(15, 0), freq: 10 }, { until: Infinity, freq: 13 }];
const SS = [{ until: Infinity, freq: 13 }];

export const SCHEDULES = {
  weekday: {
    montePo:   generateDepartures(6,  0,  21, 58, WD),
    stesicoro: generateDepartures(6, 25,  22, 30, WD),
  },
  friday: {
    montePo:   generateDepartures(6,  0,  24, 34, FX),
    stesicoro: generateDepartures(6, 25,  25,  0, FX),
  },
  saturday: {
    montePo:   generateDepartures(6,  0,  24, 25, SS),
    stesicoro: generateDepartures(6, 26,  25,  0, SS),
  },
  sunday: {
    montePo:   generateDepartures(7,  0,  21, 57, SS),
    stesicoro: generateDepartures(7, 26,  22, 30, SS),
  },
};

function dayType(day) {
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  if (day === 5) return 'friday';
  return 'weekday';
}

export function getEffectiveSchedule(date = new Date()) {
  const h = date.getHours();
  const day = date.getDay();
  const nowMins = h * 60 + date.getMinutes() + date.getSeconds() / 60;

  // Early morning (0–5:59): might still be in previous day's late-night service
  if (h < 6) {
    const prevType = dayType((day + 6) % 7);
    if (prevType === 'friday' || prevType === 'saturday') {
      return { schedule: SCHEDULES[prevType], nowMins: nowMins + 24 * 60 };
    }
  }

  return { schedule: SCHEDULES[dayType(day)], nowMins };
}
