import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";
import { formatRank, formatSpread } from "@/lib/format";
import { networkLogoUrl } from "@/lib/cfbd";
import PickButtons from "@/app/components/PickButtons";
import GameCard from "@/app/components/GameCard";
import RefreshOddsButton from "@/app/components/RefreshOddsButton";
import PullResultsButton from "@/app/components/PullResultsButton";
import LockPicksButton from "@/app/components/LockPicksButton";
import WeekSelector from "@/app/components/WeekSelector";
import PollTables from "@/app/components/PollTables";
import PrintButton from "@/app/components/PrintButton";

export const dynamic = "force-dynamic";

async function getLeaderboard() {
  const picks = await prisma.pick.findMany({ select: { picker: true, isCorrect: true } });
  const totals = Object.fromEntries(PICKERS.map((p) => [p, 0])) as Record<string, number>;
  for (const pick of picks) {
    if (pick.isCorrect) totals[pick.picker] = (totals[pick.picker] ?? 0) + 1;
  }
  return totals;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const weekIdParam = Array.isArray(params.week) ? params.week[0] : params.week;

  const weeks = await prisma.week.findMany({
    orderBy: [{ season: "desc" }, { weekNumber: "desc" }],
  });

  const selectedWeek = weekIdParam
    ? weeks.find((w) => w.id === Number(weekIdParam))
    : weeks.find((w) => w.isCurrent) ?? weeks[0];

  const leaderboard = await getLeaderboard();

  const games = selectedWeek
    ? await prisma.game.findMany({
        where: { weekId: selectedWeek.id },
        orderBy: { startDate: "asc" },
        include: { picks: true },
      })
    : [];

  const rankings = selectedWeek
    ? await prisma.pollRanking.findMany({ where: { weekId: selectedWeek.id } })
    : [];

  const previousWeek = selectedWeek
    ? await prisma.week.findFirst({
        where: {
          season: selectedWeek.season,
          seasonType: selectedWeek.seasonType,
          weekNumber: { lt: selectedWeek.weekNumber },
        },
        orderBy: { weekNumber: "desc" },
      })
    : null;

  const previousRankings = previousWeek
    ? await prisma.pollRanking.findMany({ where: { weekId: previousWeek.id } })
    : [];
  const previousRankByKey = new Map(
    previousRankings.map((r) => [`${r.poll}|${r.team}`, r.rank])
  );

  const rankingsWithChange = rankings.map((r) => ({
    ...r,
    previousRank: previousRankByKey.get(`${r.poll}|${r.team}`) ?? null,
  }));

  const now = Date.now();
  const picksLocked = selectedWeek?.picksLocked ?? false;

  const weeklyLeaderboard = Object.fromEntries(PICKERS.map((p) => [p, 0])) as Record<
    string,
    number
  >;
  for (const game of games) {
    for (const pick of game.picks) {
      if (pick.isCorrect) weeklyLeaderboard[pick.picker] = (weeklyLeaderboard[pick.picker] ?? 0) + 1;
    }
  }

  const seasonBest = Math.max(0, ...PICKERS.map((p) => leaderboard[p] ?? 0));
  const weekBest = Math.max(0, ...PICKERS.map((p) => weeklyLeaderboard[p] ?? 0));

  const gameViews = games.map((game) => ({
    game,
    locked: picksLocked || game.startDate.getTime() <= now || game.status === "final",
  }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CFB Top 25 Pick&apos;em</h1>
          {selectedWeek && (
            <p className="text-sm text-gray-500">
              {selectedWeek.season} · Week {selectedWeek.weekNumber} · {selectedWeek.pollSource}
              {selectedWeek.isCurrent ? " (current)" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
            />
          )}
          {selectedWeek && (
            <>
              <RefreshOddsButton weekId={selectedWeek.id} />
              <PullResultsButton weekId={selectedWeek.id} />
              <LockPicksButton weekId={selectedWeek.id} locked={selectedWeek.picksLocked} />
            </>
          )}
          <PrintButton />
          <Link
            href="/standings"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Standings
          </Link>
          <Link
            href="/tv-schedule"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            TV Schedule
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        {rankings.length > 0 && (
          <aside className="w-full flex-shrink-0 print:hidden lg:w-64">
            <PollTables rankings={rankingsWithChange} />
          </aside>
        )}

        <div className="min-w-0 flex-1">
          <section className="mb-8 flex flex-col gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Season
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PICKERS.map((p) => {
                  const isLeader = seasonBest > 0 && (leaderboard[p] ?? 0) === seasonBest;
                  return (
                    <div
                      key={p}
                      className={`rounded border p-2 text-center ${
                        isLeader
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="text-xs uppercase text-gray-500">{p}</div>
                      <div
                        className={`text-lg font-semibold ${isLeader ? "text-amber-700" : ""}`}
                      >
                        {leaderboard[p] ?? 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {selectedWeek && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Week {selectedWeek.weekNumber}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PICKERS.map((p) => {
                    const isLeader = weekBest > 0 && (weeklyLeaderboard[p] ?? 0) === weekBest;
                    return (
                      <div
                        key={p}
                        className={`rounded border p-2 text-center ${
                          isLeader
                            ? "border-amber-300 bg-amber-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="text-xs uppercase text-gray-500">{p}</div>
                        <div
                          className={`text-lg font-semibold ${isLeader ? "text-amber-700" : ""}`}
                        >
                          {weeklyLeaderboard[p] ?? 0}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {!selectedWeek ? (
            <p className="text-gray-500">
              No week has been synced yet. Hit the CFBD cron endpoint, or wait for
              Wednesday&apos;s automatic sync once the season&apos;s poll is out.
            </p>
          ) : games.length === 0 ? (
            <p className="text-gray-500">No Top 25 matchups found for this week.</p>
          ) : (
            <>
              <div id="picks-cards" className="space-y-3 sm:hidden">
                {gameViews.map(({ game, locked }) => (
                  <GameCard key={game.id} game={game} locked={locked} />
                ))}
              </div>

              <div id="picks-table" className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="border border-gray-300 p-2">Matchup</th>
                      <th className="border border-gray-300 p-2">Spread</th>
                      <th className="border border-gray-300 p-2">O/U</th>
                      <th className="border border-gray-300 p-2">Results</th>
                      {PICKERS.map((p) => (
                        <th key={p} className="border border-gray-300 p-2">
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gameViews.map(({ game, locked }) => {
                      return (
                        <tr key={game.id} className="align-top">
                        <td className="border border-gray-200 p-2">
                          <div className="flex items-start gap-2 font-medium">
                            <div className="flex w-16 flex-col items-center gap-1 text-center">
                              {game.awayLogo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={game.awayLogo}
                                  alt=""
                                  className="h-10 w-10 flex-shrink-0 object-contain"
                                />
                              )}
                              <span className="text-xs leading-tight">
                                {formatRank(game.awayRank)}
                                {game.awayTeam}
                              </span>
                            </div>
                            <span className="mt-3 text-gray-400">@</span>
                            <div className="flex w-16 flex-col items-center gap-1 text-center">
                              {game.homeLogo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={game.homeLogo}
                                  alt=""
                                  className="h-10 w-10 flex-shrink-0 object-contain"
                                />
                              )}
                              <span className="text-xs leading-tight">
                                {formatRank(game.homeRank)}
                                {game.homeTeam}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span>
                              {game.startDate.toLocaleString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                timeZone: "America/Chicago",
                                timeZoneName: "short",
                              })}
                            </span>
                            {game.broadcast && (
                              <span className="flex items-center gap-1">
                                {networkLogoUrl(game.broadcast) && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={networkLogoUrl(game.broadcast)!}
                                    alt=""
                                    className="h-3.5 w-3.5 flex-shrink-0 object-contain"
                                  />
                                )}
                                <span>{game.broadcast}</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-200 p-2">
                          {game.spread != null ? formatSpread(game.spread) : "–"}
                        </td>
                        <td className="border border-gray-200 p-2">
                          {game.overUnder != null ? game.overUnder : "–"}
                        </td>
                        <td className="border border-gray-200 p-2">
                          {game.status === "final" ? (
                            <span className="font-semibold text-gray-700">
                              {game.awayTeam} {game.awayScore} – {game.homeTeam} {game.homeScore}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">–</span>
                          )}
                        </td>
                        {PICKERS.map((picker) => {
                          const currentPick = game.picks.find((p) => p.picker === picker) ?? null;
                          return (
                            <td key={picker} className="border border-gray-200 p-2">
                              <PickButtons
                                gameId={game.id}
                                picker={picker}
                                homeTeam={game.homeTeam}
                                awayTeam={game.awayTeam}
                                homeLogo={game.homeLogo}
                                awayLogo={game.awayLogo}
                                spread={game.spread}
                                overUnder={game.overUnder}
                                currentPick={currentPick}
                                locked={locked}
                                isFinal={game.status === "final"}
                              />
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
