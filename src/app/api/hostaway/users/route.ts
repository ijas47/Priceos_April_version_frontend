import { NextResponse } from "next/server";

export async function GET(request: Request) {
    console.log("🚀 [Hostaway Sync] Starting GET request to /api/hostaway/users");

    try {
        const token = process.env.Hostaway_Authorization_token;
        if (!token) {
            throw new Error("Hostaway_Authorization_token is not set");
        }

        console.log("📥 [Hostaway Sync] Fetching live conversations from Hostaway securely (GET only)...");

        // Fetch conversations
        const res = await fetch("https://api.hostaway.com/v1/conversations?limit=25", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error(`Hostaway API returned ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        const conversationsRaw = json.result || [];

        // Format to match our UI shape so we can easily inject it
        const formattedConversations = conversationsRaw.map((conv: any) => {
            return {
                id: conv.id.toString(),
                guestName: conv.guestName || "Unknown Guest",
                lastMessage: conv.lastMessage?.body || "No messages",
                status: 'needs_reply', // Simplify for demo
                messages: [] // We can fetch per-conversation later if needed
            };
        });

        console.log(`✅ [Hostaway Sync] Successfully fetched ${formattedConversations.length} live conversations`);

        return NextResponse.json({
            success: true,
            message: "Hostaway conversations synced",
            conversations: formattedConversations
        });
    } catch (error) {
        console.error("❌ [Hostaway Sync] Error fetching data:", error);
        return NextResponse.json({ error: "Failed to sync" }, { status: 500 });
    }
}
