import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshOddsAndScores } from "@/lib/refresh";

export const dynamic = "force-dynamic";

// Runs daily so game results get graded without anyone needing to click
// "Refresh Odds" -- same logic that button uses.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await refreshOddsAndScores();
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
