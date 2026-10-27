// Takes the raw app screens for the store images from the live site, signed in as the demo account
// (demo-tree.mjs). Run by run.sh; by hand:
//   ACCOUNT=<account-file> LANGS=id DEVICES=iphone SHOTS=tree OUT=/tmp/sakdulur-shots node capture.cjs
// Needs playwright-core (run.sh installs it to a temp folder) and Google Chrome.
const { chromium } = require("playwright-core");
const fs = require("node:fs");

const SITE = "https://sakdulur.com";
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const out = process.env.OUT || "/tmp/sakdulur-shots";
const langs = (process.env.LANGS || "id,en").split(",");
const devices = (process.env.DEVICES || "iphone,ipad,mac,android").split(",");
const shots = (process.env.SHOTS || "tree,person,ask,people,export").split(",");
const account = fs.readFileSync(process.env.ACCOUNT, "utf8");
const email = /^email:\s*(\S+)/m.exec(account)[1];
const password = /^password:\s*(\S+)/m.exec(account)[1];

const iphoneUA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ipadUA =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const androidUA =
  "Mozilla/5.0 (Linux; Android 15; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const windowsUA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
// Viewport in CSS pixels, shaped like the screen area of the store image (compose.cjs) so nothing is cropped.
const DEVICES = {
  iphone: { client: "ios", viewport: { width: 430, height: 884 }, scale: 3, mobile: true, ua: iphoneUA },
  ipad: { client: "ios", viewport: { width: 1032, height: 1336 }, scale: 2, mobile: true, ua: ipadUA },
  mac: { client: null, viewport: { width: 1280, height: 760 }, scale: 2, mobile: false },
  // Same desktop screens with a Windows user agent (the search box shows Ctrl K), for the Microsoft Store.
  windows: { client: null, viewport: { width: 1280, height: 760 }, scale: 2, mobile: false, ua: windowsUA },
  android: { client: "android", viewport: { width: 400, height: 757 }, scale: 3, mobile: true, ua: androidUA },
};
const THINKING = { id: "Mencari di pohon", en: "Looking through the tree" };
const QUESTION = { id: "Siapa saja cucu Mbah Wiryo?", en: "Who are Mbah Wiryo's grandchildren?" };

// The demo tree's ids, read through the site's own API proxy with the signed-in session.
async function demoData(page) {
  return page.evaluate(async () => {
    const get = async (path) => (await (await fetch(`/api/proxy/api/${path}`)).json()).data;
    const tree = (await get("trees")).find((t) => t.name === "Keluarga Wiryo");
    const people = await get(`trees/${tree._id}/people`);
    const id = (name) => people.find((p) => p.name === name)._id;
    return { treeId: tree._id, ayu: id("Ayu Kartika"), sri: id("Sri Wahyuni"), bambang: id("Bambang Wiryawan") };
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: chrome });
  // Sign in once (the API allows 20 sign-ins a minute) and give every device the same session cookies.
  const first = await browser.newContext();
  const login = await first.newPage();
  await login.goto(SITE);
  const status = await login.evaluate(async ([identifier, pw]) =>
    (await fetch("/api/session/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password: pw }) })).status, [email, password]);
  if (status !== 200) throw new Error(`login ${status}`);
  const session = (await first.cookies()).filter((c) => c.name.startsWith("ft_"));
  const demo = await demoData(login);
  await first.close();
  for (const lang of langs) {
    for (const name of devices) {
      const d = DEVICES[name];
      const ctx = await browser.newContext({
        viewport: d.viewport, deviceScaleFactor: d.scale, isMobile: d.mobile, hasTouch: d.mobile,
        ...(d.ua ? { userAgent: d.ua } : {}), colorScheme: "light", locale: lang === "id" ? "id-ID" : "en-US",
      });
      const cookies = [{ name: "NEXT_LOCALE", value: lang, url: SITE }];
      if (d.client) cookies.push({ name: "ft_client", value: d.client, url: SITE });
      await ctx.addCookies([...session, ...cookies]);
      const page = await ctx.newPage();
      const tree = `${SITE}/app/t/${demo.treeId}`;
      const snap = async (shot) => {
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${out}/${lang}-${name}-${shot}.png` });
        console.log(`${lang} ${name} ${shot}`);
      };
      for (const shot of shots) {
        if (shot === "tree") {
          await page.goto(`${tree}?focus=${name === "mac" || name === "windows" || name === "ipad" ? demo.bambang : demo.sri}`);
          await page.waitForSelector(".react-flow__node", { timeout: 20000 });
          // Phones: zoom out, so three generations and their partners fit.
          if (name === "iphone" || name === "android") {
            await page.waitForTimeout(800);
            for (let i = 0; i < 3; i++) await page.locator(".react-flow__controls-zoomout").click();
          }
          await snap(shot);
        } else if (shot === "person") {
          await page.goto(`${tree}?focus=${demo.ayu}&person=${demo.ayu}`);
          await page.waitForSelector(".react-flow__node", { timeout: 20000 });
          await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
          await snap(shot);
        } else if (shot === "ask") {
          await page.goto(`${tree}/ask`);
          const box = page.locator("textarea").first();
          await box.waitFor({ timeout: 20000 });
          await box.fill(QUESTION[lang]);
          await box.press("Enter");
          // Wait for "Looking through the tree…" to appear and go, then a moment for the answer to settle.
          await page.waitForFunction((text) => document.body.innerText.includes(text), THINKING[lang], { timeout: 20000 }).catch(() => {});
          await page.waitForFunction((text) => !document.body.innerText.includes(text), THINKING[lang], { timeout: 90000 });
          await page.waitForTimeout(2500);
          await page.evaluate(() => document.activeElement?.blur());
          await snap(shot);
        } else if (shot === "people") {
          await page.goto(`${tree}/people`);
          await page.waitForTimeout(2500);
          await snap(shot);
        } else if (shot === "export") {
          await page.goto(`${tree}?focus=${demo.sri}`);
          await page.waitForSelector(".react-flow__node", { timeout: 20000 });
          await page.getByRole("button", { name: lang === "id" ? "Ekspor" : "Export", exact: true }).click();
          await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
          await snap(shot);
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
