# Microsoft Store (Partner Center)

The Windows app is the Tauri shell around https://sakdulur.com, packaged as MSIX for x64 and Arm64 by
`.github/workflows/native-windows-msix.yml` (`pnpm release windows <build>`). Microsoft signs the packages after
certification; the Store handles updates. Same Partner Center account as Malanghub, catetin.ai and Dzikir App.

Lessons from catetin.ai's rejections (July 2026), already applied below: screenshots show the app in a Windows
window only; the descriptions mention no other platform; the Generative AI declaration is on and AI answers have a
visible report action; no input device is a minimum requirement; reviewers get test steps.

## First release

1. **Reserve the name.** Partner Center > Apps and games > New product > MSIX or PWA app > `Sakdulur`.
2. **Product identity** (Product management > Product identity), as GitHub secrets:

   | Secret | Partner Center field |
   | --- | --- |
   | `SAKDULUR_WINDOWS_IDENTITY_NAME` | Package/Identity/Name |
   | `SAKDULUR_WINDOWS_PUBLISHER` | Package/Identity/Publisher (`CN=…`) |
   | `SAKDULUR_WINDOWS_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |

   `gh secret set SAKDULUR_WINDOWS_IDENTITY_NAME --body '…'` (and the other two).
3. **Build:** `SAKDULUR_RELEASE_VERSION=1.0.0 pnpm release windows 102` → artifacts
   `sakdulur-windows-msix-x64-102` and `…-arm64-102` (`Sakdulur-1.0.0.0-<arch>.msix`). Download with
   `gh run download <run-id> -R fahmialfareza/sakdulur`.
4. **Start a submission** and fill in each section:
   - **Pricing and availability:** Free (Rp 0), no free trial, all markets, public.
   - **Properties:** category **Lifestyle**; privacy policy `https://sakdulur.com/en/privacy`; website
     `https://sakdulur.com`; support contact `fahmialfareza97@gmail.com`. Product declarations: tick
     **This product uses generative AI** (the tree assistant; answers can be reported from the chat). Leave "Record
     and broadcast clips" off (not a game). System requirements: no minimum hardware (touch, keyboard, mouse,
     camera and microphone all unticked); recommended: none.
   - **Age ratings (IARC):** not a game; users can share content with **people they invite** only (no public
     sharing, no chat between strangers); no purchases; no ads; generative AI: yes; collects personal info
     (name, email) to run accounts. Expect "3+/Everyone" with interactive elements "Users interact".
   - **Packages:** upload both `.msix` files (x64 and Arm64) into the same submission.
   - **Store listings:** English (United States) and Indonesian, text below; screenshots
     `fastlane/screenshots/windows/{en-US,id}/windows-0{1…5}-*.png` (2560×1600) in that order; Store logos come from
     the package (no extra logo needed). Make the language with the most users the first one shown if asked.
   - **Submission options > Notes for certification:** the reviewer steps below.
5. **Submit for certification.** Usually 1–3 business days.

Screenshots: `DEVICES=windows ACCOUNT=<demo account file> OUT=/tmp/sakdulur-shots node capture.cjs`, then
`ONLY=windows IN=/tmp/sakdulur-shots node compose.cjs` (both in `apps/native/store/screenshots`). The Windows
capture uses a Windows user agent, so the search box shows Ctrl K.

## Each release

`pnpm release windows <build>` (the Store needs a higher MSIX version each time: build 103 → 1.0.3.0, or keep
the version with `SAKDULUR_RELEASE_VERSION` and raise it later), start an update in Partner Center, replace both
packages, update "What's new", submit.

## Listing: English (United States)

**Product name:** Sakdulur

**Short title:** Sakdulur: Family Tree

**Short description:**
Build a private family tree together with your family: parents, partners and children across generations,
photos and stories, and an assistant you can ask by chatting.

**Description:**

Sakdulur is a private family tree you build together with your family.

"Sak dulur" is Javanese for "one family". Map parents, partners and children across generations, add photos and
stories, and invite relatives to fill in their own branches. It works for a small household as well as a whole
trah or bani with hundreds of members.

A REAL FAMILY TREE
• Couples side by side, children below their own parents, ancestors and descendants together
• Remarriages, divorces and engagements, each child under the right couple
• Birth, adoptive, step, foster, guardian and milk parents, with foster and step links drawn dashed
• Record dates (even "about 1920"), places, photos, notes, and an optional religion for people who passed away

BUILD IT TOGETHER
• Invite relatives as editors or viewers with a link
• Share a branch with the people who know it best
• Keep your own tree, your spouse's and your in-laws', and copy a branch between them instead of typing it twice

ASK AND UPDATE BY CHATTING
• "Who is Ayu's father?" or "Add Rani as Ayu's daughter, born 1994."
• Nothing is saved until you press Apply, and the assistant never deletes anything
• The tree's owner decides whether to turn it on
• Answers are generated by AI and can be wrong; report any answer from the chat with one click

