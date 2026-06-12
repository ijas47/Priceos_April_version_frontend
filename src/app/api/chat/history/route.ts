import { NextRequest, NextResponse } from "next/server";
import { connectDB, ChatMessage } from "@/lib/db";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const sessionId = searchParams.get("sessionId");

    try {
        await connectDB();

        const query: Record<string, unknown> = {};

        if (propertyId && propertyId !== "null") {
            query["context.propertyId"] = new mongoose.Types.ObjectId(propertyId);
            if (sessionId) {
                query.sessionId = sessionId;
            }
        } else {
            query["context.type"] = "portfolio";
        }

        const history = await ChatMessage.find(query)
            .sort({ createdAt: 1 })
            .lean();

        const messages = history.map((msg) => ({
            id: msg._id.toString(),
            role: msg.role,
            content: msg.content,
            proposals: (msg.metadata as any)?.proposals || undefined,
            proposalStatus: (msg.metadata as any)?.proposals ? "pending" : undefined,
        }));

        return NextResponse.json({ messages, rawHistory: history });
    } catch (err) {
        console.error("Failed to fetch chat history:", err);
        return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
    }
}
