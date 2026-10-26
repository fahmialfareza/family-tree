import { notFound } from "next/navigation";

// Unknown paths, rewritten here by middleware.ts: show [locale]/not-found.tsx inside the localized layout.
export default function CatchAll() {
  notFound();
}
