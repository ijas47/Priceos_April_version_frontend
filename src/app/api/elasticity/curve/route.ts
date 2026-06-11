import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { elasticityCurve, optimalPrice } from "@/lib/elasticity/model";
import type { ElasticityParams } from "@/lib/elasticity/types";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const CurveRequestSchema = z.object({
  beta0: z.coerce.number(),
  beta1: z.coerce.number(),
  adr: z.coerce.number().positive(),
  sampleSize: z.coerce.number().int().min(0).optional(),
  floor: z.coerce.number().positive(),
  ceiling: z.coerce.number().positive(),
  steps: z.coerce.number().int().min(5).max(200).optional(),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    // Auth
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    verifyAccessToken(token); // validates token, throws on failure

    // Parse & validate query params
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = CurveRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { beta0, beta1, adr, floor, ceiling, steps } = parsed.data;

    if (ceiling <= floor) {
      return NextResponse.json(
        { error: "ceiling must be greater than floor" },
        { status: 400 },
      );
    }

    const params: ElasticityParams = {
      beta0,
      beta1,
      adr,
      sampleSize: parsed.data.sampleSize ?? 0,
      fittedAt: new Date().toISOString(),
    };

    const curve = elasticityCurve(params, floor, ceiling, steps);
    const optimal = optimalPrice(params, floor, ceiling);

    return NextResponse.json({ curve, optimal });
  } catch (err) {
    console.error("[elasticity/curve GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
