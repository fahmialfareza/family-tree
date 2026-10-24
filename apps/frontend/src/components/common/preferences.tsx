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
