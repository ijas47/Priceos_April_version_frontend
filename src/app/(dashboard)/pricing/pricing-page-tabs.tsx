"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, Sliders, CalendarDays, BarChart3, ShieldAlert } from "lucide-react";
import { PricingClient, ProposalData } from "./pricing-client";
import { PricingRulesStudio } from "@/components/pricing/pricing-rules-studio";
import { PricingCalendarHeatmap } from "@/components/pricing/pricing-calendar-heatmap";
import { CompSetViewer } from "@/components/pricing/comp-set-viewer";
import { PortfolioBulkAdjustDialog } from "@/components/pricing/portfolio-bulk-adjust-dialog";

const TABS = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "rules", label: "Property Rules", icon: Sliders },
  { id: "market", label: "Market Intel", icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  initialProposals: ProposalData[];
  listings: {
    id: string;
    name: string;
    currencyCode: string;
    pricingDataStatus?: string | null;
    pricingDataSummary?: string | null;
  }[];
  orgId: string;
}

export function PricingPageTabs({ initialProposals, listings, orgId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("calendar");
  const router = useRouter();

  const handleBulkAdjustApplied = () => {
    router.refresh();
  };

  const blockedListings = listings.filter((l) => l.pricingDataStatus === "blocked");
  const advisoryListings = listings.filter((l) => l.pricingDataStatus === "advisory");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-0 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Pricing Command Center</h1>
          <PortfolioBulkAdjustDialog
            listings={listings}
            onApplied={handleBulkAdjustApplied}
          />
        </div>
        <p className="text-muted-foreground text-sm max-w-2xl mb-4 sm:mb-6">
          365-day price calendar, AI proposals, and the rules driving every pricing decision.
        </p>

        {blockedListings.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            <div className="flex items-start gap-2 font-medium text-red-200">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {blockedListings.length} unit{blockedListings.length === 1 ? "" : "s"} blocked — pricing paused until data is fixed
              </span>
            </div>
            <ul className="mt-2 ml-6 list-disc text-red-200/90 space-y-1">
              {blockedListings.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <span className="font-medium">{l.name}</span>
                  {l.pricingDataSummary ? ` — ${l.pricingDataSummary}` : ""}
                </li>
              ))}
            </ul>
            {blockedListings.length > 5 && (
              <p className="mt-1 ml-6 text-xs text-red-200/70">
                +{blockedListings.length - 5} more. Re-run engine after fixing Hostaway data.
              </p>
            )}
          </div>
        )}

        {advisoryListings.length > 0 && blockedListings.length === 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {advisoryListings.length} unit{advisoryListings.length === 1 ? "" : "s"} on advisory — proposals run but review PMS metadata warnings.
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border-default overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                activeTab === id
                  ? "border-amber text-amber"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "calendar" && (
          <div className="p-4 sm:p-8 pt-4 sm:pt-6">
            <PricingCalendarHeatmap listings={listings} />
          </div>
        )}
        {activeTab === "proposals" && (
          <div className="p-4 sm:p-8 pt-4 sm:pt-6">
            <PricingClient initialProposals={initialProposals} allListings={listings} orgId={orgId} />
          </div>
        )}
        {activeTab === "rules" && (
          <div className="p-4 sm:p-8 pt-4 sm:pt-6">
            <PricingRulesStudio listings={listings} />
          </div>
        )}
        {activeTab === "market" && (
          <div className="p-4 sm:p-8 pt-4 sm:pt-6">
            <CompSetViewer listings={listings} />
          </div>
        )}
      </div>
    </div>
  );
}
