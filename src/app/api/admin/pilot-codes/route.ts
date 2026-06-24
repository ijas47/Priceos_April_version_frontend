import { NextRequest, NextResponse } from "next/server";
import { connectDB, PilotAccessCode } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import {
  generatePilotCodeValue,
  isOpenRegistrationEnabled,
  envPilotBypassCode,
} from "@/lib/auth/pilot-access";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

function requireOwnerOrAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return { error: "Unauthorized", status: 401 as const };
  if (session.role !== "owner" && session.role !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }
  return null;
}

/** GET /api/admin/pilot-codes */
export async function GET() {
  const session = await getSession();
  const gate = requireOwnerOrAdmin(session);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  await connectDB();
  const codes = await PilotAccessCode.find({})
    .sort({ createdAt: -1 })
    .select("-redeemedBy")
    .lean();

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c._id.toString(),
      code: c.code,
      label: c.label,
      plan: c.plan,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      isActive: c.isActive,
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    })),
    config: {
      openRegistration: isOpenRegistrationEnabled(),
      envBypassConfigured: !!envPilotBypassCode(),
    },
  });
}

/** POST /api/admin/pilot-codes — create a new code */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const gate = requireOwnerOrAdmin(session);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const plan = body.plan === "growth" || body.plan === "scale" ? body.plan : "starter";
  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses) || 1));
  const expiresInDays = body.expiresInDays ? Number(body.expiresInDays) : null;
  const customCode =
    typeof body.code === "string" && body.code.trim()
      ? body.code.trim().toUpperCase().replace(/\s+/g, "-")
      : generatePilotCodeValue();

  await connectDB();

  const existing = await PilotAccessCode.findOne({ code: customCode }).lean();
  if (existing) {
    return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  }

  const expiresAt =
    expiresInDays && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

  const doc = await PilotAccessCode.create({
    code: customCode,
    label: label || `Pilot — ${customCode}`,
    plan,
    maxUses,
    createdByOrgId: new mongoose.Types.ObjectId(session!.orgId),
    expiresAt,
  });

  return NextResponse.json(
    {
      code: {
        id: doc._id.toString(),
        code: doc.code,
        label: doc.label,
        plan: doc.plan,
        maxUses: doc.maxUses,
        expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
      },
    },
    { status: 201 }
  );
}

/** PATCH /api/admin/pilot-codes — deactivate { id } */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const gate = requireOwnerOrAdmin(session);
  if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await connectDB();
  await PilotAccessCode.findByIdAndUpdate(body.id, {
    $set: { isActive: body.isActive !== false },
  });

  return NextResponse.json({ success: true });
}