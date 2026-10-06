// Monte Carlo net-worth projection. Pure functions only so the client
// component can re-run it on every input change.

export type ProjectionInputs = {
  currentAge: number;
  retirementAge: number;
  endAge: number;
  investments: number; // market-exposed balances (401k, IRA, brokerage)
  cash: number; // savings / checking
  otherAssets: number; // home equity, vehicles, etc.
  debts: number; // total outstanding debt
  debtPayoffYears: number; // debt shrinks linearly to zero over this span
  annualContribution: number; // added to investments each working year
  contributionGrowth: number; // % per year raise in contributions
  expectedReturn: number; // % nominal mean annual return on investments
  volatility: number; // % std dev of annual investment return
  cashRate: number; // % interest on cash
  otherAssetGrowth: number; // % appreciation on other assets
  inflation: number; // % per year
  retirementSpending: number; // today's dollars withdrawn per retired year
  realDollars: boolean; // report in today's dollars
  simulations: number;
};

export type PercentileKey = "p5" | "p10" | "p25" | "p50" | "p75" | "p90" | "p95";

export type YearPoint = {
  age: number;
  year: number;
} & Record<PercentileKey, number>;

export type ProjectionResult = {
  points: YearPoint[];
  depletionChance: number; // share of runs whose investments hit zero in retirement
};

export const DEFAULT_INPUTS: ProjectionInputs = {
  currentAge: 35,
  retirementAge: 65,
  endAge: 90,
  investments: 150_000,
  cash: 25_000,
  otherAssets: 120_000,
  debts: 40_000,
  debtPayoffYears: 8,
  annualContribution: 20_000,
  contributionGrowth: 3,
  expectedReturn: 7,
  volatility: 15,
  cashRate: 3,
  otherAssetGrowth: 3,
  inflation: 2.5,
  retirementSpending: 60_000,
  realDollars: true,
  simulations: 2000,
};

// Seeded PRNG so the same inputs always draw the same chart (no flicker
// between renders, and server/client output matches).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runProjection(inp: ProjectionInputs): ProjectionResult {
  const years = Math.max(1, Math.round(inp.endAge - inp.currentAge));
  const runs = Math.max(100, Math.round(inp.simulations));
  const rand = mulberry32(1234567);

  const mu = inp.expectedReturn / 100;
  const sigma = inp.volatility / 100;
  // Lognormal returns: pick log-mean so the arithmetic mean equals `mu`.
  const logSigma = Math.sqrt(Math.log(1 + (sigma * sigma) / ((1 + mu) * (1 + mu))));
  const logMu = Math.log(1 + mu) - (logSigma * logSigma) / 2;
  const infl = inp.inflation / 100;
  const debtStep = inp.debtPayoffYears > 0 ? inp.debts / inp.debtPayoffYears : inp.debts;

  // grid[year][run]
  const grid = Array.from({ length: years + 1 }, () => new Float64Array(runs));
  let depleted = 0;

  for (let r = 0; r < runs; r++) {
    let inv = inp.investments;
    let cash = inp.cash;
    let other = inp.otherAssets;
    let debt = inp.debts;
    let contribution = inp.annualContribution;
    let priceLevel = 1;
    let hitZero = false;

    grid[0][r] = inv + cash + other - debt;

    for (let y = 1; y <= years; y++) {
      const age = inp.currentAge + y;
      const ret = Math.exp(logMu + logSigma * gaussian(rand)) - 1;
      priceLevel *= 1 + infl;

      inv *= 1 + ret;
      cash *= 1 + inp.cashRate / 100;
      other *= 1 + inp.otherAssetGrowth / 100;
      debt = Math.max(0, debt - debtStep);

      if (age <= inp.retirementAge) {
        inv += contribution;
        contribution *= 1 + inp.contributionGrowth / 100;
      } else {
        let need = inp.retirementSpending * priceLevel;
        const fromCash = Math.min(cash, need);
        cash -= fromCash;
        need -= fromCash;
        inv -= need;
        if (inv < 0) {
          inv = 0;
          hitZero = true;
        }
      }

      const nominal = inv + cash + other - debt;
      grid[y][r] = inp.realDollars ? nominal / priceLevel : nominal;
    }
    if (hitZero) depleted++;
  }

  const startYear = new Date().getFullYear();
  const points: YearPoint[] = grid.map((col, y) => {
    const sorted = col.slice().sort();
    return {
      age: inp.currentAge + y,
      year: startYear + y,
      p5: percentile(sorted, 0.05),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
    };
  });

  return { points, depletionChance: depleted / runs };
}

export function formatMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}
