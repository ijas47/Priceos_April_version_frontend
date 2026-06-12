// Neon Auth catch-all — replaced by JWT auth.
// Kept as a stub to avoid 404s from any residual SDK calls.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function PUT() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function PATCH() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
