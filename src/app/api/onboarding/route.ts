import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB, Organization, Listing } from "@/lib/db";
import { getSession, COOKIE_NAME } from "@/lib/auth/server";
import { signAccessToken } from "@/lib/auth/jwt";
import { runAutoSetup } from "@/lib/engine/auto-setup";
import mongoose from "mongoose";

/** POST /api/onboarding - persist onboarding progress on the org. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await connectDB();
    await Organization.findByIdAndUpdate(session.orgId, {
      $set: { onboardingStep: body.step ?? "complete", ...(body.marketCode ? { marketCode: body.marketCode } : {}) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Onboarding POST]", error);
    return NextResponse.json({ error: "Failed to save onboarding" }, { status: 500 });
  }
}

/**
 * PATCH /api/onboarding - full wizard save.
 *
 * Called by the wizard at each step transition. On the final "complete" step
 * it seeds listings to the DB, runs auto-setup, and returns a fresh JWT.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await connectDB();

    const orgId = session.orgId;
    const orgOid = new mongoose.Types.ObjectId(orgId);

    // Persist step progress
    const updates: Record<string, unknown> = {};
    if (body.step) updates.onboardingStep = body.step;
    if (body.marketCode) updates.marketCode = body.marketCode;
    if (body.strategy) {
      updates["settings.guardrails.maxSingleDayChangePct"] =
        body.strategy === "conservative" ? 10 : body.strategy === "aggressive" ? 25 : 15;
      updates["settings.guardrails.autoApproveThreshold"] =
        body.strategy === "conservative" ? 3 : body.strategy === "aggressive" ? 10 : 5;
    }

    if (Object.keys(updates).length > 0) {
      await Organization.findByIdAndUpdate(orgId, { $set: updates });
    }

    // On completion: seed listings + auto-setup
    if (body.step === "complete" && body.listings?.length > 0) {
      const activatedIds = new Set<string>(body.activatedListingIds || []);

      // Seed ALL listings to DB (upsert by hostawayId or name+org)
      const seededListingIds: string[] = [];
      for (const l of body.listings) {
        const filter = l.hostawayId
          ? { hostawayId: l.hostawayId }
          : { orgId: orgOid, name: l.name };

        const doc = await Listing.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              orgId: orgOid,
              name: l.name,
              city: l.city || "",
              countryCode: l.countryCode || "",
              area: l.area || l.city || "",
              bedroomsNumber: l.bedrooms ?? 1,
              bathroomsNumber: l.bathroomsNumber ?? 1,
              propertyTypeId: l.propertyTypeId ?? 0,
              price: l.price || 0,
              currencyCode: l.currencyCode || "AED",
              personCapacity: l.personCapacity ?? 2,
            },
            $set: {
              hostawayId: l.hostawayId || l.id,
              isActive: activatedIds.has(l.id),
            },
          },
          { upsert: true, new: true },
        );
        seededListingIds.push(doc._id.toString());
      }

      // Run auto-setup for activated listings (non-blocking)
      const activeListingIds = seededListingIds.filter((_, i) =>
        activatedIds.has(body.listings[i].id),
      );

      if (activeListingIds.length > 0 && body.marketCode) {
        // Fire auto-setup in background - don't block the response
        runAutoSetup({
          orgId,
          listingIds: activeListingIds,
          marketCode: body.marketCode,
          strategy: body.strategy || "balanced",
          pricingDefaults: body.pricingDefaults,
        }).catch((err) => {
          console.error("[onboarding] auto-setup background error:", err.message);
        });
      }

      // Issue fresh JWT with onboardingStep: "complete"
      const org = await Organization.findById(orgId).lean();
      const token = signAccessToken({
        userId: session.userId,
        orgId,
        email: session.email,
        role: session.role,
        isApproved: true,
        onboardingStep: "complete",
      });

      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      return NextResponse.json({
        success: true,
        step: "complete",
        listingsSeeded: seededListingIds.length,
        listingsActivated: activeListingIds.length,
        autoSetupTriggered: activeListingIds.length > 0,
      });
    }

    return NextResponse.json({ success: true, step: body.step });
  } catch (error: any) {
    console.error("[Onboarding PATCH]", error);
    return NextResponse.json(
      { error: error.message || "Failed to save onboarding" },
      { status: 500 },
    );
  }
}
