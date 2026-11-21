---
title: E-mel pada domain anda dengan Google Workspace
section: developers
order: 10
summary: Untuk pentadbir dan pengendali — rekod DNS (MX, SPF, DKIM, DMARC) dan pelan peti mel untuk menjalankan mel syarikat sendiri pada Google Workspace.
---
# E-mel pada domain anda dengan Google Workspace

> Untuk pentadbir dan pengendali. Skrin dan had Google berubah; nilai di bawah disemak dengan bantuan pentadbir Google setakat 19 Nov 2026 — sahkannya dalam Admin console semasa anda meneruskan.

## 1. Peti mel: sedikit lesen, banyak alamat

Workspace dibayar bagi setiap pengguna, jadi kekalkan bilangan pengguna yang sedikit dan jadikan yang lain **alias** atau **group**:

| Alamat | Apa itu | Bagaimana |
| --- | --- | --- |
| alamat anda sendiri | pemilik | pengguna (1 lesen) |
| hello@, billing@, security@, social@ | peti masuk yang orang tulis kepadanya | alias pemilik, atau group |
| support@ | peti masuk sokongan kongsi | Google Group dengan "collaborative inbox" dihidupkan |
| no-reply@ | penghantar e-mel produk | alias pengguna yang membuat pengesahan dengan geganti (panduan seterusnya) |

Hidupkan **2-Step Verification** untuk setiap pengguna sebelum apa-apa yang lain.

## 2. Rekod DNS

Tambah rekod ini di hos DNS anda (contohnya Cloudflare: DNS → Records). Gantikan `example.com` dengan domain anda.

| Jenis | Nama | Nilai | Mengapa |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`, keutamaan 1 | Mel untuk domain pergi ke Gmail |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF: Google boleh menghantar bagi pihak domain. Satu rekod SPF sahaja — gabungkan jika sudah ada |
| TXT | `google._domainkey` | kunci yang diberikan oleh Admin console | DKIM: menandatangani setiap mesej |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC: memberitahu penerima apa yang perlu dilakukan dengan mel yang gagal |

**DKIM:** Admin console → Apps → Google Workspace → Gmail → Authenticate email → Generate new record (2048-bit, selector `google`) → terbitkan rekod TXT → kembali ke console, **Start authentication**.

**DMARC dalam tiga langkah:** mulakan dengan `p=none` dan baca laporan selama 2–4 minggu; kemudian `p=quarantine`; kemudian `p=reject` apabila hanya penghantar anda sendiri yang muncul. Cipta alamat `dmarc@` (alias atau group) sebelum anda menerbitkannya.

## 3. Semak

Hantar mesej ke alamat luar, bukanya, pilih **Show original**: SPF, DKIM dan DMARC mesti menyatakan **PASS**. Alat Check MX Google (toolbox) menyemak rekod tersebut.

## 4. Peraturan untuk penghantaran pukal

Gmail dan pembekal peti mel besar lain mewajibkan, bagi sesiapa yang menghantar banyak mel: SPF **dan** DKIM **dan** DMARC, berhenti melanggan dengan satu klik dalam mel pemasaran, dan kadar aduan spam yang jauh di bawah 0.3%. Jangan sekali-kali menghantar mel pemasaran daripada peti mel peribadi; pemasaran memerlukan kebenaran penerima (lihat Notis privasi).
