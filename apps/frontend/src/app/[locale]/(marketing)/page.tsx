import { Copy, HeartHandshake, Lock, MessageCircleQuestion, Network, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { BRAND, SITE_URL } from "@/lib/brand";
import { contactEmail } from "@/lib/legal-content";
import { type LocaleParams, pageLocale } from "@/i18n/static";
import { jsonLd, languageAlternates, localePath, pageSocial } from "@/lib/seo";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(props);
  const t = await getTranslations("meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: languageAlternates("/", locale),
    ...pageSocial("/", locale, t("title"), t("description")),
  };
}

// A static picture of the canvas: three generations, couples joined by a terracotta dot.
function TreePreview({ label }: { label: string }) {
  const card = (name: string, years: string, tone: string, x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="150" height="54" rx="12" className="fill-card stroke-border" />
      <rect width="4" height="54" rx="2" className={tone} />
      <circle cx="30" cy="27" r="14" className="fill-secondary" />
      <text x="30" y="31" textAnchor="middle" className="fill-secondary-foreground text-[11px] font-semibold">
        {name.slice(0, 1)}
      </text>
      <text x="52" y="24" className="fill-foreground text-[12px] font-semibold">
        {name}
      </text>
      <text x="52" y="40" className="fill-muted-foreground text-[10px]">
        {years}
      </text>
    </g>
  );
  const path = "fill-none stroke-muted-foreground/50";
  return (
    <svg viewBox="0 0 520 330" role="img" aria-label={label} className="h-auto w-full drop-shadow-[0_20px_40px_oklch(0.3_0.03_60/0.15)]">
      <path d="M95 74 V100 H182 M269 74 V100 H182 M182 100 V136" className={path} strokeWidth="1.5" />
      <path d="M182 136 V150 H95 V176 M182 150 H269 V176" className={path} strokeWidth="1.5" />
      <path d="M269 230 V256 H344 M419 230 V256 H344 M344 256 V276" className={path} strokeWidth="1.5" />
      <circle cx="182" cy="100" r="5" className="fill-terracotta" />
      <circle cx="344" cy="256" r="5" className="fill-terracotta" />
      {card("Hasan", "1938–2011", "fill-node-male", 20, 20)}
      {card("Siti", "1942–2019", "fill-node-female", 194, 20)}
      {card("Ahmad", "1965", "fill-node-male", 20, 176)}
      {card("Dewi", "1968", "fill-node-female", 194, 176)}
      {card("Budi", "1966", "fill-node-male", 344, 176)}
      {card("Rani", "1994", "fill-node-female", 269, 276)}
    </svg>
  );
}

export default async function LandingPage(props: LocaleParams) {
  const locale = await pageLocale(props);
  const t = await getTranslations("landing");
  const tm = await getTranslations("meta");
  const features = [
    { icon: Network, title: t("f1Title"), body: t("f1Body") },
    { icon: HeartHandshake, title: t("f2Title"), body: t("f2Body") },
    { icon: ShieldCheck, title: t("f3Title"), body: t("f3Body") },
    { icon: MessageCircleQuestion, title: t("f5Title"), body: t("f5Body") },
    { icon: Copy, title: t("f6Title"), body: t("f6Body") },
    { icon: Smartphone, title: t("f4Title"), body: t("f4Body") },
  ];
  const steps = [t("s1"), t("s2"), t("s3")];
  const faqs = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  // Structured data for search engines and AI answer engines: who runs it, what it is, and the FAQ.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: BRAND, url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png`, email: contactEmail },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: BRAND,
        url: SITE_URL,
        inLanguage: ["en", "id"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: BRAND,
        url: SITE_URL,
        description: tm("description"),
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        inLanguage: ["en", "id"],
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
        featureList: features.map((f) => f.title),
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}${localePath(locale, "/")}#faq`,
        inLanguage: locale,
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,var(--color-secondary),transparent_55%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-terracotta" aria-hidden /> {t("badge")}
            </p>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{t("heroTitle")}</h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("heroBody")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/auth/signup">{t("ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/login">{t("ctaSecondary")}</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t("heroNote")}</p>
          </div>
          <div className="rounded-3xl border bg-canvas p-4 shadow-[var(--shadow-lift)] sm:p-6">
            <TreePreview label={t("previewLabel")} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6" aria-labelledby="what-is">
        <h2 id="what-is" className="mb-4 font-display text-3xl font-semibold">
          {t("whatIsTitle")}
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">{t("whatIsBody")}</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="features">
        <h2 id="features" className="mb-10 text-center font-display text-3xl font-semibold">
          {t("featuresTitle")}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
              <f.icon className="mb-4 size-8 text-primary" aria-hidden />
              <h3 className="mb-2 font-display text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/50 py-16" aria-labelledby="how">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 id="how" className="mb-10 text-center font-display text-3xl font-semibold">
            {t("howTitle")}
          </h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-soft)]">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary font-display text-lg font-semibold text-primary-foreground">{i + 1}</span>
                <p className="text-sm">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6" aria-labelledby="privacy-promise">
        <div className="flex flex-col items-start gap-6 rounded-3xl border bg-card p-8 shadow-[var(--shadow-soft)] sm:flex-row">
          <Lock className="size-10 shrink-0 text-terracotta" aria-hidden />
          <div className="space-y-2">
            <h2 id="privacy-promise" className="font-display text-2xl font-semibold">
              {t("privacyTitle")}
            </h2>
            <p className="text-muted-foreground">{t("privacyBody")}</p>
            <Link href={localePath(locale, "/privacy")} className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("privacyLink")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="mb-6 text-center font-display text-3xl font-semibold">
          {t("faqTitle")}
        </h2>
        <div className="divide-y rounded-2xl border bg-card">
          {faqs.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-3xl space-y-5 px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold">{t("ctaTitle")}</h2>
          <p className="opacity-90">{t("ctaBody")}</p>
          <Button asChild size="lg" variant="secondary">
            <Link href="/auth/signup">{t("ctaPrimary")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
