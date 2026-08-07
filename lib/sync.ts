import { prisma } from "@/lib/prisma";
import {
  getCurrentWeek,
  getTop25,
  getGamesForWeek,
  getLinesForWeek,
  getDisplayRankings,
  getRecords,
  pickBestLine,
  logoUrl,
  type SeasonType,
} from "@/lib/cfbd";

function currentSeasonYear(now: Date): number {
  // The CFB season year is the calendar year it kicks off in (Aug–Jan).
  // Jan–Jul dates belong to the season that started the previous August.
  return now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
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

  const [games, lines, displayPolls, records] = await Promise.all([
    getGamesForWeek(season, weekNumber, seasonType),
    getLinesForWeek(season, weekNumber, seasonType),
    getDisplayRankings(season, weekNumber, seasonType),
    getRecords(season),
  ]);

  const linesByGameId = new Map(lines.map((l) => [l.id, l.lines]));

  const top25Games = games.filter(
    (g) => rankByTeam.has(g.homeTeam) || rankByTeam.has(g.awayTeam)
  );

  await prisma.week.updateMany({ data: { isCurrent: false }, where: { isCurrent: true } });

  const week = await prisma.week.upsert({
    where: { season_weekNumber_seasonType: { season, weekNumber, seasonType } },
    create: { season, weekNumber, seasonType, pollSource: top25.pollSource, isCurrent: true },
    update: { pollSource: top25.pollSource, isCurrent: true },
  });

  let gamesUpserted = 0;
  for (const g of top25Games) {
    const bestLine = pickBestLine(linesByGameId.get(g.id) ?? []);
    await prisma.game.upsert({
      where: { cfbdGameId: g.id },
      create: {
        weekId: week.id,
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
        status: g.completed ? "final" : "scheduled",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      },
      update: {
        startDate: new Date(g.startDate),
        homeLogo: logoUrl(g.homeId),
        awayLogo: logoUrl(g.awayId),
        homeRank: rankByTeam.get(g.homeTeam) ?? null,
        awayRank: rankByTeam.get(g.awayTeam) ?? null,
        // Don't clobber an existing line with a null if the odds feed hasn't posted yet.
        ...(bestLine
          ? { spread: bestLine.spread, overUnder: bestLine.overUnder, oddsProvider: bestLine.provider }
          : {}),
      },
    });
    gamesUpserted++;
  }

  await prisma.pollRanking.deleteMany({ where: { weekId: week.id } });
  const rankingRows = displayPolls.flatMap((table) =>
    table.ranks.map((r) => {
      const rec = records.get(r.school);
      return {
        weekId: week.id,
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

  return { synced: true, season, weekNumber, seasonType, pollSource: top25.pollSource, gamesUpserted };
}
