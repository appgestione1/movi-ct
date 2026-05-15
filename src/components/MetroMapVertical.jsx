import { STATIONS } from '../data/schedule';

const STATION_H = 50;
const SVG_H = STATIONS.length * STATION_H;
const SVG_W = 88;
const LINE_X = 28;
const DOT_R = 7;
const N = STATIONS.length;

// Stesicoro (idx 11) at top, Monte Po (idx 0) at bottom
function fy(idx) { return (N - 1 - idx) * STATION_H + STATION_H / 2; }

export default function MetroMapVertical({ selectedIdx, destinationIdx, trainPositions = [] }) {
  return (
    <div className="metro-vertical-wrap">
      <svg width={SVG_W} height={SVG_H} aria-label="Linea metro FCE">
        <defs>
          <filter id="vglow-red" x="-80%" y="-20%" width="260%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="vglow-cyan" x="-80%" y="-20%" width="260%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="vlineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c1121f" />
            <stop offset="50%" stopColor="#e63946" />
            <stop offset="100%" stopColor="#c1121f" />
          </linearGradient>
        </defs>

        {/* Vertical track */}
        <rect
          x={LINE_X - 4} y={STATION_H / 2}
          width={8} height={SVG_H - STATION_H}
          rx={4} fill="url(#vlineGrad)" filter="url(#vglow-red)"
        />

        {/* Route segment highlight */}
        {selectedIdx != null && destinationIdx != null && (() => {
          const from = Math.min(selectedIdx, destinationIdx);
          const to   = Math.max(selectedIdx, destinationIdx);
          // In flipped layout, higher idx = smaller y (higher up)
          const yTop = fy(to);
          const yBot = fy(from);
          return (
            <rect
              x={LINE_X - 4} y={yTop}
              width={8} height={yBot - yTop}
              rx={4} fill="rgba(255,255,255,0.18)"
            />
          );
        })()}

        {/* Trains — smooth vertical movement */}
        {trainPositions.map((t, i) => {
          const y = fy(t.position);
          // Going to Stesicoro (idx 11) = going UP in flipped layout → ▲
          const goesUp = t.direction === 'stesicoro';
          const color  = goesUp ? '#4fc3f7' : '#a8dadc';
          return (
            <g key={i} style={{ transform: `translateY(${y}px)`, transition: 'transform 1s linear' }}>
              <circle cx={LINE_X} cy={0} r={14} fill={color} opacity={0.15} />
              <circle cx={LINE_X} cy={0} r={10} fill={color} filter="url(#vglow-cyan)" />
              <text x={LINE_X} y={1} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill="#0d1b2a" fontWeight="bold">
                {goesUp ? '▲' : '▼'}
              </text>
            </g>
          );
        })}

        {/* Station dots */}
        {STATIONS.map((s, i) => {
          const y = fy(i);
          const isBoarding    = i === selectedIdx;
          const isDestination = i === destinationIdx;
          const isTerminal    = i === 0 || i === STATIONS.length - 1;
          const dotColor    = isBoarding ? '#e63946' : isDestination ? '#4fc3f7' : '#ffffff';
          const strokeColor = isBoarding || isDestination ? '#fff' : '#c1121f';
          return (
            <g key={s.id}>
              {(isBoarding || isDestination) && (
                <circle cx={LINE_X} cy={y} r={DOT_R + 7}
                  fill={dotColor} opacity={0.15} />
              )}
              <circle cx={LINE_X} cy={y}
                r={isTerminal ? DOT_R + 3 : DOT_R}
                fill={dotColor} stroke={strokeColor} strokeWidth={2}
                filter={isBoarding || isDestination ? 'url(#vglow-red)' : undefined}
              />
              <text
                x={LINE_X + 16} y={y + 1}
                dominantBaseline="middle"
                fontSize={isBoarding || isDestination ? 10 : 9}
                fill={isBoarding ? '#e63946' : isDestination ? '#4fc3f7' : '#6c8aad'}
                fontWeight={isBoarding || isDestination ? '700' : '400'}
              >
                {s.short}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
