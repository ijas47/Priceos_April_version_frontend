import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { format, eachDayOfInterval } from "date-fns";
import { createEventIntelligenceAgent } from "./event-intelligence-agent";
import mongoose from "mongoose";

export interface PricingProposal {
  listingId: string;
  date: string;
  currentPrice: number;
  proposedPrice: number;
  priceFloor: number;
  priceCeiling: number;
  changePct: number;
  riskLevel: "low" | "medium" | "high";
  reasoning: string;
}

export interface AnalysisResult {
  proposals: PricingProposal[];
  summary: string;
  totalProposals: number;
  averageIncrease: number;
}

/**
 * Pricing Analyst Agent
 * Generates pricing proposals based on data and signals
 */
export class PricingAnalystAgent {
  private eventAgent = createEventIntelligenceAgent();

  async generateProposals(
    listingId: mongoose.Types.ObjectId | string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalysisResult> {
    await connectDB();

    const proposals: PricingProposal[] = [];
    const lid = typeof listingId === "string"
      ? new mongoose.Types.ObjectId(listingId)
      : listingId;

    const listing = await Listing.findById(lid).lean();
    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    const eventAnalysis = await this.eventAgent.analyzeEvents(startDate, endDate);

    const calendar = await InventoryMaster.find({
      listingId: lid,
      date: {
        $gte: format(startDate, "yyyy-MM-dd"),
        $lte: format(endDate, "yyyy-MM-dd"),
      },
    }).lean();

    const occupancy = await this.calculateOccupancy(lid, startDate, endDate);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      const calendarDay = calendar.find((d) => d.date === dateStr);
      const currentPrice = calendarDay ? Number(calendarDay.currentPrice) : Number(listing.price);

      const basePrice = Number(listing.price);
      const priceFloor = listing.priceFloor > 0 ? listing.priceFloor : Math.round(basePrice * 0.5);
      const priceCeiling = listing.priceCeiling > 0 ? listing.priceCeiling : Math.round(basePrice * 3.0);

      const dayEvents = eventAnalysis.events.filter(
        (e) => e.startDate <= dateStr && e.endDate >= dateStr
      );

      let proposedPrice = currentPrice;
      let reasoning = "";

      if (dayEvents.length > 0) {
        const recommendation = this.eventAgent.getPricingRecommendation(dayEvents);
        const increase = (currentPrice * recommendation.suggestedIncrease) / 100;
        proposedPrice = currentPrice + increase;
        reasoning = recommendation.reasoning;
      } else {
        if (occupancy > 80) {
          proposedPrice = currentPrice * 1.1;
          reasoning = `High occupancy (${occupancy}%). Demand is strong, increase pricing.`;
        } else if (occupancy < 60) {
          proposedPrice = currentPrice * 0.9;
          reasoning = `Low occupancy (${occupancy}%). Decrease price to attract bookings.`;
        } else {
          proposedPrice = currentPrice;
          reasoning = `Moderate occupancy (${occupancy}%). Maintain current pricing.`;
        }
      }

      if (proposedPrice < priceFloor) {
        proposedPrice = priceFloor;
        reasoning += ` (Capped at floor: AED ${priceFloor})`;
      } else if (proposedPrice > priceCeiling) {
        proposedPrice = priceCeiling;
        reasoning += ` (Capped at ceiling: AED ${priceCeiling})`;
      }

      proposedPrice = Math.round(proposedPrice / 10) * 10;
      const changePct = Math.round(((proposedPrice - currentPrice) / currentPrice) * 100);

      if (Math.abs(changePct) < 1) continue;

      const riskLevel = this.calculateRiskLevel(changePct, dayEvents.length);

      proposals.push({
        listingId: lid.toString(),
        date: dateStr,
        currentPrice,
        proposedPrice,
        priceFloor,
        priceCeiling,
        changePct,
        riskLevel,
        reasoning,
      });
    }

    const totalProposals = proposals.length;
    const averageIncrease =
      proposals.reduce((sum, p) => sum + p.changePct, 0) / (totalProposals || 1);

    const summary =
      totalProposals === 0
        ? "No pricing changes recommended for this period."
        : `${totalProposals} proposal(s) generated with avg ${averageIncrease > 0 ? "+" : ""}${averageIncrease.toFixed(1)}% change.`;

    return { proposals, summary, totalProposals, averageIncrease };
  }

  async saveProposals(analysisResult: AnalysisResult): Promise<string[]> {
    await connectDB();
    const proposalIds: string[] = [];

    for (const proposal of analysisResult.proposals) {
      const updated = await InventoryMaster.findOneAndUpdate(
        {
          listingId: new mongoose.Types.ObjectId(proposal.listingId),
          date: proposal.date,
        },
        {
          $set: {
            proposedPrice: proposal.proposedPrice,
            changePct: proposal.changePct,
            proposalStatus: "pending",
            reasoning: proposal.reasoning,
          },
        },
        { new: true }
      );

      if (updated) {
        proposalIds.push(updated._id.toString());
      }
    }

    return proposalIds;
  }

  private async calculateOccupancy(
    listingId: mongoose.Types.ObjectId,
    start: Date,
    end: Date
  ): Promise<number> {
    const calendar = await InventoryMaster.find({
      listingId,
      date: {
        $gte: format(start, "yyyy-MM-dd"),
        $lte: format(end, "yyyy-MM-dd"),
      },
    }).lean();

    if (calendar.length === 0) return 0;

    const total = calendar.length;
    const blocked = calendar.filter((d) => d.status === "blocked").length;
    const booked = calendar.filter((d) => d.status === "booked").length;

    const divisor = total - blocked;
    if (divisor <= 0) return 0;

    return Math.round((booked / divisor) * 100);
  }

  private calculateRiskLevel(changePct: number, eventCount: number): "low" | "medium" | "high" {
    const absChange = Math.abs(changePct);

    if (absChange <= 10 && eventCount > 0) return "low";
    if (absChange <= 30 && eventCount > 0) return "medium";
    if (absChange > 30) return "high";
    if (eventCount === 0 && absChange > 10) return "medium";

    return "low";
  }

  async generatePortfolioProposals(
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, AnalysisResult>> {
    await connectDB();
    const allListings = await Listing.find({ isActive: true }).lean();
    const results = new Map<string, AnalysisResult>();

    for (const listing of allListings) {
      const result = await this.generateProposals(
        listing._id as mongoose.Types.ObjectId,
        startDate,
        endDate
      );
      if (result.totalProposals > 0) {
        results.set(listing._id.toString(), result);
      }
    }

    return results;
  }
}

export function createPricingAnalystAgent(): PricingAnalystAgent {
  return new PricingAnalystAgent();
}
