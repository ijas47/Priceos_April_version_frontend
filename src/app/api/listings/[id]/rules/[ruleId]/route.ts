import { NextResponse } from "next/server";

// Seasonal rules API removed - Use AI pricing proposals instead
export async function PUT() {
  return NextResponse.json({
    error: "Seasonal rules removed in Price Intelligence Layer redesign. Use AI pricing proposals instead."
  }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({
    error: "Seasonal rules removed in Price Intelligence Layer redesign. Use AI pricing proposals instead."
  }, { status: 410 });
}
