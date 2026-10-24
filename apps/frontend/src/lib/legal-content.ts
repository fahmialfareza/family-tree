// Privacy Policy and Terms in English and Indonesian. Operator and contact come from env so the text
// does not need editing per deployment. Have this reviewed by a lawyer before launch.

type Doc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

const operator = process.env.NEXT_PUBLIC_OPERATOR_NAME || "the Family Tree operator";
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "the contact address shown on this site";
const updated = "2026-10-24";

export function privacyPolicy(locale: string): Doc {
  if (locale === "id") {
    return {
      title: "Kebijakan Privasi",
      updated: `Terakhir diperbarui ${updated}`,
      sections: [
        { h: "Siapa kami", p: [`Family Tree dikelola oleh ${operator}. Untuk pertanyaan atau permintaan terkait data pribadi, hubungi ${contact}.`] },
        {
          h: "Data yang kami simpan",
          p: [
            "Akun: nama, email, nama pengguna, kata sandi (disimpan sebagai hash bcrypt), dan perangkat yang sedang masuk (browser, alamat IP, waktu aktivitas terakhir).",
            "Isi pohon keluarga yang Anda dan anggota keluarga masukkan: nama, tanggal dan tempat lahir/wafat, jenis kelamin, foto, nomor telepon, alamat, catatan, dan hubungan keluarga. Data ini bisa menyangkut orang yang masih hidup dan tidak memiliki akun — hanya masukkan informasi yang Anda berhak bagikan, dan sebaiknya dengan persetujuan mereka.",
          ],
        },
        {
          h: "Siapa yang dapat melihatnya",
          p: [
            "Setiap pohon bersifat privat. Hanya anggota yang diundang oleh pemilik pohon yang dapat melihatnya, sesuai perannya (pemilik, editor, atau pembaca). Kami tidak menjual data Anda dan tidak menampilkan iklan.",
          ],
        },
        {
          h: "Penyedia layanan",
          p: [
            "Kami menggunakan penyedia berikut untuk menjalankan layanan: hosting server dan basis data, Cloudflare (aplikasi web), Cloudinary (penyimpanan foto), Resend (email transaksional), New Relic (pemantauan kesalahan), dan Google (bila Anda memilih masuk dengan Google). Mereka memproses data hanya untuk menjalankan layanan ini.",
          ],
        },
        {
          h: "Dasar pemrosesan dan hak Anda",
          p: [
            "Kami memproses data untuk menjalankan layanan yang Anda minta dan berdasarkan persetujuan Anda, sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi dan, bila berlaku, GDPR.",
            "Anda dapat mengakses dan mengunduh data akun dan pohon Anda, memperbaikinya, dan menghapus akun kapan saja dari halaman Akun. Penghapusan akun menghapus akun, sesi, dan pohon yang hanya Anda miliki. Untuk permintaan lain (misalnya menghapus data tentang Anda di pohon orang lain), hubungi kami.",
          ],
        },
        { h: "Penyimpanan dan keamanan", p: ["Data dienkripsi saat dikirim (HTTPS). Cadangan basis data disimpan terenkripsi dan dihapus otomatis setelah masa simpan. Sesi masuk dapat dicabut kapan saja."] },
        { h: "Cookie", p: ["Kami hanya memakai cookie yang diperlukan: sesi masuk (httpOnly), bahasa, dan tema. Tidak ada cookie pelacakan atau iklan."] },
        { h: "Perubahan", p: ["Jika kebijakan ini berubah secara penting, kami akan memberi tahu melalui aplikasi atau email."] },
      ],
    };
  }
  return {
    title: "Privacy Policy",
    updated: `Last updated ${updated}`,
    sections: [
      { h: "Who we are", p: [`Family Tree is operated by ${operator}. For questions or requests about personal data, contact ${contact}.`] },
      {
        h: "What we store",
        p: [
          "Your account: name, email, username, password (stored only as a bcrypt hash), and your signed-in devices (browser, IP address, last activity).",
          "Family tree content you and your relatives add: names, birth and death dates and places, gender, photos, phone numbers, addresses, notes, and family relationships. This can concern living people who have no account — only add information you are entitled to share, ideally with their consent.",
        ],
      },
      {
        h: "Who can see it",
        p: ["Every tree is private. Only members invited by the tree's owner can see it, according to their role (owner, editor or viewer). We do not sell your data and show no ads."],
      },
      {
        h: "Service providers",
        p: [
          "We use these providers to run the service: server and database hosting, Cloudflare (web app), Cloudinary (photo storage), Resend (transactional email), New Relic (error monitoring), and Google (only if you choose Sign in with Google). They process data only to run this service.",
        ],
      },
      {
        h: "Legal basis and your rights",
        p: [
          "We process data to provide the service you asked for and with your consent, in line with Indonesia's Personal Data Protection Law (UU No. 27/2022) and, where it applies, the GDPR.",
          "You can access and download your account and tree data, correct it, and delete your account at any time from the Account page. Deleting your account removes your account, sessions and the trees only you belong to. For anything else — for example removing data about you from someone else's tree — contact us.",
        ],
      },
      { h: "Retention and security", p: ["Data is encrypted in transit (HTTPS). Database backups are stored encrypted and expire automatically. Sign-in sessions can be revoked at any time."] },
      { h: "Cookies", p: ["We only use necessary cookies: your sign-in session (httpOnly), language and theme. No tracking or advertising cookies."] },
      { h: "Changes", p: ["If this policy changes materially, we will let you know in the app or by email."] },
    ],
  };
}

