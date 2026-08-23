import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: read-only inspection endpoint, removed after use.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = await prisma.week.findMany({
    include: { games: { include: { picks: true } } },
    orderBy: [{ season: "desc" }, { weekNumber: "asc" }],
  });

  const summary = weeks.map((w) => ({
    id: w.id,
    season: w.season,
    weekNumber: w.weekNumber,
    seasonType: w.seasonType,
    isCurrent: w.isCurrent,
    picksLocked: w.picksLocked,
    gameCount: w.games.length,
    picksCount: w.games.reduce((sum, g) => sum + g.picks.length, 0),
    gameDateRange:
      w.games.length > 0
        ? [
            w.games.map((g) => g.startDate).sort()[0],
            w.games.map((g) => g.startDate).sort()[w.games.length - 1],
          ]
        : null,
    picks: w.games.flatMap((g) =>
      g.picks.map((p) => ({ game: `${g.awayTeam} @ ${g.homeTeam}`, picker: p.picker, betType: p.betType, side: p.side }))
    ),
  }));

  return NextResponse.json(summary);
}
