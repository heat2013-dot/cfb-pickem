import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";

export const dynamic = "force-dynamic";

function highestOf(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

export default async function StandingsPage() {
  const weeks = await prisma.week.findMany({
    orderBy: [{ season: "asc" }, { weekNumber: "asc" }],
    include: { games: { include: { picks: true } } },
  });

  const weeklyPoints: Record<string, Record<number, number>> = {};
  for (const p of PICKERS) weeklyPoints[p] = {};

  for (const week of weeks) {
    for (const p of PICKERS) weeklyPoints[p][week.id] = 0;
    for (const game of week.games) {
      for (const pick of game.picks) {
        if (pick.isCorrect) {
          weeklyPoints[pick.picker][week.id] = (weeklyPoints[pick.picker][week.id] ?? 0) + 1;
        }
      }
    }
  }

  const seasonTotals = Object.fromEntries(
    PICKERS.map((p) => [p, weeks.reduce((sum, w) => sum + (weeklyPoints[p][w.id] ?? 0), 0)])
  ) as Record<string, number>;

  const seasonBest = highestOf(Object.values(seasonTotals));
  const weekBest = Object.fromEntries(
    weeks.map((w) => [w.id, highestOf(PICKERS.map((p) => weeklyPoints[p][w.id] ?? 0))])
  ) as Record<number, number>;

  // Fun stats: spread vs. over/under accuracy per picker, season-wide.
  const graded = await prisma.pick.findMany({
    where: { isCorrect: { not: null } },
    select: { picker: true, betType: true, isCorrect: true },
  });
  type BetStat = { made: number; correct: number };
  const stats = Object.fromEntries(
    PICKERS.map((p) => [
      p,
      { spread: { made: 0, correct: 0 } as BetStat, total: { made: 0, correct: 0 } as BetStat },
    ])
  ) as Record<string, { spread: BetStat; total: BetStat }>;
  for (const pick of graded) {
    const bucket = pick.betType === "spread" ? stats[pick.picker].spread : stats[pick.picker].total;
    bucket.made++;
    if (pick.isCorrect) bucket.correct++;
  }
  const pct = (s: BetStat) => (s.made ? Math.round((s.correct / s.made) * 100) : null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Season Standings</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to picks
        </Link>
      </div>

      {weeks.length === 0 ? (
        <p className="text-gray-500">No weeks synced yet.</p>
      ) : (
        <>
          <div className="mb-10 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th className="p-2">Picker</th>
                  {weeks.map((w) => (
                    <th key={w.id} className="p-2 text-center whitespace-nowrap">
                      Wk {w.weekNumber}
                    </th>
                  ))}
                  <th className="p-2 text-center font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {PICKERS.map((p) => {
                  const isSeasonLeader = seasonBest > 0 && seasonTotals[p] === seasonBest;
                  return (
                    <tr key={p} className="border-b border-gray-100">
                      <td className="p-2 font-medium">{p}</td>
                      {weeks.map((w) => {
                        const points = weeklyPoints[p][w.id] ?? 0;
                        const isWeekLeader = weekBest[w.id] > 0 && points === weekBest[w.id];
                        return (
                          <td
                            key={w.id}
                            className={`p-2 text-center ${
                              isWeekLeader ? "rounded bg-amber-50 font-semibold text-amber-700" : ""
                            }`}
                          >
                            {points}
                          </td>
                        );
                      })}
                      <td
                        className={`p-2 text-center font-bold ${
                          isSeasonLeader ? "rounded bg-amber-100 text-amber-800" : ""
                        }`}
                      >
                        {seasonTotals[p]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">Fun Stats</h2>
            <p className="mb-3 text-xs text-gray-500">
              Accuracy split by bet type, across every graded pick this season.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full max-w-2xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left">
                    <th className="p-2">Picker</th>
                    <th className="p-2 text-center">Spread record</th>
                    <th className="p-2 text-center">O/U record</th>
                  </tr>
                </thead>
                <tbody>
                  {PICKERS.map((p) => {
                    const s = stats[p].spread;
                    const t = stats[p].total;
                    const sPct = pct(s);
                    const tPct = pct(t);
                    return (
                      <tr key={p} className="border-b border-gray-100">
                        <td className="p-2 font-medium">{p}</td>
                        <td className="p-2 text-center text-gray-700">
                          {s.correct}-{s.made - s.correct}
                          {sPct != null && <span className="text-gray-400"> ({sPct}%)</span>}
                        </td>
                        <td className="p-2 text-center text-gray-700">
                          {t.correct}-{t.made - t.correct}
                          {tPct != null && <span className="text-gray-400"> ({tPct}%)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
