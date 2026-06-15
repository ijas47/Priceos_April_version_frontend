"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, ArrowRight, X, Check, Globe, Zap, Shield, BarChart3 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ─── Tour Step Definition ──────────────────────────
interface TourStep {
  targetId: string;
  path?: string;             // If the step requires being on a specific page
  title: string;
  explanation: string;
  dataSource?: string;       // Educational: Where the data comes from
  icon: React.ReactNode;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-sidebar-dashboard",
    path: "/dashboard",
    title: "The Portfolio Overview",
    explanation: "Welcome! Here is your high-level summary. We sync your data directly from Hostaway to give you a 30-day forward look.",
    dataSource: "📡 Hostaway PMS API",
    icon: <BarChart3 className="w-5 h-5 text-amber" />,
    position: "right",
  },
  {
    targetId: "tour-sync-button",
    path: "/dashboard",
    title: "Real-Time Sync",
    explanation: "Whenever you update your listing details or prices on Hostaway, hit this to ensure PriceOS is using the latest data.",
    dataSource: "📡 Secure PMS Tunnel",
    icon: <Shield className="w-5 h-5 text-amber" />,
    position: "bottom",
  },
  {
    targetId: "tour-kpi-revenue",
    path: "/dashboard",
    title: "Intelligent Revenue Projection",
    explanation: "Our AI calculates gross revenue by blending your current bookings with a predictive model for unbooked nights.",
    dataSource: "📈 PriceOS ML Model",
    icon: <Zap className="w-5 h-5 text-amber" />,
    position: "bottom",
  },
  {
    targetId: "tour-sidebar-pricing",
    path: "/pricing",
    title: "Pricing Command Center",
    explanation: "This is where all strategy lives. Review AI proposals and configure the rules that drive your revenue.",
    dataSource: "🤖 PriceOS Strategy Engine",
    icon: <Zap className="w-5 h-5 text-amber" />,
    position: "right",
  },
  {
    targetId: "tour-pricing-rules",
    path: "/pricing",
    title: "The 4-Pass Waterfall",
    explanation: "We implement a strict waterfall: Foundations → Strategy → Inventory → Guardrails. Your safety is always guaranteed.",
    dataSource: "🛡️ Customizable Strategy Rules",
    icon: <Shield className="w-5 h-5 text-amber" />,
    position: "bottom",
  },
  {
    targetId: "tour-sidebar-market",
    path: "/market",
    title: "Market Intelligence",
    explanation: "Step outside your bubble. We monitor the entire market to ensure you're never priced too low during high-demand events.",
    dataSource: "🌐 Global Event & Comp Scrapers",
    icon: <Globe className="w-5 h-5 text-amber" />,
    position: "right",
  },
  {
    targetId: "tour-market-scan",
    path: "/market",
    title: "Live Market Scan",
    explanation: "Run a fresh analysis anytime to see live event shifts on Ticketmaster, Eventbrite, and competitor rates.",
    dataSource: "📡 External Data Aggregators",
    icon: <Globe className="w-5 h-5 text-amber" />,
    position: "bottom",
  }
];

const STORAGE_KEY = "priceos-global-tour-done";

export function GlobalTour() {
  const [isActive, setIsActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const rafRef = useRef<number>(0);

  // Check if tour is already done
  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const t = setTimeout(() => setShowWelcome(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const startTour = () => {
    setShowWelcome(false);
    setIsActive(true);
    setCurrentStep(0);
  };

  const endTour = () => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  // Handle path transitions for the tour
  useEffect(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[currentStep];
    if (step.path && pathname !== step.path) {
      router.push(step.path);
    }
  }, [isActive, currentStep, pathname, router]);

  // Track target position
  const updatePosition = useCallback(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.getElementById(step.targetId);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
    rafRef.current = requestAnimationFrame(updatePosition);
  }, [isActive, currentStep]);

  useEffect(() => {
    if (isActive) {
      rafRef.current = requestAnimationFrame(updatePosition);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, updatePosition]);

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
        <div className="max-w-md w-full bg-surface-1 border border-amber/20 rounded-3xl p-10 text-center shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="w-16 h-16 bg-amber/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber/20">
            <Sparkles className="w-8 h-8 text-amber" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to PriceOS</h2>
          <p className="text-text-secondary text-sm leading-relaxed mb-8">
            I'm Aria, your AI Revenue Assistant. Let me show you how the data flows from your PMS 
            through our AI engine to maximize your revenue.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={startTour}
              className="w-full bg-amber text-black font-bold py-3 rounded-xl hover:bg-primary/dim transition-all flex items-center justify-center gap-2 group"
            >
              Start Exploratory Tour
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={endTour}
              className="text-text-tertiary text-xs font-medium hover:text-white transition-colors"
            >
              I'll explore on my own
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isActive || !targetRect) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  // Tooltip positioning
  const gap = 16;
  const tooltipStyle: React.CSSProperties = {};
  if (step.position === "right") {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.left = targetRect.right + gap;
    tooltipStyle.transform = "translateY(-50%)";
  } else if (step.position === "bottom") {
    tooltipStyle.top = targetRect.bottom + gap;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = "translateX(-50%)";
  } else if (step.position === "left") {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.right = window.innerWidth - targetRect.left + gap;
    tooltipStyle.transform = "translateY(-50%)";
  } else {
    tooltipStyle.bottom = window.innerHeight - targetRect.top + gap;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = "translateX(-50%)";
  }

  return (
    <div className="fixed inset-0 z-[99998] pointer-events-none">
      {/* Hole Overlay */}
      <div 
        className="absolute transition-all duration-300 pointer-events-auto"
        style={{
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)",
          left: targetRect.left - 8,
          top: targetRect.top - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          borderRadius: 12,
        }}
      />

      {/* Tooltip */}
      <div 
        className="absolute w-80 bg-surface-1 border border-amber/30 rounded-2xl p-6 pointer-events-auto shadow-2xl animate-in slide-in-from-bottom-2 duration-300"
        style={tooltipStyle}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber/10 rounded-xl flex items-center justify-center border border-amber/20">
            {step.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-sm leading-tight">{step.title}</h3>
            <div className="w-full h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-amber transition-all duration-500" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        </div>

        <p className="text-text-secondary text-xs leading-relaxed mb-4">
          {step.explanation}
        </p>

        {step.dataSource && (
          <div className="bg-black/40 rounded-lg p-2.5 mb-5 border border-white/5">
            <div className="text-[9px] uppercase tracking-widest text-text-tertiary font-bold mb-1">Data Source</div>
            <div className="text-[10px] text-amber flex items-center gap-1.5 font-medium">
              {step.dataSource}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto">
          <button 
            onClick={endTour}
            className="text-text-tertiary text-[10px] font-bold uppercase hover:text-white transition-all"
          >
            End Tour
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button 
                onClick={prevStep}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold text-white hover:bg-white/5 transition-all"
              >
                Back
              </button>
            )}
            <button 
              onClick={nextStep}
              className="px-4 py-1.5 rounded-lg bg-amber text-black text-[10px] font-bold hover:bg-primary/dim transition-all flex items-center gap-1.5"
            >
              {currentStep === TOUR_STEPS.length - 1 ? "Finish" : "Next Step"}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
