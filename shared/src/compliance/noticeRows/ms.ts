// Malay cells of the privacy-notice and KVKK-notice tables (Malaysian Malay, PDPA 2010
// vocabulary). Joined to dataInventory.ts by activity id in scripts/compliance/legal-pack.ts.
// Malaysia wants the notice in Malay and English (PDPA s. 7(3)); the English page is the other half.
// Draft translation — lawyer to confirm; the English text prevails.
import type { NoticeText } from './types';

const text: NoticeText = {
  head: { purpose: 'Tujuan', data: 'Data peribadi', subjects: 'Data siapa', basis: 'Asas undang-undang mengikut rantau', kvkk: 'Asas undang-undang (KVKK perkara 5)', retention: 'Tempoh simpanan', recipients: 'Penerima' },
  processor: 'bagi pihak pelanggan, sebagai pemproses',
  rows: {
    accounts: {
      purpose: 'Menyediakan perkhidmatan: akaun, log masuk, pemberitahuan',
      data: 'Nama, e-mel kerja, peranan, bahasa, zon waktu, gambar profil',
      subjects: 'Pengguna syarikat pelanggan',
      basis: 'EU/UK: Perkara 6(1)(b) GDPR (kontrak). Türkiye: KVKK perkara 5/2-c (kontrak). Teluk: Kontrak dengan individu (perkara 4 undang-undang UAE; PDPL Saudi); persetujuan jika tiada pengecualian terpakai. Rantau lain: Kontrak / langkah sebelum kontrak (KR perkara 15(1)4, TW perkara 19, notis tujuan di Jepun).',
      kvkk: 'KVKK perkara 5/2-c (kontrak)',
      retention: 'Selagi akaun dibuka; individu yang dipadam serta-merta (rekod kerja tanpa nama disimpan); seluruh syarikat 30 hari selepas pentadbir meminta pemadaman, dengan sijil pemadaman (sandaran ditimpa dalam 35 hari)',
    },
    security: {
      purpose: 'Menjaga keselamatan akaun, mengesan penyalahgunaan, had peranti bagi setiap tempat duduk',
      data: 'Masa log masuk, pengecam peranti, alamat IP, pelayar, log aktiviti',
      subjects: 'Pengguna, kenalan portal, pelawat halaman log masuk',
      basis: 'EU/UK: Perkara 6(1)(f) (kepentingan sah: keselamatan) dan 6(1)(c). Türkiye: KVKK perkara 5/2-ç (kewajipan undang-undang, Undang-undang 5651) dan 5/2-f (kepentingan sah). Teluk: Kewajipan undang-undang / perlu untuk kontrak; di UAE diliputi oleh teks persetujuan. Rantau lain: Langkah keselamatan yang dikehendaki setiap undang-undang (APPI perkara 23, PIPA perkara 29, PDPA seksyen 24).',
      kvkk: 'KVKK perkara 5/2-ç (kewajipan undang-undang, Undang-undang 5651) dan 5/2-f (kepentingan sah)',
      retention: '12 bulan, kemudian dipadam',
    },
    customerData: {
      purpose: 'Pemprosesan atas arahan bertulis pelanggan (Perjanjian pemprosesan data)',
      data: 'Apa sahaja yang dimasukkan pelanggan: kenalan, akaun, tugasan, nota, fail, pengguna portal',
      subjects: 'Pelanggan, kenalan dan kakitangan pelanggan itu sendiri',
      basis: 'EU/UK: Perkara 28 GDPR — asas pelanggan. Türkiye: Pelanggan ialah pengawal data; Curahold ialah pemproses (KVKK perkara 12). Teluk: Pemproses atas arahan pengawal. Rantau lain: Penyerahan / penyumberan luar (JP perkara 27(5), KR perkara 26).',
      retention: 'Sepanjang kontrak; boleh dieksport pada bila-bila masa; dipadam 30 hari selepas syarikat meminta pemadaman (termasuk fail, kunci sambungan dan cache), sandaran dalam 35 hari; invois disimpan mengikut undang-undang cukai',
      others: 'Alat yang disambungkan oleh pelanggan sendiri, atas arahannya: CRM (Salesforce, HubSpot, Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell), meja bantuan (Zendesk, Freshdesk, Intercom, Jira Service Management, Front), perakaunan (Paraşüt, Odoo, Xero, QuickBooks, freee, Zoho Books), peti mel (Gmail, Outlook), data (Segment, BigQuery, Snowflake, Google Sheets, Excel), sembang (Slack, Teams, Google Chat), Jira, webhook',
    },
    trialLeads: {
      purpose: 'Menilai permintaan percubaan, menghubungi individu itu, membuka percubaan',
      data: 'Nama, e-mel kerja, jawatan, syarikat, negara, saiz syarikat, jawapan borang, masa kod pengesahan',
      subjects: 'Orang yang meminta percubaan',
      basis: 'EU/UK: Perkara 6(1)(f) (kepentingan sah untuk menjawab pertanyaan perniagaan). Türkiye: KVKK perkara 5/2-c (memeterai kontrak) dan 5/2-f (kepentingan sah). Teluk: UAE: persetujuan (perkara 4); Saudi / Qatar: persetujuan secara lalai; Mesir: tidak ditawarkan. Rantau lain: KR: langkah kontrak + persetujuan pemindahan yang berasingan; TW: notis + persetujuan; IL: persetujuan tersirat; JP/HK/SG: notis; IN: notis + persetujuan (Akta DPDP 2023 seksyen 5–6), bukan untuk bawah 18 tahun; MY: notis dalam bahasa Melayu dan Inggeris + persetujuan (PDPA 2010 seksyen 6–7).',
      kvkk: 'KVKK perkara 5/2-c (memeterai kontrak) dan 5/2-f (kepentingan sah)',
      retention: '12 bulan dari permintaan jika percubaan tidak bermula; jika bermula, seperti data akaun',
    },
    consentRecords: {
      purpose: 'Membuktikan persetujuan dan kebenaran; menghormati penarikan balik',
      data: 'Setiap pilihan: versi teks dan cincangannya, masa, negara, bahasa, ID persetujuan tanpa nama (e-mel bagi kebenaran pemasaran); setiap jawapan kepada notis pembantu AI (individu, masa, versi notis, bahasa)',
      subjects: 'Pelawat, pengguna, pemohon percubaan',
      basis: 'EU/UK: Perkara 6(1)(c) bersama perkara 7(1). Türkiye: KVKK perkara 5/2-ç (kewajipan undang-undang; Peraturan Komunikasi Komersial perkara 7(10), 13). Teluk: Kewajipan bukti (perkara 6 undang-undang UAE). Rantau lain: Kewajipan bukti (TW perkara 7; KR perkara 22).',
      kvkk: 'KVKK perkara 5/2-ç (kewajipan undang-undang; Peraturan Komunikasi Komersial perkara 7(10), 13)',
      retention: '3 tahun selepas rekod, kecuali kebenaran yang masih berkuat kuasa (disimpan selagi disandarkan); pilihan kuki 3 tahun; rekod hanya boleh dijadikan tanpa nama, tidak sekali-kali diubah',
    },
    contracts: {
      purpose: 'Bukti kontrak (bukti penerimaan dengan klik)',
      data: 'Nama, e-mel, peranan, syarikat dan nombor cukai, versi dokumen dan cincangannya, masa, negara, pelayar',
      subjects: 'Pentadbir yang menerima terma',
      basis: 'EU/UK: Perkara 6(1)(b) dan (f). Türkiye: KVKK perkara 5/2-c dan 5/2-e (mewujudkan atau mempertahankan hak). Teluk: Kontrak. Rantau lain: Kontrak.',
      kvkk: 'KVKK perkara 5/2-c dan 5/2-e (mewujudkan atau mempertahankan hak)',
      retention: 'Tempoh kontrak ditambah 10 tahun (tempoh had masa)',
    },
    billing: {
      purpose: 'Pengebilan dan perakaunan',
      data: 'Syarikat, kenalan pengebilan, pelan, invois (tiada nombor kad: Paddle menyimpannya)',
      subjects: 'Kenalan pengebilan syarikat yang membayar',
      basis: 'EU/UK: Perkara 6(1)(b) dan (c). Türkiye: KVKK perkara 5/2-c dan 5/2-ç (kod cukai dan komersial). Teluk: Kontrak dan kewajipan undang-undang. Rantau lain: Kontrak dan kewajipan undang-undang.',
      kvkk: 'KVKK perkara 5/2-c dan 5/2-ç (kod cukai dan komersial)',
      retention: '10 tahun (Kod Komersial Türkiye perkara 82)',
    },
    support: {
      purpose: 'Menjawab permintaan sokongan',
      data: 'Permintaan, lampiran; rakaman sesi sokongan hanya apabila syarikat menghidupkannya (dimatikan secara lalai)',
      subjects: 'Pengguna yang meminta bantuan',
      basis: 'EU/UK: Perkara 6(1)(b) dan (f). Türkiye: KVKK perkara 5/2-c dan 5/2-f. Teluk: Kontrak. Rantau lain: Kontrak.',
      kvkk: 'KVKK perkara 5/2-c dan 5/2-f',
      retention: '24 bulan selepas perubahan terakhir pada permintaan; rakaman 7 hari',
    },
    ai: {
      purpose: 'Menjawab dalam produk (dimatikan sehingga pentadbir menghidupkan AI, dan hanya selepas individu itu menerima notis); tidak sekali-kali digunakan untuk melatih model',
      data: 'Soalan dan konteks minimum yang diperlukan untuk jawapan',
      subjects: 'Pengguna yang bertanya kepada pembantu AI; orang yang disebut dalam soalan',
      basis: 'EU/UK: Perkara 28 — asas pelanggan. Türkiye: Bagi pihak pelanggan (pemproses); pemindahan kepada pembekal AI di luar negara tertakluk pada KVKK perkara 9. Teluk: Pemproses. Rantau lain: Penyerahan.',
      retention: 'Log perbualan mengikut pilihan syarikat (30 hari secara lalai, tiada hingga 365); dipadam bersama individu itu; di pihak pembekal [30 hari — sahkan], tiada latihan',
    },
    humanCheck: {
      purpose: 'Menghalang bot daripada borang awam (Cloudflare Turnstile, tiada teka-teki, tiada kuki penjejakan)',
      data: 'Isyarat pelayar yang dibaca oleh semakan dan token sekali gunanya; widget dimuatkan dari Cloudflare, yang melihat alamat IP; Curahold sendiri menghantar alamat itu hanya jika pengendali menghidupkannya (TURNSTILE_SEND_IP)',
      subjects: 'Pelawat yang mengisi borang awam (permintaan percubaan, pendaftaran, log masuk portal)',
      basis: 'EU/UK: Perkara 6(1)(f) (keselamatan). Türkiye: KVKK perkara 5/2-f (kepentingan sah: keselamatan); pemindahan ke luar negara perkara 9. Teluk: Perlu untuk perkhidmatan yang diminta. Rantau lain: Langkah keselamatan (PIPA perkara 29, APPI perkara 23).',
      kvkk: 'KVKK perkara 5/2-f (kepentingan sah: keselamatan); pemindahan ke luar negara perkara 9',
      retention: 'Tidak disimpan oleh Curahold; di Cloudflare mengikut termanya sendiri',
    },
    sessionRecording: {
      purpose: 'Membolehkan sokongan Curahold melihat kerosakan yang dilaporkan individu itu (dimatikan secara lalai)',
      data: 'Skrin seperti yang dilukis antara muka, setiap medan disembunyikan (tiada apa yang ditaip dirakam)',
      subjects: 'Pengguna syarikat yang menghidupkan rakaman sokongan',
      basis: 'EU/UK: Perkara 28 — asas pelanggan. Türkiye: Bagi pihak pelanggan (pemproses). Teluk: Pemproses. Rantau lain: Penyerahan.',
      retention: '7 hari',
    },
    aiTeam: {
      purpose: 'Mengendalikan Curahold itu sendiri; pasukan AI hanya mencadangkan, seorang manusia meluluskan setiap tindakan luar',
      data: 'Tugasan, nota dan memori pasukan AI dalaman Curahold (tiada data ruang kerja pelanggan dibaca)',
      subjects: 'Pengendali Curahold sendiri; kenalan pelanggan apabila tugasan pengendali menyebut mereka',
      basis: 'EU/UK: Perkara 6(1)(f). Türkiye: KVKK perkara 5/2-f (kepentingan sah). Teluk: Kepentingan sah jika diiktiraf; jika tidak, persetujuan. Rantau lain: Tujuan perniagaan yang sah (notis).',
      kvkk: 'KVKK perkara 5/2-f (kepentingan sah)',
      retention: 'Sehingga tugasan selesai atau nota dibuang; sebutan tentang individu yang dipadam dihitamkan',
    },
    breachLog: {
      purpose: 'Rekod pelanggaran yang dikehendaki undang-undang (GDPR Perkara 33(5); keputusan Lembaga KVKK 2019/10; Perjanjian pemprosesan data §7)',
      data: 'Fakta pelanggaran, kesannya, apa yang dilakukan, siapa yang dimaklumkan dan bila',
      subjects: 'Orang yang terjejas oleh pelanggaran data peribadi (sebagai bilangan dan jenis data, bukan nama)',
      basis: 'EU/UK: Perkara 6(1)(c). Türkiye: KVKK perkara 5/2-ç (kewajipan undang-undang). Teluk: Kewajipan undang-undang. Rantau lain: Kewajipan undang-undang.',
      kvkk: 'KVKK perkara 5/2-ç (kewajipan undang-undang)',
      retention: '5 tahun selepas pelanggaran ditutup [peguam untuk mengesahkan]',
    },
    website: {
      purpose: 'Mengendalikan laman web; dengan persetujuan, mengukurnya dan pengiklanan kami',
      data: 'Halaman yang dilawati, bahasa yang dipilih; dengan persetujuan sahaja: pengecam analitis dan pengiklanan (lihat halaman Kuki)',
      subjects: 'Pelawat laman web',
      basis: 'EU/UK: Persetujuan di bawah perkara 5(3) ePrivacy bagi apa sahaja yang tidak perlu; Perkara 6(1)(a). Türkiye: Perlu: perkara 5/2-f; analitis dan iklan: persetujuan nyata (perkara 5/1) dan perkara 9 bagi pemindahan. Teluk: Persetujuan. Rantau lain: Persetujuan / notis (KR perkara 30; penghantaran luar di Jepun).',
      kvkk: 'Perlu: perkara 5/2-f; analitis dan iklan: persetujuan nyata (perkara 5/1) dan perkara 9 bagi pemindahan',
      retention: 'Seperti yang disenaraikan di halaman Kuki',
      others: 'Hanya dengan persetujuan dan apabila dihidupkan: Google (Analytics), Meta, TikTok — sebagai pengawal data mereka sendiri',
    },
    marketing: {
      purpose: 'Menghantar berita produk dan tawaran melalui e-mel',
      data: 'Nama, e-mel, rekod kebenaran, senarai sekatan selepas penolakan',
      subjects: 'Orang yang memilih untuk menerima e-mel pemasaran',
      basis: 'EU/UK: Perkara 6(1)(a) + perkara 13 ePrivacy. Türkiye: Persetujuan nyata (perkara 5/1) dan kelulusan mesej komersial di bawah Undang-undang 6563 (İYS). Teluk: Persetujuan. Rantau lain: Persetujuan (ikut serta di mana-mana).',
      kvkk: 'Persetujuan nyata (perkara 5/1) dan kelulusan mesej komersial di bawah Undang-undang 6563 (İYS)',
      retention: 'Sehingga kebenaran ditarik balik; penolakan disimpan dalam senarai sekatan',
    },
  },
};

export default text;
