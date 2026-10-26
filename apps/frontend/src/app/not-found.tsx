import Link from "next/link";
import "./globals.css";

// Only for URLs middleware.ts doesn't rewrite into [locale]; everything else gets [locale]/not-found.tsx.
export default function NotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl font-semibold">Page not found</h1>
        <Link href="/" className="text-primary underline underline-offset-4">
          Sakdulur
        </Link>
      </body>
    </html>
  );
}
