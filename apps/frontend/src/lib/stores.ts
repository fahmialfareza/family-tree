// Where the Sakdulur apps are published (apps/native). Used by the landing and download pages, the download banner,
// structured data, the web manifest and llms.txt.
//
// Set `live` to true once a store has approved the app: until then its page is a 404, so it is shown as "coming
// soon" and never linked.

export type StoreId = "appStore" | "macAppStore" | "googlePlay" | "microsoftStore" | "snapStore";

export type Store = { id: StoreId; url: string; os: string; live: boolean };

export const APP_STORE_ID = "6827420604";
export const ANDROID_PACKAGE = "com.fahmialfareza.sakdulur";
export const APP_VERSION = "1.0.0";

export const STORES: Store[] = [
  { id: "appStore", url: `https://apps.apple.com/app/id${APP_STORE_ID}`, os: "iOS, iPadOS", live: false },
  { id: "macAppStore", url: `https://apps.apple.com/app/id${APP_STORE_ID}?platform=mac`, os: "macOS", live: false },
  { id: "googlePlay", url: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`, os: "Android", live: true },
  { id: "microsoftStore", url: "https://apps.microsoft.com/detail/9N7B6TSCXZ00", os: "Windows", live: true },
  { id: "snapStore", url: "https://snapcraft.io/sakdulur", os: "Linux", live: true },
];

export const liveStores = STORES.filter((s) => s.live);
export const isLive = (id: StoreId) => STORES.some((s) => s.id === id && s.live);
export const storeUrl = (id: StoreId) => STORES.find((s) => s.id === id)!.url;

/** Operating systems Sakdulur runs on today: the web, plus every store that has it. */
export const liveOperatingSystems = ["Web", ...liveStores.map((s) => s.os)].join(", ");
