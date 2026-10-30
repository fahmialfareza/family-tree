import { isLocale, type Locale } from "@/i18n/config";

// The app's language: the last choice on this device (saveLocale), else the system language. The account's
// language replaces it at sign-in (intl.tsx), as the website does with its cookie.
export const LOCALE_KEY = "sakdulur-locale";

export function currentLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // storage unavailable
  }
  return /^(id|in)\b/i.test(navigator.language) ? "id" : "en";
}
