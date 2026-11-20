---
title: Paraşüt (perakaunan)
section: help
order: 8.25
summary: Sambungkan Paraşüt untuk dibaca sahaja: baki tertunggak, invois lewat bayar dan bayaran pada halaman setiap pelanggan.
---
# Paraşüt (perakaunan)

Pelanggan, invois jualan dan bayaran daripada Paraşüt.

## Apa yang dibaca

Pelanggan (dengan nombor cukai, e-mel dan alamat web jika program menyimpannya), invois dengan tarikh akhir dan baki yang masih terhutang, serta bayaran yang diterima. Curahold tidak pernah menulis ke Paraşüt: ia tidak boleh mencipta, mengubah atau memadam apa-apa di sana.

## Menyambung

Dalam **Tetapan → Sumber data**, cari **Program perakaunan** dan pilih **Sambung Paraşüt**. Kemudian:

1. Minta akses API untuk syarikat anda daripada sokongan Paraşüt; mereka akan menghantar client ID dan client secret.
2. Nombor syarikat anda terdapat dalam bar alamat selepas uygulama.parasut.com/.
3. Masukkannya bersama e-mel dan kata laluan pengguna Paraşüt. Kata laluan digunakan sekali untuk mendapatkan kunci dan tidak disimpan.

## Had dan masa

Paraşüt membenarkan kira-kira 10 permintaan setiap 10 saat dan memulangkan 25 baris sehalaman; ia tiada penapis "diubah sejak", jadi setiap larian membaca senarai sepenuhnya. Bagi perniagaan kecil, ini hanya beberapa dozen halaman. Amaun dibaca dalam mata wang invois (TRY, USD, EUR, GBP).

## Jika berlaku masalah

Jika Paraşüt berhenti menerima sambungan (kunci atau log masuk dibatalkan), sambungan itu ditandakan "Masalah" dalam Tetapan → Sambungan dan pentadbir dimaklumkan sekali; pilih **Sambung semula** pada halamannya. Jawapan had kadar bukan ralat: larian berhenti, menyimpan kedudukannya dan menyambung semula pada kali seterusnya.

## Lihat juga

- [Program perakaunan](/docs/ms/accounting/)
