"use client";

import { useTransition } from "react";
import { lockWeek, unlockWeek } from "@/lib/actions";

export default function LockPicksButton({
  weekId,
  locked,
}: {
  weekId: number;
  locked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (locked) {
        await unlockWeek(weekId);
      } else {
        await lockWeek(weekId);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={
        locked
          ? "rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          : "rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      }
    >
      {pending ? "Working…" : locked ? "Unlock Picks" : "Lock Picks"}
    </button>
  );
}
