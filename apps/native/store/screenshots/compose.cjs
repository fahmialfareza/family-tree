// Turns the raw screens from capture.cjs into the store images: brand background, a headline in Fraunces, and
// the screen with rounded corners (a window title bar on the Mac and on Windows). Also draws the Play icon and
// feature graphic.
//   IN=/tmp/sakdulur-shots node compose.cjs            (ONLY=windows for one store)
// Writes into fastlane/screenshots/{ios,mac,windows}/<locale> and fastlane/metadata/android/<locale>/images.
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../..");
const FL = path.join(ROOT, "fastlane");
const IN = process.env.IN || "/tmp/sakdulur-shots";
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOCALE = { id: "id", en: "en-US" };

const SLIDES = [
  { shot: "tree", id: ["Silsilah keluarga,", "disusun bersama"], en: ["Your family tree,", "built together"],
    sub: { id: "Pasangan, anak, dan leluhur dalam satu pohon", en: "Partners, children and ancestors in one tree" } },
  { shot: "person", id: ["Setiap kerabat,", "lengkap kisahnya"], en: ["Every relative,", "with their story"],
    sub: { id: "Tanggal, tempat, foto, dan catatan", en: "Dates, places, photos and notes" } },
  { shot: "ask", id: ["Tanya soal keluarga", "lewat obrolan"], en: ["Ask about your family", "just by chatting"],
    sub: { id: "Atau minta tambahkan kerabat; tersimpan setelah Anda setujui", en: "Or ask it to add relatives; saved only when you approve" } },
  { shot: "people", id: ["Semua kerabat", "di satu tempat"], en: ["All your relatives", "in one place"],
    sub: { id: "Privat: hanya keluarga yang Anda undang", en: "Private: only the family you invite" } },
  { shot: "export", id: ["Simpan dan bagikan", "pohon keluarga"], en: ["Save and share", "your family tree"],
    sub: { id: "Gambar, Excel, atau GEDCOM", en: "As a picture, Excel or GEDCOM" } },
];

// width × height of the store image, and the source device from capture.cjs
const TARGETS = [
  { store: "ios", device: "iphone", w: 1320, h: 2868, dir: (l) => path.join(FL, "screenshots/ios", LOCALE[l]), file: (i, s) => `iphone-0${i + 1}-${s}.png` },
  { store: "ios", device: "ipad", w: 2064, h: 2752, dir: (l) => path.join(FL, "screenshots/ios", LOCALE[l]), file: (i, s) => `ipad-0${i + 1}-${s}.png` },
  { store: "mac", device: "mac", w: 2880, h: 1800, dir: (l) => path.join(FL, "screenshots/mac", LOCALE[l]), file: (i, s) => `mac-0${i + 1}-${s}.png` },
  // Microsoft Store: the desktop screens in a Windows window (it rejects screenshots showing another platform).
  { store: "windows", device: "windows", w: 2560, h: 1600, dir: (l) => path.join(FL, "screenshots/windows", LOCALE[l]), file: (i, s) => `windows-0${i + 1}-${s}.png` },
  { store: "play", device: "android", w: 1080, h: 2160, dir: (l) => path.join(FL, "metadata/android", LOCALE[l], "images/phoneScreenshots"), file: (i, s) => `0${i + 1}-${s}.png` },
  { store: "play", device: "ipad", w: 2064, h: 2752, dir: (l) => path.join(FL, "metadata/android", LOCALE[l], "images/tenInchScreenshots"), file: (i, s) => `0${i + 1}-${s}.png` },
  { store: "play", device: "ipad", w: 2064, h: 2752, dir: (l) => path.join(FL, "metadata/android", LOCALE[l], "images/sevenInchScreenshots"), file: (i, s) => `0${i + 1}-${s}.png` },
];

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Plus+Jakarta+Sans:wght@500&display=block" rel="stylesheet">`;
const BASE_CSS = `*{margin:0;box-sizing:border-box}body{width:100vw;height:100vh;overflow:hidden;
  background:radial-gradient(120% 80% at 50% 0%,#fdfbf5 0%,#f3eee2 55%,#e6efe5 100%);color:#3a3128;
  font-family:"Plus Jakarta Sans",sans-serif}
  h1{font-family:Fraunces,serif;font-weight:600;letter-spacing:-.01em;line-height:1.08;color:#2f4f3a}
  .accent{color:#c9714a}`;

