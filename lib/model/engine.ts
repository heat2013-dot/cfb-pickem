/**
 * Pick model engine. A faithful port of the offline research pipeline:
 * point-in-time opponent-adjusted team ratings (ridge regression anchored to
 * preseason priors) feed a small regularized regression that predicts how far
 * the real result lands from the betting line. Everything here is pure -- no
 * network or database access -- so it can be tested against the research code.
 */

export interface SeasonGame {
  id: number;
  week: number;
  seasonType: string;
  date: number; // ms since epoch
  neutral: boolean;
  completed: boolean;
  homeKey: string;
  awayKey: string;
  homeName: string;
  awayName: string;
  homePoints: number | null;
  awayPoints: number | null;
}

export interface LineSummary {
  spread: number | null; // home perspective: negative = home favored
  overUnder: number | null;
}

export interface AdvRow {
  gameId: number;
  team: string;
  offPlays: number | null;
  offPpa: number | null;
  offSuccess: number | null;
}

export interface Weather {
  indoors: boolean | null;
  temperature: number | null;
  windSpeed: number | null;
  precipitation: number | null;
}

export interface Priors {
  season: number;
  ratings: Record<string, Record<string, number>>;
  pace: Record<string, number>;
  mean_pace: number;
  fbs: string[];
}

interface LinearModel {
  feats: string[];
  mu: number[];
  sd: number[];
  coef: number[];
  intercept: number;
  resid_sd: number;
}

export interface ModelParams {
  total: LinearModel;
  spread: LinearModel;
  calibration: Record<"total" | "spread", { intercept: number; slope: number }>;
  tier_cutoffs: { medium: number; high: number };
  weather_median: { temp: number; wind: number; precip: number };
  hyper: { lam_pw: number; lam_po: number; lam_x: number; lam_s: number; lam_h: number; cap: number; pace_k: number };
}

export interface TargetGame {
  id: number; // CFBD game id
  homeName: string;
  awayName: string;
  startDate: number;
  spread: number | null;
  overUnder: number | null;
  neutral?: boolean;
}

export interface Prediction {
  id: number;
  edgeSpread: number | null; // predicted (home margin - market margin); >0 favors home covering
  edgeTotal: number | null; // predicted (total - line); >0 favors the over
  pSpread: number | null; // calibrated chance the spread lean wins
  pTotal: number | null;
  features: Record<string, number>;
}

const ATS_K = 4;

