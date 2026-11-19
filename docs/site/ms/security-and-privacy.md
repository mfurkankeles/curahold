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

Log masuk, langkah kedua, perubahan pada orang dan peranan, sambungan, kunci API, webhook dan tindakan data peribadi ditulis ke log aktiviti, dalam Tetapan → Log aktiviti. Log boleh ditambah, tetapi tidak pernah diubah atau dipadam, walaupun melalui peranan pangkalan data yang digunakan oleh aplikasi. **Eksport log** memuat turunnya bersama cap jari SHA-256 berterusan; cap jari terakhir juga ditulis ke log, supaya salinan boleh disemak kemudian.

## Portal pelanggan

Portal pelanggan berjalan pada domain berasingan dengan sesi dan kukinya sendiri. Peranan pangkalan data di sebalik permintaan portal tiada keistimewaan pada mana-mana jadual; ia hanya boleh memanggil fungsi yang memulangkan data kongsi syarikat orang yang log masuk itu sendiri. Butiran: [Portal pelanggan](/docs/ms/customer-portal/).

## Akses sokongan Curahold

Sokongan Curahold hanya masuk ke sesebuah syarikat dengan persetujuan seseorang: dia menandakan kotak pada permintaan bantuan dan memilih untuk berapa lama (24 jam hingga 7 hari). Sokongan melihat apa yang dilihat oleh orang itu dan hanya boleh melihat: ia tidak pernah boleh mengubah apa-apa. Akses tamat apabila masa yang dipilih berakhir dan boleh ditutup pada bila-bila masa. Setiap lawatan, dan apa yang dibaca oleh sokongan sepanjang tempoh itu, ditulis ke log aktiviti bersama nama kakitangan sokongan. Pentadbir boleh mengehadkannya kepada pentadbir atau mematikannya dalam **Tetapan → Keselamatan → Akses sokongan**. Butiran: [Mendapatkan bantuan](/docs/ms/getting-help/).

## Data peribadi

Dalam Tetapan → Orang, menu seseorang menawarkan:

- **Muat turun data peribadi:** segala-galanya tentang orang itu dalam satu fail.
- **Hapuskan data peribadi:** nama dan e-mel dibuang; kerja yang telah dilakukannya kekal, tanpa nama. Serahkan pelanggan dan tugasan terbukanya kepada orang lain dahulu.

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

## Rahsia yang disimpan

Bukti kelayakan untuk sambungan CRM dan sembang, serta rahsia tandatangan webhook, disimpan dalam bentuk tersulit. Bagi kunci API, hanya ringkasan (digest) disimpan: kunci itu sendiri ditunjukkan sekali dan tidak boleh dilihat lagi.
