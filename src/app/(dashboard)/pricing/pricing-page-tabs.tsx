"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, Sliders, CalendarDays, BarChart3, Layers } from "lucide-react";
import { PricingProfilesPanel } from "@/components/pricing/pricing-profiles-panel";
import { PricingClient, ProposalData } from "./pricing-client";
import { PricingRulesStudio } from "@/components/pricing/pricing-rules-studio";
import { PricingCalendarHeatmap } from "@/components/pricing/pricing-calendar-heatmap";
import { CompSetViewer } from "@/components/pricing/comp-set-viewer";

const TABS = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "rules", label: "Pricing Rules", icon: Sliders },
  { id: "profiles", label: "Profiles", icon: Layers },
  { id: "market", label: "Market Intel", icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  initialProposals: ProposalData[];
  listings: { id: string; name: string; currencyCode: string }[];
  orgId: string;
}

export function PricingPageTabs({ initialProposals, listings, orgId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("calendar");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-0 shrink-0">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Pricing Command Center</h1>
        <p className="text-muted-foreground text-sm max-w-2xl mb-4 sm:mb-6">
          365-day price calendar, AI proposals, and the rules driving every pricing decision.
        </p>

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
        {activeTab === "profiles" && (
          <div className="p-4 sm:p-8 pt-4 sm:pt-6">
            <PricingProfilesPanel />
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
