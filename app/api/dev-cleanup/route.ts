import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: one-off cleanup of the verification week, removed after use.
export async function DELETE(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = await prisma.week.findMany({ include: { games: true } });
  for (const week of weeks) {
    const gameIds = week.games.map((g) => g.id);
    await prisma.pick.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { weekId: week.id } });
    await prisma.week.delete({ where: { id: week.id } });
  }

  return NextResponse.json({ deletedWeeks: weeks.length });
}
