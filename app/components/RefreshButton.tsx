"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton({ weekId }: { weekId: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function refresh() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekId }),
        });
        const data = await res.json();
        if (!res.ok || data.refreshed === false) {
          throw new Error(data.error ?? data.reason ?? "Refresh failed");
        }

        const parts: string[] = [];
        if (data.odds?.gamesUpserted != null) {
          parts.push(`updated ${data.odds.gamesUpserted} game(s)`);
        }
        if (data.results?.gamesGraded != null) {
          parts.push(`graded ${data.results.gamesGraded} final game(s)`);
        }
        if (data.advanced?.advanced) {
          parts.push(`advanced to Week ${data.advanced.weeks?.[0]?.weekNumber ?? "next"}`);
        }
        setMessage(parts.length > 0 ? parts.join(", ") + "." : "Nothing new.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Refresh failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
