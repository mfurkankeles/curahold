---
title: Portal pelanggan
section: help
order: 12
summary: Membuka papan kepada pelanggan anda; cara mereka membuka permintaan dan membalas, dan apa yang tidak pernah boleh mereka lihat.
---
# Portal pelanggan

Portal pelanggan membuka papan yang dipilih kepada orang daripada pelanggan anda. Mereka log masuk di alamat mereka sendiri (cth. `acme.curahold-portal.com`), melihat apa yang terbuka untuk syarikat mereka dan statusnya, membuka permintaan baharu dan membalas.

## Apa yang dilihat oleh pelanggan, dan tidak pernah dilihat

| Melihat | Tidak pernah melihat |
|---|---|
| Tugasan syarikat mereka sendiri yang **dikongsi dengan mereka** | Mana-mana tugasan pelanggan lain |
| Tajuk, penerangan, status (dengan nama yang anda pilih untuk lajur) | Nota dalaman dan komen dalaman |
| Komen yang ditulis sebagai **Balas kepada pelanggan** | Pasukan, peranan dan orang lain anda |
| Butiran yang anda benarkan pada papan (tarikh akhir, keutamaan, siapa yang mengerjakannya) | Medan pelanggan, urus niaga, skor kesihatan, rekod |
| | Papan lain, syarikat lain, Curahold itu sendiri |

Portal berjalan pada domain berasingan: sesi, kuki dan API aplikasi tidak boleh dicapai langsung daripadanya. Peranan pangkalan data di sebalik permintaan portal tidak boleh membaca sebarang jadual; ia hanya boleh memanggil fungsi portal, yang memulangkan data syarikat orang yang log masuk itu sendiri.

## Menghidupkannya (pentadbir)

1. **Tetapan → Portal pelanggan → Portal pelanggan dihidupkan.** Alamat log masuk pelanggan anda dipaparkan di sana.
2. Dalam **tetapan papan** yang ingin anda buka → **Portal pelanggan**:
   - **Buka papan ini kepada pelanggan**
   - **Permintaan baharu masuk ke:** pilih lajur. Permintaan baharu ditugaskan kepada pemilik pelanggan.
   - **Apa yang dibaca pelanggan untuk setiap lajur:** contohnya "Sedang disemak" dan bukannya "Menunggu bahagian undang-undang". Jika dibiarkan kosong, nama lajur itu sendiri dipaparkan.
   - **Butiran yang dilihat pelanggan:** tarikh akhir, keutamaan, siapa yang mengerjakannya.

   Lebih pantas, semasa belum ada papan yang dibuka: **Tetapan → Portal pelanggan** menyenaraikan papan anda; klik **Buka … kepada pelanggan** pada papan tempat permintaan patut masuk (ia masuk ke lajur pertamanya).

Papan peribadi tidak boleh dibuka. Mematikan suis menutup portal untuk semua orang, dengan serta-merta.

## Menjemput orang

Daripada **Tetapan → Portal pelanggan → Orang yang boleh log masuk**, atau bahagian **Portal pelanggan** pada halaman pelanggan: nama dan e-mel, kemudian **Jemput**. Pemilik pelanggan dan pentadbir boleh menjemput.

- Jemputan berfungsi sekali, selama 7 hari. Selepas itu, orang log masuk dengan cara yang dibenarkan oleh syarikat (di bawah).
- Alamat milik seseorang dalam syarikat anda tidak boleh dijemput; portal adalah untuk pelanggan.
- **Matikan** menamatkan akses dan sesi terbuka mereka dengan serta-merta.

## Cara log masuk

Dalam **Tetapan → Portal pelanggan → Cara pelanggan log masuk**, pilih cara yang sesuai untuk pelanggan anda:

