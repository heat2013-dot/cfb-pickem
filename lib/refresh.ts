import { prisma } from "@/lib/prisma";
import { getGamesForWeek, type SeasonType } from "@/lib/cfbd";
import { gradePick } from "@/lib/grade";
import { resolveCfbdQueryWeek, gamesForWeek } from "@/lib/sync";

/**
 * Pulls the latest scores for one week's games, marks any that have gone
 * final, and grades everyone's picks against them. Does not touch odds or
 * the matchup list -- that's refreshWeek()'s job.
 */
export async function pullResults(weekId: number) {
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: { games: true },
  });
  if (!week) {
    return { refreshed: false, reason: "Week not found." };
  }

  const seasonType = week.seasonType as SeasonType;
  const queryWeekNumber = resolveCfbdQueryWeek(week.weekNumber);
  const rawGames = await getGamesForWeek(week.season, queryWeekNumber, seasonType);
  const cfbdGames = gamesForWeek(week.weekNumber, seasonType, rawGames);
  const cfbdById = new Map(cfbdGames.map((g) => [g.id, g]));

  let gamesGraded = 0;
  for (const game of week.games) {
    const latest = cfbdById.get(game.cfbdGameId);
    if (latest?.completed && game.status !== "final") {
      await prisma.game.update({
        where: { id: game.id },
        data: { status: "final", homeScore: latest.homeScore, awayScore: latest.awayScore },
      });

      const picks = await prisma.pick.findMany({ where: { gameId: game.id } });
      for (const pick of picks) {
        const isCorrect = gradePick({
          betType: pick.betType,
          side: pick.side,
          homeScore: latest.homeScore!,
          awayScore: latest.awayScore!,
          spread: game.spread,
          overUnder: game.overUnder,
        });
        await prisma.pick.update({ where: { id: pick.id }, data: { isCorrect } });
      }
      gamesGraded++;
    }
  }

  return { refreshed: true, gamesGraded };
}
