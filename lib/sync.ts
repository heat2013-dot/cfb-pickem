import { prisma } from "@/lib/prisma";
import {
  getCurrentWeek,
  getTop25,
  getGamesForWeek,
  getLinesForWeek,
  getDisplayRankings,
  getRecords,
  getMediaForWeek,
  pickBestLine,
  logoUrl,
  type SeasonType,
  type CfbdGame,
  type CfbdLine,
  type PollTable,
  type TeamRecord,
} from "@/lib/cfbd";

const DAY_MS = 24 * 60 * 60 * 1000;

function currentSeasonYear(now: Date): number {
  // The CFB season year is the calendar year it kicks off in (Aug–Jan).
  // Jan–Jul dates belong to the season that started the previous August.
  return now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
}

/**
 * CFBD sometimes merges the early "Week 0" slate (e.g. the season-opening
 * Ireland/Dublin or Hawaii games) into Week 1's date range instead of giving
 * it its own week number. Detect that by finding a >=3 day gap between game
 * dates -- a real single week's games never have a gap that wide.
 */
function splitByDateGap(games: CfbdGame[]): { early: CfbdGame[]; late: CfbdGame[] } | null {
  if (games.length < 2) return null;
  const sorted = [...games].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  let splitIndex = -1;
  let maxGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gapDays =
      (new Date(sorted[i].startDate).getTime() - new Date(sorted[i - 1].startDate).getTime()) /
      DAY_MS;
    if (gapDays > maxGapDays) {
      maxGapDays = gapDays;
      splitIndex = i;
    }
  }

  if (maxGapDays >= 3 && splitIndex > 0) {
    return { early: sorted.slice(0, splitIndex), late: sorted.slice(splitIndex) };
  }
  return null;
}

/**
 * CFBD has no real "week 0": querying most endpoints (games, lines, media)
 * with week=0 returns the ENTIRE SEASON instead of just that week's slate,
 * while week 1 reliably returns the correct (possibly merged) slate for
 * both. This is the one safe place that knows that -- every caller that
 * needs to query CFBD for a Week 0 record must route through here rather
 * than passing weekNumber straight through.
 */
export function resolveCfbdQueryWeek(weekNumber: number): number {
  return weekNumber === 0 ? 1 : weekNumber;
}

/**
 * Splits one CFBD query week's raw games into the real week(s) they belong
 * to. Only week 1 (regular season) can be a merged Week 0 + Week 1 slate;
 * every other query week is returned as a single bucket.
 */
function bucketsForQueryWeek(
  queryWeekNumber: number,
  seasonType: SeasonType,
  games: CfbdGame[]
): { weekNumber: number; games: CfbdGame[] }[] {
  if (queryWeekNumber !== 1 || seasonType !== "regular") {
    return [{ weekNumber: queryWeekNumber, games }];
  }
  const split = splitByDateGap(games);
  if (!split) return [{ weekNumber: queryWeekNumber, games }];
  return [
    { weekNumber: 0, games: split.early },
    { weekNumber: 1, games: split.late },
  ];
}

/**
 * Filters a raw CFBD games list (fetched via resolveCfbdQueryWeek's result)
 * down to just the games belonging to one specific already-existing week
 * record. Shared by refreshWeek() and pullResults() so neither has to
 * reimplement the Week 0/1 split on its own.
 */
export function gamesForWeek(
  weekNumber: number,
  seasonType: SeasonType,
  rawGames: CfbdGame[]
): CfbdGame[] {
  const queryWeekNumber = resolveCfbdQueryWeek(weekNumber);
  const buckets = bucketsForQueryWeek(queryWeekNumber, seasonType, rawGames);
  return buckets.find((b) => b.weekNumber === weekNumber)?.games ?? rawGames;
}

/**
 * Upserts the Top 25 matchups (with lines/broadcast) and the poll sidebar
 * tables for one week. Shared by the full weekly sync and the manual
 * per-week "Refresh Odds" button.
 */
