import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";
import { formatRank, formatSpread } from "@/lib/format";
import { networkLogoUrl } from "@/lib/cfbd";
import { computeGameResult } from "@/lib/grade";
import PickButtons from "@/app/components/PickButtons";
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
        <div className="flex items-center gap-3 print:hidden">
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
                {PICKERS.map((p) => (
                  <div key={p} className="rounded border border-gray-200 p-2 text-center">
                    <div className="text-xs uppercase text-gray-500">{p}</div>
                    <div className="text-lg font-semibold">{leaderboard[p] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
            {selectedWeek && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Week {selectedWeek.weekNumber}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PICKERS.map((p) => (
                    <div key={p} className="rounded border border-gray-200 p-2 text-center">
                      <div className="text-xs uppercase text-gray-500">{p}</div>
                      <div className="text-lg font-semibold">{weeklyLeaderboard[p] ?? 0}</div>
                    </div>
                  ))}
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left">
                    <th className="p-2">Matchup</th>
                    <th className="p-2">TV</th>
                    <th className="p-2">Spread</th>
                    <th className="p-2">O/U</th>
                    <th className="p-2">Results</th>
                    {PICKERS.map((p) => (
                      <th key={p} className="p-2">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => {
                    const locked =
                      picksLocked || game.startDate.getTime() <= now || game.status === "final";
                    const { spreadResult, totalResult } = computeGameResult({
                      homeScore: game.homeScore,
                      awayScore: game.awayScore,
                      spread: game.spread,
                      overUnder: game.overUnder,
                    });
                    const spreadResultLabel =
                      spreadResult === "home"
                        ? `${game.homeTeam} ${game.spread != null ? formatSpread(game.spread) : ""}`
                        : spreadResult === "away"
                          ? `${game.awayTeam} ${game.spread != null ? formatSpread(-game.spread) : ""}`
                          : spreadResult === "push"
                            ? "Push"
                            : null;
                    const totalResultLabel =
                      totalResult === "over"
                        ? `Over ${game.overUnder ?? ""}`
                        : totalResult === "under"
                          ? `Under ${game.overUnder ?? ""}`
                          : totalResult === "push"
                            ? "Push"
                            : null;
                    return (
                      <tr key={game.id} className="border-b border-gray-100 align-top">
                        <td className="p-2">
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
                                timeZone: "America/New_York",
                                timeZoneName: "short",
                              })}
                            </span>
                            {game.status === "final" && (
                              <span className="font-semibold text-gray-700">
                                Final: {game.awayTeam} {game.awayScore} – {game.homeTeam}{" "}
                                {game.homeScore}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {game.broadcast &&
                            (networkLogoUrl(game.broadcast) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={networkLogoUrl(game.broadcast)!}
                                alt={game.broadcast}
                                title={game.broadcast}
                                className="h-6 w-6 object-contain"
                              />
                            ) : (
                              <span className="text-xs text-gray-500">{game.broadcast}</span>
                            ))}
                        </td>
                        <td className="p-2">
                          {game.spread != null ? formatSpread(game.spread) : "–"}
                        </td>
                        <td className="p-2">{game.overUnder != null ? game.overUnder : "–"}</td>
                        <td className="p-2">
                          {game.status === "final" ? (
                            <div className="flex flex-col gap-1">
                              {spreadResultLabel && (
                                <span className="inline-block w-fit rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                  {spreadResultLabel}
                                </span>
                              )}
                              {totalResultLabel && (
                                <span className="inline-block w-fit rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                  {totalResultLabel}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">–</span>
                          )}
                        </td>
                        {PICKERS.map((picker) => {
                          const currentPick = game.picks.find((p) => p.picker === picker) ?? null;
                          return (
                            <td key={picker} className="p-2">
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
          )}
        </div>
      </div>
    </div>
  );
}
