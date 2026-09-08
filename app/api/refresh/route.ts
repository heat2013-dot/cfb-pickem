import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshAll } from "@/lib/refresh";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekId = Number(body.weekId);
    if (!weekId) {
      return NextResponse.json({ error: "weekId is required" }, { status: 400 });
    }
    const result = await refreshAll(weekId);
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
