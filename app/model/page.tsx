import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";
import { formatRank, formatSpread } from "@/lib/format";
import WeekSelector from "@/app/components/WeekSelector";
import backtest from "@/lib/model/backtest.json";

export const dynamic = "force-dynamic";

type Pick = {
  betType: string;
  side: string;
  probability: number;
  tier: string;
  lineSpread: number | null;
  lineTotal: number | null;
  edgeSpread: number | null;
  edgeTotal: number | null;
  projHome: number | null;
  projAway: number | null;
  isCorrect: boolean | null;
  backfilled: boolean;
};

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–");
const pctRaw = (x: number) => `${(x * 100).toFixed(1)}%`;

function pickLabel(p: Pick, home: string, away: string): string {
  if (p.betType === "total") {
    return `${p.side === "over" ? "Over" : "Under"}${p.lineTotal != null ? ` ${p.lineTotal}` : ""}`;
  }
  const isHome = p.side === "home";
  const line = p.lineSpread == null ? null : isHome ? p.lineSpread : -p.lineSpread;
  return `${isHome ? home : away}${line == null ? "" : ` ${formatSpread(line)}`}`;
}

const TIER_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-gray-100 text-gray-600",
};

export default async function ModelPage({ searchParams }: PageProps<"/model">) {
  const params = await searchParams;
  const weekIdParam = Array.isArray(params.week) ? params.week[0] : params.week;

  const weeks = await prisma.week.findMany({
    orderBy: [{ season: "desc" }, { weekNumber: "desc" }],
  });
  const selectedWeek = weekIdParam
    ? weeks.find((w) => w.id === Number(weekIdParam))
    : weeks.find((w) => w.isCurrent) ?? weeks[0];

  const games = selectedWeek
    ? await prisma.game.findMany({
        where: { weekId: selectedWeek.id },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        include: { modelPick: true },
      })
    : [];

  // Season record for the model, and the same accuracy measure for each picker.
  const seasonPicks = selectedWeek
    ? await prisma.modelPick.findMany({
        where: { isCorrect: { not: null }, game: { week: { season: selectedWeek.season } } },
        select: { isCorrect: true, backfilled: true, betType: true },
      })
    : [];
  const tally = (rows: { isCorrect: boolean | null }[]) => ({ w: rows.filter((r) => r.isCorrect).length, n: rows.length });
  const live = tally(seasonPicks.filter((p) => !p.backfilled));
  const filled = tally(seasonPicks.filter((p) => p.backfilled));
  const all = tally(seasonPicks);
  const byType = {
    total: tally(seasonPicks.filter((p) => p.betType === "total")),
    spread: tally(seasonPicks.filter((p) => p.betType === "spread")),
  };

  const humanPicks = selectedWeek
    ? await prisma.pick.findMany({
        where: { isCorrect: { not: null }, game: { week: { season: selectedWeek.season } } },
        select: { picker: true, isCorrect: true },
      })
    : [];
  const humans = PICKERS.map((p) => {
    const rows = humanPicks.filter((h) => h.picker === p);
    return { name: p, ...tally(rows) };
  });

  const weekPicks = games.flatMap((g) => (g.modelPick?.isCorrect != null ? [g.modelPick] : []));
  const weekRecord = tally(weekPicks);

  const bt = backtest as unknown as {
    pooled: { total: [number, number]; spread: [number, number] };
    per_season: Record<string, { total: [number, number]; spread: [number, number] }>;
    baseline_over_rate: number;
    baseline_home_cover_rate: number;
    baseline_favorite_cover_rate: number;
    tiers_total: Record<"high" | "medium" | "low", [number, number]>;
    tier_cutoffs: { medium: number; high: number };
    chosen_bet_accuracy: [number, number];
    share_spread_picks: number;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Model Picks</h1>
          <p className="text-sm text-gray-500">
            A statistical model&apos;s pick for every game, one bet per game like the rest of us.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
              basePath="/model"
            />
          )}
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to picks
          </Link>
        </div>
      </div>

      {!selectedWeek ? (
        <p className="text-gray-500">No week has been synced yet.</p>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={`Week ${selectedWeek.weekNumber}`} value={`${weekRecord.w}-${weekRecord.n - weekRecord.w}`} sub={pct(weekRecord.w, weekRecord.n)} />
            <Tile label="Season (all picks)" value={`${all.w}-${all.n - all.w}`} sub={pct(all.w, all.n)} />
            <Tile label="Live picks only" value={`${live.w}-${live.n - live.w}`} sub={pct(live.w, live.n)} />
            <Tile label="Backfilled picks" value={`${filled.w}-${filled.n - filled.w}`} sub={pct(filled.w, filled.n)} />
          </section>

          {games.length === 0 ? (
            <p className="text-gray-500">No games for this week yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="border border-gray-300 p-2">Matchup</th>
                    <th className="border border-gray-300 p-2">Spread</th>
                    <th className="border border-gray-300 p-2">O/U</th>
                    <th className="border border-gray-300 p-2">Model pick</th>
                    <th className="border border-gray-300 p-2">Confidence</th>
                    <th className="border border-gray-300 p-2">Model projection</th>
                    <th className="border border-gray-300 p-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    const p = g.modelPick;
                    const isFinal = g.status === "final";
                    return (
                      <tr key={g.id} className="align-top">
                        <td className="border border-gray-200 p-2">
                          <div className="flex items-center gap-2 font-medium">
                            {g.awayLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={g.awayLogo} alt="" className="h-7 w-7 object-contain" />
                            )}
                            <span>
                              {formatRank(g.awayRank)}
                              {g.awayTeam}
                            </span>
                            <span className="text-gray-400">@</span>
                            {g.homeLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={g.homeLogo} alt="" className="h-7 w-7 object-contain" />
                            )}
                            <span>
                              {formatRank(g.homeRank)}
                              {g.homeTeam}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {g.startDate.toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: "America/Chicago",
                              timeZoneName: "short",
                            })}
                          </div>
                        </td>
                        <td className="border border-gray-200 p-2">
                          {g.spread != null ? formatSpread(g.spread) : "–"}
                        </td>
                        <td className="border border-gray-200 p-2">{g.overUnder != null ? g.overUnder : "–"}</td>
                        {p ? (
                          <>
                            <td className="border border-gray-200 p-2 font-semibold">
                              {pickLabel(p, g.homeTeam, g.awayTeam)}
                              <div className="text-[11px] font-normal uppercase text-gray-400">
                                {p.betType === "total" ? "Over/Under" : "Spread"}
                                {p.backfilled ? " · backfilled" : ""}
                              </div>
                            </td>
                            <td className="border border-gray-200 p-2">
                              <span className="font-medium">{pctRaw(p.probability)}</span>{" "}
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${TIER_STYLE[p.tier]}`}>
                                {p.tier}
                              </span>
                            </td>
                            <td className="border border-gray-200 p-2 text-gray-700">
                              {p.projHome != null && p.projAway != null
                                ? `${g.awayTeam} ${Math.round(p.projAway)} – ${g.homeTeam} ${Math.round(p.projHome)}`
                                : "–"}
                            </td>
                          </>
                        ) : (
                          <td className="border border-gray-200 p-2 text-gray-400" colSpan={3}>
                            No line posted yet — the model picks once one is available.
                          </td>
                        )}
                        <td className="border border-gray-200 p-2">
                          {isFinal ? (
                            <div>
                              <div className="text-xs text-gray-600">
                                {g.awayTeam} {g.awayScore} – {g.homeTeam} {g.homeScore}
                              </div>
                              {p &&
                                (p.isCorrect === true ? (
                                  <span className="font-semibold text-green-700">✓ Correct</span>
                                ) : p.isCorrect === false ? (
                                  <span className="font-semibold text-red-700">✗ Wrong</span>
                                ) : (
                                  <span className="text-gray-500">Push</span>
                                ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section className="mt-10">
            <h2 className="mb-2 text-lg font-semibold">{selectedWeek.season} accuracy: model vs. pickers</h2>
            <p className="mb-3 text-xs text-gray-500">
              Share of graded picks that won (pushes excluded). Model: {byType.total.w}-{byType.total.n - byType.total.w} on
              over/unders, {byType.spread.w}-{byType.spread.n - byType.spread.w} against the spread.
            </p>
            <table className="w-full max-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="p-2">Picker</th>
                  <th className="p-2 text-center">Record</th>
                  <th className="p-2 text-center">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {[...humans, { name: "Model", ...all }].map((r) => (
                  <tr key={r.name} className={`border-b border-gray-100 ${r.name === "Model" ? "bg-sky-50 font-semibold" : ""}`}>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-center">
                      {r.w}-{r.n - r.w}
                    </td>
                    <td className="p-2 text-center">{pct(r.w, r.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-10 max-w-3xl text-sm text-gray-700">
            <h2 className="mb-2 text-lg font-semibold">How the model works</h2>
            <p className="mb-2">
              For every game it estimates team strength from this season&apos;s results and play-by-play efficiency
              (opponent-adjusted points, success rate and EPA), starting from a preseason prior built from last season,
              recruiting talent and returning production. It then weighs that against the sportsbook line, adding
              factors like the total&apos;s tendency to regress toward the average, each team&apos;s history against the
              over/under, pace of play, and forecast weather. Each game gets one pick, whichever bet (spread or
              over/under) it rates as more likely to win.
            </p>
            <p className="mb-2">
              Weeks that happened before the model existed were run after the fact, using only information available
              before that week&apos;s kickoff and the line that was posted then. Those are labeled <em>backfilled</em> and
              counted separately from live picks. A pick is frozen at kickoff.
            </p>

            <h3 className="mb-1 mt-4 font-semibold">Back-test: how well would it have done?</h3>
            <p className="mb-2">
              Each season below was predicted using only seasons before it (nothing about the future leaked in).
              Sportsbook lines are very efficient — a coin flip wins 50%, and you need about 52.4% to break even at
              standard odds — so even a good model wins only a little more than half the time.
            </p>
            <div className="mb-3 overflow-x-auto">
              <table className="w-full max-w-lg border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left">
                    <th className="p-2">Season</th>
                    <th className="p-2 text-center">Over/Under</th>
                    <th className="p-2 text-center">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bt.per_season).map(([season, r]) => (
                    <tr key={season} className="border-b border-gray-100">
                      <td className="p-2">{season}</td>
                      <td className="p-2 text-center">
                        {pctRaw(r.total[0])} <span className="text-gray-400">({r.total[1]})</span>
                      </td>
                      <td className="p-2 text-center">
                        {pctRaw(r.spread[0])} <span className="text-gray-400">({r.spread[1]})</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="p-2">All</td>
                    <td className="p-2 text-center">
                      {pctRaw(bt.pooled.total[0])} <span className="font-normal text-gray-400">({bt.pooled.total[1]})</span>
                    </td>
                    <td className="p-2 text-center">
                      {pctRaw(bt.pooled.spread[0])} <span className="font-normal text-gray-400">({bt.pooled.spread[1]})</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mb-2 list-disc space-y-1 pl-5">
              <li>
                By confidence on over/unders: High {pctRaw(bt.tiers_total.high[0])} ({bt.tiers_total.high[1]} games), Medium{" "}
                {pctRaw(bt.tiers_total.medium[0])}, Low {pctRaw(bt.tiers_total.low[0])}.
              </li>
              <li>
                One bet per game (the model&apos;s choice): {pctRaw(bt.chosen_bet_accuracy[0])} over {bt.chosen_bet_accuracy[1]} games;
                it picks the spread in about {Math.round(bt.share_spread_picks * 100)}% of games.
              </li>
              <li>
                Simple baselines: always over {pctRaw(bt.baseline_over_rate)}, always home {pctRaw(bt.baseline_home_cover_rate)},
                always the favorite {pctRaw(bt.baseline_favorite_cover_rate)}.
              </li>
            </ul>
            <p className="text-xs text-gray-500">
              Be skeptical: the model&apos;s settings were tuned on 2021–2025, so those years flatter it. 2026 was never used
              in building it, and its first nine weeks there came in at {pctRaw(bt.per_season["2026"].total[0])} on over/unders and{" "}
              {pctRaw(bt.per_season["2026"].spread[0])} against the spread — about what you&apos;d expect from a small, noisy
              edge. Treat these picks as one more opinion, not a lock.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-gray-200 p-3 text-center">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}
