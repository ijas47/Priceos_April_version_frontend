"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Moon,
  Sun,
  User,
  LogOut,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContextStore } from "@/stores/context-store";
import { useChatStore } from "@/stores/chat-store";
export function HeaderNav() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { setPortfolioContext } = useContextStore();
  const { switchContext } = useChatStore();

  const [userName, setUserName] = useState("User Account");
  const [userInitial, setUserInitial] = useState("U");
  const [userEmail, setUserEmail] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch("/api/user/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        const name = data.fullName || data.email || "User Account";
        const email = data.email || "";
        setUserName(name);
        setUserInitial((name[0] || "U").toUpperCase());
        setUserEmail(email);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    window.location.href = '/login?signedout=true';
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 z-10">
      <div className="flex items-center gap-6 flex-1 min-w-0">
        {/* Logo/Brand - clickable to return to portfolio */}
        <button
          onClick={() => {
            setPortfolioContext();
            switchContext({ type: "portfolio" });
            router.push("/dashboard");
          }}
          className="flex items-center gap-3 shrink-0 group"
        >
          <div className="rounded-lg bg-primary p-2 shadow-sm group-hover:shadow-md transition-shadow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">PriceOS</h1>
            <p className="text-[10px] text-muted-foreground font-medium">
              Revenue Intelligence
            </p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User dropdown with settings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground font-semibold uppercase" suppressHydrationWarning>
                  {mounted ? userInitial : "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground font-semibold uppercase">
                  {mounted ? userInitial : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <p className="text-sm font-medium truncate" suppressHydrationWarning>{mounted ? userName : ""}</p>
                <p className="text-[10px] text-muted-foreground truncate" suppressHydrationWarning>
                  {mounted ? (userEmail || "Property Manager") : ""}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-600 dark:text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
