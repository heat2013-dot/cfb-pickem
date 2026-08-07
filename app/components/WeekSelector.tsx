"use client";

import { useRouter } from "next/navigation";

export default function WeekSelector({
  weeks,
  selectedId,
}: {
  weeks: { id: number; label: string }[];
  selectedId: number;
}) {
  const router = useRouter();
  return (
    <select
      className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      value={selectedId}
      onChange={(e) => router.push(`/?week=${e.target.value}`)}
    >
      {weeks.map((w) => (
        <option key={w.id} value={w.id}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
