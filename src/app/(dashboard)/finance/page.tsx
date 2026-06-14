import { getSession } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { FinanceDashboard } from "./finance-dashboard";
import { format, addDays } from "date-fns";
import { apiBase } from "@/lib/api/absolute-url";

export const metadata = {
  title: "Finance | PriceOS Intelligence",
  description: "Revenue overview, property performance, and pricing impact.",
};


export default async function FinancePage() {
  const API = await apiBase();
  const session = await getSession();
  if (!session?.orgId) redirect("/login");

  const { orgId } = session;
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  const authHeaders = { Authorization: `Bearer ${token}` };
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const plus30Str = format(addDays(new Date(), 30), "yyyy-MM-dd");

  const [listingsRes, portfolioRes, proposalsRes] = await Promise.allSettled([
    fetch(`${API}/listings/?orgId=${orgId}`, { headers: authHeaders, cache: "no-store" }),
    fetch(`${API}/agent-tools/portfolio-overview?orgId=${orgId}&dateFrom=${todayStr}&dateTo=${plus30Str}`, { headers: authHeaders, cache: "no-store" }),
    fetch(`${API}/v1/revenue/proposals?orgId=${orgId}&status=approved`, { headers: authHeaders, cache: "no-store" }),
  ]);

  const listings =
    listingsRes.status === "fulfilled" && listingsRes.value.ok
      ? ((await listingsRes.value.json().catch(() => ({}))) as Record<string, unknown>)?.listings ?? []
      : [];

  const portfolio =
    portfolioRes.status === "fulfilled" && portfolioRes.value.ok
      ? await portfolioRes.value.json().catch(() => ({}))
      : {};

  const proposals =
    proposalsRes.status === "fulfilled" && proposalsRes.value.ok
      ? ((await proposalsRes.value.json().catch(() => ({}))) as Record<string, unknown>)?.proposals ?? []
      : [];

  return (
    <FinanceDashboard
      listings={listings as Record<string, unknown>[]}
      portfolio={portfolio as Record<string, unknown>}
      proposals={proposals as Record<string, unknown>[]}
    />
  );
}
