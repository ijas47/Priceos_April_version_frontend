import { getSession } from "@/lib/auth/server";
import { BacktestClient } from "./backtest-client";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const session = await getSession();

  return (
    <div className="p-8 max-w-7xl space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Backtest Harness
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          Replay pricing decisions against actual booking outcomes to measure
          accuracy.
        </p>
      </div>
      <BacktestClient orgId={session?.orgId ?? null} />
    </div>
  );
}
