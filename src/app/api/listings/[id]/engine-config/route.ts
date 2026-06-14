import { connectDB, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
        }
        await connectDB();

        // Tenant isolation: scope the lookup to the caller's org.
        const l = await Listing.findOne({
            _id: new mongoose.Types.ObjectId(id),
            orgId: session.orgId,
        }).lean();
        if (!l) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        const config = {
            priceFloor: l.priceFloor,
            priceCeiling: l.priceCeiling,
            lastMinuteEnabled: l.lastMinuteEnabled,
            lastMinuteDaysOut: l.lastMinuteDaysOut,
            lastMinuteDiscountPct: l.lastMinuteDiscountPct,
            lastMinuteMinStay: l.lastMinuteMinStay,
            farOutEnabled: l.farOutEnabled,
            farOutDaysOut: l.farOutDaysOut,
            farOutMarkupPct: l.farOutMarkupPct,
            farOutMinStay: l.farOutMinStay,
            dowPricingEnabled: l.dowPricingEnabled,
            dowDays: l.dowDays,
            dowPriceAdjPct: l.dowPriceAdjPct,
            dowMinStay: l.dowMinStay,
            gapPreventionEnabled: l.gapPreventionEnabled,
            minFragmentThreshold: l.minFragmentThreshold,
            gapFillEnabled: l.gapFillEnabled,
            gapFillLengthMin: l.gapFillLengthMin,
            gapFillLengthMax: l.gapFillLengthMax,
            gapFillDiscountPct: l.gapFillDiscountPct,
            gapFillOverrideCico: l.gapFillOverrideCico,
            allowedCheckinDays: l.allowedCheckinDays,
            allowedCheckoutDays: l.allowedCheckoutDays,
            lowestMinStayAllowed: l.lowestMinStayAllowed,
            defaultMaxStay: l.defaultMaxStay,
        };

        return NextResponse.json(config);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load config";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
        }
        await connectDB();

        const body = await req.json();
        const allowed = [
            "priceFloor", "priceCeiling",
            "lastMinuteEnabled", "lastMinuteDaysOut", "lastMinuteDiscountPct", "lastMinuteMinStay",
            "farOutEnabled", "farOutDaysOut", "farOutMarkupPct", "farOutMinStay",
            "dowPricingEnabled", "dowDays", "dowPriceAdjPct", "dowMinStay",
            "gapPreventionEnabled", "minFragmentThreshold",
            "gapFillEnabled", "gapFillLengthMin", "gapFillLengthMax", "gapFillDiscountPct", "gapFillOverrideCico",
            "allowedCheckinDays", "allowedCheckoutDays",
            "lowestMinStayAllowed", "defaultMaxStay",
        ];

        const updateFields: Record<string, unknown> = {};
        for (const key of allowed) {
            if (body[key] !== undefined) updateFields[key] = body[key];
        }

        // Tenant isolation: only update a listing the caller owns.
        const result = await Listing.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(id), orgId: session.orgId },
            { $set: updateFields }
        );
        if (!result) {
            return NextResponse.json(
                { error: "Listing not found or access denied" },
                { status: 404 }
            );
        }
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update config";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