| Cara | Bagaimana ia berfungsi |
|---|---|
| **Kod dan pautan e-mel** | Satu e-mel dengan kod enam digit dan pautan, setiap satu berfungsi sekali selama 30 minit. Kod membolehkan seseorang membaca e-mel pada telefon dan log masuk pada komputer. |
| **Google** | Akaun Google syarikat mereka. Jika syarikat mereka menutup akaun itu, portal juga ditutup kepada mereka. |
| **Microsoft** | Akaun Microsoft 365 mereka. Log masuk Microsoft pertama disahkan sekali dengan kod melalui e-mel; selepas itu akaun itu sendiri dikenali. |
| **Kunci laluan** | Cap jari, wajah atau PIN peranti. Cara paling selamat; orang menambahnya pada **Akaun anda** selepas log masuk pertama. Kunci laluan hanya berfungsi pada alamat portal itu, tidak pernah pada laman tiruan. |
| **Kata laluan** | Untuk pelanggan yang memintanya (mati secara lalai). Sekurang-kurangnya 10 aksara; lima percubaan salah menguncinya selama 15 minit; "Lupa kata laluan?" menetapkannya semula melalui e-mel. |

- **Kekal log masuk pada peranti selama:** 1, 7, 30 (lalai) atau 90 hari.
- **Notis log masuk:** selepas log masuk dengan Google, Microsoft, kunci laluan atau kata laluan, orang itu menerima e-mel "log masuk baharu" (boleh dimatikan).
- Mematikan sesuatu cara menamatkan sesi yang dibuka dengannya; tempoh yang lebih pendek menamatkan sesi yang lebih lama. Sekurang-kurangnya satu cara masuk (e-mel, Google, Microsoft atau kata laluan) mesti kekal hidup.
- Borang log masuk tidak pernah memberitahu sama ada sesuatu alamat mempunyai akses, dan sesuatu alamat menerima paling banyak 5 e-mel sejam.
- Pada **Akaun anda**, orang menambah kunci laluan, menetapkan kata laluan, menyahpaut Google/Microsoft atau log keluar di semua tempat.

## Berkongsi tugasan dan membalas

- Permintaan yang dibuka oleh pelanggan dikongsi dengan sendirinya.
- Untuk menunjukkan tugasan yang dibuka oleh pasukan anda, tandakan **Dikongsi dengan pelanggan** dalam panel tugasan (tugasan itu memerlukan pelanggan, pada papan yang terbuka).
- Pada tugasan yang dikongsi, pilih **Nota dalaman** (lalai) atau **Balas kepada pelanggan** semasa memberi komen. Balasan kepada pelanggan ditandakan dengan garis oren dan "Pelanggan melihat", dan dihantar kepada mereka melalui e-mel.
- Apa yang ditulis oleh pelanggan dipaparkan dengan label "Pelanggan" dan sampai kepada penerima tugasan sebagai pemberitahuan.
- Apabila pelanggan sesuatu tugasan berubah, perkongsian dimatikan dengan sendirinya: perbualan seorang pelanggan tidak pernah berpindah kepada pelanggan lain.

## Fail daripada pelanggan

Pelanggan hanya boleh menghantar fail kepada permintaan dan tiket yang dikongsi dengan mereka, dan kepada langkah pelan onboarding mereka. Tidak di tempat lain.

- Dokumen, gambar, hamparan, CSV, PDF dan ZIP, sehingga 25 MB setiap satu. Setiap fail disemak mengikut jenis dan bait pertamanya, dan sentiasa dibuka sebagai muat turun.
- Jumlah yang boleh dihantar oleh pelanggan anda ditetapkan dalam Tetapan → **Portal pelanggan** → **Fail daripada pelanggan** (2,048 MB melainkan anda mengubahnya). Apabila penuh, mereka diminta menghantar fail dengan cara lain.
- Setiap fail yang dihantar oleh pelanggan dipaparkan pada garis masa pelanggan itu.

## Had

Setiap orang boleh membuka sehingga 30 permintaan dan menulis 200 balasan sehari.