// ------------------------------------------------------------------ linear algebra
/** Solves A x = b for symmetric positive-definite A (flat row-major, n x n) via Cholesky. */
function solveSPD(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error("matrix not positive definite");
        L[i * n + i] = Math.sqrt(s);
      } else {
        L[i * n + j] = s / L[j * n + j];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

function accumulate(A: Float64Array, b: Float64Array, n: number, idx: number[], val: number[], y: number, w: number) {
  for (let i = 0; i < idx.length; i++) {
    if (val[i] === 0) continue;
    b[idx[i]] += w * val[i] * y;
    for (let j = 0; j < idx.length; j++) {
      if (val[j] === 0) continue;
      A[idx[i] * n + idx[j]] += w * val[i] * val[j];
    }
  }
}

function fitMargin(
  T: number,
  rows: { h: number; a: number; y: number; nn: number }[],
  prior: Float64Array,
  lam: number,
  lamH: number,
  hfa0: number
): { r: Float64Array; hfa: number } {
  const n = T + 1;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  for (const row of rows) accumulate(A, b, n, [row.h, row.a, T], [1, -1, row.nn], row.y, 1);
  for (let i = 0; i < n; i++) {
    const reg = i < T ? lam : lamH;
    A[i * n + i] += reg;
    b[i] += reg * (i < T ? prior[i] : hfa0);
  }
  const th = solveSPD(A, b, n);
  return { r: th.slice(0, T), hfa: th[T] };
}

interface OffDefRow {
  t: number;
  o: number;
  y: number;
  home: number; // +1 home, -1 away, 0 neutral
  w: number;
}

function fitOffDef(
  T: number,
  rows: OffDefRow[],
  pO: Float64Array,
  pD: Float64Array,
  lam: number,
  lamH: number,
  hfa0: number,
  mu0: number
) {
  const n = 2 * T + 2;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  for (const row of rows) {
    accumulate(A, b, n, [row.t, T + row.o, 2 * T, 2 * T + 1], [1, -1, 1, 0.5 * row.home], row.y, row.w);
  }
  for (let i = 0; i < n; i++) {
    let reg: number;
    let prior: number;
    if (i < T) { reg = lam; prior = pO[i]; }
    else if (i < 2 * T) { reg = lam; prior = pD[i - T]; }
    else if (i === 2 * T) { reg = 1e-3; prior = mu0; }
    else { reg = lamH; prior = hfa0; }
    A[i * n + i] += reg;
    b[i] += reg * prior;
  }
  const th = solveSPD(A, b, n);
  return { O: th.slice(0, T), D: th.slice(T, 2 * T), mu: th[2 * T], hfa: th[2 * T + 1] };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Reduces CFBD's per-provider lines to the median spread and total for a game. */
export function summarizeLines(lines: { spread: number | null; overUnder: number | null }[]): LineSummary {
  return {
    spread: median(lines.flatMap((l) => (l.spread == null ? [] : [l.spread]))),
    overUnder: median(lines.flatMap((l) => (l.overUnder == null ? [] : [l.overUnder]))),
  };
}

// ------------------------------------------------------------------ rating state
interface AdvFit {
  O: Float64Array;
  D: Float64Array;
  mu: number;
  hfa: number;
  fitted: boolean;
}

interface RatingState {
  pw: Float64Array;
  hfa: number;
  O: Float64Array;
  D: Float64Array;
  mu: number;
  hfa2: number;
  x: AdvFit;
  s: AdvFit;
  paceSum: Map<string, number>;
  paceN: Map<string, number>;
  ouSum: Map<string, number>;
  ouN: Map<string, number>;
}

export interface ModelInputs {
  games: SeasonGame[]; // every FBS-involved game this season (completed or not)
  lines: Map<number, LineSummary>;
  adv: AdvRow[];
  weather: Map<number, Weather>;
  priors: Priors;
  params: ModelParams;
}

export function predictGames(inp: ModelInputs, targets: TargetGame[]): Prediction[] {
  const { priors, params } = inp;
  const teams = [...[...priors.fbs].sort(), "FCS"];
  const T = teams.length;
  const ix = new Map(teams.map((t, i) => [t, i]));
  const fbsSet = new Set(priors.fbs);
  const keyOf = (name: string) => (fbsSet.has(name) ? name : "FCS");
  const idxOf = (key: string) => ix.get(key) ?? (ix.get("FCS") as number);

  const gamesById = new Map(inp.games.map((g) => [g.id, g]));
  const regular = inp.games.filter((g) => g.seasonType === "regular");

  const prior = (k: string) => Float64Array.from(teams, (t) => priors.ratings[t]?.[k] ?? priors.ratings["FCS"]?.[k] ?? 0);
  const P = { pw: prior("pw"), po: prior("po"), pd: prior("pd"), xo: prior("xo"), xd: prior("xd"), so: prior("so"), sd: prior("sd") };
  const H = params.hyper;

  // first kickoff of each regular-season week group
  const weekStart = new Map<number, number>();
  for (const g of regular) weekStart.set(g.week, Math.min(weekStart.get(g.week) ?? Infinity, g.date));

  const advByGame = new Map<number, AdvRow[]>();
  for (const r of inp.adv) {
    if (!advByGame.has(r.gameId)) advByGame.set(r.gameId, []);
    advByGame.get(r.gameId)!.push(r);
  }

  const stateCache = new Map<number, RatingState>();
  function stateAt(cutoff: number): RatingState {
    const hit = stateCache.get(cutoff);
    if (hit) return hit;

    const hist = regular.filter(
      (g) => g.completed && g.homePoints != null && g.awayPoints != null && g.date < cutoff
    );

    // margin ratings
    let pw: Float64Array = P.pw;
    let hfa = 2.5;
    if (hist.length) {
      const rows = hist.map((g) => ({
        h: idxOf(g.homeKey),
        a: idxOf(g.awayKey),
        y: Math.max(-H.cap, Math.min(H.cap, g.homePoints! - g.awayPoints!)),
        nn: g.neutral ? 0 : 1,
      }));
      const f = fitMargin(T, rows, P.pw, H.lam_pw, H.lam_h, 2.5);
      pw = f.r;
      hfa = f.hfa;
    }

    // points offense / defense
    let O: Float64Array = P.po, D: Float64Array = P.pd, mu = 28.0, hfa2 = 2.5;
    if (hist.length) {
      const rows: OffDefRow[] = [];
      let sumY = 0;
      for (const g of hist) {
        const hm = g.neutral ? 0 : 1;
        rows.push({ t: idxOf(g.homeKey), o: idxOf(g.awayKey), y: g.homePoints!, home: hm, w: 1 });
        rows.push({ t: idxOf(g.awayKey), o: idxOf(g.homeKey), y: g.awayPoints!, home: -hm, w: 1 });
        sumY += g.homePoints! + g.awayPoints!;
      }
      const f = fitOffDef(T, rows, P.po, P.pd, H.lam_po, H.lam_h, 2.5, sumY / rows.length);
      O = f.O; D = f.D; mu = f.mu; hfa2 = f.hfa;
    }

    // advanced-stat rows from earlier games this season
    const advRows: { g: SeasonGame; r: AdvRow }[] = [];
    for (const g of hist) {
      for (const r of advByGame.get(g.id) ?? []) advRows.push({ g, r });
    }
    const advFit = (pick: (r: AdvRow) => number | null, pO: Float64Array, pD: Float64Array, lam: number): AdvFit => {
      const rows: OffDefRow[] = [];
      let sumY = 0;
      for (const { g, r } of advRows) {
        const y = pick(r);
        if (y == null) continue;
        const isHome = r.team === g.homeName;
        const t = isHome ? g.homeKey : g.awayKey;
        const o = isHome ? g.awayKey : g.homeKey;
        rows.push({
          t: idxOf(t), o: idxOf(o), y,
          home: g.neutral ? 0 : isHome ? 1 : -1,
          w: (r.offPlays ?? 60) / 65,
        });
        sumY += y;
      }
      if (!rows.length) return { O: pO, D: pD, mu: NaN, hfa: 0, fitted: false };
      const f = fitOffDef(T, rows, pO, pD, lam, H.lam_h * 5, 0, sumY / rows.length);
      return { ...f, fitted: true };
    };
    const x = advFit((r) => r.offPpa, P.xo, P.xd, H.lam_x);
    const s = advFit((r) => r.offSuccess, P.so, P.sd, H.lam_s);

    // pace + over/under tendencies
    const paceSum = new Map<string, number>();
    const paceN = new Map<string, number>();
    for (const { g, r } of advRows) {
      if (r.offPlays == null) continue;
      const key = r.team === g.homeName ? g.homeKey : g.awayKey;
      paceSum.set(key, (paceSum.get(key) ?? 0) + r.offPlays);
      paceN.set(key, (paceN.get(key) ?? 0) + 1);
    }
    const ouSum = new Map<string, number>();
    const ouN = new Map<string, number>();
    for (const g of hist) {
      const ln = inp.lines.get(g.id);
      if (!ln || ln.spread == null || ln.overUnder == null) continue;
      const oc = g.homePoints! + g.awayPoints! - ln.overUnder;
      for (const key of [g.homeKey, g.awayKey]) {
        ouSum.set(key, (ouSum.get(key) ?? 0) + oc);
        ouN.set(key, (ouN.get(key) ?? 0) + 1);
      }
    }

    const st: RatingState = { pw, hfa, O, D, mu, hfa2, x, s, paceSum, paceN, ouSum, ouN };
    stateCache.set(cutoff, st);
    return st;
  }

  const linear = (m: LinearModel, f: Record<string, number>) => {
    let v = m.intercept;
    for (let i = 0; i < m.feats.length; i++) v += (m.coef[i] * (f[m.feats[i]] - m.mu[i])) / m.sd[i];
    return v;
  };
  const prob = (kind: "total" | "spread", edge: number) => {
    const c = params.calibration[kind];
    return 1 / (1 + Math.exp(-(c.intercept + c.slope * Math.abs(edge))));
  };

  const out: Prediction[] = [];
  for (const t of targets) {
    const row = gamesById.get(t.id);
    const cutoff = row && row.seasonType === "regular" ? (weekStart.get(row.week) ?? Infinity) : Infinity;
    const st = stateAt(cutoff);
    const homeKey = keyOf(t.homeName);
    const awayKey = keyOf(t.awayName);
    const h = idxOf(homeKey);
    const a = idxOf(awayKey);
    const neutral = t.neutral ?? row?.neutral ?? false;
    const nn = neutral ? 0 : 1;
    const f: Record<string, number> = {};

    const pwM = st.pw[h] - st.pw[a] + st.hfa * nn;
    const expH = st.mu + st.O[h] - st.D[a] + 0.5 * st.hfa2 * nn;
    const expA = st.mu + st.O[a] - st.D[h] - 0.5 * st.hfa2 * nn;
    const adv = (m: AdvFit) => {
      if (!m.fitted) return { diff: 0, sum: 0 };
      const eh = m.mu + m.O[h] - m.D[a] + 0.5 * m.hfa * nn;
      const ea = m.mu + m.O[a] - m.D[h] - 0.5 * m.hfa * nn;
      return { diff: eh - ea, sum: eh + ea };
    };
    const ax = adv(st.x);
    const as = adv(st.s);
    f.x_diff = ax.diff;
    f.s_diff = as.diff;
    f.s_sum = as.sum;

    const paceOf = (key: string) => {
      const n = st.paceN.get(key) ?? 0;
      const base = priors.pace[key] ?? priors.mean_pace;
      return ((st.paceSum.get(key) ?? 0) + H.pace_k * base) / (n + H.pace_k);
    };
    f.pace_mean = (paceOf(homeKey) + paceOf(awayKey)) / 2;
    const ouf = (key: string) => (key === "FCS" ? 0 : (st.ouSum.get(key) ?? 0) / ((st.ouN.get(key) ?? 0) + ATS_K));
    f.ouf_sum = ouf(homeKey) + ouf(awayKey);

    const w = inp.weather.get(t.id);
    const indoors = w?.indoors ? 1 : 0;
    const temp = w?.temperature ?? params.weather_median.temp;
    const wind = w?.windSpeed ?? params.weather_median.wind;
    const precip = w?.precipitation ?? params.weather_median.precip;
    f.indoors_f = indoors;
    f.wind_out = wind * (1 - indoors);
    f.cold = temp < 40 && indoors === 0 ? 1 : 0;
    f.rain = precip > 0.02 && indoors === 0 ? 1 : 0;

    let edgeSpread: number | null = null;
    let edgeTotal: number | null = null;
    if (t.spread != null) {
      const M = -t.spread;
      f.e_pw = pwM - M;
      f.e_po = expH - expA - M;
      edgeSpread = linear(params.spread, f);
    }
    if (t.overUnder != null) {
      f.e_pt = expH + expA - t.overUnder;
      f.ou_c = t.overUnder - 55;
      edgeTotal = linear(params.total, f);
    }
    out.push({
      id: t.id,
      edgeSpread,
      edgeTotal,
      pSpread: edgeSpread == null ? null : prob("spread", edgeSpread),
      pTotal: edgeTotal == null ? null : prob("total", edgeTotal),
      features: { ...f, po_t: expH + expA, po_m: expH - expA, pw_m: pwM },
    });
  }
  return out;
}

export type Tier = "high" | "medium" | "low";

export function tierFor(edgeTotal: number | null, cutoffs: { medium: number; high: number }): Tier {
  const e = Math.abs(edgeTotal ?? 0);
  return e >= cutoffs.high ? "high" : e >= cutoffs.medium ? "medium" : "low";
}
