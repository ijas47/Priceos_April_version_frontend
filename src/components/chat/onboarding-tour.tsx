"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, ArrowRight, X, Check } from "lucide-react";

// ─── Tour Steps (action-driven) ──────────────────────────
interface TourStep {
  targetId: string;
  title: string;
  instruction: string;      // What the user should DO
  explanation: string;       // What this element does
  icon: string;
  position: "top" | "bottom" | "left" | "right";
  advanceOn: "click" | "auto"; // How to advance to next step
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-property-list",
    title: "Select a Property",
    instruction: "👆 Click on any property card to get started",
    explanation: "Each card shows the property name, location, occupancy rate, and target nightly rate.",
    icon: "🏠",
    position: "right",
    advanceOn: "click",
  },
  {
    targetId: "tour-guardrails",
    title: "Set Your Price Guardrails",
    instruction: "👆 Click 'Set Guardrails' to define your min/max price",
    explanation: "Guardrails protect your property - the AI will never suggest a price below your floor or above your ceiling.",
    icon: "🛡️",
    position: "bottom",
    advanceOn: "click",
  },
  {
    targetId: "tour-date-range",
    title: "Choose Date Range",
    instruction: "👆 Click to select the dates you want to analyze",
    explanation: "Aria will only analyze bookings, gaps, events, and competitors within this date window.",
    icon: "📅",
    position: "bottom",
    advanceOn: "click",
  },
  {
    targetId: "tour-chat-input",
    title: "Chat with Aria",
    instruction: "💬 Type 'Full analysis' and press Enter",
    explanation: "Just ask - Aria automatically primes itself (scanning market events and competitor rates) on your first question. Try 'Booking velocity', 'What should I price?', or 'Full analysis'.",
    icon: "💬",
    position: "top",
    advanceOn: "click",
  },
  {
    targetId: "tour-sidebar",
    title: "Market Intelligence",
    instruction: "📊 Explore the sidebar tabs - Summary, Signals, Calendar",
    explanation: "Real-time data: performance metrics, benchmark comparisons, market events calendar - all synced to your selected date range.",
    icon: "📊",
    position: "left",
    advanceOn: "click",
  },
];

const STORAGE_KEY = "priceos-tour-completed";
const TOUR_STEP_KEY = "priceos-tour-step";

