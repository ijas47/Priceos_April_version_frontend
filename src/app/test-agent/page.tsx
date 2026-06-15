'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const TEST_QUESTIONS = [
  "What should I price Marina Heights 1BR for next weekend?",
  "How are competitors pricing in Downtown Dubai right now?",
  "What events are affecting Dubai prices this month?",
  "Should I adjust prices for the Dubai Shopping Festival?",
  "What's the optimal price for a Palm Villa during Ramadan?",
];

export default function TestAgentPage() {
  const [question, setQuestion] = useState(TEST_QUESTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testAgent = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          user_id: 'test-user-' + Date.now(),
          session_id: 'test-session-' + Date.now(),
        }),
      });

      const data = await res.json();
      setResponse(data);

      if (!data.success) {
        setError(data.error || data.response?.message || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">🧪 Lyzr Agent Test</h1>
        <p className="text-muted-foreground">
          Test the CRO (Chief Revenue Officer) agent with sample pricing questions
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
          <CardDescription>
            Agent ID is resolved from server configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Sample Questions</label>
            <div className="grid grid-cols-1 gap-2">
              {TEST_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant={question === q ? 'default' : 'outline'}
                  onClick={() => setQuestion(q)}
                  className="justify-start text-left h-auto py-2 px-4"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Custom Question</label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter your pricing question..."
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <Button
            onClick={testAgent}
            disabled={loading || !question.trim()}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing Agent...
              </>
            ) : (
              '🚀 Test Agent'
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">❌ Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded overflow-auto">{error}</pre>
          </CardContent>
        </Card>
      )}

      {response && (
        <Card className={response.success ? 'border-green-500' : 'border-destructive'}>
          <CardHeader>
            <CardTitle className={response.success ? 'text-green-500' : 'text-destructive'}>
              {response.success ? '✅ Success' : '⚠️ Response'}
            </CardTitle>
            <CardDescription>
              Timestamp: {response.timestamp || 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {response.response?.message && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Agent Response:</h3>
                <div className="bg-muted p-4 rounded">
                  <p className="whitespace-pre-wrap">{response.response.message}</p>
                </div>
              </div>
            )}

            {response.response?.result && Object.keys(response.response.result).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Structured Data:</h3>
                <pre className="text-xs bg-muted p-4 rounded overflow-auto">
                  {JSON.stringify(response.response.result, null, 2)}
                </pre>
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold mb-2">
                🔍 Full Response (Debug)
              </summary>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>💡 Agent Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Dubai-specific pricing knowledge (Marina, Downtown, JBR, Palm, Business Bay)</li>
            <li>Event-aware recommendations (festivals, conferences, Ramadan, Expo)</li>
            <li>Competitor analysis and market positioning</li>
            <li>Risk classification (low/medium/high)</li>
            <li>Structured JSON output with pricing data</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
