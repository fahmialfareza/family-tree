// The real root layout (<html>, fonts, providers) is [locale]/layout.tsx; this one only exists so that
// not-found.tsx can catch URLs outside it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
