import { getSession } from "@/lib/auth/server";
import { PricingPageTabs } from "./pricing-page-tabs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBase } from "@/lib/api/absolute-url";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export default async function PricingPage() {
  const session = await getSession();
  if (!session?.orgId) {
    redirect("/login");
  }

  const API = await apiBase();
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  const authHeaders = { Authorization: `Bearer ${token ?? ""}` };

  // Listings only on the server — proposals load client-side to avoid RSC
  // payload limits when hundreds of rows carry long [COMPS] reasoning text.
  const listingsRes = await fetch(`${API}/listings/?orgId=${session.orgId}`, {
    headers: authHeaders,
    cache: "no-store",
  }).catch(() => null);

  const listingsPayload =
    listingsRes?.ok
      ? ((await listingsRes.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

  const listings = ((listingsPayload.listings as Record<string, unknown>[]) ?? []).map((l) => ({
    id: String(l.id ?? l._id ?? ""),
    name: String(l.name ?? ""),
    currencyCode: String(l.currencyCode || "AED"),
    pricingDataStatus: asString(l.pricingDataStatus),
    pricingDataSummary: asString(l.pricingDataSummary),
  }));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <PricingPageTabs
        initialProposals={[]}
        listings={listings}
        orgId={session.orgId}
      />
    </div>
  );
}

