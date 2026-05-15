import { STATIONS } from '../data/schedule';

const STATION_W = 76;
const PADDING = 44;
const SVG_W = STATIONS.length * STATION_W + PADDING * 2;
const SVG_H = 100;
const LINE_Y = 42;
const DOT_R = 8;

export default function MetroMap({ selectedIdx, destinationIdx, trainPositions = [], onSelectStation }) {
  return (
    <div className="metro-map-wrap">
      <svg
        width={SVG_W}
        height={SVG_H}
        style={{ display: 'block', minWidth: SVG_W }}
        aria-label="Linea metropolitana FCE"
      >
        <defs>
          <filter id="glow-red" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-cyan" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c1121f" />
            <stop offset="50%" stopColor="#e63946" />
            <stop offset="100%" stopColor="#c1121f" />
          </linearGradient>
        </defs>

        {/* Track shadow */}
        <rect
          x={PADDING} y={LINE_Y - 5}
          width={SVG_W - PADDING * 2} height={10} rx={5}
          fill="rgba(0,0,0,0.4)" transform="translate(0,3)"
        />

        {/* Red track */}
        <rect
          x={PADDING} y={LINE_Y - 5}
          width={SVG_W - PADDING * 2} height={10} rx={5}
          fill="url(#lineGrad)" filter="url(#glow-red)"
        />

        {/* Route segment highlight */}
        {selectedIdx !== undefined && destinationIdx !== undefined && (
          (() => {
            const from = Math.min(selectedIdx, destinationIdx);
            const to   = Math.max(selectedIdx, destinationIdx);
            const x1 = PADDING + from * STATION_W;
            const x2 = PADDING + to   * STATION_W;
            return (
              <rect
                x={x1} y={LINE_Y - 5}
                width={x2 - x1} height={10} rx={5}
                fill="rgba(255,255,255,0.15)"
              />
            );
          })()
        )}

        {/* Trains */}
        {trainPositions.map((t, i) => {
          const x = PADDING + t.position * STATION_W;
          const isToStesicoro = t.direction === 'stesicoro';
          const color = isToStesicoro ? '#4fc3f7' : '#a8dadc';
          return (
            <g key={i} style={{ transform: `translateX(${x}px)`, transition: 'transform 1s linear' }}>
              <circle cx={0} cy={LINE_Y} r={18} fill={color} opacity={0.12} />
              <circle cx={0} cy={LINE_Y} r={14} fill={color} opacity={0.18} />
              <circle cx={0} cy={LINE_Y} r={11} fill={color} filter="url(#glow-cyan)" />
              <text x={0} y={LINE_Y + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill="#0d1b2a" fontWeight="bold">
                {isToStesicoro ? '▶' : '◀'}
              </text>
            </g>
          );
        })}

        {/* Station dots */}
        {STATIONS.map((s, i) => {
          const x = PADDING + i * STATION_W;
          const isBoarding    = i === selectedIdx;
          const isDestination = i === destinationIdx;
          const isTerminal    = i === 0 || i === STATIONS.length - 1;
          const dotColor = isBoarding ? '#e63946' : isDestination ? '#4fc3f7' : '#ffffff';
          const strokeColor = isBoarding ? '#fff' : isDestination ? '#fff' : '#c1121f';
          const glowFilter = (isBoarding || isDestination) ? 'url(#glow-red)' : undefined;
          return (
            <g key={s.id} onClick={() => onSelectStation(i)} style={{ cursor: 'default' }}>
              {(isBoarding || isDestination) && (
                <circle cx={x} cy={LINE_Y} r={DOT_R + 7} fill={dotColor} opacity={0.15} />
              )}
              <circle
                cx={x} cy={LINE_Y}
                r={isTerminal ? DOT_R + 3 : DOT_R}
                fill={dotColor}
                stroke={strokeColor}
                strokeWidth={isBoarding || isDestination ? 2 : 1.5}
                filter={glowFilter}
              />
              <text x={x} y={LINE_Y + 24} textAnchor="middle"
                fontSize={isBoarding || isDestination ? 10 : 9}
                fill={isBoarding ? '#e63946' : isDestination ? '#4fc3f7' : '#7fa8c0'}
                fontWeight={isBoarding || isDestination ? '700' : '400'}>
                {s.short}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
