"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Moon, Sun, User, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";

export function Header() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [userInitial, setUserInitial] = useState("U");

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const name = data.fullName || data.email || "U";
        setUserInitial(name[0].toUpperCase());
      })
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { }
    window.location.href = '/login?signedout=true';
  };

  const handleProfile = () => {
    router.push('/profile');
  };

  return (
    <header className="relative flex h-16 items-center justify-between border-b bg-gradient-to-r from-background via-primary/5 to-background dark:via-primary/5 px-6 backdrop-blur-sm">
      {/* Decorative gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="flex items-center gap-3 max-md:pl-12">
        {/* Logo/Brand */}
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-primary to-primary/85 p-2 shadow-md">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold bg-gradient-to-r from-primary to-primary/85 dark:from-primary dark:to-sky-400 bg-clip-text text-transparent">
              PriceOS
            </h2>
            <p className="text-[10px] text-muted-foreground font-medium">
              Revenue Intelligence
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="hover:bg-primary/100 dark:hover:bg-primary/950/50"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-primary" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-primary" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-primary/100 dark:hover:bg-primary/950/50"
            >
              <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                <AvatarFallback className="text-xs bg-gradient-to-br from-primary to-primary/85 text-white font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleProfile} className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 dark:text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
