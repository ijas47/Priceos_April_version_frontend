/**
 * GET /api/lyzr-cleanup
 * One-time cleanup endpoint — deletes all duplicate active_property_data
 * and active_property_data_test contexts from the Lyzr account.
 * Safe to call multiple times.
 */

import { NextResponse } from "next/server";

const LYZR_BASE_URL = "https://agent-prod.studio.lyzr.ai/v3";
const STALE_NAMES = ["active_property_data", "active_property_data_test"];

export const dynamic = "force-dynamic";

export async function GET() {
    const apiKey = process.env.LYZR_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "LYZR_API_KEY not set" }, { status: 500 });
    }

    const headers = {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
    };

    try {
        // List all contexts
        const listRes = await fetch(`${LYZR_BASE_URL}/contexts/?skip=0&limit=100`, {
            method: "GET",
            headers,
        });

        if (!listRes.ok) {
            return NextResponse.json({ error: `List failed: ${listRes.status}` }, { status: 502 });
        }

        const rawBody = await listRes.json();
        let allContexts: { id: string; name: string }[] = [];

        if (Array.isArray(rawBody)) {
            allContexts = rawBody;
        } else if (rawBody && typeof rawBody === "object") {
            allContexts =
                rawBody.response || rawBody.results || rawBody.data || rawBody.contexts || [];
        }

        console.log(`🧹 [Cleanup] Found ${allContexts.length} total contexts. Raw type: ${Array.isArray(rawBody) ? 'array' : typeof rawBody}`);
        // Log the FIRST context's raw structure so we know all field names
        if (allContexts.length > 0) {
            console.log(`🔍 [Cleanup] First context raw fields:`, JSON.stringify(allContexts[0]));
        }
        console.log(`🧹 [Cleanup] All context names:`, allContexts.map((c: any) => `${c.name || c.context_name} (id=${c.id || c._id || c.context_id})`));

        // Delete all matching stale contexts
        const deleted: string[] = [];
        const failed: string[] = [];

        for (const ctx of allContexts) {
            const ctxName = (ctx.name || (ctx as any).context_name || "").trim();
            // Try all possible ID field names the Lyzr API might use
            const ctxId = (ctx as any).id || (ctx as any)._id || (ctx as any).context_id;
            if (STALE_NAMES.includes(ctxName)) {
                if (!ctxId) {
                    console.warn(`⚠️  [Cleanup] Context "${ctxName}" has no ID — cannot delete. Raw:`, JSON.stringify(ctx));
                    failed.push(`${ctxName} (no ID found)`);
                    continue;
                }
                console.log(`🗑️  [Cleanup] Deleting "${ctxName}" (${ctxId})...`);
                const delRes = await fetch(`${LYZR_BASE_URL}/contexts/${ctxId}`, {
                    method: "DELETE",
                    headers,
                });
                if (delRes.ok) {
                    deleted.push(`${ctxName} (${ctxId})`);
                } else {
                    const errText = await delRes.text().catch(() => "");
                    failed.push(`${ctxName} (${ctxId}) → ${delRes.status}: ${errText.slice(0, 100)}`);
                }
            }
        }

        console.log(`✅ [Cleanup] Done. Deleted: ${deleted.length}, Failed: ${failed.length}`);

        return NextResponse.json({
            success: true,
            message: `Deleted ${deleted.length} stale context(s).`,
            deleted,
            failed,
            allContextNames: allContexts.map((c: any) => ({ id: c.id, name: c.name })),
        });

    } catch (err) {
        console.error("[Cleanup] Error:", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
