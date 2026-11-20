---
title: Keselamatan dan privasi
section: help
order: 10
summary: Pengasingan syarikat, sesi, log aktiviti, mengeksport dan memadam data peribadi.
---
# Keselamatan dan privasi

## Syarikat tidak boleh melihat satu sama lain

Setiap pertanyaan berjalan di bawah peraturan keselamatan peringkat baris dalam pangkalan data. Data sesebuah syarikat tidak boleh dibaca daripada alamat, API atau penyambung syarikat lain dengan apa cara sekalipun. Peraturan peranan dan medan dikuatkuasakan pada lapisan yang sama.

## Sesi dan peranti

Sesi terikat pada peranti; kuki yang disalin tidak berfungsi pada mesin lain. Melebihi had peranti akan melog keluar sesi yang paling lama. Lihat dan tamatkan sesi anda dalam Tetapan anda → Peranti.

## Kunci laluan dan langkah kedua

Selain pautan melalui e-mel, anda boleh log masuk dengan **kunci laluan** (cap jari, wajah atau PIN peranti) dan menambah **langkah kedua**: aplikasi pengesah, dengan sepuluh kod pemulihan sekali guna sekiranya telefon hilang. Sediakannya dalam **Peranti saya → Keselamatan log masuk**, di mana anda juga boleh melog keluar semua peranti lain sekali gus. Pentadbir boleh mewajibkan langkah kedua bagi pentadbir atau semua orang dalam **Tetapan → Log masuk**; ia disemak pada pelayan setiap kali log masuk. Orang yang log masuk dengan log masuk tunggal tidak ditanya lagi: pembekal identiti yang melakukannya. Tiada sesiapa terkunci di luar: pentadbir boleh menetapkan semula langkah kedua seseorang, dan pemasangan hos sendiri mempunyai penetapan semula dalam persekitaran pelayan (`RESET_SECOND_STEP`).

Menukar peranan, log masuk tunggal atau SCIM, membuat kunci API, mengeksport atau memadam data peribadi, membuang seseorang dan mengeksport log aktiviti meminta anda mengesahkan bahawa ini anda (kunci laluan, kod aplikasi atau kod melalui e-mel) apabila log masuk anda sudah lebih daripada sepuluh minit.

## Apa yang disimpan pada peranti

Supaya anda boleh membaca tanpa sambungan, aplikasi menyimpan salinan senarai yang terakhir anda lihat dalam storan pelayar itu sendiri (tugasan, papan, pelanggan, peti masuk anda; bukan lampiran, bukan tetapan). Salinan itu kekal pada peranti dan pelayar tersebut dan tidak dihantar ke mana-mana. Ia dibuang apabila anda log keluar, atau pada sambungan pertama selepas sesi anda ditamatkan pada pelayan. Pada komputer yang dikongsi, log keluar apabila selesai.

## Log aktiviti

Log masuk, langkah kedua, perubahan pada orang dan peranan, sambungan, kunci API, webhook dan tindakan data peribadi ditulis ke log aktiviti, dalam Tetapan → Log aktiviti. Entri tidak pernah diubah, dan peranan pangkalan data yang digunakan oleh aplikasi pun tidak boleh membuangnya; selepas 12 bulan pembersihan malam melepaskannya (pangkalan data enggan membuang apa-apa yang lebih baharu daripada 90 hari). **Eksport log** memuat turunnya bersama cap jari SHA-256 berterusan; cap jari terakhir juga ditulis ke log, supaya salinan boleh disemak kemudian.

## Portal pelanggan

Portal pelanggan berjalan pada domain berasingan dengan sesi dan kukinya sendiri. Peranan pangkalan data di sebalik permintaan portal tiada keistimewaan pada mana-mana jadual; ia hanya boleh memanggil fungsi yang memulangkan data kongsi syarikat orang yang log masuk itu sendiri. Butiran: [Portal pelanggan](/docs/ms/customer-portal/).

## Akses sokongan Curahold

Sokongan Curahold hanya masuk ke sesebuah syarikat dengan persetujuan seseorang: dia menandakan kotak pada permintaan bantuan dan memilih untuk berapa lama (24 jam hingga 7 hari). Sokongan melihat apa yang dilihat oleh orang itu dan hanya boleh melihat: ia tidak pernah boleh mengubah apa-apa. Akses tamat apabila masa yang dipilih berakhir dan boleh ditutup pada bila-bila masa. Setiap lawatan, dan apa yang dibaca oleh sokongan sepanjang tempoh itu, ditulis ke log aktiviti bersama nama kakitangan sokongan. Pentadbir boleh mengehadkannya kepada pentadbir atau mematikannya dalam **Tetapan → Keselamatan → Akses sokongan**. Butiran: [Mendapatkan bantuan](/docs/ms/getting-help/).

## Data peribadi

Dalam Tetapan → Orang, menu seseorang menawarkan:

- **Muat turun data peribadi:** segala-galanya tentang orang itu dalam satu fail.
- **Hapuskan data peribadi:** nama dan e-mel dibuang; kerja yang telah dilakukannya kekal, tanpa nama. Serahkan pelanggan dan tugasan terbukanya kepada orang lain dahulu.
- **Penghapusan** juga membuang apa yang ditanyanya kepada CuraAI, pemberitahuannya, pautan sembang, kunci laluan dan langkah kedua, rakaman sesi, dan sebutan alamat atau nama penuhnya dalam nota pasukan AI. Disimpan, kerana undang-undang memintanya: invois, rekod siapa yang menerima terma bagi pihak syarikat, dan rekod persetujuan tanpa alamat (hanya cap jarinya).
- **Orang di pelanggan anda** (Tetapan → Portal pelanggan → Orang yang boleh log masuk): pentadbir yang mengurus privasi boleh **Muat turun data** atau **Hapuskan data peribadi**. Penghapusan memadam akaun portal itu sendiri; apa yang ditulisnya kekal tanpa namanya.

