import { NextResponse } from 'next/server';

const LYZR_API_URL = 'https://agent-prod.studio.lyzr.ai/v3/inference/chat/';
const LYZR_API_KEY = process.env.LYZR_API_KEY || '';
const CRO_AGENT_ID = '6992c6ade9c656b13d173dc2';

export async function GET() {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'LYZR_API_KEY not configured in environment',
      }, { status: 500 });
    }

    const testQuestion = "What should I price a 1-bedroom apartment in Dubai Marina for next weekend? It has sea view, pool, and gym.";

    console.log('🧪 Testing CRO Agent...');
    console.log('Question:', testQuestion);
    console.log('Agent ID:', CRO_AGENT_ID);

    const response = await fetch(LYZR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify({
        message: testQuestion,
        agent_id: CRO_AGENT_ID,
        user_id: 'test-user-' + Date.now(),
        session_id: 'test-session-' + Date.now(),
      }),
    });

    const rawText = await response.text();
    console.log('Raw response:', rawText.substring(0, 200));

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Lyzr API returned ${response.status}`,
        raw: rawText,
      }, { status: response.status });
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawText);
    } catch (e) {
      parsedResponse = { raw: rawText };
    }

    console.log('✅ Agent responded successfully');

    return NextResponse.json({
      success: true,
      question: testQuestion,
      agent_id: CRO_AGENT_ID,
      response: parsedResponse,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
