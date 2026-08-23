"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PullResultsButton({ weekId }: { weekId: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function pull() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/pull-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekId }),
        });
        const data = await res.json();
        if (!res.ok || data.refreshed === false) {
          throw new Error(data.error ?? data.reason ?? "Pull failed");
        }
        setMessage(`Graded ${data.gamesGraded} final game(s).`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Pull failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={pull}
        disabled={pending}
        className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Pulling…" : "Pull Results"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
