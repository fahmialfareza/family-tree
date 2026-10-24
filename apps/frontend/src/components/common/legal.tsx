/** Long-form legal text: one heading, a last-updated line, then sections. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{updated}</p>
      </header>
      {sections.map((s) => (
        <section key={s.h} className="space-y-3">
          <h2 className="font-display text-xl font-semibold">{s.h}</h2>
          {s.p.map((para) => (
            <p key={para.slice(0, 40)} className="leading-relaxed text-muted-foreground">
              {para}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
