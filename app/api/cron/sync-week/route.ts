import { NextRequest, NextResponse } from "next/server";
import { syncCurrentWeek, syncWeek } from "@/lib/sync";
import { runModel } from "@/lib/model/run";
import { prisma } from "@/lib/prisma";
import type { SeasonType } from "@/lib/cfbd";

export const dynamic = "force-dynamic";

// Supports optional ?season=&week=&seasonType= overrides (still gated by
// CRON_SECRET) for manually backfilling or re-syncing a specific past week.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const season = request.nextUrl.searchParams.get("season");
    const week = request.nextUrl.searchParams.get("week");
    const seasonType = request.nextUrl.searchParams.get("seasonType") as SeasonType | null;

    const result =
      season && week
        ? await syncWeek(Number(season), Number(week), seasonType ?? "regular")
        : await syncCurrentWeek();

    const current = await prisma.week.findFirst({ where: { isCurrent: true } });
    const model = await runModel(current ? [current.id] : []);

    return NextResponse.json({ ...result, model });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
