---
title: Odoo (perakaunan)
section: help
order: 8.23
summary: Sambungkan Odoo untuk dibaca sahaja: baki tertunggak, invois lewat bayar dan bayaran pada halaman setiap pelanggan.
---
# Odoo (perakaunan)

Pelanggan, invois dan bayaran daripada Odoo Online, Odoo.sh atau pelayan anda sendiri.

## Apa yang dibaca

Pelanggan (dengan nombor cukai, e-mel dan alamat web jika program menyimpannya), invois dengan tarikh akhir dan baki yang masih terhutang, serta bayaran yang diterima. Curahold tidak pernah menulis ke Odoo: ia tidak boleh mencipta, mengubah atau memadam apa-apa di sana.

## Menyambung

Dalam **Tetapan → Sumber data**, cari **Program perakaunan** dan pilih **Sambung Odoo**. Kemudian:

1. Dalam Odoo, buka profil anda → Preferences → Account Security dan cipta kunci API.
2. Catat alamat Odoo dan log masuk anda. Pada Odoo.sh atau pelayan anda sendiri, catat juga nama pangkalan data.
3. Masukkannya di bawah. Pada Odoo Online, akses API memerlukan pelan Custom (peraturan Odoo).

## Had dan masa

Odoo tidak menerbitkan had tetap; Curahold menghantar kira-kira dua permintaan sesaat supaya pelayan kecil tidak pernah terbeban. Odoo 19 dan ke atas dibaca melalui API JSON-2; versi lebih lama melalui JSON-RPC (dan nama pangkalan data diperlukan). Perubahan dibaca setiap jam.

## Jika berlaku masalah

Jika Odoo berhenti menerima sambungan (kunci atau log masuk dibatalkan), sambungan itu ditandakan "Masalah" dalam Tetapan → Sambungan dan pentadbir dimaklumkan sekali; pilih **Sambung semula** pada halamannya. Jawapan had kadar bukan ralat: larian berhenti, menyimpan kedudukannya dan menyambung semula pada kali seterusnya.

## Lihat juga

- [Program perakaunan](/docs/ms/accounting/)
