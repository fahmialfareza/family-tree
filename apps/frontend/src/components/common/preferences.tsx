"use client";

import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function useSetLocale() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (locale: string) =>
    start(async () => {
      await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        // ?lang= wins over the cookie, so leave the language-specific URL.
        url.searchParams.delete("lang");
        window.location.replace(url.toString());
        return;
      }
      router.refresh();
    });
  return { set, pending };
}

export function LocaleRadio() {
  const locale = useLocale();
  const { set } = useSetLocale();
  return (
    <DropdownMenuRadioGroup value={locale} onValueChange={set}>
      <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="id">Bahasa Indonesia</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

export function ThemeRadio() {
  const t = useTranslations("prefs");
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light">
        <Sun className="size-4" aria-hidden /> {t("light")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon className="size-4" aria-hidden /> {t("dark")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor className="size-4" aria-hidden /> {t("system")}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

/** Compact language + theme picker for public pages. */
export function PreferencesMenu() {
  const t = useTranslations("prefs");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")}>
          <Languages className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <LocaleRadio />
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <ThemeRadio />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One-click light/dark switch (system preference is still available in the menus). */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("prefs");
  const { resolvedTheme, setTheme } = useTheme();
  // The label stays the same on server and client (the theme is only known in the browser); the icon
  // switches through the .dark class, so nothing differs during hydration.
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("toggleTheme")}
      title={t("toggleTheme")}
    >
      <Sun className="hidden size-5 dark:block" aria-hidden />
      <Moon className="size-5 dark:hidden" aria-hidden />
    </Button>
  );
}
