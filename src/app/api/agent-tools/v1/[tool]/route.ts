import { NextRequest, NextResponse } from "next/server";
import { ListingAccessError } from "@/lib/db/assert-listing-owned";
import {
  agentToolsJsonHeaders,
  handleToolError,
  requireScopedSession,
} from "@/lib/agent-tools/utils";
import {
  defaultDateRange,
  handleGetAgentSystemStatus,
  handleGetGuestSummary,
  handleGetPortfolioOverview,
  handleGetPortfolioRevenueSnapshot,
  handleGetPropertyBenchmark,
  handleGetPropertyCalendarMetrics,
  handleGetPropertyMarketEvents,
  handleGetPropertyProfile,
  handleGetPropertyReservations,
  handleListGuestConversations,
} from "@/lib/agent-tools/v1-handlers";

export const dynamic = "force-dynamic";

const TOOL_ALIASES: Record<string, string> = {
  "get-portfolio-overview": "get_portfolio_overview",
  "get-agent-system-status": "get_agent_system_status",
  "get-portfolio-revenue-snapshot": "get_portfolio_revenue_snapshot",
  "get-property-profile": "get_property_profile",
  "get-property-calendar-metrics": "get_property_calendar_metrics",
  "get-property-reservations": "get_property_reservations",
  "get-property-market-events": "get_property_market_events",
  "get-property-benchmark": "get_property_benchmark",
  "list-guest-conversations": "list_guest_conversations",
  "get-guest-summary": "get_guest_summary",
};

function resolveOperationId(toolSegment: string): string | null {
  if (TOOL_ALIASES[toolSegment]) return TOOL_ALIASES[toolSegment];
  if (toolSegment.includes("_")) return toolSegment;
  return null;
}

/** GET /api/agent-tools/v1/{tool} — OpenAPI-aligned Lyzr tool surface */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ tool: string }> }
) {
  const { tool: toolSegment } = await ctx.params;
  const operationId = resolveOperationId(toolSegment);
  const endpoint = `agent-tools/v1/${toolSegment}`;

  if (!operationId) {
    return NextResponse.json(
      { error: `Unknown tool: ${toolSegment}` },
      { status: 404, headers: agentToolsJsonHeaders() }
    );
  }

  try {
    const { orgId } = await requireScopedSession(req, endpoint);
    const { searchParams } = new URL(req.url);
    const defaults = defaultDateRange();
    const dateFrom = searchParams.get("dateFrom") ?? defaults.dateFrom;
    const dateTo = searchParams.get("dateTo") ?? defaults.dateTo;

    let payload: unknown;

    switch (operationId) {
      case "get_portfolio_overview":
        payload = await handleGetPortfolioOverview(orgId, dateFrom, dateTo);
        break;
      case "get_agent_system_status":
        payload = await handleGetAgentSystemStatus(orgId);
        break;
      case "get_portfolio_revenue_snapshot":
        payload = await handleGetPortfolioRevenueSnapshot(orgId, dateFrom, dateTo);
        break;
      case "get_property_profile": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        payload = await handleGetPropertyProfile(orgId, listingId);
        break;
      }
      case "get_property_calendar_metrics": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        payload = await handleGetPropertyCalendarMetrics(
          orgId,
          listingId,
          dateFrom,
          dateTo
        );
        break;
      }
      case "get_property_reservations": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        const limit = Number(searchParams.get("limit") || 100);
        payload = await handleGetPropertyReservations(
          orgId,
          listingId,
          dateFrom,
          dateTo,
          limit
        );
        break;
      }
      case "get_property_market_events":
        payload = await handleGetPropertyMarketEvents(
          orgId,
          dateFrom,
          dateTo,
          searchParams.get("listingId") ?? undefined
        );
        break;
      case "get_property_benchmark": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        payload = await handleGetPropertyBenchmark(
          orgId,
          listingId,
          dateFrom,
          dateTo
        );
        break;
      }
      case "list_guest_conversations": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        payload = await handleListGuestConversations(
          orgId,
          listingId,
          dateFrom,
          dateTo
        );
        break;
      }
      case "get_guest_summary": {
        const listingId = searchParams.get("listingId");
        if (!listingId) throw new Error("MISSING_PARAM:listingId");
        payload = await handleGetGuestSummary(orgId, listingId, dateFrom, dateTo);
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unhandled tool: ${operationId}` },
          { status: 404, headers: agentToolsJsonHeaders() }
        );
    }

    return NextResponse.json(payload, { headers: agentToolsJsonHeaders() });
  } catch (error) {
    if (error instanceof ListingAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: agentToolsJsonHeaders() }
      );
    }
    if (error instanceof Error && error.message.startsWith("MISSING_PARAM:")) {
      const param = error.message.split(":")[1];
      return NextResponse.json(
        { error: `${param} is required` },
        { status: 400, headers: agentToolsJsonHeaders() }
      );
    }
    if (error instanceof Error && error.message === "INVALID_LISTING_ID") {
      return NextResponse.json(
        { error: "Invalid listingId" },
        { status: 400, headers: agentToolsJsonHeaders() }
      );
    }
    return handleToolError(error, endpoint);
  }
}