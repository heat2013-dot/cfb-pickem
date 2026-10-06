import type { Metadata } from "next";
import NetWorthProjector from "@/app/components/NetWorthProjector";

export const metadata: Metadata = {
  title: "Net Worth Projection",
  description: "Monte Carlo projection of future net worth with upper and lower bounds",
};

export default function NetWorthPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Net Worth Projection</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter where you stand today to see a range of where your net worth could go.
        </p>
      </header>
      <NetWorthProjector />
    </main>
  );
}
