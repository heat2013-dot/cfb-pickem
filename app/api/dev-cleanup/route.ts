import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: wipes games (and their picks) for a given weekId, without
// deleting the Week row itself. Used to clean up the corrupted Week 0 bucket.
export async function DELETE(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekId = Number(request.nextUrl.searchParams.get("weekId"));
  if (!weekId) return NextResponse.json({ error: "weekId is required" }, { status: 400 });

  const games = await prisma.game.findMany({ where: { weekId } });
  const gameIds = games.map((g) => g.id);
  await prisma.pick.deleteMany({ where: { gameId: { in: gameIds } } });
  const deleted = await prisma.game.deleteMany({ where: { weekId } });

  return NextResponse.json({ deletedGames: deleted.count });
}
