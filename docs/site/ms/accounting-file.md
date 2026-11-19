---
title: Perakaunan: fail daripada mana-mana program lain
section: help
order: 8.29
summary: Logo, Mikro, Tally, SAP Business One atau mana-mana program: muat naik pelanggan, invois dan bayaran sebagai Excel atau CSV.
---
# Perakaunan: fail daripada mana-mana program lain

Program tanpa API terbuka — Logo, Mikro, Tally, SAP Business One dan lain-lain — disambungkan dengan fail. Angka itu kemudiannya berfungsi sama seperti program yang disambungkan: halaman pelanggan, pemadanan dan skor kesihatan.

## Langkah

1. Dalam **Tetapan → Sumber data → Program perakaunan**, pilih **Muat naik fail**.
2. Pada tab **Muat naik**, muat turun **Templat** untuk pelanggan, invois dan bayaran.
3. Eksport data yang sama daripada program anda dan letakkannya dalam lajur templat (Excel atau CSV; lajur tambahan diabaikan).
4. Muat naik pelanggan dahulu, kemudian invois, kemudian bayaran.

## Lajur

| Fail | Lajur |
| --- | --- |
| Pelanggan | customer_id, name, tax_id, email, website, currency, balance |
| Invois | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| Bayaran | payment_id, customer_id, invoice_id, paid_on, amount, currency |

Tarikh dalam format YYYY-MM-DD. `status` boleh jadi open, paid, void atau draft (juga ödendi, açık, iptal…); jika dibiarkan kosong, invois yang masih ada baki terhutang dikira sebagai open.

## Angka yang lebih terkini

Muat naik fail baharu bila-bila masa anda mahu: ia menggantikan fail sebelumnya yang sama jenis. Padanan yang anda buat secara manual dikekalkan. Fail tidak pernah dihantar ke tempat lain.