async function upsertGamesAndPolls(
  weekId: number,
  games: CfbdGame[],
  rankByTeam: Map<string, number>,
  linesByGameId: Map<number, CfbdLine[]>,
  media: Map<number, string>,
  displayPolls: PollTable[],
  records: Map<string, TeamRecord>,
  options: { includeAllGames?: boolean; picksLocked?: boolean; now?: number } = {}
): Promise<number> {
  const { includeAllGames = false, picksLocked = false, now = Date.now() } = options;

  // Week 0's real slate is tiny (a handful of games league-wide), so it's
  // shown in full rather than filtered down to just ranked matchups.
  const top25Games = includeAllGames
    ? games
    : games.filter((g) => rankByTeam.has(g.homeTeam) || rankByTeam.has(g.awayTeam));

  let gamesUpserted = 0;
  for (const g of top25Games) {
    const bestLine = pickBestLine(linesByGameId.get(g.id) ?? []);
    // Once a game has kicked off, finished, or the week's picks are manually
    // locked, freeze its line -- picks were made against that number and
    // must be graded against it, not whatever the market has moved to since.
    const freezeOdds = picksLocked || g.completed || new Date(g.startDate).getTime() <= now;
    await prisma.game.upsert({
      where: { cfbdGameId: g.id },
      create: {
        weekId,
        cfbdGameId: g.id,
        startDate: new Date(g.startDate),
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        homeLogo: logoUrl(g.homeId),
        awayLogo: logoUrl(g.awayId),
        homeRank: rankByTeam.get(g.homeTeam) ?? null,
        awayRank: rankByTeam.get(g.awayTeam) ?? null,
        spread: bestLine?.spread ?? null,
        overUnder: bestLine?.overUnder ?? null,
        oddsProvider: bestLine?.provider ?? null,
        broadcast: media.get(g.id) ?? null,
        status: g.completed ? "final" : "scheduled",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      },
      update: {
        weekId,
        startDate: new Date(g.startDate),
        homeLogo: logoUrl(g.homeId),
        awayLogo: logoUrl(g.awayId),
        homeRank: rankByTeam.get(g.homeTeam) ?? null,
        awayRank: rankByTeam.get(g.awayTeam) ?? null,
        broadcast: media.get(g.id) ?? null,
        // Don't clobber an existing line with a null if the odds feed hasn't
        // posted yet, and don't move it at all once frozen.
        ...(bestLine && !freezeOdds
          ? { spread: bestLine.spread, overUnder: bestLine.overUnder, oddsProvider: bestLine.provider }
          : {}),
      },
    });
    gamesUpserted++;
  }

  await prisma.pollRanking.deleteMany({ where: { weekId } });
  const rankingRows = displayPolls.flatMap((table) =>
    table.ranks.map((r) => {
      const rec = records.get(r.school);
      return {
        weekId,
        poll: table.poll,
        rank: r.rank,
        team: r.school,
        logo: logoUrl(r.teamId),
        wins: rec?.wins ?? 0,
        losses: rec?.losses ?? 0,
        ties: rec?.ties ?? 0,
      };
    })
  );
  if (rankingRows.length > 0) {
    await prisma.pollRanking.createMany({ data: rankingRows });
  }

  return gamesUpserted;
}

/**
 * Pulls the current week's Top 25 matchups (AP, or CFP once available) and
 * their opening lines, and upserts them into the DB. Safe to call repeatedly.
 */
export async function syncCurrentWeek(now: Date = new Date()) {
  const season = currentSeasonYear(now);
  const { week: weekNumber, seasonType } = await getCurrentWeek(season, now);
  return syncWeek(season, weekNumber, seasonType);
}

