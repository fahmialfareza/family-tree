import Link from "next/link";
import type { LegalDoc } from "@/lib/legal-content";

/** Long-form legal text: title, effective date, intro, table of contents, then numbered sections. */
export function LegalPage({ doc, otherDoc }: { doc: LegalDoc; otherDoc: { href: string; title: string } }) {
  const numbered = doc.sections.filter((s) => /^\d+\./.test(s.h));
  const anchor = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-semibold">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">{doc.updated}</p>
        <p className="leading-relaxed">{doc.intro}</p>
      </header>
      <nav aria-label={doc.title} className="rounded-2xl border bg-card p-5 text-sm">
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {numbered.map((s) => (
            <li key={s.h}>
              <a href={`#${anchor(s.h)}`} className="text-primary underline-offset-4 hover:underline">
                {s.h}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {doc.sections.map((s) => {
        const top = /^\d+\./.test(s.h);
        return (
          <section key={s.h} id={anchor(s.h)} className="scroll-mt-24 space-y-3">
            {top ? <h2 className="font-display text-2xl font-semibold">{s.h}</h2> : <h3 className="font-display text-lg font-semibold">{s.h}</h3>}
            {s.p?.map((para) => (
              <p key={para.slice(0, 48)} className="leading-relaxed text-muted-foreground">
                {para}
              </p>
            ))}
            {s.list ? (
              <ul className="list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-primary">
                {s.list.map((item) => (
                  <li key={item.slice(0, 48)}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
      <footer className="border-t pt-6 text-sm">
        <Link href={otherDoc.href} className="text-primary underline-offset-4 hover:underline">
          {otherDoc.title} →
        </Link>
      </footer>
    </article>
  );
}
