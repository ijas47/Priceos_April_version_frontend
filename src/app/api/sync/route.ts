import { NextRequest, NextResponse } from "next/server";
import { auth } from '@/lib/auth/server'

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const { context, propertyId } = await req.json();

    if (!context) {
      return NextResponse.json(
        { success: false, error: "Missing context parameter" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const { data: session, error } = await auth.getSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Proxy to Python backend
    const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        listing_id: propertyId || null,
        context: context,
      }),
    })

    const pythonData = await pythonResponse.json()

    if (!pythonResponse.ok) {
      return NextResponse.json(
        { success: false, error: pythonData.detail || 'Python backend error' },
        { status: pythonResponse.status }
      );
    }

    // Return Python backend response
    return NextResponse.json(pythonData)

  } catch (error) {
    console.error("Sync error:", error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
