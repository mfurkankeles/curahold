---
title: Perjanjian tahap perkhidmatan
section: legal
order: 7
summary: Ketersediaan yang dijanjikan Curahold pada pelan berbayar, cara ia diukur, kredit perkhidmatan, masa respons sokongan, sandaran dan sasaran pemulihan.
---
# Perjanjian tahap perkhidmatan (SLA)

> **Draf — kelulusan peguam diperlukan.** Versi 2026-11-19.draft1. Sebahagian daripada Terma perkhidmatan bagi pelan berbayar (bukan untuk percubaan). Angka dalam [kurungan] ialah cadangan: hanya angka yang dapat dibuktikan oleh pemantauan kami dijanjikan. Ini ialah terjemahan teks bahasa Inggeris untuk memudahkan bacaan; jika terdapat sebarang perbezaan, teks bahasa Inggeris diguna pakai.

## 1. Ketersediaan

- **Sasaran:** Perkhidmatan tersedia **[99.5]%** daripada setiap bulan kalendar.
- **Diukur** melalui semakan luaran ke atas halaman log masuk dan API setiap minit dari sekurang-kurangnya dua rantau; satu minit dikira tidak tersedia apabila kedua-dua rantau gagal. Angkanya ditunjukkan di halaman status [alamat halaman status].
- **Tidak dikira:** penyelenggaraan terancang yang diumumkan sekurang-kurangnya 48 jam lebih awal (paling banyak [4] jam sebulan, di luar 08:00–20:00 waktu Istanbul jika boleh); masalah yang disebabkan oleh Pelanggan, rangkaiannya atau alat pihak ketiga yang disambungkannya; penggantungan di bawah terma; force majeure; ciri yang ditanda beta.

## 2. Kredit perkhidmatan

| Ketersediaan bulanan | Kredit (bahagian daripada yuran bulan itu) |
| --- | --- |
| di bawah [99.5]% | [10]% |
| di bawah [99.0]% | [25]% |
| di bawah [95.0]% | [50]% |

Pentadbir menuntut kredit dalam masa 30 hari selepas bulan tamat, melalui sokongan. Kredit ditolak daripada invois berikutnya, tidak dibayar secara tunai, dan merupakan **remedi tunggal** bagi ketersediaan yang tidak dicapai. Jika ketersediaan di bawah [99.0]% dalam tiga bulan daripada mana-mana enam bulan, Pelanggan boleh menamatkan perjanjian dengan bayaran balik yuran prabayar.

## 3. Sokongan

| Keterukan | Contoh | Respons pertama |
| --- | --- | --- |
| 1 — kritikal | Perkhidmatan tergendala atau data berisiko | [4] jam bekerja |
| 2 — besar | Ciri utama gagal, tiada penyelesaian sementara | [1] hari bekerja |
| 3 — kecil | Ciri gagal, ada penyelesaian sementara | [2] hari bekerja |
| 4 — soalan | Cara melakukan, permintaan | [3] hari bekerja |

Waktu bekerja: [09:00–18:00 waktu Istanbul, Isnin–Jumaat, kecuali cuti umum di Türkiye]. Saluran: bantuan dalam aplikasi dan [e-mel sokongan].

## 4. Sandaran dan pemulihan

- Sandaran sekurang-kurangnya setiap hari, disimpan selama 35 hari.
- **Objektif titik pemulihan (RPO):** [24] jam. **Objektif masa pemulihan (RTO):** [8] jam.
- Ujian pemulihan sekurang-kurangnya setiap suku tahun [sahkan dengan persediaan pengehosan].

## 5. Perubahan

SLA ini berubah seperti yang diterangkan dalam seksyen 19 terma; perubahan tidak boleh menurunkan sasaran semasa tempoh langganan berbayar.
