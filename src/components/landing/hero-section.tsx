'use client';

import { useState } from 'react';
import { Building2, Sparkles, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthDialog } from './auth-dialog';

export function HeroSection() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  return (
    <section className="relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-blue-50 to-slate-50 dark:from-primary/10 dark:via-primary/5 dark:to-slate-900/20" />

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/15 dark:bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/15 dark:bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="container relative mx-auto px-4 py-20 md:py-32">
        <div className="flex flex-col items-center text-center space-y-10 max-w-5xl mx-auto">
          {/* Floating badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/15 border border-primary/20 dark:border-primary/30 shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
            <Sparkles className="h-4 w-4 text-primary dark:text-primary" />
            <span className="text-sm font-medium text-primary dark:text-primary/100">
              AI-Powered Revenue Intelligence
            </span>
          </div>

          {/* Hero headline with dramatic typography */}
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter bg-gradient-to-br from-primary via-sky-500 to-blue-600 dark:from-primary dark:via-sky-400 dark:to-blue-400 bg-clip-text text-transparent leading-[1.1]">
              The Smartest
              <br />
              <span className="relative">
                Revenue Engine
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 400 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 8C52 4 352 2 398 6" stroke="url(#paint0_linear)" strokeWidth="4" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2d7ff9" stopOpacity="0.6"/>
                      <stop offset="50%" stopColor="#1d6fe8" stopOpacity="0.8"/>
                      <stop offset="100%" stopColor="#dc2626" stopOpacity="0.6"/>
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>

            <p className="text-xl md:text-2xl lg:text-3xl text-gray-700 dark:text-gray-300 font-light leading-relaxed max-w-3xl mx-auto">
              Event-aware pricing, competitor intelligence, and guardrailed execution,{" "}
              <span className="font-semibold text-primary dark:text-primary">built for property managers who want revenue decisions they can trust.</span>
            </p>
          </div>

          {/* CTA with hover effects */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
            <Button
              size="lg"
              onClick={() => setAuthDialogOpen(true)}
              className="group relative text-lg px-10 py-7 bg-gradient-to-r from-primary to-primary/85 hover:from-primary hover:to-primary/85 text-white shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300 hover:scale-105"
            >
              <span className="relative z-10 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                Start Optimizing Revenue
              </span>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 group-hover:animate-shimmer" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-7 border-2 border-primary/80 dark:border-primary/700 text-primary dark:text-primary/100 hover:bg-primary/50 dark:hover:bg-primary/950/50 hover:border-primary/400 dark:hover:border-primary/600 transition-all duration-300"
            >
              Watch Demo
            </Button>
          </div>

          {/* Trust indicators with icons */}
          <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-sm text-gray-600 dark:text-gray-400 animate-in fade-in duration-1000 delay-700">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary dark:text-primary" />
              <span>15-50 Unit Operators</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary dark:text-primary" />
              <span>Enterprise-Grade Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary dark:text-primary" />
              <span>Built for Every Market</span>
            </div>
          </div>

          {/* Decorative stats */}
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-3xl w-full animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-1000">
            {[
              { value: 'Daily', label: 'Pricing proposals' },
              { value: 'PMS', label: 'Sync-ready workflow' },
              { value: 'AI', label: 'Human-in-the-loop' }
            ].map((stat, i) => (
              <div key={i} className="text-center group cursor-default">
                <div className="text-3xl md:text-4xl font-black bg-gradient-to-br from-primary to-primary/85 dark:from-primary dark:to-sky-400 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auth Dialog */}
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        @keyframes delay-1000 {
          0%, 50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </section>
  );
}
