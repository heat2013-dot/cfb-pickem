import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";
import { formatRank } from "@/lib/format";
import PickButtons from "@/app/components/PickButtons";
import RefreshOddsButton from "@/app/components/RefreshOddsButton";
import WeekSelector from "@/app/components/WeekSelector";
import PollTables from "@/app/components/PollTables";

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

  const now = Date.now();

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
        <div className="flex items-center gap-3">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
            />
          )}
          <RefreshOddsButton />
        </div>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        {rankings.length > 0 && (
          <aside className="w-full flex-shrink-0 lg:w-64">
            <PollTables rankings={rankings} />
          </aside>
        )}

        <div className="min-w-0 flex-1">
          <section className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PICKERS.map((p) => (
              <div key={p} className="rounded border border-gray-200 p-2 text-center">
                <div className="text-xs uppercase text-gray-500">{p}</div>
                <div className="text-lg font-semibold">{leaderboard[p] ?? 0}</div>
              </div>
            ))}
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
                    <th className="p-2">Spread</th>
                    <th className="p-2">O/U</th>
                    {PICKERS.map((p) => (
                      <th key={p} className="p-2">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => {
                    const locked = game.startDate.getTime() <= now || game.status === "final";
                    return (
                      <tr key={game.id} className="border-b border-gray-100 align-top">
                        <td className="whitespace-nowrap p-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            {game.awayLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={game.awayLogo}
                                alt=""
                                className="h-5 w-5 flex-shrink-0 object-contain"
                              />
                            )}
                            <span>
                              {formatRank(game.awayRank)}
                              {game.awayTeam}
                            </span>
                            <span className="text-gray-400">@</span>
                            {game.homeLogo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={game.homeLogo}
                                alt=""
                                className="h-5 w-5 flex-shrink-0 object-contain"
                              />
                            )}
                            <span>
                              {formatRank(game.homeRank)}
                              {game.homeTeam}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {game.startDate.toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {game.status === "final" && (
                              <span className="ml-2 font-semibold text-gray-700">
                                Final: {game.awayTeam} {game.awayScore} – {game.homeTeam}{" "}
                                {game.homeScore}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">{game.spread != null ? game.spread : "–"}</td>
                        <td className="p-2">{game.overUnder != null ? game.overUnder : "–"}</td>
                        {PICKERS.map((picker) => {
                          const currentPick = game.picks.find((p) => p.picker === picker) ?? null;
                          return (
                            <td key={picker} className="p-2">
                              <PickButtons
                                gameId={game.id}
                                picker={picker}
                                homeTeam={game.homeTeam}
                                awayTeam={game.awayTeam}
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