PRIVATE BY DEFAULT
• Every tree is private: only the people you invite can see it
• No ads, and your data is never sold
• Export a tree as a picture, Excel or GEDCOM, download your data, or delete your account anytime

In English or Bahasa Indonesia, light or dark. Free. Needs an internet connection.

**What's new in this version:**
First release on Windows: relationship kinds (birth, adoptive, step, foster, guardian, milk), partner status
with marriage and divorce dates, siblings grouped as full, half, step and foster, and a clearer tree.

**Search terms (7):** family tree; genealogy; silsilah; ancestry; family history; GEDCOM; trah

**Copyright:** © 2026 Fahmi Alfareza

## Listing: Indonesian

**Product name:** Sakdulur

**Short title:** Sakdulur: Silsilah Keluarga

**Short description:**
Susun silsilah keluarga yang privat bersama keluarga: orang tua, pasangan, dan anak lintas generasi, foto dan
cerita, serta asisten yang bisa ditanya lewat obrolan.

**Description:**

Sakdulur adalah aplikasi silsilah keluarga yang privat, disusun bersama keluarga Anda.

"Sak dulur" dalam bahasa Jawa berarti "satu saudara". Petakan orang tua, pasangan, dan anak lintas generasi,
tambahkan foto dan cerita, lalu undang kerabat untuk melengkapi cabangnya sendiri. Cocok untuk satu rumah tangga
hingga satu trah atau bani dengan ratusan anggota.

SILSILAH YANG SEBENARNYA
• Pasangan berdampingan, anak di bawah orang tuanya sendiri, leluhur dan keturunan sekaligus
• Pernikahan kedua, cerai, dan tunangan, setiap anak di bawah pasangan yang tepat
• Orang tua kandung, angkat, tiri, asuh, wali, dan susuan, dengan garis asuh dan tiri putus-putus
• Catat tanggal (bahkan "sekitar 1920"), tempat, foto, catatan, serta agama (opsional) untuk yang sudah wafat

DISUSUN BERSAMA
• Undang kerabat sebagai editor atau pembaca lewat tautan
• Bagikan satu cabang kepada orang yang paling mengenalnya
• Simpan pohon Anda, pohon pasangan, dan pohon keluarga besan, lalu salin cabang di antaranya tanpa mengetik ulang

TANYA DAN UBAH LEWAT OBROLAN
• "Bapaknya Ayu siapa?" atau "Tambahkan Rani anaknya Ayu, lahir 1994."
• Tidak ada yang tersimpan sebelum Anda menekan Terapkan, dan asisten tidak pernah menghapus apa pun
• Pemilik pohon yang memutuskan untuk mengaktifkannya
• Jawaban dibuat oleh AI dan bisa keliru; laporkan jawaban mana pun dari obrolan dengan satu klik

PRIVAT SEJAK AWAL
• Setiap pohon bersifat privat: hanya orang yang Anda undang yang dapat melihatnya
• Tanpa iklan, dan data Anda tidak pernah dijual
• Ekspor pohon sebagai gambar, Excel, atau GEDCOM, unduh data Anda, atau hapus akun kapan saja

Dalam Bahasa Indonesia atau Inggris, mode terang atau gelap. Gratis. Memerlukan koneksi internet.

**Yang baru di versi ini:**
Rilis pertama di Windows: jenis hubungan (kandung, angkat, tiri, asuh, wali, susuan), status pasangan dengan
tanggal nikah dan cerai, saudara dikelompokkan (kandung, seayah/seibu, tiri, asuh), dan pohon yang lebih jelas.

**Kata pencarian (7):** silsilah keluarga; pohon keluarga; trah; bani; genealogi; family tree; GEDCOM

**Hak cipta:** © 2026 Fahmi Alfareza

## Notes for certification

```
Sakdulur is a family tree app; the Windows app shows our website (https://sakdulur.com) in an app window.

Test account (has a demo family tree "Keluarga Wiryo"):
  Email: <demo account email>
  Password: <demo account password>

1. Sign in with the email and password above (Google and Apple sign-in open the browser and return to the app).
2. Pohon / Tree: the family tree. Click a person to see details; use the toolbar above a card to add a parent,
   partner or child.
3. Tanya / Ask: the AI assistant (generative AI). Ask "Who is Bambang's father?". Every answer has a "Report"
   link under it that opens an email to us to report a wrong or harmful answer. Suggested changes are only saved
   when the user presses Apply.
4. Account > Delete account deletes the account and its data.

The app needs an internet connection. No purchases, no ads.
```

Fill in the account from the demo account file (iCloud `Reza/Projects/Sakdulur/Credentials`); never commit it.
