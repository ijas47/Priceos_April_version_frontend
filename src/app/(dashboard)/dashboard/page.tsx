/**
 * dashboard/page.tsx — Server Component
 *
 * Loads portfolio metrics directly from MongoDB (no self-fetch to /api).
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { loadPortfolioDashboardData } from "@/lib/dashboard/portfolio-metrics";
import { OverviewClient } from "./overview-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.orgId) redirect("/login");

  let data;
  try {
    data = await loadPortfolioDashboardData(session.orgId);
  } catch (error) {
    console.error("[Dashboard] failed to load portfolio metrics:", error);
    data = {
      properties: [],
      totalProperties: 0,
      avgPortfolioOccupancy: 0,
      avgPortfolioPrice: 0,
      totalPortfolioRevenue: 0,
      totalHistoricalRevenue: 0,
      projectedPortfolioRevenue: 0,
    };
  }

  return (
    <OverviewClient
      orgId={session.orgId}
      properties={data.properties}
      totalProperties={data.totalProperties}
      avgPortfolioOccupancy={data.avgPortfolioOccupancy}
      avgPortfolioPrice={data.avgPortfolioPrice}
      totalPortfolioRevenue={data.totalPortfolioRevenue}
      totalHistoricalRevenue={data.totalHistoricalRevenue}
    />
  );
}