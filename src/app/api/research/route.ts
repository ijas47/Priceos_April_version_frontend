import { NextRequest, NextResponse } from "next/server";
import { createInternetResearchAgent } from "@/lib/agents/internet-research-agent";

/**
 * POST /api/research
 * 
 * Endpoint for the Internet Research Agent.
 * Called by the Pricing Agent (or directly) to get real-time market intelligence.
 * 
 * Body:
 *   - type: "events" | "market_rates" | "area_intelligence" | "tourism_trends" | "general"
 *   - area: string (e.g., "Dubai Marina")
 *   - startDate?: string (YYYY-MM-DD)
 *   - endDate?: string (YYYY-MM-DD)
 *   - bedrooms?: number (for market_rates)
 *   - query?: string (for general queries)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, area, startDate, endDate, bedrooms, query } = body;

        if (!type) {
            return NextResponse.json(
                { error: "Missing 'type' field. Must be: events, market_rates, area_intelligence, tourism_trends, or general" },
                { status: 400 }
            );
        }

        const agent = createInternetResearchAgent();

        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate
            ? new Date(endDate)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        let result;

        switch (type) {
            case "events":
                result = await agent.searchEvents(area || "Dubai", start, end);
                break;

            case "market_rates":
                result = await agent.searchMarketRates(
                    area || "Dubai",
                    bedrooms || 1,
                    start,
                    end
                );
                break;

            case "area_intelligence":
                result = await agent.searchAreaIntelligence(area || "Dubai");
                break;

            case "tourism_trends":
                result = await agent.searchTourismTrends(start, end);
                break;

            case "general":
                if (!query) {
                    return NextResponse.json(
                        { error: "Missing 'query' field for general research" },
                        { status: 400 }
                    );
                }
                result = await agent.generalQuery(query, area || "Dubai");
                break;

            default:
                return NextResponse.json(
                    { error: `Unknown type: ${type}` },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("[/api/research] Error:", error);
        return NextResponse.json(
            { error: "Failed to perform research", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
