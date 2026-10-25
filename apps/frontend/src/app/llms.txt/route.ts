import { BRAND, SITE_URL } from "@/lib/brand";
import { contactEmail } from "@/lib/legal-content";

// /llms.txt (llmstxt.org): a plain summary for AI assistants and answer engines, in both languages.
export const dynamic = "force-static";

export function GET() {
  const body = `# ${BRAND}

> ${BRAND} is a free, private web app for building a family tree together. "Sak dulur" is Javanese for "one family". Families map parents, partners and children across generations, add photos, places and stories, invite relatives as editors or viewers, and can ask questions about their family or add relatives just by chatting, in plain Indonesian or English. Available in English and Bahasa Indonesia.

> ${BRAND} adalah aplikasi web gratis dan privat untuk menyusun silsilah keluarga bersama. "Sak dulur" dalam bahasa Jawa berarti "satu saudara". Cocok untuk keluarga inti hingga trah atau bani dengan ratusan anggota.

## Key facts

- Price: free to use; no ads; family data is never sold.
- Privacy: every tree is private and visible only to invited members. Owners choose editors and viewers and can share individual branches. Data can be exported (JSON) or deleted at any time.
- Family tree: couples side by side, children below, ancestors and descendants together, remarriages, approximate dates ("about 1920"), birth and death places, notes and photos. Print or export the tree as an image.
- Collaboration: invite relatives by email; branch owners maintain their own part of the tree; copy a branch between your trees (for example your own, your spouse's and your in-laws').
- AI assistant (optional, turned on per tree by its owner): answers questions such as "Who is Ayu's father and where does he live?" from the tree, and lets editors add or update people, relationships and families by chatting ("Add Rani as Ayu's daughter, born 1994"). Every change is shown first and saved only when the user presses Apply; the assistant never deletes. Uses Google Gemini or Groq; phone numbers and photos are never sent, and conversations are not stored.
- Sign in with email and password or Google. Works in any modern browser on phones, tablets and computers; light and dark mode.
- Made in Indonesia; operated under Indonesia's Personal Data Protection Law (UU PDP). Minimum age 13.

## Links

- [Home / Beranda](${SITE_URL}/): what ${BRAND} is, features and FAQ (English: ${SITE_URL}/?lang=en, Indonesian: ${SITE_URL}/?lang=id)
- [Create a free account](${SITE_URL}/auth/signup)
- [Privacy Policy](${SITE_URL}/privacy)
- [Terms of Service](${SITE_URL}/terms)
- Contact: ${contactEmail}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