### Memadam seluruh syarikat

Pentadbir boleh memintanya dalam **Tetapan → Syarikat → Padam syarikat**, dengan menaip alamat syarikat. Tiada apa-apa dipadam selama 30 hari: syarikat berfungsi seperti biasa, anda masih boleh mengeksport, dan mana-mana pentadbir boleh membatalkannya. Kemudian segala-galanya hilang secara kekal, termasuk fail dan kunci sambungan, dan sijil pemadaman disimpan yang menyenaraikan apa yang dibuang (tiada nama atau alamat). Invois kekal, seperti yang dikehendaki oleh undang-undang cukai. Sandaran tamat mengikut jadual pembekal pengehosan.

### Permintaan tentang data peribadi

Dalam **Tetapan → Syarikat → Permintaan tentang data peribadi**, orang yang mempunyai kebenaran privasi merekodkan setiap permintaan seseorang tentang data mereka, bersama undang-undang yang terpakai: akses, pembetulan, pemadaman, sekatan pemprosesan, bantahan, kemudahalihan atau penarikan balik persetujuan. Tarikh akhir dikira daripada undang-undang itu (contohnya 30 hari di bawah KVKK, satu bulan kalendar di bawah GDPR, 10 hari di bawah PIPA Korea), dan permintaan yang lewat ditanda merah dengan ikon. Tandakan permintaan sebagai sudah dijawab atau ditolak apabila selesai; setiap perubahan direkodkan dalam log aktiviti. Kerja sebenar dibuat melalui tindakan eksport dan padam pada orang itu.

## Berapa lama sesuatu disimpan

| Data | Disimpan selama |
| --- | --- |
| Pemberitahuan | 90 hari |
| Sesi yang telah tamat | 90 hari |
| Sejarah penyegerakan | 90 hari |
| Pelanggan, rekod, tugasan dan lain-lain yang dipadam, dalam [tong sampah](/docs/ms/trash/) | 30 hari, kemudian dihapuskan bersama failnya; pentadbir boleh menghapuskannya lebih awal |
| Data buat asal untuk import | 30 hari |
| Rekod penghantaran webhook | 7 hari |
| Rekod ralat (apa yang rosak, di mana — tidak pernah kandungan permintaan) | 30 hari |
| Kunci API yang dibatalkan | 30 hari |
| Log aktiviti | 12 bulan |
| Permintaan tentang data peribadi, setelah dijawab atau ditolak | 3 tahun selepas ditutup |
| Permintaan bantuan, mesej dan failnya | 24 bulan selepas perubahan terakhir |
| Soalan kepada CuraAI | Seperti yang dipilih oleh syarikat anda (30 hari melainkan diubah) |
| Syarikat yang dipadam | 30 hari selepas permintaan, kemudian dihapuskan |

## Rahsia yang disimpan

Bukti kelayakan untuk sambungan CRM dan sembang, serta rahsia tandatangan webhook, disimpan dalam bentuk tersulit. Bagi kunci API, hanya ringkasan (digest) disimpan: kunci itu sendiri ditunjukkan sekali dan tidak boleh dilihat lagi.

## Log masuk tunggal (SSO) dan SCIM {#sso}

Dalam Tetapan → **Log masuk tunggal (SSO)**: pilih **Protokol**, berikan nilai di bawah **Berikan butiran ini kepada penyedia identiti anda** kepada penyedia identiti anda, isi **Butiran penyedia identiti anda**, simpan, kemudian tekan **Uji log masuk**. Ujian tidak melog masuk sesiapa dan tidak menghidupkan SSO. **Wajibkan SSO untuk syarikat ini** hanya boleh dihidupkan selepas ujian dengan butiran yang sama seperti yang disimpan lulus, dan dengan pentadbir sandaran yang mempunyai kunci laluan atau aplikasi pengesah.

Apabila ujian tidak lulus, ia menyatakan sebabnya:

- Client secret ditolak (diperbaharui di pihak penyedia): tampal yang baharu ke dalam **Client secret** dan simpan;
- tandatangan tidak sepadan (penyedia memperbaharui kunci atau sijilnya): untuk SAML, tampal sijil baharu ke dalam **Sijil tandatangan IdP**; OpenID Connect mengambil kunci baharu sendiri;
- jawapan itu untuk aplikasi lain atau sudah tamat tempoh: semak **Issuer**, **Client ID** dan jam penyedia;
- penyedia tidak dapat dihubungi: semak **Token endpoint** dan **JWKS URL**, kemudian tunggu seminit.

Orang yang log masuk hanya melihat bahawa penyedia tidak menyelesaikan log masuk, dan kembali ke halaman log masuk.

**Peruntukan SCIM**: **Jana token** memaparkan token sekali sahaja; berikannya kepada penyedia bersama **URL asas SCIM**. Orang yang dinyahaktifkan di sana hilang semua sesi dan kunci API serta-merta, dan pertukaran nama juga sampai. Menjana token baharu menghentikan yang lama serta-merta.
