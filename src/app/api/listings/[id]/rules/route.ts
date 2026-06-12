import { connectDB, PricingRule } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();
        const rules = await PricingRule.find({
            listingId: new mongoose.Types.ObjectId(id),
        }).lean();
        return NextResponse.json(rules);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const body = await req.json();
        const rule = await PricingRule.create({
            ...body,
            orgId,
            listingId: new mongoose.Types.ObjectId(id),
        });
        return NextResponse.json(rule);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
        return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });
    }

    try {
        await connectDB();
        await PricingRule.deleteOne({
            _id: new mongoose.Types.ObjectId(ruleId),
            listingId: new mongoose.Types.ObjectId(id),
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