export function OnboardingTour() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const rafRef = useRef<number>(0);

  // Check first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const t = setTimeout(() => setShowWelcome(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  // Track the target element position continuously
  const updatePosition = useCallback(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const el = document.getElementById(step.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    }
    rafRef.current = requestAnimationFrame(updatePosition);
  }, [isActive, currentStep]);

  useEffect(() => {
    if (isActive) {
      rafRef.current = requestAnimationFrame(updatePosition);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, updatePosition]);

  // Listen for clicks on the target to advance
  useEffect(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    const el = document.getElementById(step.targetId);
    if (!el) return;

    const handler = () => {
      // Show success animation briefly
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        if (currentStep < TOUR_STEPS.length - 1) {
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          localStorage.setItem(TOUR_STEP_KEY, String(nextStep));
        } else {
          endTour();
        }
      }, 800);
    };

    el.addEventListener("click", handler, { once: true });
    return () => el.removeEventListener("click", handler);
  }, [isActive, currentStep]);

  const startTour = () => {
    setShowWelcome(false);
    setCurrentStep(0);
    setIsActive(true);
    localStorage.setItem(TOUR_STEP_KEY, "0");
  };

  const endTour = () => {
    setIsActive(false);
    setShowWelcome(false);
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.removeItem(TOUR_STEP_KEY);
  };

  const skipStep = () => {
    setShowSuccess(false);
    if (currentStep < TOUR_STEPS.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      localStorage.setItem(TOUR_STEP_KEY, String(nextStep));
    } else {
      endTour();
    }
  };

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep) / TOUR_STEPS.length) * 100;

  // ─── Welcome Modal ──────────────────────
  if (showWelcome) {
    return (
      <>
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "tourFadeIn 0.3s ease",
        }}>
          <div style={{
            background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
            border: "1px solid rgba(243,156,18,0.3)",
            borderRadius: 24, padding: "44px 40px", maxWidth: 460, width: "90%",
            textAlign: "center", animation: "tourScaleIn 0.4s ease",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 80px rgba(243,156,18,0.06)",
          }}>
            {/* Icon */}
            <div style={{
              width: 72, height: 72, margin: "0 auto 24px",
              background: "linear-gradient(135deg, rgba(243,156,18,0.2), rgba(243,156,18,0.05))",
              border: "2px solid rgba(243,156,18,0.3)", borderRadius: 20,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles style={{ width: 32, height: 32, color: "#f39c12" }} />
            </div>

            <h2 style={{
              fontSize: "1.6rem", fontWeight: 900, color: "#fff",
              marginBottom: 8, letterSpacing: "-0.5px",
            }}>Welcome to PriceOS! 👋</h2>

            <p style={{
              color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.7,
              marginBottom: 8,
            }}>
              I'm <strong style={{ color: "#f39c12" }}>Aria</strong>, your AI Revenue Manager.
            </p>
            <p style={{
              color: "#64748b", fontSize: "0.82rem", lineHeight: 1.7,
              marginBottom: 32,
            }}>
              Let me walk you through the interface step-by-step.<br />
              You'll <strong style={{ color: "#94a3b8" }}>click each element</strong> as I guide you - it only takes 30 seconds.
            </p>

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <button
                onClick={startTour}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "14px 36px", border: "none", borderRadius: 14,
                  background: "linear-gradient(135deg, #f39c12, #e67e22)",
                  color: "#000", fontWeight: 800, fontSize: "0.95rem",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(243,156,18,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <Sparkles style={{ width: 18, height: 18 }} />
                Show Me Around
                <ArrowRight style={{ width: 18, height: 18 }} />
              </button>
              <button
                onClick={endTour}
                style={{
                  padding: "8px 20px", border: "none", background: "none",
                  color: "#555", fontWeight: 600, fontSize: "0.8rem",
                  cursor: "pointer", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#999"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#555"; }}
              >
                I know my way around
              </button>
            </div>

            {/* Footer hint */}
            <div style={{
              marginTop: 28, padding: "10px 16px",
              background: "rgba(255,255,255,0.03)", borderRadius: 8,
              fontSize: "0.7rem", color: "#4a5568",
              display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
            }}>
              💡 You can restart this tour anytime from your profile
            </div>
          </div>
        </div>
        <style>{tourStyles}</style>
      </>
    );
  }

  // ─── Active Tour ──────────────────────
  if (!isActive || !targetRect) return null;

  // Calculate tooltip position
  const tooltipPos = getTooltipPosition(step.position, targetRect);

  // Four-panel overlay calculations - creates 4 dark rectangles AROUND the target,
  // leaving a real clickable hole where the actual UI elements are
  const pad = 8;
  const hole = {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  };

  return (
    <>
      {/* 4-panel overlay - leaves a REAL HOLE so clicks pass through to actual elements */}
      {/* Top panel */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        height: Math.max(0, hole.top),
        background: "rgba(0,0,0,0.6)", zIndex: 99998,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
      {/* Bottom panel */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        top: hole.top + hole.height,
        background: "rgba(0,0,0,0.6)", zIndex: 99998,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
      {/* Left panel */}
      <div style={{
        position: "fixed", left: 0, top: hole.top,
        width: Math.max(0, hole.left),
        height: hole.height,
        background: "rgba(0,0,0,0.6)", zIndex: 99998,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
      {/* Right panel */}
      <div style={{
        position: "fixed", top: hole.top,
        left: hole.left + hole.width,
        right: 0, height: hole.height,
        background: "rgba(0,0,0,0.6)", zIndex: 99998,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />

      {/* Pulsing ring around target */}
      <div className="tour-pulse-ring" style={{
        position: "fixed", zIndex: 99999,
        top: hole.top,
        left: hole.left,
        width: hole.width,
        height: hole.height,
        borderRadius: 12,
        pointerEvents: "none",
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />

      {/* Success flash */}
      {showSuccess && (
        <div style={{
          position: "fixed", zIndex: 100001,
          top: targetRect.top + targetRect.height / 2 - 28,
          left: targetRect.left + targetRect.width / 2 - 28,
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #10b981, #059669)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "tourSuccessPop 0.5s ease",
          boxShadow: "0 0 30px rgba(16,185,129,0.5)",
        }}>
          <Check style={{ width: 28, height: 28, color: "#fff", strokeWidth: 3 }} />
        </div>
      )}

      {/* Tooltip */}
      {!showSuccess && (
        <div className="tour-tooltip-card" style={{
          position: "fixed", zIndex: 100000,
          ...tooltipPos,
          width: 320, maxWidth: "calc(100vw - 32px)",
          animation: "tourSlideIn 0.3s ease",
        }}>
          {/* Close */}
          <button
            onClick={endTour}
            style={{
              position: "absolute", top: 12, right: 12,
              width: 28, height: 28, borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#666", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>

          {/* Step counter + progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{
              padding: "3px 10px", borderRadius: 20,
              background: "rgba(243,156,18,0.15)",
              border: "1px solid rgba(243,156,18,0.3)",
              fontSize: "0.6rem", fontWeight: 800, color: "#f39c12",
              textTransform: "uppercase", letterSpacing: "1px",
            }}>
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <div style={{
              flex: 1, height: 3, background: "rgba(255,255,255,0.08)",
              borderRadius: 2, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", background: "#f39c12", borderRadius: 2,
                width: `${progress}%`, transition: "width 0.4s ease",
              }} />
            </div>
          </div>

          {/* Icon + Title */}
          <div style={{ fontSize: "1.8rem", marginBottom: 6 }}>{step.icon}</div>
          <h3 style={{
            fontSize: "1.05rem", fontWeight: 800, color: "#fff",
            marginBottom: 10, letterSpacing: "-0.3px",
          }}>{step.title}</h3>

          {/* Instruction - highlighted call to action */}
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(243,156,18,0.08)",
            border: "1px solid rgba(243,156,18,0.2)",
            marginBottom: 10,
          }}>
            <p style={{
              fontSize: "0.82rem", fontWeight: 700, color: "#f39c12",
              margin: 0, lineHeight: 1.5,
            }}>{step.instruction}</p>
          </div>

          {/* Explanation */}
          <p style={{
            fontSize: "0.78rem", color: "#64748b", lineHeight: 1.6,
            margin: "0 0 14px 0",
          }}>{step.explanation}</p>

          {/* Skip link */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={skipStep}
              style={{
                padding: "6px 14px", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, background: "transparent",
                color: "#64748b", fontSize: "0.72rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {isLast ? "Finish Tour" : "Skip this step →"}
            </button>
            <button
              onClick={endTour}
              style={{
                padding: "6px 14px", border: "none", background: "none",
                color: "#475569", fontSize: "0.68rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              End tour
            </button>
          </div>
        </div>
      )}

      <style>{tourStyles}</style>
    </>
  );
}

// ─── Tooltip positioning ─────────────────
function getTooltipPosition(
  position: string,
  rect: DOMRect
): React.CSSProperties {
  const gap = 16;
  switch (position) {
    case "bottom":
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
    case "top":
      return { bottom: window.innerHeight - rect.top + gap, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + gap, transform: "translateY(-50%)" };
    case "left":
      return { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + gap, transform: "translateY(-50%)" };
    default:
      return { top: rect.bottom + gap, left: rect.left };
  }
}

// ─── Restart Tour Button ─────────────────
export function RestartTourButton({ className }: { className?: string }) {
  return (
    <button
      className={className}
      onClick={() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOUR_STEP_KEY);
        window.location.reload();
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 12px", fontSize: "0.75rem", fontWeight: 700,
        background: "rgba(243,156,18,0.1)", border: "1px solid rgba(243,156,18,0.2)",
        borderRadius: 8, color: "#f39c12", cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <Sparkles style={{ width: 14, height: 14 }} />
      Restart Tour
    </button>
  );
}

// ─── CSS ─────────────────────────────────
const tourStyles = `
@keyframes tourFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tourScaleIn {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes tourSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes tourPulse {
  0% { box-shadow: 0 0 0 0 rgba(243,156,18,0.5); }
  70% { box-shadow: 0 0 0 12px rgba(243,156,18,0); }
  100% { box-shadow: 0 0 0 0 rgba(243,156,18,0); }
}
@keyframes tourSuccessPop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.tour-pulse-ring {
  border: 2px solid rgba(243,156,18,0.8);
  animation: tourPulse 1.5s ease-in-out infinite;
}

.tour-tooltip-card {
  background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(243,156,18,0.25);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(243,156,18,0.05);
}
`;
