import { NextResponse } from "next/server";

// Expenses API removed - Use HostAway for financial tracking
export async function GET() {
  return NextResponse.json({ 
    error: "Expenses API removed in Price Intelligence Layer redesign. Use HostAway for financial tracking." 
  }, { status: 410 });
}
