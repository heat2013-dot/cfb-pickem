"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AdvanceWeekButton({ weekId }: { weekId: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function advance() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/advance-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekId }),
        });
        const data = await res.json();
        if (!res.ok || data.advanced === false) {
          throw new Error(data.error ?? data.reason ?? "Could not advance to next week yet.");
        }
        setMessage(`Advanced to Week ${data.weeks?.[0]?.weekNumber ?? "next"}.`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Advance failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={advance}
        disabled={pending}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Advancing…" : "Next Week →"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