export async function syncWeek(season: number, weekNumber: number, seasonType: SeasonType) {
  const top25 = await getTop25(season, weekNumber, seasonType);
  if (!top25) {
    return { synced: false, reason: "No poll published yet for this week." };
  }

  const rankByTeam = new Map(top25.ranks.map((r) => [r.school, r.rank]));

  const [games, lines, displayPolls, records, media] = await Promise.all([
    getGamesForWeek(season, weekNumber, seasonType),
    getLinesForWeek(season, weekNumber, seasonType),
    getDisplayRankings(season, weekNumber, seasonType),
    getRecords(season),
    getMediaForWeek(season, weekNumber, seasonType),
  ]);

  const linesByGameId = new Map(lines.map((l) => [l.id, l.lines]));

  const buckets = bucketsForQueryWeek(weekNumber, seasonType, games);

  await prisma.week.updateMany({ data: { isCurrent: false }, where: { isCurrent: true } });

  const syncedWeeks: { weekNumber: number; gamesUpserted: number }[] = [];

  for (const bucket of buckets) {
    const week = await prisma.week.upsert({
      where: { season_weekNumber_seasonType: { season, weekNumber: bucket.weekNumber, seasonType } },
      create: { season, weekNumber: bucket.weekNumber, seasonType, pollSource: top25.pollSource },
      update: { pollSource: top25.pollSource },
    });

    const gamesUpserted = await upsertGamesAndPolls(
      week.id,
      bucket.games,
      rankByTeam,
      linesByGameId,
      media,
      displayPolls,
      records,
      { includeAllGames: bucket.weekNumber === 0, picksLocked: week.picksLocked }
    );

    syncedWeeks.push({ weekNumber: bucket.weekNumber, gamesUpserted });
  }

  // The "current" week is the earliest bucket whose games haven't finished
  // yet; if every bucket is in the past, fall back to the latest one.
  const now = Date.now();
  let currentWeekNumber = buckets[buckets.length - 1].weekNumber;
  for (const bucket of buckets) {
    if (bucket.games.length === 0) continue;
    const lastStart = Math.max(...bucket.games.map((g) => new Date(g.startDate).getTime()));
    if (lastStart + DAY_MS > now) {
      currentWeekNumber = bucket.weekNumber;
      break;
    }
  }
  await prisma.week.update({
    where: { season_weekNumber_seasonType: { season, weekNumber: currentWeekNumber, seasonType } },
    data: { isCurrent: true },
  });

  return {
    synced: true,
    season,
    seasonType,
    pollSource: top25.pollSource,
    weeks: syncedWeeks,
    gamesUpserted: syncedWeeks.reduce((sum, w) => sum + w.gamesUpserted, 0),
  };
}

/**
 * DB-only signal for the daily grade cron: is it worth paying for a full
 * CFBD re-sync to check whether the next week's poll/schedule is out yet?
 * True once it's been >=24h since the current week's last game kicked off,
 * so "current" doesn't sit on a finished week until the Wednesday sync.
 */
export async function currentWeekIsStale(now: Date = new Date()): Promise<boolean> {
  const week = await prisma.week.findFirst({
    where: { isCurrent: true },
    include: { games: { select: { startDate: true } } },
  });
  if (!week || week.games.length === 0) return false;
  const lastStart = Math.max(...week.games.map((g) => g.startDate.getTime()));
  return now.getTime() - lastStart >= DAY_MS;
}

/**
 * Manual per-week refresh: re-pulls that week's matchups (in case a team's
 * ranking changed which games count as Top 25), lines, broadcast info, and
 * poll tables. Unlike syncWeek, this targets one already-existing week and
 * never touches isCurrent or does the Week 0/1 split -- that's cron-only.
 */
export async function refreshWeek(weekId: number) {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) {
    return { refreshed: false, reason: "Week not found." };
  }

  const seasonType = week.seasonType as SeasonType;
  const queryWeekNumber = resolveCfbdQueryWeek(week.weekNumber);

  const top25 = await getTop25(week.season, queryWeekNumber, seasonType);
  if (!top25) {
    return { refreshed: false, reason: "No poll published yet for this week." };
  }
  const rankByTeam = new Map(top25.ranks.map((r) => [r.school, r.rank]));

  const [rawGames, lines, displayPolls, records, media] = await Promise.all([
    getGamesForWeek(week.season, queryWeekNumber, seasonType),
    getLinesForWeek(week.season, queryWeekNumber, seasonType),
    getDisplayRankings(week.season, queryWeekNumber, seasonType),
    getRecords(week.season),
    getMediaForWeek(week.season, queryWeekNumber, seasonType),
  ]);
  const linesByGameId = new Map(lines.map((l) => [l.id, l.lines]));

  const games = gamesForWeek(week.weekNumber, seasonType, rawGames);

  const gamesUpserted = await upsertGamesAndPolls(
    week.id,
    games,
    rankByTeam,
    linesByGameId,
    media,
    displayPolls,
    records,
    { includeAllGames: week.weekNumber === 0, picksLocked: week.picksLocked }
  );

  return { refreshed: true, gamesUpserted };
}
