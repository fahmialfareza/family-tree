// Product name and public origin, used by metadata, structured data, llms.txt and legal text.
// The domain comes from NEXT_PUBLIC_APP_URL (https://sakdulur.com in production).
export const BRAND = "Sakdulur";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

// Feature suggestions go to the maintainer on WhatsApp (international format, digits only).
export const SUGGESTIONS_WHATSAPP = "6285117319725";
