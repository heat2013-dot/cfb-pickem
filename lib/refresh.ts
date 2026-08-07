import { prisma } from "@/lib/prisma";
import {
  getGamesForWeek,
  getLinesForWeek,
  getRecords,
  pickBestLine,
  type SeasonType,
} from "@/lib/cfbd";
import { gradePick } from "@/lib/grade";

/**
 * Re-pulls lines for games that haven't kicked off yet (so the spread/total
 * stay current), and pulls scores to mark games final and grade picks.
 */
export async function refreshOddsAndScores(now: Date = new Date()) {
  const week = await prisma.week.findFirst({
    where: { isCurrent: true },
    include: { games: true },
  });
  if (!week) {
    return { refreshed: false, reason: "No current week has been synced yet." };
  }

  const seasonType = week.seasonType as SeasonType;

  const [lines, cfbdGames] = await Promise.all([
    getLinesForWeek(week.season, week.weekNumber, seasonType),
    getGamesForWeek(week.season, week.weekNumber, seasonType),
  ]);
  const linesByGameId = new Map(lines.map((l) => [l.id, l.lines]));
  const cfbdById = new Map(cfbdGames.map((g) => [g.id, g]));

  let oddsUpdated = 0;
  let gamesGraded = 0;

  const records = await getRecords(week.season);
  const rankings = await prisma.pollRanking.findMany({ where: { weekId: week.id } });
  for (const pr of rankings) {
    const rec = records.get(pr.team);
    if (rec && (rec.wins !== pr.wins || rec.losses !== pr.losses || rec.ties !== pr.ties)) {
      await prisma.pollRanking.update({
        where: { id: pr.id },
        data: { wins: rec.wins, losses: rec.losses, ties: rec.ties },
      });
    }
  }

  for (const game of week.games) {
    // Only move the line while the game hasn't started yet, so a pick made
    // earlier in the week is graded against the number it was made on.
    if (game.status === "scheduled" && game.startDate.getTime() > now.getTime()) {
      const best = pickBestLine(linesByGameId.get(game.cfbdGameId) ?? []);
      if (best) {
        await prisma.game.update({
          where: { id: game.id },
          data: { spread: best.spread, overUnder: best.overUnder, oddsProvider: best.provider },
        });
        oddsUpdated++;
      }
    }

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

  return { refreshed: true, oddsUpdated, gamesGraded };
}
