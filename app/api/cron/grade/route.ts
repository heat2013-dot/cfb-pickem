import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pullResults } from "@/lib/refresh";
import { currentWeekIsStale, syncCurrentWeek } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Runs daily so game results get graded without anyone needing to click
// "Pull Results" -- same logic that button uses.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const week = await prisma.week.findFirst({ where: { isCurrent: true } });
    if (!week) {
      return NextResponse.json({ refreshed: false, reason: "No current week has been synced yet." });
    }
    const result = await pullResults(week.id);

    // Once the current week's last game is >=24h old, try pulling the next
    // week's poll/schedule so "current" advances without waiting for
    // Wednesday's full sync. Cheap no-op on days it's not due yet.
    const advanced = (await currentWeekIsStale()) ? await syncCurrentWeek() : null;

    revalidatePath("/");
    return NextResponse.json({ ...result, advanced });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
