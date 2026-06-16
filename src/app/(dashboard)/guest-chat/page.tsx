import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { GuestInboxWired } from "@/components/chat/guest-inbox-wired";
import type { PropertyWithMetrics } from "@/types";
import { apiBase } from "@/lib/api/absolute-url";

export const metadata = {
    title: "Guest Inbox | PriceOS Intelligence",
    description: "Real-time guest communication and AI-powered relationship management.",
};

export default async function GuestChatPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("priceos-session")?.value;
    if (!token) redirect("/login");

    let orgObjectId: string;
    try {
        const payload = verifyAccessToken(token);
        orgObjectId = payload.orgId;
    } catch {
        redirect("/login");
    }

    let propertiesWithMetrics: PropertyWithMetrics[] = [];
    try {
        const backend = await apiBase();
        const res = await fetch(
            `${backend}/properties?orgId=${encodeURIComponent(orgObjectId)}`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const properties = Array.isArray(data?.properties) ? data.properties : [];
        propertiesWithMetrics = properties.map((p: Record<string, unknown>) => ({
            ...p,
            id: String(p.id ?? p._id ?? ""),
            _id: String(p.id ?? p._id ?? ""),
            basePrice: Number(p.basePrice ?? p.listedPrice ?? p.price ?? 0),
            displayRate: Number(p.displayRate ?? p.avgPrice ?? p.basePrice ?? p.price ?? 0),
            rateLabel: (p.rateLabel as "Listed Rate" | "Avg Rate" | undefined) ?? "Listed Rate",
            price: Number(p.displayRate ?? p.basePrice ?? p.price ?? 0),
            occupancy: Number(p.occupancyPct ?? p.occupancy ?? 0),
            avgPrice: Number(p.displayRate ?? p.avgPrice ?? p.basePrice ?? p.price ?? 0),
        }));
    } catch (err) {
        console.error("[guest-chat page] failed to load properties", err);
    }

    return (
        <div className="flex h-full overflow-hidden">
            <GuestInboxWired orgId={orgObjectId} properties={propertiesWithMetrics} />
        </div>
    );
}
