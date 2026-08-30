"use client";

import { useRouter } from "next/navigation";

export default function WeekSelector({
  weeks,
  selectedId,
  basePath = "/",
}: {
  weeks: { id: number; label: string }[];
  selectedId: number;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <select
      className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      value={selectedId}
      onChange={(e) => router.push(`${basePath}?week=${e.target.value}`)}
    >
      {weeks.map((w) => (
        <option key={w.id} value={w.id}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
