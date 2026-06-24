import { NextRequest, NextResponse } from "next/server";

const DEMO_LISTINGS = [
  { id: "demo-1", name: "Marina Heights 1BR", bedrooms: 1, city: "Dubai", type: "Apartment", thumbnail: null },
  { id: "demo-2", name: "Downtown Residences 2BR", bedrooms: 2, city: "Dubai", type: "Apartment", thumbnail: null },
  { id: "demo-3", name: "JBR Beach Studio", bedrooms: 0, city: "Dubai", type: "Studio", thumbnail: null },
  { id: "demo-4", name: "Palm Villa 3BR", bedrooms: 3, city: "Dubai", type: "Villa", thumbnail: null },
  { id: "demo-5", name: "Bay View 1BR", bedrooms: 1, city: "Dubai", type: "Apartment", thumbnail: null },
];

/**
 * GET /api/hostaway/metadata?accountId=X&apiSecret=Y
 *
 * Validates Hostaway credentials and fetches property listings.
 * Falls back to demo listings if real API is unavailable.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const accountId = searchParams.get("accountId")?.trim();
    const apiSecret = searchParams.get("apiSecret")?.trim();

    if (!accountId || !apiSecret) {
      return NextResponse.json(
        { error: "accountId and apiSecret are required" },
        { status: 400 },
      );
    }

    // Try real Hostaway API
    try {
      const tokenRes = await fetch("https://api.hostaway.com/v1/accessTokens", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: accountId,
          client_secret: apiSecret,
          scope: "general",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => "");
        console.warn("[hostaway/metadata] auth failed:", tokenRes.status, errBody.slice(0, 200));
        throw new Error("auth_failed");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) throw new Error("no_token");

      const listingsRes = await fetch("https://api.hostaway.com/v1/listings", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!listingsRes.ok) throw new Error("listings_fetch_failed");

      const listingsData = await listingsRes.json();
      const rawListings = listingsData.result || [];

      const listings = rawListings.map((l: any) => ({
        id: String(l.id),
        hostawayId: String(l.id),
        name: l.name || `Listing ${l.id}`,
        bedrooms: l.bedroomsNumber ?? 1,
        city: l.city || "",
        countryCode: l.countryCode || "",
        type: l.propertyTypeId === 1 ? "Apartment" : l.propertyTypeId === 2 ? "House" : "Property",
        thumbnail: l.thumbnailUrl || null,
        price: l.price || 0,
        currencyCode: l.currencyCode || "AED",
        bathroomsNumber: l.bathroomsNumber || 1,
        personCapacity: l.personCapacity || 2,
        area: l.area || l.city || "",
      }));

      return NextResponse.json({
        success: true,
        mode: "real",
        listings,
        total: listings.length,
      });
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[hostaway/metadata] falling back to demo:", msg);

      return NextResponse.json({
        success: true,
        mode: "fallback_available",
        reason: msg === "auth_failed"
          ? "Invalid credentials - showing demo properties instead"
          : "Could not reach Hostaway API - showing demo properties instead",
        listings: DEMO_LISTINGS,
        total: DEMO_LISTINGS.length,
      });
    }
  } catch (error: any) {
    console.error("[hostaway/metadata]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch metadata" },
      { status: 500 },
    );
  }
}
