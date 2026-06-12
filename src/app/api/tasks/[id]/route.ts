import { NextResponse } from "next/server";

// Tasks API removed - Use HostAway for task management
export async function GET() {
  return NextResponse.json({
    error: "Tasks API removed in Price Intelligence Layer redesign. Use HostAway for task management."
  }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({
    error: "Tasks API removed in Price Intelligence Layer redesign. Use HostAway for task management."
  }, { status: 410 });
}
