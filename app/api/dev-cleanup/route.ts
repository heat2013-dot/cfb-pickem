import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: removes a specific season/week used for manual verification.
export async function DELETE(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const season = Number(searchParams.get("season"));
  const weekNumber = Number(searchParams.get("week"));

  const week = await prisma.week.findFirst({
    where: { season, weekNumber, seasonType: "regular" },
    include: { games: true },
  });
  if (!week) return NextResponse.json({ deleted: false, reason: "not found" });

  const gameIds = week.games.map((g) => g.id);
  await prisma.pick.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.game.deleteMany({ where: { weekId: week.id } });
  await prisma.pollRanking.deleteMany({ where: { weekId: week.id } });
  await prisma.week.delete({ where: { id: week.id } });

  return NextResponse.json({ deleted: true });
}
