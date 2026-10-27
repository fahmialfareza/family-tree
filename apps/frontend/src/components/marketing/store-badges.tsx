import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { STORES, type StoreId } from "@/lib/stores";

// Store logos as plain shapes (as on catetin.ai), drawn in the text color.
const APPLE =
  "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z";
const PLAY =
  "M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z";
const WINDOWS = "M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801";
const SNAP =
  "M12 2.5c-2.6 0-4.4 2.24-4.4 5.42 0 1.43-.43 2.6-1.16 3.76-.8 1.27-1.7 2.72-1.7 4.48 0 3.15 3.32 5.34 7.26 5.34s7.26-2.19 7.26-5.34c0-1.76-.91-3.21-1.7-4.48-.73-1.16-1.16-2.33-1.16-3.76 0-3.18-1.8-5.42-4.4-5.42z";

const TUX_DETAILS =
  "M10.36 9.62h3.28c-.2.62-.8 1.1-1.64 1.1s-1.44-.48-1.64-1.1zM7.65 19.15c-.95.25-1.78.72-2.45 1.42.9.52 2.16.46 3.18-.18.42-.27.54-.82.28-1.18-.2-.26-.58-.15-1.01-.06zM16.35 19.15c.95.25 1.78.72 2.45 1.42-.9.52-2.16.46-3.18-.18-.42-.27-.54-.82-.28-1.18.2-.26.58-.15 1.01-.06z";

const ICON: Record<StoreId, string> = { appStore: APPLE, macAppStore: APPLE, googlePlay: PLAY, microsoftStore: WINDOWS, snapStore: SNAP };

export function StoreIcon({ id, className }: { id: StoreId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-6 shrink-0", className)}>
      <path d={ICON[id]} />
      {id === "snapStore" ? (
        // Tux's eyes, beak and feet, so the silhouette reads as the Linux penguin.
        <>
          <circle cx="9.8" cy="7.55" r="0.7" fill="#1f1a17" />
          <circle cx="14.2" cy="7.55" r="0.7" fill="#1f1a17" />
          <path fill="#f59e0b" d={TUX_DETAILS} />
        </>
      ) : null}
    </svg>
  );
}

/**
 * A button per store. Stores that have approved the app link to it; the others say "Coming soon" and link nowhere
 * (their store page would be a 404). `only` limits it to some stores, in that order.
 */
export async function StoreBadges({ only, className }: { only?: StoreId[]; className?: string }) {
  const t = await getTranslations("stores");
  const stores = only ? only.map((id) => STORES.find((s) => s.id === id)!) : STORES;
  return (
    <ul className={cn("flex flex-wrap gap-3", className)}>
      {stores.map((s) => {
        const body = (
          <>
            <StoreIcon id={s.id} />
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[11px] opacity-80">{s.live ? t(`${s.id}Pre`) : t("soon")}</span>
              <span className="text-[15px] font-semibold">{t(s.id)}</span>
            </span>
          </>
        );
        return (
          <li key={s.id}>
            {s.live ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener"
                className="flex h-12 min-w-40 items-center gap-2.5 rounded-xl bg-foreground px-4 text-background transition-opacity hover:opacity-85"
              >
                {body}
              </a>
            ) : (
              <span className="flex h-12 min-w-40 items-center gap-2.5 rounded-xl border border-dashed px-4 text-muted-foreground" aria-disabled>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
