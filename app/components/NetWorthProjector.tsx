"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_INPUTS,
  formatMoney,
  runProjection,
  type ProjectionInputs,
  type ProjectionResult,
  type YearPoint,
} from "@/lib/netWorth";

// One hue, light -> dark: the wider the band, the lighter it reads, so the
// eye lands on the median first.
const BAND_OUTER = "#cfe0f6";
const BAND_INNER = "#8fb6e8";
const MEDIAN = "#1d5fb0";
const BOUND_LINE = "#5a8fd6";

const WIDTH = 760;
const HEIGHT = 380;
const MARGIN = { top: 16, right: 96, bottom: 32, left: 64 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? raw);
}

type FieldDef = {
  key: keyof ProjectionInputs;
  label: string;
  prefix?: string;
  suffix?: string;
  step?: number;
};

const FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Where you are now",
    fields: [
      { key: "currentAge", label: "Current age" },
      { key: "investments", label: "Investments (401k, IRA, brokerage)", prefix: "$", step: 1000 },
      { key: "cash", label: "Cash & savings", prefix: "$", step: 1000 },
      { key: "otherAssets", label: "Home equity & other assets", prefix: "$", step: 1000 },
      { key: "debts", label: "Total debts", prefix: "$", step: 1000 },
      { key: "debtPayoffYears", label: "Years to pay off debt", suffix: "yrs" },
    ],
  },
  {
    title: "Saving",
    fields: [
      { key: "annualContribution", label: "Invested per year", prefix: "$", step: 1000 },
      { key: "contributionGrowth", label: "Yearly increase in savings", suffix: "%", step: 0.5 },
      { key: "retirementAge", label: "Retirement age" },
      { key: "retirementSpending", label: "Retirement spending / yr (today's $)", prefix: "$", step: 1000 },
      { key: "endAge", label: "Project until age" },
    ],
  },
  {
    title: "Market assumptions",
    fields: [
      { key: "expectedReturn", label: "Avg. investment return", suffix: "%", step: 0.5 },
      { key: "volatility", label: "Return volatility (std dev)", suffix: "%", step: 1 },
      { key: "cashRate", label: "Cash interest rate", suffix: "%", step: 0.25 },
      { key: "otherAssetGrowth", label: "Other asset appreciation", suffix: "%", step: 0.5 },
      { key: "inflation", label: "Inflation", suffix: "%", step: 0.25 },
    ],
  },
];

