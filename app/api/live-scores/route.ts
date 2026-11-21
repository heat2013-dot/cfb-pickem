import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveScores, type LiveInfo } from "@/lib/espn";

export const dynamic = "force-dynamic";

const MIN = 60_000;

/**
 * Live scores for one week's games. Only talks to ESPN while something is
 * actually in progress (or about to be), and the response is CDN-cached for a
 * few seconds so any number of viewers share a single upstream fetch.
 */
export async function GET(request: NextRequest) {
  const weekId = Number(request.nextUrl.searchParams.get("week"));
  if (!weekId) return NextResponse.json({ error: "week is required" }, { status: 400 });

  const games = await prisma.game.findMany({
    where: { weekId },
    select: { id: true, cfbdGameId: true, startDate: true, status: true },
  });
  const now = Date.now();
  const open = games.filter((g) => g.status !== "final");
  // started within the last 9 hours (or starting within 30 min) and not yet final in our database
  const active = open.filter((g) => {
    const t = g.startDate.getTime();
    return t <= now + 30 * MIN && t >= now - 9 * 60 * MIN;
  });

  const cache = { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=20" };

  if (active.length === 0) {
    const nextStart = open.map((g) => g.startDate.getTime()).filter((t) => t > now).sort((a, b) => a - b)[0];
    // check back shortly before the next kickoff, otherwise stop polling
    const pollMs = nextStart != null && nextStart - now < 6 * 60 * MIN ? Math.max(MIN, nextStart - now - 30 * MIN) : 0;
    return NextResponse.json({ scores: {}, pollMs }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
  }

  try {
    const times = active.map((g) => g.startDate.getTime());
    const live = await getLiveScores(Math.min(...times), Math.max(...times));
    const scores: Record<number, LiveInfo> = {};
    for (const g of active) {
      const info = live.get(g.cfbdGameId);
      if (info && info.state !== "pre") scores[g.id] = info;
    }
    return NextResponse.json({ scores, pollMs: 30_000 }, { headers: cache });
  } catch (err) {
    console.error("live scores failed", err);
    return NextResponse.json(
      { scores: {}, pollMs: 60_000, error: err instanceof Error ? err.message : "failed" },
      { headers: cache }
    );
  }
}
