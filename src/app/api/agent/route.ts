import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import type { AgentCacheContext } from '@/lib/cache/types'

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, agent_id, session_id, cache } = body

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'message is required',
          },
          error: 'message is required',
        },
        { status: 400 }
      )
    }

    // Get authenticated user
    const { data: session, error } = await auth.getSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'Unauthorized',
          },
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    // Proxy to Python backend
    const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/api/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        agent_id: agent_id || 'cro',
        user_id: session.user.id,
        session_id: session_id || `${agent_id || 'cro'}-${session.user.id}`,
        cache: cache || null,
      }),
    })

    const pythonData = await pythonResponse.json()

    if (!pythonResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: pythonData.detail || 'Python backend error',
          },
          error: pythonData.detail || 'Python backend error',
        },
        { status: pythonResponse.status }
      )
    }

    // Return Python backend response
    return NextResponse.json(pythonData)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      {
        success: false,
        response: {
          status: 'error',
          result: {},
          message: errorMsg,
        },
        error: errorMsg,
      },
      { status: 500 }
    )
  }
}
