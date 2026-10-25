import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers/providers";
import { BRAND, SITE_URL } from "@/lib/brand";
import { OPERATOR_NAME } from "@/lib/legal-content";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap", axes: ["SOFT", "opsz"] });

// Search keywords per language (Bing still reads them; Google ignores them but they cost nothing).
const KEYWORDS: Record<string, string[]> = {
  en: ["family tree", "family tree app", "AI family tree", "genealogy", "family history", "ancestry", "Indonesian family tree", "Sakdulur"],
  id: ["silsilah keluarga", "pohon keluarga", "aplikasi silsilah", "silsilah keluarga AI", "trah", "bani", "keluarga besar", "garis keturunan", "Sakdulur"],
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const locale = await getLocale();
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