export function terms(locale: string): Doc {
  if (locale === "id") {
    return {
      title: "Ketentuan Layanan",
      updated: `Terakhir diperbarui ${updated}`,
      sections: [
        { h: "Menggunakan Family Tree", p: [`Dengan membuat akun, Anda menyetujui ketentuan ini. Layanan dikelola oleh ${operator}.`] },
        {
          h: "Konten Anda",
          p: [
            "Anda tetap memiliki konten yang Anda tambahkan. Anda memberi kami izin terbatas untuk menyimpan dan menampilkannya kepada anggota pohon yang Anda undang.",
            "Anda bertanggung jawab memastikan bahwa Anda berhak membagikan informasi tentang orang lain, terutama yang masih hidup, dan menghormati privasi mereka.",
          ],
        },
        { h: "Penggunaan yang dilarang", p: ["Jangan gunakan layanan untuk melecehkan orang, menyimpan konten ilegal, mengirim spam (termasuk undangan massal), atau mencoba mengakses data yang bukan milik Anda."] },
        { h: "Akun", p: ["Jaga kerahasiaan kata sandi Anda. Kami dapat menangguhkan akun yang melanggar ketentuan ini. Anda dapat menghapus akun kapan saja."] },
        { h: "Ketersediaan", p: ["Layanan disediakan apa adanya. Kami berusaha menjaga data tetap aman dan tersedia, tetapi tidak menjamin layanan tanpa gangguan. Unduh ekspor data Anda secara berkala."] },
        { h: "Kontak", p: [`Pertanyaan tentang ketentuan ini: ${contact}.`] },
      ],
    };
  }
  return {
    title: "Terms of Service",
    updated: `Last updated ${updated}`,
    sections: [
      { h: "Using Family Tree", p: [`By creating an account you agree to these terms. The service is operated by ${operator}.`] },
      {
        h: "Your content",
        p: [
          "You keep ownership of what you add. You give us a limited permission to store it and show it to the members of the trees you invite them to.",
          "You are responsible for making sure you may share information about other people, especially living people, and for respecting their privacy.",
        ],
      },
      { h: "Acceptable use", p: ["Do not use the service to harass people, store illegal content, send spam (including bulk invitations), or try to access data that is not yours."] },
      { h: "Accounts", p: ["Keep your password safe. We may suspend accounts that break these terms. You can delete your account at any time."] },
      { h: "Availability", p: ["The service is provided as is. We work to keep your data safe and available but cannot promise uninterrupted service. Download exports of your data from time to time."] },
      { h: "Contact", p: [`Questions about these terms: ${contact}.`] },
    ],
  };
}
