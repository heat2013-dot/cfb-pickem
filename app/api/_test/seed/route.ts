import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: manual verification route, removed before final handoff.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = await prisma.week.findFirst({ where: { isCurrent: true } });
  if (!week) return NextResponse.json({ error: "no current week" }, { status: 400 });

  const game = await prisma.game.upsert({
    where: { cfbdGameId: -999 },
    create: {
      weekId: week.id,
      cfbdGameId: -999,
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      homeTeam: "Test Home",
      awayTeam: "Test Away",
      homeRank: 5,
      awayRank: null,
      spread: -6.5,
      overUnder: 51.5,
      oddsProvider: "test",
      status: "scheduled",
    },
    update: {
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    },
  });

  return NextResponse.json({ seeded: true, gameId: game.id });
}

export async function DELETE(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const game = await prisma.game.findUnique({ where: { cfbdGameId: -999 } });
  if (game) {
    await prisma.pick.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
  }
  return NextResponse.json({ deleted: true });
}
