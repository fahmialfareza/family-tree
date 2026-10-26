"use client";

import { ChevronsUpDown, LayoutDashboard, Lightbulb, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleRadio, ThemeRadio } from "@/components/common/preferences";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSuggestLink } from "./suggest-feature";

export async function signOut() {
  await fetch("/api/session/logout", { method: "POST" });
  window.location.assign("/auth/login");
}

export function UserMenu({ user, compact, className }: { user: User; compact?: boolean; className?: string }) {
  const t = useTranslations("shell");
  const tp = useTranslations("prefs");
  const suggestHref = useSuggestLink();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-3 rounded-xl p-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          !compact && "w-full",
          className,
        )}
        aria-label={t("accountMenu")}
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(user.name)}</AvatarFallback>
        </Avatar>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email || user.username}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-60">
        <DropdownMenuItem asChild>
          <Link href="/app/account">
            <UserRound className="size-4" aria-hidden /> {t("account")}
          </Link>
        </DropdownMenuItem>
        {user.role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard className="size-4" aria-hidden /> {t("admin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href={suggestHref} target="_blank" rel="noopener noreferrer">
            <Lightbulb className="size-4" aria-hidden /> {t("suggest")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tp("language")}</DropdownMenuLabel>
        <LocaleRadio />
        <DropdownMenuLabel>{tp("theme")}</DropdownMenuLabel>
        <ThemeRadio />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
