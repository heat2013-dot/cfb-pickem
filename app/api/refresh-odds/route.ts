import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshOddsAndScores } from "@/lib/refresh";

export const dynamic = "force-dynamic";

export async function POST() {
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
