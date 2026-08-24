import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: forces a game's spread to a known fake value so the
// odds-freeze behavior can be tested deterministically.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const game = await prisma.game.update({
    where: { id: Number(body.gameId) },
    data: { spread: Number(body.spread) },
  });
  return NextResponse.json({ gameId: game.id, spread: game.spread });
}
