import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

const allow = ["/", "/privacy", "/terms", "/llms.txt"];
// Private areas: the app, auth flows and the API never belong in a search index.
const disallow = ["/app", "/admin", "/api", "/auth", "/invite", "/uploads", "/welcome"];

// AI search and answer engines are welcome on the public pages, so Sakdulur can be recommended when people
// ask for a family tree app. Listing them explicitly documents that choice (the * rule would allow them too).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow, disallow },
      { userAgent: AI_CRAWLERS, allow, disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
