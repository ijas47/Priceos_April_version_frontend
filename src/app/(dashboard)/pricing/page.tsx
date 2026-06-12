import { getSession } from "@/lib/auth/server";
import { PricingPageTabs } from "./pricing-page-tabs";
import { cookies } from "next/headers";
import { apiBase } from "@/lib/api/absolute-url";

export const dynamic = "force-dynamic";


export default async function PricingPage() {
  const API = await apiBase();
  const session = await getSession();
  if (!session?.orgId) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;

  // Fetch listings and proposals in parallel
  const [listingsRes, proposalsRes] = await Promise.all([
    fetch(`${API}/listings/?orgId=${session.orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
    fetch(`${API}/v1/revenue/proposals?orgId=${session.orgId}&status=all`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),

  ]).catch(() => [null, null]);

  const listingsData = listingsRes?.ok ? await listingsRes.json() : { listings: [] };
  const proposalsData = proposalsRes?.ok ? await proposalsRes.json() : { proposals: [] };

  const listings = (listingsData.listings ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    currencyCode: l.currencyCode || "AED",
  }));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <PricingPageTabs 
        initialProposals={proposalsData.proposals ?? []} 
        listings={listings} 
        orgId={session.orgId}
      />
    </div>
  );
}

