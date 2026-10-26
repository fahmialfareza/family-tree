"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { DayCount } from "@/lib/api/types";

// Single-series daily columns (one hue, so no legend: the title names the series). Specs from the dataviz
// guide: columns <= 24px with a 4px rounded top and square base, hairline solid gridlines, clean y ticks,
// a hover/focus tooltip per column (value first) with a full-height hit area, and a table view.

const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 36 };

/** Clean axis maximum (1, 2, 5 × 10^n) and three ticks. */
function niceScale(max: number) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max) ?? 10 * pow;
  const ticks = top >= 2 && Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top];
  return { top, ticks };
}

/** Column path: square at the baseline, 4px rounded data-end. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function ColumnChart({ title, data, bucket }: { title: string; data: DayCount[]; bucket: "day" | "week" | "month" }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);
  const { top, ticks } = niceScale(Math.max(...data.map((d) => d.count), 0));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(24, band - 2)); // 2px surface gap between neighbours
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const at = (iso: string) => new Date(`${iso}T00:00:00`);
  // Axis: short; tooltip and table: the full bucket ("Week of 20 Oct", "October 2026").
  const axisLabel = (iso: string) =>
    bucket === "month" ? format.dateTime(at(iso), { month: "short", year: "2-digit" }) : format.dateTime(at(iso), { day: "numeric", month: "short" });
  const fullLabel = (iso: string) =>
    bucket === "month"
      ? format.dateTime(at(iso), { month: "long", year: "numeric" })
      : bucket === "week"
        ? t("weekOf", { date: format.dateTime(at(iso), { day: "numeric", month: "short", year: "numeric" }) })
        : format.dateTime(at(iso), { day: "numeric", month: "short", year: "numeric" });
  const subtitle = t(`chartSub.${bucket}`, { total: format.number(total) });
  const labelEvery = Math.ceil(data.length / (width < 420 ? 4 : 6));
  const hovered = active !== null ? data[active] : null;

  return (
    <figure className="space-y-3">
      <figcaption>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </figcaption>
      <div ref={wrap} className="relative w-full min-w-0" onPointerLeave={() => setActive(null)}>
        {/* width 100% + viewBox: the SVG never forces its container wider than the screen while measuring. */}
        <svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`${title}. ${subtitle}`} className="block overflow-visible">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {format.number(v, { notation: "compact" })}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * band + (band - barW) / 2;
            const h = innerH - (y(d.count) - PAD.top);
            return (
              <g key={d.date}>
                {d.count > 0 ? (
                  <path d={columnPath(x, y(d.count), barW, h)} className="transition-opacity" style={{ fill: "var(--chart-1)" }} opacity={active === null || active === i ? 1 : 0.55} />
                ) : null}
                {/* Hit area: the whole column slot, taller than the mark. */}
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${fullLabel(d.date)}: ${d.count}`}
                  className="cursor-default outline-none focus-visible:stroke-ring"
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
                {/* Every Nth label plus the last; skip one that would crowd the last label. */}
                {i === data.length - 1 || (i % labelEvery === 0 && data.length - 1 - i >= Math.max(2, labelEvery / 2)) ? (
                  <text x={PAD.left + i * band + band / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {axisLabel(d.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hovered && active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-center shadow-[var(--shadow-soft)]"
            style={{ left: Math.min(Math.max(PAD.left + active * band + band / 2, 48), width - 48), top: Math.max(y(hovered.count) - 52, 0) }}
          >
            <p className="text-sm font-semibold tabular-nums">{format.number(hovered.count)}</p>
            <p className="text-xs text-muted-foreground">{fullLabel(hovered.date)}</p>
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("showTable")}</summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="px-3 py-1.5 font-medium">{t("date")}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t("count")}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-3 py-1">{fullLabel(d.date)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
