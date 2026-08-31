import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTeamColors, networkLogoUrl, type TeamColors } from "@/lib/cfbd";
import { formatRank } from "@/lib/format";
import WeekSelector from "@/app/components/WeekSelector";

export const dynamic = "force-dynamic";

const SLOT_MIN = 30;
const SLOT_MS = SLOT_MIN * 60 * 1000;
const GAME_DURATION_MS = 3.5 * 60 * 60 * 1000;
const SLOT_WIDTH = 38;
const LABEL_WIDTH = 50;
const DEFAULT_COLOR = "#4b5563";

function floorToSlot(ms: number) {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}
function ceilToSlot(ms: number) {
  return Math.ceil(ms / SLOT_MS) * SLOT_MS;
}
function dayKeyCT(date: Date): string {
  return date.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
}
function dayLabelCT(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
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

  // If CFBD is unavailable or rate-limited, fall back to no colors (each bar
  // shows a neutral gray) rather than crashing the whole page.
  const colors = selectedWeek
    ? await getTeamColors(selectedWeek.season).catch((err) => {
        console.error("getTeamColors failed, falling back to default bar colors", err);
        return new Map<string, TeamColors>();
      })
    : new Map<string, TeamColors>();

  const byDay = new Map<string, typeof games>();
  for (const g of games) {
    const key = dayKeyCT(g.startDate);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(g);
  }
  const days = [...byDay.entries()].sort(
    (a, b) => a[1][0].startDate.getTime() - b[1][0].startDate.getTime()
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">TV Schedule</h1>
        <div className="flex items-center gap-3">
          {weeks.length > 0 && selectedWeek && (
            <WeekSelector
              weeks={weeks.map((w) => ({
                id: w.id,
                label: `${w.season} Wk ${w.weekNumber}${w.isCurrent ? " (current)" : ""}`,
              }))}
              selectedId={selectedWeek.id}
              basePath="/tv-schedule"
            />
          )}
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to picks
          </Link>
        </div>
      </div>

      {!selectedWeek || days.length === 0 ? (
        <p className="text-gray-500">No scheduled games with broadcast info for this week yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map(([key, dayGames]) => (
            <div key={key}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {dayLabelCT(dayGames[0].startDate)} · All times CT
              </h2>
              <ScheduleGrid games={dayGames} colors={colors} />
            </div>
          ))}
        </div>
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
      minute: t.getMinutes() === 0 ? undefined : "2-digit",
      timeZone: "America/Chicago",
    });
  });

  const gridTemplateColumns = `${LABEL_WIDTH}px repeat(${totalSlots}, ${SLOT_WIDTH}px)`;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <div
        className="grid text-xs"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `28px repeat(${totalRows}, 52px)`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-10 border-b border-gray-300 bg-gray-100" />
        {timeLabels.map((label, i) => (
          <div
            key={i}
            className="flex items-center justify-center border-b border-l border-gray-200 bg-gray-100 text-[10px] font-medium text-gray-600"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {label}
          </div>
        ))}

        {/* Network label cells */}
        {networkOrder.map((network) => {
          const startRow = networkStartRow.get(network)!;
          const laneCount = laneCountByNetwork.get(network) ?? 1;
          const logo = networkLogoUrl(network);
          return (
            <div
              key={network}
              className="sticky left-0 z-10 flex items-center justify-center border-b border-gray-200 bg-white p-1"
              style={{ gridColumn: 1, gridRow: `${startRow} / span ${laneCount}` }}
              title={network}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={network} className="h-6 w-6 object-contain" />
              ) : (
                <span className="text-center text-[9px] font-semibold text-gray-600">
                  {network}
                </span>
              )}
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
              className="m-0.5 flex items-center gap-1 overflow-hidden rounded-md px-1 text-white shadow-sm"
              style={{
                gridColumn: `${colStart} / ${colEnd}`,
                gridRow: row,
                background: `linear-gradient(to right, ${awayColor}, ${homeColor})`,
              }}
              title={`${game.awayTeam} @ ${game.homeTeam}`}
            >
              {game.awayLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.awayLogo}
                  alt=""
                  className="h-6 w-6 flex-shrink-0 rounded-full bg-white/90 object-contain p-0.5"
                />
              )}
              <div
                className="min-w-0 flex-1 text-center text-xs leading-tight font-semibold"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
              >
                <div className="truncate">
                  {formatRank(game.awayRank)}
                  {game.awayTeam} @
                </div>
                <div className="truncate">
                  {formatRank(game.homeRank)}
                  {game.homeTeam}
                </div>
              </div>
              {game.homeLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.homeLogo}
                  alt=""
                  className="h-6 w-6 flex-shrink-0 rounded-full bg-white/90 object-contain p-0.5"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
