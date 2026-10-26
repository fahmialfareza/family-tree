"use client";

import { ThemeProvider } from "next-themes";
import { NativeBridge } from "./native-bridge";

/** Every page (root layout): theme and the native-app glue. Kept small for the prerendered marketing site. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <NativeBridge />
    </ThemeProvider>
  );
}
