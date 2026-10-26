"use client";

import { MessagesSquare, Network, UsersRound } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ICONS = { tree: Network, family: UsersRound, ask: MessagesSquare } as const;

type Slide = { icon: keyof typeof ICONS; title: string; body: string; label: string };

/**
 * Welcome slides for the desktop/mobile app: swipeable cards with dots on phones, all three side by side
 * on wider windows. Plain CSS scroll snapping, so swiping feels native.
 */
export function WelcomeSlides({ slides, label }: { slides: Slide[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = track.current;
    if (el) setActive(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (i: number) => {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section aria-label={label} aria-roledescription="carousel" className="w-full">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            <article
              key={s.icon}
              aria-roledescription="slide"
              aria-label={s.label}
              className="flex w-full shrink-0 snap-center flex-col items-center px-6 text-center md:rounded-2xl md:border md:bg-card md:px-5 md:py-6 md:shadow-[var(--shadow-soft)]"
            >
              <div className="flex size-28 items-center justify-center rounded-[2rem] bg-secondary text-primary shadow-[var(--shadow-soft)] md:size-16 md:rounded-2xl">
                <Icon className="size-12 md:size-7" strokeWidth={1.6} aria-hidden />
              </div>
              <h2 className="mt-8 font-display text-2xl font-semibold leading-tight md:mt-4 md:text-lg">{s.title}</h2>
              <p className="mt-3 max-w-xs text-muted-foreground md:mt-2 md:text-sm">{s.body}</p>
            </article>
          );
        })}
      </div>
      <div className="mt-8 flex justify-center gap-2 md:hidden">
        {slides.map((s, i) => (
          <button
            key={s.icon}
            type="button"
            onClick={() => go(i)}
            aria-label={s.label}
            aria-current={i === active ? "true" : undefined}
            className={cn("h-2 rounded-full bg-muted-foreground/30 transition-all", i === active ? "w-6 bg-primary" : "w-2")}
          />
        ))}
      </div>
    </section>
  );
}
