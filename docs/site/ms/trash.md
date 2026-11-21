---
title: Tong sampah
section: help
order: 6.5
summary: Apa yang anda padam kekal selama 30 hari dan boleh dipulihkan seperti asal. Siapa melihat apa, dan cara memadam secara kekal.
---
# Tong sampah

Memadam sesuatu dalam Curahold tidak muktamad serta-merta. Ia berpindah ke tong sampah, kekal di sana selama 30 hari, dan boleh dipulihkan seperti asal. Apabila 30 hari berakhir, ia dihapuskan secara kekal, termasuk fail.

## Apa yang masuk ke tong sampah

| Anda memadam | Apa yang ikut bersamanya | Apa yang kekal |
| --- | --- | --- |
| Pelanggan | Rekodnya (kenalan, peluang dan lain-lain), garis masa, mesyuarat, sejarah kesihatan dan orang portal | Tugasannya kekal pada papan masing-masing, tanpa pelanggan |
| Tugasan | Subtugasan, komen, masa, pengikut, pautan dan failnya | Tiada apa-apa lagi yang disentuh |
| Rekod | Komen dan failnya | Tugasan yang merujuk kepadanya |
| Entri garis masa atau mesyuarat | Hanya dirinya | Langkah seterusnya mesyuarat kekal, sebagai tugasan |
| Halaman, laporan yang disimpan, automasi | Hanya dirinya | Tugasan yang telah dibuka oleh automasi |

Membuat asal import meletakkan semua yang ditambah oleh import itu dalam tong sampah sebagai satu item.

Sesetengah perkara dipadam terus dan tidak melalui tong sampah: satu komen, satu fail, satu entri masa, paparan yang disimpan, webhook atau kunci API.

## Memulihkan sesuatu

Sejurus selepas memadam, notis di bahagian bawah skrin menawarkan **Buat asal**. Kemudian, buka menu anda (bawah kiri), pilih **Tong sampah**, cari item itu dan pilih **Pulihkan**.

Ia kembali seperti asal: di alamat yang sama, dengan semua yang ikut bersamanya. Pautan daripada perkara lain kepadanya disambung semula: tugasan pelanggan merujuk kepadanya sekali lagi, kecuali seseorang telah memindahkan tugasan itu kepada pelanggan lain sementara itu. Jika ia dipautkan kepada CRM, penyegerakan mengikutinya semula. Tiada sesiapa dimaklumkan dan tiada webhook dihantar: kembali bukanlah berita.

Tiga perkara tidak kembali: notis yang telah dihantar tentangnya, serta sesi terbuka dan pautan sekali guna orang portal pelanggan. Mereka perlu log masuk semula; jemputan yang tidak pernah diterima perlu dihantar semula.

### Apabila ia belum boleh kembali

- **Perkara yang menjadi induknya juga berada dalam tong sampah.** Rekod memerlukan pelanggannya, subtugasan memerlukan tugasan induknya. Curahold memberitahu yang mana; pulihkan yang itu dahulu.
- **Perkara yang menjadi induknya tidak wujud lagi.** Contohnya, jenis rekod itu telah dibuang. Ia tidak boleh dipulihkan.
- **Sesuatu yang lain telah mengambil tempatnya.** Pelanggan lain kini membawa id CRM yang sama, atau orang portal lain mempunyai e-mel yang sama. Ubah atau buang yang itu dahulu.

Apabila sesuatu di bawahnya telah kehilangan induknya secara kekal, selebihnya tetap kembali dan mesej menyatakan berapa item yang ditinggalkan.

## Siapa melihat apa

- Anda melihat, dan boleh memulihkan, apa yang anda padam sendiri.
- Orang yang boleh mengubah tetapan syarikat atau mengurus privasi melihat semua yang dipadam dalam syarikat, dan boleh memulihkan mana-mana daripadanya.
- Orang dengan pemerhati tidak boleh memadam, jadi mereka tiada tong sampah.

## Memadam secara kekal

Orang yang boleh mengubah tetapan syarikat atau mengurus privasi boleh memilih **Padam secara kekal** pada mana-mana item. Ia dihapuskan serta-merta, bersama failnya, dan tiada sesiapa boleh memulihkannya. Gunakan ini untuk permintaan memadam data peribadi yang tidak boleh menunggu 30 hari.

Segala-galanya yang lain keluar dengan sendirinya apabila 30 harinya berakhir.

## Untuk pembangun

Setiap `DELETE` yang memindahkan sesuatu ke tong sampah menjawab dengan `trashId`. Penyenaraian, pemulihan dan pemadaman kekal diterangkan dalam [rujukan tong sampah](/docs/ms/ref-trash/).
