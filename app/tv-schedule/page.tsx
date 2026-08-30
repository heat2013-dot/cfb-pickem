import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTeamColors, type TeamColors } from "@/lib/cfbd";
import { formatRank } from "@/lib/format";
import WeekSelector from "@/app/components/WeekSelector";

export const dynamic = "force-dynamic";

const SLOT_MIN = 30;
const SLOT_MS = SLOT_MIN * 60 * 1000;
const GAME_DURATION_MS = 3.5 * 60 * 60 * 1000;
const SLOT_WIDTH = 76;
const LABEL_WIDTH = 150;
const DEFAULT_COLOR = "#4b5563";

function floorToSlot(ms: number) {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}
function ceilToSlot(ms: number) {
  return Math.ceil(ms / SLOT_MS) * SLOT_MS;
}

export default async function TvSchedulePage({ searchParams }: PageProps<"/tv-schedule">) {
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
        where: { weekId: selectedWeek.id, broadcast: { not: null } },
        orderBy: { startDate: "asc" },
      })
    : [];

  const colors = selectedWeek
    ? await getTeamColors(selectedWeek.season)
    : new Map<string, TeamColors>();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">TV Schedule</h1>
        <div className="flex items-center gap-3">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              basePath="/tv-schedule"
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
            />
          )}
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to picks
          </Link>
        </div>
      </div>

      {!selectedWeek || games.length === 0 ? (
        <p className="text-gray-500">No scheduled games with broadcast info for this week yet.</p>
      ) : (
        <ScheduleGrid games={games} colors={colors} />
      )}
    </div>
  );
}

type ScheduleGame = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeRank: number | null;
  awayRank: number | null;
  broadcast: string | null;
  startDate: Date;
};

function ScheduleGrid({
  games,
  colors,
}: {
  games: ScheduleGame[];
  colors: Map<string, TeamColors>;
}) {
  const starts = games.map((g) => g.startDate.getTime());
  const ends = starts.map((s) => s + GAME_DURATION_MS);
  const gridStart = floorToSlot(Math.min(...starts));
  const gridEnd = ceilToSlot(Math.max(...ends));
  const totalSlots = Math.round((gridEnd - gridStart) / SLOT_MS);

  const slotIndex = (ms: number) => Math.round((ms - gridStart) / SLOT_MS);

  // Group by network, then greedily pack overlapping games into lanes so
  // simultaneous broadcasts on the same network don't collide.
  const byNetwork = new Map<string, ScheduleGame[]>();
  for (const g of games) {
    const key = g.broadcast!;
    if (!byNetwork.has(key)) byNetwork.set(key, []);
    byNetwork.get(key)!.push(g);
  }

  type Row = { network: string; lane: number; game: ScheduleGame };
  const rows: Row[] = [];
  const networkOrder = [...byNetwork.keys()].sort();
  const laneCountByNetwork = new Map<string, number>();

  for (const network of networkOrder) {
    const networkGames = [...byNetwork.get(network)!].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime()
    );
    const laneEndTimes: number[] = [];
    for (const g of networkGames) {
      const start = g.startDate.getTime();
      const end = start + GAME_DURATION_MS;
      let lane = laneEndTimes.findIndex((endTime) => endTime <= start);
      if (lane === -1) {
        lane = laneEndTimes.length;
        laneEndTimes.push(end);
      } else {
        laneEndTimes[lane] = end;
      }
      rows.push({ network, lane, game: g });
    }
    laneCountByNetwork.set(network, laneEndTimes.length);
  }

  const networkStartRow = new Map<string, number>();
  let rowCursor = 2; // row 1 is the time header
  for (const network of networkOrder) {
    networkStartRow.set(network, rowCursor);
    rowCursor += laneCountByNetwork.get(network) ?? 1;
  }
  const totalRows = rowCursor - 1;

  const timeLabels = Array.from({ length: totalSlots }, (_, i) => {
    const t = new Date(gridStart + i * SLOT_MS);
    return t.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  });

  const gridTemplateColumns = `${LABEL_WIDTH}px repeat(${totalSlots}, ${SLOT_WIDTH}px)`;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <div
        className="grid text-xs"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `36px repeat(${totalRows}, 64px)`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-10 flex items-center border-b border-gray-300 bg-gray-100 px-2 font-semibold text-gray-500">
          Network
        </div>
        {timeLabels.map((label, i) => (
          <div
            key={i}
            className="flex items-center justify-center border-b border-l border-gray-200 bg-gray-100 font-medium text-gray-600"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {label}
          </div>
        ))}

        {/* Network label cells */}
        {networkOrder.map((network) => {
          const startRow = networkStartRow.get(network)!;
          const laneCount = laneCountByNetwork.get(network) ?? 1;
          return (
            <div
              key={network}
              className="sticky left-0 z-10 flex items-center border-b border-gray-200 bg-white px-2 font-semibold text-gray-700"
              style={{ gridColumn: 1, gridRow: `${startRow} / span ${laneCount}` }}
            >
              {network}
            </div>
          );
        })}

        {/* Background cells for the grid lines */}
        {Array.from({ length: totalRows }, (_, r) =>
          Array.from({ length: totalSlots }, (_, c) => (
            <div
              key={`${r}-${c}`}
              className="border-b border-l border-gray-100"
              style={{ gridColumn: c + 2, gridRow: r + 2 }}
            />
          ))
        )}

        {/* Game bars */}
        {rows.map(({ network, lane, game }) => {
          const start = game.startDate.getTime();
          const end = start + GAME_DURATION_MS;
          const colStart = slotIndex(start) + 2;
          const colEnd = slotIndex(end) + 2;
          const row = networkStartRow.get(network)! + lane;
          const away = colors.get(game.awayTeam);
          const home = colors.get(game.homeTeam);
          const awayColor = away?.color || DEFAULT_COLOR;
          const homeColor = home?.color || DEFAULT_COLOR;

          return (
            <div
              key={game.id}
              className="m-1 flex overflow-hidden rounded-md text-white shadow-sm"
              style={{
                gridColumn: `${colStart} / ${colEnd}`,
                gridRow: row,
                background: `linear-gradient(to bottom, ${awayColor} 50%, ${homeColor} 50%)`,
              }}
              title={`${game.awayTeam} @ ${game.homeTeam}`}
            >
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-1 text-[10px] leading-tight">
                <div className="flex items-center gap-1 truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                  {game.awayLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.awayLogo} alt="" className="h-3.5 w-3.5 flex-shrink-0 object-contain" />
                  )}
                  <span className="truncate">
                    {formatRank(game.awayRank)}
                    {game.awayTeam}
                  </span>
                </div>
                <div className="flex items-center gap-1 truncate font-bold" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                  {game.homeLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.homeLogo} alt="" className="h-3.5 w-3.5 flex-shrink-0 object-contain" />
                  )}
                  <span className="truncate">
                    {formatRank(game.homeRank)}
                    {game.homeTeam}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
