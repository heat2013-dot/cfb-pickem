import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PICKERS } from "@/lib/pickers";
import { getStatePaths, projectPoint, MAP_WIDTH, MAP_HEIGHT } from "@/lib/usmap";
import WeekSelector from "@/app/components/WeekSelector";
import GameMap, { type MapGame } from "@/app/components/GameMap";

export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: PageProps<"/map">) {
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
        include: { picks: true },
      })
    : [];

  const mapGames: MapGame[] = games.map((g) => {
    const point = projectPoint(g.latitude, g.longitude);
    return {
      id: g.id,
      x: point ? point[0] : null,
      y: point ? point[1] : null,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: g.status,
      spread: g.spread,
      overUnder: g.overUnder,
      startDate: g.startDate.toISOString(),
      venue: g.venueName
        ? `${g.venueName}${g.venueCity ? `, ${g.venueCity}` : ""}${g.venueState ? `, ${g.venueState}` : ""}`
        : null,
      picks: Object.fromEntries(
        g.picks.map((p) => [p.picker, { betType: p.betType, side: p.side, isCorrect: p.isCorrect }])
      ),
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Game Map</h1>
        <div className="flex items-center gap-3">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
              basePath="/map"
            />
          )}
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to picks
          </Link>
        </div>
      </div>

      {!selectedWeek || games.length === 0 ? (
        <p className="text-gray-500">No games for this week yet.</p>
      ) : (
        <GameMap
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          statePaths={getStatePaths()}
          games={mapGames}
          pickers={[...PICKERS]}
        />
      )}
    </div>
  );
}
