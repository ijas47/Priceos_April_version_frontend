import { NextRequest, NextResponse } from "next/server";
import { connectDB, Insight } from "@/lib/db";
import { requireSession } from "@/lib/auth/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    await connectDB();

    const body = await req.json();
    const { status, modifiedAction, snoozeUntil } = body;

    const validTransitions: Record<string, string[]> = {
      pending: ["approved", "modified", "rejected", "snoozed"],
      snoozed: ["pending", "approved", "rejected"],
      approved: ["superseded"],
      modified: ["superseded"],
    };

    const insight = await Insight.findOne({ _id: id, orgId: session.orgId });
    if (!insight) return NextResponse.json({ error: "Insight not found" }, { status: 404 });

    const allowed = validTransitions[insight.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${insight.status} → ${status}` },
        { status: 400 }
      );
    }

    insight.status = status;
    insight.resolvedBy = session.email;
    insight.resolvedAt = new Date();

    if (status === "modified" && modifiedAction) {
      insight.modifiedAction = modifiedAction;
    }
    if (status === "snoozed") {
      insight.snoozeUntil = snoozeUntil ? new Date(snoozeUntil) : new Date(Date.now() + 7 * 86400000);
    }

    await insight.save();
    return NextResponse.json({ success: true, insight });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Insights PATCH/:id]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    await connectDB();

    await Insight.findOneAndDelete({ _id: id, orgId: session.orgId });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
