---
title: Stripe (yalnızca okunur)
section: help
order: 8.27
summary: Stripe'ı kısıtlı bir anahtarla bağla: her müşterinin sayfasında açık ve vadesi geçmiş faturalar ve ödemeler.
---
# Stripe (yalnızca okunur)

Stripe'tan müşteriler, faturalar (vade tarihi ve kalan tutarıyla) ve ödemeler. Curahold Stripe'a hiçbir şey yazmaz: verdiğin anahtar yalnızca okuyabilir.

## Curahold'da {#connect}

1. **Ayarlar → CRM ve tablolar**'nı aç, **Muhasebe programları**'nı bul ve **Stripe bağla**'ya tıkla.
   ![Stripe kutucuğu, işaretli](img/b19-stripe-tile.webp)

Kısıtlı anahtarı **Kısıtlı anahtar**'a yapıştır ve **Bağlan**'a tıkla. Tam yetkili gizli anahtar (`sk_…`) bilerek reddedilir. Sonra **Başlat**'a tıkla ve eşleşemeyen müşterileri **Eşleştirme** sekmesinde kontrol et.

## Stripe'ta

1. **Developers → API keys**'i aç ve **Create restricted key**'e tıkla.
2. Adını `Curahold` koy.
3. **Customers**, **Invoices** ve **Events**'i **Read** yap. Diğer her şeyi **None** bırak.
4. **Create key**'e tıkla, ikinci adımınla onayla ve anahtarı kopyala. Şöyle başlar:

```text
rk_live_
```

Önce denemek için bir sandbox anahtarı (`rk_test_…`) kullan.

## Sınırlar ve zamanlama

İlk okuma her şeyi getirir; sonra yalnızca değişenler, Stripe'ın olay listesinden (Stripe 30 gün saklar). Stripe saniyede 100 istek kabul eder (sandbox'ta 25); Curahold bunun çok altında kalır. Tutarlar her para biriminin kendi ondalıklarına göre okunur (yende ondalık yoktur). Stripe'ın "uncollectible" dediği fatura burada borç olarak kalır, böylece gecikme görünmeye devam eder.

## Bir sorun olursa

Yenilenmiş ya da silinmiş anahtar bağlantıyı **Bakılması gerek** olarak işaretler: yeni bir kısıtlı anahtar yap ve **Yeniden bağla** ile yapıştır. Bir izin eksikse bağlanma adımı onu söyler. **Kaldır** anahtarı siler; okunmuş rakamlar sen kaldırana kadar kalır.

## Ayrıca bakın

- [Muhasebe programları](/docs/tr/accounting/)
