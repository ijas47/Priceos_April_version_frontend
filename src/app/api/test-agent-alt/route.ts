import { NextResponse } from 'next/server';

// Alternative endpoint: /v3/inference/{agent_id}/chat/completions
const LYZR_API_KEY = process.env.LYZR_API_KEY || '';
const CRO_AGENT_ID = '6992c6ade9c656b13d173dc2';
const LYZR_API_URL = `https://agent-prod.studio.lyzr.ai/v3/inference/${CRO_AGENT_ID}/chat/completions`;

export async function GET() {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'LYZR_API_KEY not configured in environment',
      }, { status: 500 });
    }

    const testQuestion = "What should I price a 1-bedroom apartment in Dubai Marina for next weekend? It has sea view, pool, and gym.";

    console.log('🧪 Testing CRO Agent (Alternative Endpoint)...');
    console.log('Endpoint:', LYZR_API_URL);
    console.log('Question:', testQuestion);

    const response = await fetch(LYZR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: testQuestion
          }
        ],
        stream: false
      }),
    });

    const rawText = await response.text();
    console.log('Raw response:', rawText.substring(0, 500));

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Lyzr API returned ${response.status}`,
        raw: rawText,
        endpoint: 'alternative (/v3/inference/{agent_id}/chat/completions)',
      }, { status: response.status });
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawText);
    } catch (e) {
      parsedResponse = { raw: rawText };
    }

    console.log('✅ Agent responded successfully via alternative endpoint');

    return NextResponse.json({
      success: true,
      question: testQuestion,
      agent_id: CRO_AGENT_ID,
      endpoint: 'alternative (/v3/inference/{agent_id}/chat/completions)',
      response: parsedResponse,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: 'alternative',
    }, { status: 500 });
  }
}
