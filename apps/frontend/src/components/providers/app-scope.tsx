import { NextIntlClientProvider } from "next-intl";
import { AppProviders } from "./app-providers";

/**
 * Wraps the app, sign-in and admin sections: all UI messages (the root layout only sends the few the
 * marketing site uses) plus the client providers those sections need.
 */
export function AppScope({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider>
      <AppProviders>{children}</AppProviders>
    </NextIntlClientProvider>
  );
}
