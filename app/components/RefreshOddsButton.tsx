"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshOddsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function refresh() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/refresh-odds", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Refresh failed");
        setMessage(
          `Updated odds for ${data.oddsUpdated} game(s), graded ${data.gamesGraded} final game(s).`
        );
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Refresh failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh Odds"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
