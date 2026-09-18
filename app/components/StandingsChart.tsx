"use client";

import { useMemo, useState } from "react";

// Fixed categorical order matching PICKERS -- color follows the person, never
// their rank, so it can't repaint as the leaderboard shuffles week to week.
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

const WIDTH = 720;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 84, bottom: 28, left: 36 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * step);
  return candidates.find((c) => c >= value) ?? candidates[candidates.length - 1];
}

export default function StandingsChart({
  weekLabels,
  series,
}: {
  weekLabels: number[];
  series: { picker: string; values: number[] }[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxY = useMemo(() => {
    const allValues = series.flatMap((s) => s.values);
    return niceMax(Math.max(1, ...allValues));
  }, [series]);

  const n = weekLabels.length;
  const xAt = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) => PLOT_H - (v / maxY) * PLOT_H;

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => Math.round((maxY / count) * i));
  }, [maxY]);

  // End labels: sorted by final value so converging lines get nudged apart
  // instead of stacking on top of each other.
  const endLabels = useMemo(() => {
    const items = series
      .map((s, idx) => ({
        idx,
        picker: s.picker,
        value: s.values[s.values.length - 1] ?? 0,
        y: yAt(s.values[s.values.length - 1] ?? 0),
      }))
      .sort((a, b) => a.y - b.y);
    const minGap = 14;
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < minGap) {
        items[i].y = items[i - 1].y + minGap;
      }
    }
    return items;
  }, [series, maxY]);

  function handleMove(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const scale = WIDTH / rect.width;
    const localX = (clientX - rect.left) * scale - MARGIN.left;
    if (n <= 1) {
      setHoverIdx(0);
      return;
    }
    const idx = Math.round((localX / PLOT_W) * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  }

  if (n === 0) return null;

  const hovered = hoverIdx != null;
  const tooltipRows = hovered
    ? series
        .map((s, idx) => ({ picker: s.picker, value: s.values[hoverIdx!] ?? 0, idx }))
        .sort((a, b) => b.value - a.value)
    : [];
  const tooltipX = hovered ? MARGIN.left + xAt(hoverIdx!) : 0;
  const tooltipOnRight = tooltipX < WIDTH * 0.6;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-3xl touch-none select-none"
        role="img"
        aria-label="Cumulative season points by week for each picker"
        onPointerMove={(e) => handleMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Gridlines + Y ticks */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={PLOT_W}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="#e1e0d9"
                strokeWidth={1}
              />
              <text x={-8} y={yAt(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#898781">
                {t}
              </text>
            </g>
          ))}

          {/* X axis week labels */}
          {weekLabels.map((wk, i) => (
            <text
              key={wk}
              x={xAt(i)}
              y={PLOT_H + 18}
              textAnchor="middle"
              fontSize={10}
              fill="#898781"
            >
              Wk {wk}
            </text>
          ))}

          {/* Crosshair */}
          {hovered && (
            <line
              x1={xAt(hoverIdx!)}
              x2={xAt(hoverIdx!)}
              y1={0}
              y2={PLOT_H}
              stroke="#c3c2b7"
              strokeWidth={1}
            />
          )}

          {/* Lines */}
          {series.map((s, idx) => {
            const points = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
            return (
              <polyline
                key={s.picker}
                points={points}
                fill="none"
                stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* End markers */}
          {series.map((s, idx) => {
            const lastI = s.values.length - 1;
            if (lastI < 0) return null;
            return (
              <circle
                key={s.picker}
                cx={xAt(lastI)}
                cy={yAt(s.values[lastI])}
                r={4}
                fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                stroke="#fcfcfb"
                strokeWidth={2}
              />
            );
          })}

          {/* Hover dots */}
          {hovered &&
            series.map((s, idx) => (
              <circle
                key={s.picker}
                cx={xAt(hoverIdx!)}
                cy={yAt(s.values[hoverIdx!] ?? 0)}
                r={4}
                fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
                stroke="#fcfcfb"
                strokeWidth={2}
              />
            ))}

          {/* Direct end labels */}
          {endLabels.map(({ idx, picker, y }) => (
            <text
              key={picker}
              x={PLOT_W + 8}
              y={y}
              dy="0.32em"
              fontSize={11}
              fontWeight={600}
              fill="#52514e"
            >
              {picker}
            </text>
          ))}

          {/* Tooltip */}
          {hovered && (
            <g
              transform={`translate(${tooltipOnRight ? xAt(hoverIdx!) + 10 : xAt(hoverIdx!) - 118},4)`}
            >
              <rect
                width={108}
                height={20 + tooltipRows.length * 15}
                rx={6}
                fill="#fcfcfb"
                stroke="#c3c2b7"
                strokeWidth={1}
              />
              <text x={8} y={14} fontSize={10} fontWeight={600} fill="#0b0b0b">
                Week {weekLabels[hoverIdx!]}
              </text>
              {tooltipRows.map((row, i) => (
                <g key={row.picker} transform={`translate(8,${28 + i * 15})`}>
                  <line
                    x1={0}
                    x2={10}
                    y1={-4}
                    y2={-4}
                    stroke={SERIES_COLORS[row.idx % SERIES_COLORS.length]}
                    strokeWidth={2}
                  />
                  <text x={14} y={0} fontSize={10} fill="#52514e">
                    {row.picker}
                  </text>
                  <text x={92} y={0} textAnchor="end" fontSize={10} fontWeight={600} fill="#0b0b0b">
                    {row.value}
                  </text>
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, idx) => (
          <div key={s.picker} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
            />
            {s.picker}
          </div>
        ))}
      </div>
    </div>
  );
}
