import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, locales } from "@/i18n/config";
import { Providers } from "@/components/providers/providers";
import { BRAND, SITE_URL } from "@/lib/brand";
import { OPERATOR_NAME } from "@/lib/legal-content";
import "../globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// No extra variable axes (SOFT, opsz): they quadruple the file (~120 KB) and headings look the same.
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

// Search keywords per language (Bing still reads them; Google ignores them but they cost nothing).
const KEYWORDS: Record<string, string[]> = {
  en: ["family tree", "family tree app", "AI family tree", "genealogy", "family history", "ancestry", "Indonesian family tree", "Sakdulur"],
  id: ["silsilah keluarga", "pohon keluarga", "aplikasi silsilah", "silsilah keluarga AI", "trah", "bani", "keluarga besar", "garis keturunan", "Sakdulur"],
};

type Props = { params: Promise<{ locale: string }> };

// Messages every page's client components may need; the app, sign-in and admin sections get all of them
// (components/providers/app-scope.tsx). Keeps the marketing pages' HTML and JavaScript small.
const SHARED_MESSAGES = ["marketing", "stores", "prefs", "errors", "offline"];

function pick(messages: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in messages).map((k) => [k, messages[k]]));
}

// URLs carry no locale: middleware.ts picks it per request and rewrites /path to /{locale}/path, so pages that
// don't read cookies (the marketing pages) are prerendered once per language.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const verification: Metadata["verification"] = {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  };
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${BRAND}` },
    description: t("description"),
    applicationName: BRAND,
    keywords: KEYWORDS[locale] ?? KEYWORDS.en,
    authors: [{ name: OPERATOR_NAME }],
    creator: OPERATOR_NAME,
    publisher: BRAND,
    category: "lifestyle",
    openGraph: {
      type: "website",
      siteName: BRAND,
      title: t("title"),
      description: t("description"),
      url: SITE_URL,
      locale: locale === "id" ? "id_ID" : "en_US",
      alternateLocale: locale === "id" ? ["en_US"] : ["id_ID"],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    verification,
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#221d18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: Readonly<{ children: React.ReactNode } & Props>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={pick(await getMessages(), SHARED_MESSAGES)}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
