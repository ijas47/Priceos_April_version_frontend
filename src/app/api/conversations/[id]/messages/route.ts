import { NextResponse } from "next/server";

// Conversations API removed - Use HostAway for guest messaging
export async function GET() {
  return NextResponse.json({
    error: "Conversations API removed in Price Intelligence Layer redesign. Use HostAway for guest messaging."
  }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({
    error: "Conversations API removed in Price Intelligence Layer redesign. Use HostAway for guest messaging."
  }, { status: 410 });
}
