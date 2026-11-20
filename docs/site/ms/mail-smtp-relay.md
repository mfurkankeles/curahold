---
title: E-mel produk melalui Google Workspace (geganti SMTP)
section: developers
order: 11
summary: Untuk pentadbir dan pengendali — menghantar e-mel Curahold sendiri (pautan log masuk, peringatan, ringkasan) melalui geganti SMTP Google Workspace, tetapan untuk perkhidmatan berhos dan hos sendiri, had, dan bila perkhidmatan penghantaran khusus menjadi perlu.
---
# E-mel produk melalui Google Workspace (geganti SMTP)

> Untuk pentadbir dan pengendali. Lakukan panduan DNS dahulu (*E-mel pada domain anda dengan Google Workspace*): geganti hanya menghantar dengan baik apabila SPF, DKIM dan DMARC lulus.

Curahold menghantar pautan log masuk, peringatan, notis percubaan dan ringkasan. Peti mel Gmail biasa tidak dimaksudkan untuk mel aplikasi; **SMTP relay service** Google pula memang untuk itu. Ia kekal dalam Google Workspace, jadi tiada perkhidmatan mel lain diperlukan.

## 1. Hidupkan geganti

Admin console → Apps → Google Workspace → Gmail → **Routing** → **SMTP relay service** → Configure:

- **Allowed senders:** only addresses in my domains.
- **Authentication:** tandakan **Require SMTP Authentication** (perkhidmatan berhos berjalan pada pelayan tanpa alamat tetap, jadi ia log masuk dan bukannya disenarai benarkan). Hos sendiri pada alamat tetap boleh menggunakan pilihan yang hanya menerima mel daripada alamat IP yang ditetapkan sebaliknya.
- **Encryption:** tandakan **Require TLS encryption**.
- Simpan. Ia boleh mengambil masa sehingga sejam untuk berfungsi.

## 2. Akaun penghantar

Pilih pengguna yang akan log masuk ke geganti (pemilik sudah memadai), dengan 2-Step Verification dihidupkan, dan cipta **app password** untuknya (Google account → Security → App passwords). Tambah `no-reply@` sebagai alias pengguna itu, supaya mel produk datang daripada domain anda sendiri.

## 3. Beritahu Curahold

**Berhos (Cloudflare Workers)** — tetapkan sebagai rahsia (`wrangler secret put …`):

| Tetapan | Nilai |
| --- | --- |
| `SMTP_RELAY_USER` | pengguna daripada langkah 2, cth. `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | app password pengguna itu |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay` (dipilih secara automatik apabila dua di atas ditetapkan) |
| `SMTP_RELAY_HOST`, `SMTP_RELAY_PORT` | hanya untuk menukar nilai lalai `smtp-relay.gmail.com`, `587` |

Laluan kod ialah `api/src/lib/smtpRelay.ts` (STARTTLS pada port 587; port 25 ditutup pada Workers).

**Hos sendiri** — dalam fail `.env`:

```
SMTP_URL=smtp://owner%40example.com:APP-PASSWORD@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

(`%40` mewakili tanda at dalam nama pengguna.) Mulakan semula aplikasi.

## 4. Semak

Log keluar dan minta pautan log masuk. Mesej mesti tiba daripada `no-reply@…`, dan **Show original** mesti menunjukkan SPF, DKIM dan DMARC **PASS**. Jika tiada apa-apa yang tiba, log aplikasi menamakan langkah SMTP yang gagal (greeting, starttls, auth, rcpt to…).

## 5. Had — dan bila perkhidmatan penghantaran khusus menjadi perlu

Geganti menerima sehingga **10,000 penerima sehari bagi setiap pengguna** (had yang diterbitkan Google; semak bantuan pentadbir, ia berubah). Pindahkan mel produk ke perkhidmatan penghantaran khusus — keputusan pemilik, dan berbayar — apabila **mana-mana** perkara ini berlaku:

- mel produk harian kerap melepasi kira-kira **separuh had** (5,000 penerima sehari);
- kebolehhantaran menurun: lantunan melebihi **2%**, aduan spam menghampiri **0.1%**, atau mel mula masuk ke spam;
- anda memerlukan peristiwa penghantaran bagi setiap mesej (webhook) atau reputasi penghantaran berasingan untuk jenis mel yang berbeza;
- anda merancang **kempen pemasaran** — tidak sekali-kali melalui geganti.

Menukar hanyalah satu tetapan: perkhidmatan berhos sudah mempunyai pemacu untuk perkhidmatan khusus (`EMAIL_PROVIDER=resend` dengan `RESEND_API_KEY`). Tambahkannya ke halaman Sub-pemproses dan beri notis 30 hari kepada pentadbir dahulu.
