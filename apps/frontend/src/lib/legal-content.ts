// Privacy Policy and Terms of Service, in English and Indonesian.
// Operator details default to the current operator and can be overridden per deployment with env vars.
// Keep both languages in step, and bump LEGAL_UPDATED whenever the meaning changes.

import { BRAND } from "./brand";

export type LegalSection = { h: string; p?: string[]; list?: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

export const LEGAL_UPDATED = "2026-10-27";
export const MIN_AGE = 13;

const operator = process.env.NEXT_PUBLIC_OPERATOR_NAME || "Fahmi Alfareza";
export const OPERATOR_NAME = operator;
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "fahmialfareza97@gmail.com";
export const contactEmail = contact;
const site = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/^https?:\/\//, "") || BRAND;

export function privacyPolicy(locale: string): LegalDoc {
  if (locale === "id") {
    return {
      title: "Kebijakan Privasi",
      updated: `Berlaku sejak ${LEGAL_UPDATED}`,
      intro: `Kebijakan ini menjelaskan data pribadi apa yang dikumpulkan ${BRAND} (${site}), untuk apa digunakan, dengan siapa dibagikan, berapa lama disimpan, dan hak Anda atasnya. Kami menulisnya sesederhana mungkin.`,
      sections: [
        {
          h: "1. Pengendali data",
          p: [
            `${BRAND} dikelola oleh ${operator}, perorangan yang berdomisili di Indonesia, yang bertindak sebagai pengendali data pribadi menurut Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).`,
            `Untuk semua pertanyaan dan permintaan terkait data pribadi, hubungi ${contact}.`,
          ],
        },
        {
          h: "2. Data yang kami kumpulkan",
          p: ["Data akun Anda:"],
          list: [
            "Nama, alamat email, dan nama pengguna (untuk akun lama).",
            "Kata sandi — hanya disimpan sebagai hash bcrypt; kami tidak pernah dapat melihat kata sandi Anda.",
            "Jika Anda masuk dengan Google: ID akun Google, nama, dan email yang diberikan Google. Kami tidak menerima kata sandi Google Anda.",
            "Jika Anda masuk dengan Apple: ID akun Apple, email yang diberikan Apple (dapat berupa alamat relai pribadi jika Anda memilih menyembunyikan email), dan nama Anda saat pertama kali masuk. Kami tidak menerima kata sandi Akun Apple Anda.",
            "Sesi masuk: jenis browser/perangkat, alamat IP, waktu dibuat dan terakhir digunakan.",
          ],
        },
        {
          h: "Isi pohon keluarga",
          p: [
            "Data yang Anda dan anggota pohon lain masukkan tentang orang-orang di pohon: nama, nama panggilan, jenis kelamin, tanggal dan tempat lahir/wafat, status hidup, foto, nomor telepon, alamat, catatan, serta hubungan keluarga.",
            "Data ini sering menyangkut orang yang masih hidup dan tidak memiliki akun, termasuk anak-anak. Orang yang menambahkannya bertanggung jawab memastikan ia berhak melakukannya (lihat bagian 9).",
          ],
        },
        {
          h: "Data teknis",
          list: [
            "Log server (alamat IP, waktu, halaman yang diminta, kode status) untuk keamanan dan pemecahan masalah. Isi permintaan, kata sandi, dan token tidak dicatat.",
            "Data kesalahan dan kinerja aplikasi melalui layanan pemantauan.",
            "Statistik kunjungan anonim untuk situs web melalui Cloudflare Web Analytics (halaman yang dilihat, situs perujuk, negara, jenis browser dan perangkat). Layanan ini tidak memasang cookie dan tidak melacak Anda di situs lain.",
            "Kami tidak menggunakan iklan, pelacak lintas situs, atau profil perilaku.",
          ],
        },
        {
          h: "Aplikasi kami",
          list: [
            "Aplikasi Sakdulur untuk iPhone, Android, Mac, Windows, dan Linux membuka layanan yang sama ini di jendela aplikasi. Aplikasi tidak mengumpulkan data selain yang dijelaskan dalam kebijakan ini dan tidak menambahkan iklan atau analitik sendiri.",
            "File yang Anda ekspor atau unduh di aplikasi disimpan di perangkat Anda. Untuk masuk dengan Apple atau Google, aplikasi menggunakan lembar masuk Apple atau browser Anda.",
            "Toko aplikasi tempat Anda memasang aplikasi (seperti App Store atau Google Play) memproses data unduhan dan pemasangan sesuai kebijakan privasinya sendiri.",
          ],
        },
        {
          h: "3. Tujuan dan dasar pemrosesan",
          list: [
            "Menyediakan layanan yang Anda minta: membuat akun, menyimpan dan menampilkan pohon kepada anggota yang Anda undang (pelaksanaan perjanjian/Ketentuan Layanan).",
            "Mengirim email yang diperlukan: verifikasi alamat, atur ulang kata sandi, dan undangan (pelaksanaan perjanjian).",
            "Menjaga keamanan: membatasi percobaan masuk, mendeteksi penyalahgunaan, mencadangkan data (kepentingan yang sah dan kewajiban keamanan).",
            "Isi pohon tentang orang lain diproses atas dasar persetujuan dan kepentingan sah keluarga dalam mencatat silsilahnya; orang yang bersangkutan dapat mengajukan keberatan (bagian 6).",
            "Kami tidak menjual data pribadi dan tidak menggunakannya untuk iklan atau pengambilan keputusan otomatis yang berdampak hukum.",
          ],
        },
        {
          h: "4. Siapa yang dapat melihat data",
          list: [
            "Setiap pohon bersifat privat. Hanya anggota yang diundang pemilik pohon yang dapat membukanya.",
            "Peran menentukan akses: pemilik mengelola semuanya, editor dapat menambah dan mengubah, pembaca hanya melihat. Pemilik dapat membatasi editor dan pembaca pada cabang tertentu.",
            "Email anggota hanya terlihat oleh pemilik pohon.",
            "Pemilik dan editor dapat menyalin cabang (nama, jenis kelamin, tanggal, tempat, dan hubungan — bukan foto, telepon, alamat, atau catatan) ke pohon lain yang mereka kelola, misalnya pohon pasangan. Salinan itu kemudian terlihat oleh anggota pohon tujuan. Di pohon yang berbagi per cabang, editor hanya dapat menyalin orang yang dibagikan kepada mereka.",
            "Pengelola dapat mengakses data hanya bila diperlukan untuk dukungan yang Anda minta, keamanan, atau kewajiban hukum.",
          ],
        },
        {
          h: "5. Penyedia layanan (pemroses data)",
          p: ["Kami menggunakan penyedia berikut, yang memproses data atas nama kami hanya untuk menjalankan layanan:"],
          list: [
            "Railway — server API, basis data, dan cache.",
            "Cloudflare — aplikasi web, statistik kunjungan anonim (Web Analytics), dan penyimpanan cadangan basis data (R2).",
            "Cloudinary — penyimpanan dan pengolahan foto.",
            "Resend — pengiriman email transaksional.",
            "New Relic — pemantauan kesalahan dan kinerja.",
            "Google — hanya jika Anda memilih masuk dengan Google.",
            "Apple — hanya jika Anda memilih masuk dengan Apple.",
            "Google (Gemini) dan Groq — hanya untuk pohon yang asisten AI-nya diaktifkan oleh pemilik. Saat anggota bertanya atau meminta perubahan, pesan mereka beserta nama, tanggal, tempat, alamat, dan catatan orang yang terkait dikirim ke salah satu penyedia ini untuk menyusun jawaban atau usulan perubahan, yang baru tersimpan setelah anggota menekan Terapkan. Nomor telepon dan foto tidak dikirim, dan percakapan tidak kami simpan.",
          ],
        },
        {
          h: "Transfer ke luar negeri",
          p: [
            "Penyedia di atas dapat menyimpan atau memproses data di luar Indonesia (misalnya di Amerika Serikat, Eropa, atau Asia). Kami memilih penyedia yang menerapkan perlindungan memadai dan mewajibkan mereka menjaga kerahasiaan serta keamanan data, sesuai Pasal 56 UU PDP.",
          ],
        },
        {
          h: "6. Hak Anda",
          p: ["Sesuai UU PDP (dan GDPR bila berlaku), Anda berhak untuk:"],
          list: [
            "Mendapat informasi tentang pemrosesan data Anda (kebijakan ini).",
            "Mengakses dan memperoleh salinan data Anda — unduh dari Akun → Data Anda; pemilik pohon dapat mengekspor pohon.",
            "Memperbaiki data yang tidak akurat — langsung di aplikasi, atau minta kepada pemilik pohon.",
            "Menghapus data — hapus akun dari halaman Akun, atau minta penghapusan data tentang Anda di pohon orang lain.",
            "Menarik persetujuan dan mengajukan keberatan atas pemrosesan, serta meminta pembatasan pemrosesan.",
            "Memindahkan data dalam format yang umum dibaca mesin (JSON).",
            "Mengajukan pengaduan kepada otoritas pelindungan data pribadi.",
          ],
        },
        {
          h: "Cara mengajukan permintaan",
          p: [
            `Kirim email ke ${contact} dari alamat yang terdaftar di akun Anda (atau jelaskan hubungan Anda dengan data tersebut jika Anda tidak memiliki akun). Kami akan menanggapi dalam 3 × 24 jam sejak permintaan diterima sebagaimana diwajibkan UU PDP, dan dapat meminta verifikasi identitas sebelum bertindak.`,
          ],
        },
        {
          h: "7. Penyimpanan dan penghapusan",
          list: [
            "Data akun disimpan selama akun aktif.",
            "Menghapus akun akan langsung menghapus akun, sesi, keanggotaan, dan pohon yang hanya Anda miliki beserta isinya. Jika Anda satu-satunya pemilik pohon yang juga dipakai orang lain, Anda harus menyerahkan kepemilikan terlebih dahulu.",
            "Orang, keluarga, atau pohon yang dihapus di dalam aplikasi disembunyikan dari semua anggota, tetapi catatannya tetap tersimpan sebagai riwayat sampai pohonnya dihapus atau Anda meminta penghapusan permanen melalui email.",
            "Sesi masuk berakhir paling lama 30 hari setelah terakhir digunakan; tautan email berlaku 1 jam (atur ulang kata sandi), 24 jam (verifikasi), atau 7 hari (undangan).",
            "Cadangan basis data harian disimpan 14 hari dan cadangan mingguan 8 minggu; data yang dihapus hilang dari cadangan setelah masa itu.",
            "Log server dan data pemantauan disimpan dalam waktu terbatas, umumnya tidak lebih dari 90 hari.",
          ],
        },
        {
          h: "8. Keamanan",
          p: [
            "Semua koneksi dienkripsi (HTTPS). Kata sandi di-hash dengan bcrypt, token masuk disimpan dalam cookie httpOnly yang tidak dapat dibaca skrip halaman, akses dibatasi per pohon dan per peran, percobaan masuk dibatasi, dan cadangan disimpan di penyimpanan terenkripsi.",
            "Tidak ada sistem yang sepenuhnya aman. Jika terjadi kegagalan pelindungan data pribadi, kami akan memberi tahu Anda dan otoritas terkait paling lambat 3 × 24 jam sesuai UU PDP.",
          ],
        },
        {
          h: "9. Data orang lain dan anak-anak",
          list: [
            `Akun hanya untuk pengguna berusia minimal ${MIN_AGE} tahun. Pengguna di bawah 18 tahun memerlukan izin orang tua atau wali.`,
            "Anak-anak dapat muncul di pohon sebagai anggota keluarga yang ditambahkan orang dewasa. Hanya tambahkan data anak jika Anda orang tua/wali atau memiliki izin mereka, sebagaimana diwajibkan UU PDP untuk data anak.",
            "Untuk kerabat yang masih hidup, mintalah izin mereka sebelum menambahkan detail pribadi seperti foto, nomor telepon, atau alamat.",
            `Jika Anda menemukan data tentang diri Anda atau anak Anda di sebuah pohon dan ingin data itu diubah atau dihapus, hubungi ${contact}; kami akan menindaklanjuti dengan pemilik pohon atau langsung bila perlu.`,
          ],
        },
        {
          h: "10. Cookie dan penyimpanan lokal",
          p: ["Kami hanya menggunakan yang diperlukan agar aplikasi berfungsi:"],
          list: [
            "ft_access dan ft_refresh — sesi masuk Anda (httpOnly, berlaku hingga 30 hari).",
            "ft_signed_in — menandai bahwa Anda sedang masuk, agar halaman depan menampilkan tombol yang tepat (tanpa data pribadi, hingga 30 hari).",
            "ft_oauth_binding, serta ft_oauth dan ft_oauth_apple di api.sakdulur.com — mengamankan proses masuk dengan Google dan Apple (10 menit).",
            "ft_client — hanya di aplikasi Sakdulur: aplikasi yang Anda gunakan (iOS, Android, macOS, Windows, atau Linux), agar aplikasi terbuka di layar awalnya sendiri (1 tahun).",
            "NEXT_LOCALE — pilihan bahasa (1 tahun).",
            "theme (penyimpanan lokal browser) — pilihan tema terang/gelap.",
            "Tidak ada cookie analitik, pelacakan, atau iklan (statistik kunjungan di atas tidak memakai cookie), sehingga tidak diperlukan banner persetujuan cookie.",
          ],
        },
        {
          h: "11. Perubahan kebijakan",
          p: [
            "Jika kami mengubah kebijakan ini secara material, kami akan memberi tahu melalui aplikasi atau email sebelum perubahan berlaku. Tanggal berlaku di bagian atas selalu menunjukkan versi terbaru.",
          ],
        },
        { h: "12. Kontak", p: [`${operator} — ${contact}`] },
      ],
    };
  }
  return {
    title: "Privacy Policy",
    updated: `Effective ${LEGAL_UPDATED}`,
    intro: `This policy explains what personal data ${BRAND} (${site}) collects, why, who it is shared with, how long it is kept, and your rights over it. We have tried to keep it plain.`,
    sections: [
      {
        h: "1. Who is responsible",
        p: [
          `${BRAND} is operated by ${operator}, an individual based in Indonesia, who is the data controller under Indonesia's Personal Data Protection Law No. 27 of 2022 (UU PDP).`,
          `For any question or request about personal data, contact ${contact}.`,
        ],
      },
      {
        h: "2. What we collect",
        p: ["Your account:"],
        list: [
          "Name, email address, and username (for older accounts).",
          "Password — stored only as a bcrypt hash; we can never see your password.",
          "If you sign in with Google: your Google account ID, name and email as provided by Google. We never receive your Google password.",
          "If you sign in with Apple: your Apple account ID, your email as provided by Apple (which may be a private relay address if you chose to hide yours), and your name the first time you sign in. We never receive your Apple Account password.",
          "Sign-in sessions: browser/device type, IP address, when they were created and last used.",
        ],
      },
      {
        h: "Family tree content",
        p: [
          "What you and other members of a tree add about the people in it: names, nicknames, gender, birth and death dates and places, living status, photos, phone numbers, addresses, notes, and family relationships.",
          "This often concerns living people who have no account, including children. Whoever adds it is responsible for being entitled to do so (see section 9).",
        ],
      },
      {
        h: "Technical data",
        list: [
          "Server logs (IP address, time, requested page, status code) for security and troubleshooting. Request bodies, passwords and tokens are not logged.",
          "Application error and performance data through a monitoring service.",
          "Anonymous visit statistics for the website through Cloudflare Web Analytics (pages viewed, referring site, country, browser and device type). It sets no cookies and does not follow you across other sites.",
          "We use no advertising, cross-site trackers, or behavioural profiling.",
        ],
      },
      {
        h: "Our apps",
        list: [
          "The Sakdulur apps for iPhone, Android, Mac, Windows and Linux open this same service in an app window. They collect nothing beyond what this policy describes and add no advertising or analytics of their own.",
          "Files you export or download in an app are saved on your device. The app uses Apple's sign-in sheet, or your browser, to sign you in with Apple or Google.",
          "The app store you install from (such as the App Store or Google Play) processes download and installation data under its own privacy policy.",
        ],
      },
      {
        h: "3. Why we use it (and on what basis)",
        list: [
          "To provide the service you asked for: creating your account, storing your trees and showing them to the members you invite (performance of a contract — our Terms).",
          "To send necessary emails: address verification, password resets and invitations (performance of a contract).",
          "To keep the service secure: limiting sign-in attempts, detecting abuse, and backing up data (legitimate interests and security obligations).",
          "Tree content about other people is processed with consent and in the family's legitimate interest in recording its history; the people concerned may object (section 6).",
          "We do not sell personal data and do not use it for advertising or automated decisions with legal effect.",
        ],
      },
      {
        h: "4. Who can see it",
        list: [
          "Every tree is private. Only members invited by the tree's owner can open it.",
          "Roles decide access: owners manage everything, editors add and change people, viewers can only look. Owners can limit editors and viewers to specific branches.",
          "Members' email addresses are visible only to the tree's owners.",
          "Owners and editors can copy a branch (names, gender, dates, places and relationships — not photos, phone numbers, addresses or notes) into another tree they manage, for example a spouse's tree. The copy is then visible to that tree's members. In branch-shared trees, editors can only copy people shared with them.",
          "The operator accesses data only when needed for support you request, for security, or to meet a legal obligation.",
        ],
      },
      {
        h: "5. Service providers (processors)",
        p: ["We use these providers, who process data on our behalf only to run the service:"],
        list: [
          "Railway — API servers, database and cache.",
          "Cloudflare — the web app, anonymous visit statistics (Web Analytics), and database backup storage (R2).",
          "Cloudinary — photo storage and processing.",
          "Resend — transactional email delivery.",
          "New Relic — error and performance monitoring.",
          "Google — only if you choose Sign in with Google.",
          "Apple — only if you choose Sign in with Apple.",
          "Google (Gemini) and Groq — only for trees whose owner turned on the AI assistant. When a member asks a question or asks for a change, their message and the names, dates, places, addresses and notes of the people involved are sent to one of these providers to write the answer or propose the change, which is saved only when the member presses Apply. Phone numbers and photos are not sent, and we do not store the conversation.",
        ],
      },
      {
        h: "International transfers",
        p: [
          "These providers may store or process data outside Indonesia (for example in the United States, Europe or Asia). We choose providers that apply adequate protection and require them to keep data confidential and secure, in line with Article 56 of the UU PDP.",
        ],
      },
      {
        h: "6. Your rights",
        p: ["Under the UU PDP (and the GDPR where it applies) you have the right to:"],
        list: [
          "Be informed about how your data is processed (this policy).",
          "Access your data and get a copy — download it from Account → Your data; tree owners can export a tree.",
          "Correct inaccurate data — directly in the app, or by asking the tree's owner.",
          "Delete data — delete your account from the Account page, or ask us to remove data about you from someone else's tree.",
          "Withdraw consent, object to processing, and ask us to restrict processing.",
          "Receive your data in a common machine-readable format (JSON).",
          "Complain to the personal data protection authority.",
        ],
      },
      {
        h: "How to make a request",
        p: [
          `Email ${contact} from the address on your account (or explain how the data relates to you if you have no account). We respond within 3 × 24 hours of receiving the request, as the UU PDP requires, and may ask you to verify your identity before acting.`,
        ],
      },
      {
        h: "7. How long we keep data",
        list: [
          "Account data is kept while your account exists.",
          "Deleting your account immediately removes your account, sessions, memberships, and the trees only you belong to, with their content. If you are the only owner of a tree others use, you must hand ownership over first.",
          "People, families or trees deleted inside the app are hidden from all members, but the records are kept as history until the tree is deleted or you ask us by email to erase them permanently.",
          "Sign-in sessions end at most 30 days after last use; email links last 1 hour (password reset), 24 hours (verification) or 7 days (invitations).",
          "Daily database backups are kept for 14 days and weekly backups for 8 weeks; deleted data disappears from backups after that.",
          "Server logs and monitoring data are kept for a limited time, generally no longer than 90 days.",
        ],
      },
      {
        h: "8. Security",
        p: [
          "All connections are encrypted (HTTPS). Passwords are hashed with bcrypt, sign-in tokens live in httpOnly cookies that page scripts cannot read, access is limited per tree and role, sign-in attempts are rate-limited, and backups are kept in encrypted storage.",
          "No system is perfectly secure. If a personal data breach happens, we will notify you and the relevant authority within 3 × 24 hours as the UU PDP requires.",
        ],
      },
      {
        h: "9. Other people's data and children",
        list: [
          `Accounts are for people aged ${MIN_AGE} or older. Users under 18 need permission from a parent or guardian.`,
          "Children may appear in a tree as relatives added by adults. Only add a child's details if you are their parent or guardian or have their permission, as the UU PDP requires for children's data.",
          "For living relatives, ask before adding personal details such as photos, phone numbers or addresses.",
          `If you find data about yourself or your child in a tree and want it corrected or removed, contact ${contact}; we will follow up with the tree's owner, or act directly where needed.`,
        ],
      },
      {
        h: "10. Cookies and local storage",
        p: ["We only use what the app needs to work:"],
        list: [
          "ft_access and ft_refresh — your sign-in session (httpOnly, up to 30 days).",
          "ft_signed_in — marks that you are signed in, so the home page shows the right buttons (no personal data, up to 30 days).",
          "ft_oauth_binding, and ft_oauth and ft_oauth_apple on api.sakdulur.com — secure Sign in with Google and Apple (10 minutes).",
          "ft_client — only in the Sakdulur apps: which app you are using (iOS, Android, macOS, Windows or Linux), so it opens on the app's own start screen (1 year).",
          "NEXT_LOCALE — your language choice (1 year).",
          "theme (browser local storage) — your light/dark preference.",
          "There are no analytics, tracking or advertising cookies (the visit statistics above are cookieless), so no cookie consent banner is needed.",
        ],
      },
      {
        h: "11. Changes to this policy",
        p: [
          "If we change this policy materially, we will tell you in the app or by email before the change takes effect. The effective date at the top always shows the current version.",
        ],
      },
      { h: "12. Contact", p: [`${operator} — ${contact}`] },
    ],
  };
}

export function terms(locale: string): LegalDoc {
  if (locale === "id") {
    return {
      title: "Ketentuan Layanan",
      updated: `Berlaku sejak ${LEGAL_UPDATED}`,
      intro: `Ketentuan ini mengatur penggunaan ${BRAND} (${site}), yang disediakan oleh ${operator} ("kami"). Dengan membuat akun atau menggunakan layanan, Anda menyetujui Ketentuan ini dan Kebijakan Privasi.`,
      sections: [
        {
          h: "1. Kelayakan",
          list: [
            `Anda harus berusia minimal ${MIN_AGE} tahun untuk membuat akun.`,
            "Jika Anda berusia di bawah 18 tahun, Anda menyatakan telah mendapat izin orang tua atau wali.",
            "Anda harus memberikan informasi akun yang benar dan menggunakan alamat email milik Anda sendiri.",
          ],
        },
        {
          h: "2. Akun Anda",
          list: [
            "Jaga kerahasiaan kata sandi Anda dan jangan berbagi akun. Anda bertanggung jawab atas aktivitas di akun Anda.",
            `Beri tahu kami di ${contact} jika Anda menduga akun Anda disalahgunakan. Anda dapat mengeluarkan semua perangkat dari halaman Akun.`,
            "Anda dapat menghapus akun kapan saja dari halaman Akun.",
          ],
        },
        {
          h: "3. Pohon, peran, dan undangan",
          list: [
            "Pembuat pohon menjadi pemiliknya. Pemilik memutuskan siapa yang diundang dan perannya (pemilik, editor, atau pembaca), dan bertanggung jawab atas pengelolaan anggota pohonnya.",
            "Undangan hanya boleh dikirim kepada orang yang Anda kenal dan yang kemungkinan besar ingin bergabung. Undangan massal atau tidak diminta dilarang.",
            "Pemilik dapat mengubah peran, mengeluarkan anggota, atau menghapus pohon; anggota dapat keluar dari pohon kapan saja.",
          ],
        },
        {
          h: "4. Konten Anda",
          list: [
            "Anda tetap memiliki konten yang Anda tambahkan (teks, foto, dan data lain).",
            "Anda memberi kami izin terbatas, non-eksklusif, dan bebas royalti untuk menyimpan, memproses, menyalin (misalnya cadangan dan pengubahan ukuran foto), dan menampilkan konten tersebut kepada anggota pohon terkait, semata-mata untuk menjalankan layanan. Izin ini berakhir saat konten atau akun dihapus, kecuali salinan cadangan sampai masa simpannya berakhir.",
            "Anda menjamin berhak membagikan konten tersebut dan tidak melanggar hak cipta, privasi, atau hak lain siapa pun.",
          ],
        },
        {
          h: "5. Data tentang orang lain",
          list: [
            "Silsilah keluarga berisi data tentang orang lain. Anda bertanggung jawab memastikan Anda berhak menambahkan informasi tentang kerabat yang masih hidup — mintalah izin mereka untuk detail pribadi seperti foto, nomor telepon, atau alamat.",
            "Hanya tambahkan data anak-anak jika Anda orang tua/wali mereka atau memiliki izin mereka.",
            "Hormati permintaan seseorang untuk mengubah atau menghapus data tentang dirinya. Kami dapat mengubah atau menghapus konten tersebut atas permintaan yang sah.",
          ],
        },
        {
          h: "6. Penggunaan yang dilarang",
          p: ["Anda tidak boleh:"],
          list: [
            "Melecehkan, mengancam, atau mencemarkan nama baik orang lain, atau memuat konten yang melanggar hukum, cabul, atau penuh kebencian.",
            "Mengunggah konten yang melanggar hak cipta atau privasi orang lain.",
            "Mengirim spam, termasuk undangan massal atau tidak diminta.",
            "Mencoba mengakses akun, pohon, atau data yang bukan milik Anda, atau mengganggu, menguji kerentanan, atau membebani layanan tanpa izin tertulis.",
            "Menggunakan layanan untuk tujuan komersial seperti menjual data pohon, atau mengambil data secara otomatis (scraping).",
          ],
        },
        {
          h: "7. Ketersediaan dan perubahan layanan",
          list: [
            "Layanan saat ini disediakan secara gratis. Jika kami memperkenalkan fitur berbayar, kami akan memberi tahu terlebih dahulu dan tidak akan membebankan biaya tanpa persetujuan Anda.",
            "Kami berupaya menjaga layanan tetap aman dan tersedia, tetapi tidak menjamin layanan selalu tanpa gangguan atau kesalahan. Sebaiknya unduh ekspor data Anda secara berkala.",
            "Kami dapat mengubah, menambah, atau menghentikan fitur. Jika layanan akan dihentikan sepenuhnya, kami akan memberi tahu minimal 30 hari sebelumnya agar Anda dapat mengunduh data Anda.",
          ],
        },
        {
          h: "8. Penangguhan dan pengakhiran",
          list: [
            "Kami dapat menangguhkan atau menutup akun, atau menghapus konten, yang melanggar Ketentuan ini atau hukum yang berlaku, atau yang membahayakan pengguna lain atau layanan. Bila memungkinkan, kami akan memberi tahu dan menjelaskan alasannya.",
            "Anda dapat berhenti menggunakan layanan dan menghapus akun kapan saja.",
          ],
        },
        {
          h: "9. Penafian dan batasan tanggung jawab",
          list: [
            "Layanan disediakan \"sebagaimana adanya\" dan \"sebagaimana tersedia\". Sejauh diizinkan hukum, kami tidak memberikan jaminan apa pun, termasuk atas keakuratan data silsilah yang dimasukkan pengguna.",
            "Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, insidental, atau konsekuensial, atau atas hilangnya data atau keuntungan, yang timbul dari penggunaan layanan.",
            "Tidak ada ketentuan ini yang membatasi tanggung jawab yang tidak dapat dibatasi menurut hukum, termasuk hak Anda berdasarkan UU PDP.",
          ],
        },
        {
          h: "10. Ganti rugi",
          p: [
            "Anda setuju untuk membebaskan kami dari tuntutan pihak ketiga yang timbul dari konten yang Anda tambahkan atau pelanggaran Anda terhadap Ketentuan ini, sejauh diizinkan hukum.",
          ],
        },
        {
          h: "11. Hukum yang berlaku dan penyelesaian sengketa",
          p: [
            "Ketentuan ini diatur oleh hukum Republik Indonesia. Kami mendorong Anda untuk menghubungi kami terlebih dahulu agar setiap masalah dapat diselesaikan secara musyawarah. Jika tidak tercapai penyelesaian dalam 30 hari, sengketa diselesaikan di pengadilan negeri yang berwenang di Indonesia.",
          ],
        },
        {
          h: "12. Perubahan Ketentuan",
          p: [
            "Kami dapat memperbarui Ketentuan ini. Untuk perubahan material, kami akan memberi tahu melalui aplikasi atau email minimal 14 hari sebelum berlaku. Dengan tetap menggunakan layanan setelah tanggal tersebut, Anda menyetujui Ketentuan yang diperbarui.",
          ],
        },
        { h: "13. Kontak", p: [`${operator} — ${contact}`] },
      ],
    };
  }
  return {
    title: "Terms of Service",
    updated: `Effective ${LEGAL_UPDATED}`,
    intro: `These terms govern your use of ${BRAND} (${site}), provided by ${operator} ("we", "us"). By creating an account or using the service you agree to these Terms and to our Privacy Policy.`,
    sections: [
      {
        h: "1. Eligibility",
        list: [
          `You must be at least ${MIN_AGE} years old to create an account.`,
          "If you are under 18, you confirm that a parent or guardian has given permission.",
          "You must give accurate account information and use an email address that belongs to you.",
        ],
      },
      {
        h: "2. Your account",
        list: [
          "Keep your password safe and do not share your account. You are responsible for activity on it.",
          `Tell us at ${contact} if you think your account has been misused. You can sign out all devices from the Account page.`,
          "You can delete your account at any time from the Account page.",
        ],
      },
      {
        h: "3. Trees, roles and invitations",
        list: [
          "Whoever creates a tree becomes its owner. Owners decide who is invited and with which role (owner, editor or viewer), and are responsible for managing their tree's members.",
          "Only invite people you know who are likely to want to join. Bulk or unsolicited invitations are not allowed.",
          "Owners can change roles, remove members or delete the tree; members can leave a tree at any time.",
        ],
      },
      {
        h: "4. Your content",
        list: [
          "You keep ownership of the content you add (text, photos and other data).",
          "You give us a limited, non-exclusive, royalty-free permission to store, process, copy (for example backups and photo resizing) and display that content to the members of the tree it belongs to, solely to run the service. This permission ends when the content or your account is deleted, except for backup copies until they expire.",
          "You confirm that you may share the content and that it does not infringe anyone's copyright, privacy or other rights.",
        ],
      },
      {
        h: "5. Information about other people",
        list: [
          "Family trees contain information about other people. You are responsible for being entitled to add information about living relatives — ask them before adding personal details such as photos, phone numbers or addresses.",
          "Only add children's details if you are their parent or guardian or have their permission.",
          "Respect requests from people to correct or remove information about themselves. We may change or remove such content when we receive a valid request.",
        ],
      },
      {
        h: "6. Acceptable use",
        p: ["You must not:"],
        list: [
          "Harass, threaten or defame anyone, or post content that is unlawful, obscene or hateful.",
          "Upload content that infringes someone else's copyright or privacy.",
          "Send spam, including bulk or unsolicited invitations.",
          "Try to access accounts, trees or data that are not yours, or disrupt, probe for vulnerabilities in, or overload the service without written permission.",
          "Use the service commercially, such as selling tree data, or collect data automatically (scraping).",
        ],
      },
      {
        h: "7. Availability and changes",
        list: [
          "The service is currently provided free of charge. If we introduce paid features, we will tell you in advance and never charge you without your agreement.",
          "We work to keep the service secure and available but cannot promise it will always be uninterrupted or error-free. Download exports of your data from time to time.",
          "We may change, add or remove features. If we shut the service down entirely, we will give at least 30 days' notice so you can download your data.",
        ],
      },
      {
        h: "8. Suspension and termination",
        list: [
          "We may suspend or close accounts, or remove content, that break these Terms or the law, or that put other users or the service at risk. Where possible we will tell you and explain why.",
          "You can stop using the service and delete your account at any time.",
        ],
      },
      {
        h: "9. Disclaimers and limitation of liability",
        list: [
          "The service is provided \"as is\" and \"as available\". To the extent the law allows, we give no warranties, including about the accuracy of genealogy data entered by users.",
          "To the extent the law allows, we are not liable for indirect, incidental or consequential losses, or for loss of data or profits, arising from use of the service.",
          "Nothing in these Terms limits liability that cannot be limited by law, including your rights under the UU PDP.",
        ],
      },
      {
        h: "10. Indemnity",
        p: [
          "To the extent the law allows, you agree to hold us harmless from third-party claims arising from content you add or your breach of these Terms.",
        ],
      },
      {
        h: "11. Governing law and disputes",
        p: [
          "These Terms are governed by the laws of the Republic of Indonesia. Please contact us first so that any problem can be resolved amicably. If it is not resolved within 30 days, disputes will be settled by the competent district court in Indonesia.",
        ],
      },
      {
        h: "12. Changes to these Terms",
        p: [
          "We may update these Terms. For material changes we will notify you in the app or by email at least 14 days before they take effect. By continuing to use the service after that date you accept the updated Terms.",
        ],
      },
      { h: "13. Contact", p: [`${operator} — ${contact}`] },
    ],
  };
}
