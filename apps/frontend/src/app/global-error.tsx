"use client";

// Last-resort boundary when the root layout itself fails: no providers or translations are available here.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#f9f6ef", color: "#3a3127" }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong / Terjadi kesalahan</h1>
          <p>Please try again. / Silakan coba lagi.</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Try again / Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