function slideHtml(t, slide, lang, img) {
  const [l1, l2] = slide[lang];
  const sub = slide.sub[lang];
  const landscape = t.w > t.h;
  const u = t.w / 100; // 1vw in px, for sizes that follow the image width
  if (landscape) {
    // Mac: headline left, window right.
    return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
      body{display:flex;align-items:center;gap:${4 * u}px;padding:0 ${5 * u}px}
      .text{flex:0 0 26%}h1{font-size:${3.6 * u}px}p{margin-top:${1.6 * u}px;font-size:${1.45 * u}px;line-height:1.45;color:#75695c}
      .win{flex:1;border-radius:${0.9 * u}px;overflow:hidden;box-shadow:0 ${1.2 * u}px ${4 * u}px rgba(47,79,58,.22),0 0 0 1px rgba(58,49,40,.08);background:#fff}
      .bar{height:${2.1 * u}px;background:#ece7dc;display:flex;align-items:center;gap:${0.55 * u}px;padding:0 ${0.9 * u}px}
      .bar i{width:${0.75 * u}px;height:${0.75 * u}px;border-radius:50%;display:block}
      .win img{display:block;width:100%}
      .win.windows{border-radius:${0.45 * u}px}
      .windows .bar{background:#f3f3f3;gap:${0.6 * u}px;padding:0 0 0 ${0.9 * u}px;font:${0.85 * u}px "Segoe UI",sans-serif;color:#1f1f1f}
      .windows .bar img{width:${1.1 * u}px;height:${1.1 * u}px}.windows .bar span{flex:1}
      .windows .bar b{width:${3.4 * u}px;height:100%;display:flex;align-items:center;justify-content:center;font-weight:400;font-size:${0.95 * u}px}</style></head><body>
      <div class="text"><h1>${l1}<br><span class="accent">${l2}</span></h1><p>${sub}</p></div>
      ${t.store === "windows"
        ? `<div class="win windows"><div class="bar"><img src="data:image/png;base64,${ICON}"><span>Sakdulur</span><b>&#x2500;</b><b>&#x2610;</b><b>&#x2715;</b></div><img src="${img}"></div>`
        : `<div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><img src="${img}"></div>`}
      </body></html>`;
  }
  const phone = t.h / t.w > 1.6;
  const head = phone ? 0.205 : 0.165; // share of the height for the headline
  return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
    body{display:flex;flex-direction:column;align-items:center}
    .text{height:${head * t.h}px;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:0 ${6 * u}px}
    h1{font-size:${(phone ? 7.4 : 5.6) * u}px}p{margin-top:${(phone ? 2 : 1.4) * u}px;font-size:${(phone ? 3.4 : 2.4) * u}px;color:#75695c}
    .screen{flex:1;width:${phone ? 84 : 86}%;min-height:0;border-radius:${(phone ? 6 : 3) * u}px ${(phone ? 6 : 3) * u}px 0 0;overflow:hidden;
      box-shadow:0 ${2 * u}px ${6 * u}px rgba(47,79,58,.22),0 0 0 ${0.35 * u}px rgba(58,49,40,.08);background:#fff}
    .screen img{display:block;width:100%}</style></head><body>
    <div class="text"><h1>${l1}<br><span class="accent">${l2}</span></h1><p>${sub}</p></div>
    <div class="screen"><img src="${img}"></div></body></html>`;
}

const ICON = fs.readFileSync(path.join(ROOT, "apps/native/app-icon.png")).toString("base64");

function featureHtml(lang) {
  const tag = lang === "id" ? "Susun silsilah keluarga, bersama-sama" : "Build your family tree, together";
  return `<!doctype html><html><head>${FONTS}<style>${BASE_CSS}
    body{background:linear-gradient(120deg,#3f7a52 0%,#2f5f40 100%);display:flex;align-items:center;gap:56px;padding:0 84px;color:#fbf7ee}
    img{width:220px;height:220px;border-radius:48px;box-shadow:0 18px 48px rgba(0,0,0,.25)}
    h1{color:#fbf7ee;font-size:92px}p{margin-top:14px;font-size:34px;color:#e6efe5}</style></head><body>
    <img src="data:image/png;base64,${ICON}"><div><h1>Sakdulur</h1><p>${tag}</p></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome });
  const render = async (html, w, h, file) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    await page.close();
  };
  let made = 0;
  for (const lang of Object.keys(LOCALE)) {
    for (const t of TARGETS.filter((t) => !process.env.ONLY || t.store === process.env.ONLY)) {
      for (const [i, slide] of SLIDES.entries()) {
        const raw = path.join(IN, `${lang}-${t.device}-${slide.shot}.png`);
        if (!fs.existsSync(raw)) continue;
        const img = `data:image/png;base64,${fs.readFileSync(raw).toString("base64")}`;
        await render(slideHtml(t, slide, lang, img), t.w, t.h, path.join(t.dir(lang), t.file(i, slide.shot)));
        made++;
      }
    }
    if (process.env.ONLY && process.env.ONLY !== "play") continue;
    const images = path.join(FL, "metadata/android", LOCALE[lang], "images");
    await render(featureHtml(lang), 1024, 500, path.join(images, "featureGraphic.png"));
    // Play's icon: 512×512.
    execFileSync("sips", ["-z", "512", "512", path.join(ROOT, "apps/native/app-icon.png"), "--out", path.join(images, "icon.png")], { stdio: "ignore" });
  }
  await browser.close();
  console.log(`Composed ${made} store images, plus the Play icon and feature graphics.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
