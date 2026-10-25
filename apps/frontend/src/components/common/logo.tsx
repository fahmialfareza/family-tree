import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Brand mark: a small stylized tree in the primary color with a terracotta "root". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="16" cy="11" r="4" className="fill-primary-foreground" />
      <circle cx="9.5" cy="21" r="3.2" className="fill-primary-foreground/85" />
      <circle cx="22.5" cy="21" r="3.2" className="fill-primary-foreground/85" />
      <path d="M16 15v3.5M16 18.5l-5 1.5M16 18.5l5 1.5" className="stroke-primary-foreground" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <rect x="13" y="25.5" width="6" height="2" rx="1" className="fill-terracotta" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  label = BRAND,
  labelClassName,
}: {
  href?: string;
  className?: string;
  label?: string;
  labelClassName?: string;
}) {
  return (
    <Link href={href} aria-label={label} className={cn("inline-flex items-center gap-2.5 rounded-lg font-display text-lg font-semibold whitespace-nowrap", className)}>
      <LogoMark />
      <span className={labelClassName}>{label}</span>
    </Link>
  );
}