function NumberField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600 dark:text-gray-400">{def.label}</span>
      <div className="flex items-center rounded border border-gray-300 bg-white focus-within:border-blue-500 dark:border-gray-700 dark:bg-gray-900">
        {def.prefix && <span className="pl-2 text-gray-500">{def.prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step={def.step ?? 1}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 tabular-nums outline-none"
        />
        {def.suffix && <span className="pr-2 text-gray-500">{def.suffix}</span>}
      </div>
    </label>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function FanChart({
  points,
  retirementAge,
  realDollars,
}: {
  points: YearPoint[];
  retirementAge: number;
  realDollars: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const n = points.length;

  const { yMin, yMax, ticks } = useMemo(() => {
    const hi = Math.max(1, ...points.map((p) => p.p90));
    const lo = Math.min(0, ...points.map((p) => p.p10));
    const step = niceStep(hi - lo, 5);
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const t: number[] = [];
    for (let v = min; v <= max + step / 2; v += step) t.push(v);
    return { yMin: min, yMax: max, ticks: t };
  }, [points]);

  const xAt = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) => PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const area = (lo: keyof YearPoint, hi: keyof YearPoint) => {
    const top = points.map((p, i) => `${xAt(i)},${yAt(p[hi])}`);
    const bottom = points.map((p, i) => `${xAt(i)},${yAt(p[lo])}`).reverse();
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };
  const line = (k: keyof YearPoint) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p[k])}`).join("");

  const xTickEvery = n > 40 ? 10 : 5;
  const retireIdx = points.findIndex((p) => p.age === retirementAge);

  const last = points[n - 1];
  const endLabels = [
    { key: "p90", text: "Optimistic", value: last.p90 },
    { key: "p50", text: "Median", value: last.p50 },
    { key: "p10", text: "Pessimistic", value: last.p10 },
  ].map((l) => ({ ...l, y: yAt(l.value) }));
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 26) endLabels[i].y = endLabels[i - 1].y + 26;
  }

  function handleMove(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const localX = (clientX - rect.left) * (WIDTH / rect.width) - MARGIN.left;
    const idx = Math.round((localX / PLOT_W) * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  }

  const hp = hoverIdx != null ? points[hoverIdx] : null;
  const tipLeftPct = hoverIdx != null ? ((MARGIN.left + xAt(hoverIdx)) / WIDTH) * 100 : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="Projected net worth by age with pessimistic, median and optimistic bands"
        onPointerMove={(e) => handleMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={PLOT_W}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke={t === 0 ? "#a3a29b" : "#e1e0d9"}
                strokeWidth={1}
              />
              <text x={-8} y={yAt(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#898781">
                {formatMoney(t).replace(/\.0+(?=[KMB])/, "")}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            i % xTickEvery === 0 || i === n - 1 ? (
              <text
                key={p.age}
                x={xAt(i)}
                y={PLOT_H + 20}
                textAnchor="middle"
                fontSize={11}
                fill="#898781"
              >
                {p.age}
              </text>
            ) : null
          )}

          <path d={area("p10", "p90")} fill={BAND_OUTER} />
          <path d={area("p25", "p75")} fill={BAND_INNER} />
          <path d={line("p10")} fill="none" stroke={BOUND_LINE} strokeWidth={1} strokeDasharray="4 3" />
          <path d={line("p90")} fill="none" stroke={BOUND_LINE} strokeWidth={1} strokeDasharray="4 3" />
          <path d={line("p50")} fill="none" stroke={MEDIAN} strokeWidth={2.5} strokeLinejoin="round" />

          {retireIdx > 0 && (
            <g>
              <line
                x1={xAt(retireIdx)}
                x2={xAt(retireIdx)}
                y1={0}
                y2={PLOT_H}
                stroke="#52514e"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text x={xAt(retireIdx) + 4} y={10} fontSize={11} fill="#52514e">
                Retire
              </text>
            </g>
          )}

          {hp && (
            <g>
              <line
                x1={xAt(hoverIdx!)}
                x2={xAt(hoverIdx!)}
                y1={0}
                y2={PLOT_H}
                stroke="#52514e"
                strokeWidth={1}
              />
              {(["p90", "p50", "p10"] as const).map((k) => (
                <circle
                  key={k}
                  cx={xAt(hoverIdx!)}
                  cy={yAt(hp[k])}
                  r={4}
                  fill={k === "p50" ? MEDIAN : BOUND_LINE}
                  stroke="#fcfcfb"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          {endLabels.map((l) => (
            <g key={l.key}>
              <text x={PLOT_W + 8} y={l.y - 3} fontSize={11} fontWeight={600} fill="#52514e">
                {l.text}
              </text>
              <text x={PLOT_W + 8} y={l.y + 10} fontSize={11} fill="#898781">
                {formatMoney(l.value)}
              </text>
            </g>
          ))}
        </g>
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={HEIGHT - 2}
          textAnchor="middle"
          fontSize={11}
          fill="#898781"
        >
          Age
        </text>
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 rounded-md border border-gray-200 bg-white/95 p-2.5 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900/95"
          style={
            tipLeftPct < 60
              ? { left: `calc(${tipLeftPct}% + 12px)` }
              : { right: `calc(${100 - tipLeftPct}% + 12px)` }
          }
        >
          <div className="mb-1 font-semibold">
            Age {hp.age} · {hp.year}
          </div>
          {[
            ["Optimistic (90th)", hp.p90],
            ["Good (75th)", hp.p75],
            ["Median (50th)", hp.p50],
            ["Weak (25th)", hp.p25],
            ["Pessimistic (10th)", hp.p10],
          ].map(([label, v]) => (
            <div key={label as string} className="flex justify-between gap-2 tabular-nums">
              <span className="text-gray-500">{label}</span>
              <span className={label === "Median (50th)" ? "font-semibold" : ""}>
                {formatMoney(v as number)}
              </span>
            </div>
          ))}
          <div className="mt-1 text-[10px] text-gray-400">
            {realDollars ? "In today's dollars" : "In future (nominal) dollars"}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: MEDIAN }} />
          Median outcome
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: BAND_INNER }} />
          Likely range (25th–75th percentile)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: BAND_OUTER }} />
          Wide range (10th–90th percentile)
        </span>
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

export default function NetWorthProjector() {
  // The simulation's floating-point output can differ in the last digits
  // between server and browser engines, so results render client-side only.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [inputs, setInputs] = useState<ProjectionInputs>(DEFAULT_INPUTS);
  const [showTable, setShowTable] = useState(false);

  const set = <K extends keyof ProjectionInputs>(key: K, value: ProjectionInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  // Keep ages sane so a half-typed value doesn't produce an empty chart.
  const safe = useMemo<ProjectionInputs>(() => {
    const currentAge = Math.min(Math.max(0, inputs.currentAge), 100);
    const endAge = Math.min(Math.max(currentAge + 1, inputs.endAge), 120);
    const retirementAge = Math.min(Math.max(currentAge, inputs.retirementAge), endAge);
    return { ...inputs, currentAge, endAge, retirementAge, volatility: Math.max(0, inputs.volatility) };
  }, [inputs]);

  const result = useMemo(() => (mounted ? runProjection(safe) : null), [mounted, safe]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col gap-6 lg:w-80">
        {FIELD_GROUPS.map((g) => (
          <fieldset key={g.title} className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">{g.title}</legend>
            {g.fields.map((f) => (
              <NumberField
                key={f.key}
                def={f}
                value={inputs[f.key] as number}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </fieldset>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inputs.realDollars}
            onChange={(e) => set("realDollars", e.target.checked)}
          />
          Show in today&apos;s dollars (inflation-adjusted)
        </label>
        <button
          type="button"
          onClick={() => setInputs(DEFAULT_INPUTS)}
          className="self-start rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          Reset to example
        </button>
      </aside>

      {result ? (
        <Results
          result={result}
          inputs={safe}
          showTable={showTable}
          onToggleTable={() => setShowTable((s) => !s)}
        />
      ) : (
        <section className="order-first min-h-96 flex-1 lg:order-none" />
      )}
    </div>
  );
}

function Results({
  result,
  inputs: safe,
  showTable,
  onToggleTable,
}: {
  result: ProjectionResult;
  inputs: ProjectionInputs;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  const { points } = result;
  const now = points[0];
  const atRetire = points.find((p) => p.age === safe.retirementAge) ?? points[points.length - 1];
  const atEnd = points[points.length - 1];

  return (
    <section className="order-first flex min-w-0 flex-1 flex-col gap-6 lg:order-none">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Net worth today" value={formatMoney(now.p50)} />
        <StatTile
          label={`At retirement (${safe.retirementAge})`}
          value={formatMoney(atRetire.p50)}
          sub={`${formatMoney(atRetire.p10)} – ${formatMoney(atRetire.p90)}`}
        />
        <StatTile
          label={`At age ${safe.endAge}`}
          value={formatMoney(atEnd.p50)}
          sub={`${formatMoney(atEnd.p10)} – ${formatMoney(atEnd.p90)}`}
        />
        <StatTile
          label="Chance savings last"
          value={`${Math.round((1 - result.depletionChance) * 100)}%`}
          sub={`Investments never hit $0 through ${safe.endAge}`}
        />
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-1 text-lg font-semibold">Projected net worth</h2>
        <p className="mb-3 text-sm text-gray-500">
          {safe.simulations.toLocaleString()} simulated market paths. Middle line is the median;
          shaded bands show the range of likely outcomes. Hover for details.
        </p>
        <FanChart
          points={points}
          retirementAge={safe.retirementAge}
          realDollars={safe.realDollars}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={onToggleTable}
          className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          {showTable ? "Hide" : "Show"} year-by-year table
        </button>
        {showTable && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead className="text-xs uppercase text-gray-500">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 text-left">Age</th>
                  <th className="py-2 text-left">Year</th>
                  <th className="py-2">5th</th>
                  <th className="py-2">10th</th>
                  <th className="py-2">25th</th>
                  <th className="py-2">Median</th>
                  <th className="py-2">75th</th>
                  <th className="py-2">90th</th>
                  <th className="py-2">95th</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr
                    key={p.age}
                    className={`border-b border-gray-100 dark:border-gray-900 ${
                      p.age === safe.retirementAge ? "bg-blue-50 dark:bg-blue-950" : ""
                    }`}
                  >
                    <td className="py-1.5 text-left">{p.age}</td>
                    <td className="py-1.5 text-left text-gray-500">{p.year}</td>
                    <td className="py-1.5">{formatMoney(p.p5)}</td>
                    <td className="py-1.5">{formatMoney(p.p10)}</td>
                    <td className="py-1.5">{formatMoney(p.p25)}</td>
                    <td className="py-1.5 font-semibold">{formatMoney(p.p50)}</td>
                    <td className="py-1.5">{formatMoney(p.p75)}</td>
                    <td className="py-1.5">{formatMoney(p.p90)}</td>
                    <td className="py-1.5">{formatMoney(p.p95)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Investment returns are drawn each year from a lognormal distribution with the average and
        volatility you set. Cash, other assets and inflation grow at fixed rates; debt is paid
        down evenly. Contributions stop at retirement, after which spending is withdrawn from cash
        first, then investments. This is an estimate for planning, not financial advice.
      </p>
    </section>
  );
}
