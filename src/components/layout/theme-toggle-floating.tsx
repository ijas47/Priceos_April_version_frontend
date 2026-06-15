"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggleFloating() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed bottom-20 right-6 z-[100] group">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full shadow-2xl transition-all duration-300 transform group-hover:scale-110",
          "bg-gradient-to-br from-primary to-primary/85 dark:from-primary dark:to-primary/85",
          "border-2 border-white dark:border-surface-2"
        )}
      >
        <div className="relative h-6 w-6">
          <Sun className="h-6 w-6 text-white rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute inset-0 h-6 w-6 text-white rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </div>
        
        {/* Tooltip */}
        <span className="absolute right-full mr-4 px-3 py-1.5 rounded-lg bg-surface-1 border border-border-subtle text-text-primary text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl pointer-events-none">
          Switch to {theme === "dark" ? "Light" : "Dark"} Mode
        </span>
      </button>
    </div>
  );
}
