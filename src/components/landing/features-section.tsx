'use client';

import { Zap, Calendar, Brain, Shield, BarChart3, Rocket } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'AI Pricing Engine',
    description:
      'Neural networks trained on your market data. Real-time competitor analysis. Dynamic demand forecasting.',
    gradient: 'from-violet-500 to-purple-600',
    bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20',
    size: 'large',
  },
  {
    icon: Calendar,
    title: 'Event Intelligence',
    description:
      'F1, Expo, Ramadan, peak seasons—automatically detected and priced.',
    gradient: 'from-amber-500 to-orange-600',
    bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20',
    size: 'medium',
  },
  {
    icon: Zap,
    title: 'Auto-Execution',
    description:
      'One-click approval. PMS sync in seconds. Zero manual work.',
    gradient: 'from-blue-500 to-cyan-600',
    bgGradient: 'from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20',
    size: 'medium',
  },
  {
    icon: Shield,
    title: 'Risk Guardrails',
    description:
      'Floor/ceiling protection. Red-flag alerts. Never underprice again.',
    gradient: 'from-emerald-500 to-teal-600',
    bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20',
    size: 'small',
  },
  {
    icon: BarChart3,
    title: 'Revenue Analytics',
    description:
      'Real-time dashboards. Occupancy insights. Channel breakdown.',
    gradient: 'from-rose-500 to-pink-600',
    bgGradient: 'from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20',
    size: 'small',
  },
  {
    icon: Rocket,
    title: 'Scale Effortlessly',
    description:
      'Handle 50+ properties without breaking a sweat. Built for growth.',
    gradient: 'from-indigo-500 to-purple-600',
    bgGradient: 'from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20',
    size: 'medium',
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />

      <div className="container relative mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40 border border-violet-200 dark:border-violet-800">
            <Zap className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-100 uppercase tracking-wider">
              Platform Capabilities
            </span>
          </div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight">
            Built for{' '}
            <span className="bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 dark:from-amber-400 dark:via-orange-400 dark:to-red-400 bg-clip-text text-transparent">
              Performance
            </span>
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every feature designed to maximize revenue, minimize manual work, and give you confidence in your pricing strategy.
          </p>
        </div>

        {/* Bento Grid - Asymmetric Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const sizeClasses = {
              large: 'md:col-span-2 md:row-span-2',
              medium: 'md:col-span-1 md:row-span-1',
              small: 'md:col-span-1 md:row-span-1',
            };

            return (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-8 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:border-border animate-in fade-in slide-in-from-bottom-8 ${sizeClasses[feature.size as keyof typeof sizeClasses]}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>

                  {/* Title */}
                  <h3 className={`text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-br ${feature.gradient} bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300 origin-left ${feature.size === 'large' ? 'md:text-4xl' : ''}`}>
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className={`text-muted-foreground leading-relaxed ${feature.size === 'large' ? 'text-lg md:text-xl' : 'text-base'}`}>
                    {feature.description}
                  </p>

                  {/* Decorative corner accent */}
                  <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br ${feature.gradient} rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                </div>

                {/* Hover border glow effect */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 blur-xl transition-opacity duration-500`} />
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-500">
          <p className="text-muted-foreground mb-4">
            Ready to transform your revenue operations?
          </p>
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <div className="flex -space-x-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 border-2 border-background"
                />
              ))}
            </div>
            <span className="text-muted-foreground">
              Join property managers already using PriceOS
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
