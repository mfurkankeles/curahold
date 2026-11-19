---
title: Odoo (muhasebe)
section: help
order: 8.23
summary: Odoo'i yalnızca okunur bağla: her müşterinin sayfasında açık bakiye, vadesi geçmiş faturalar ve ödemeler.
---
# Odoo (muhasebe)

Odoo Online, Odoo.sh ya da kendi sunucunuzdaki Odoo'dan müşteriler, faturalar ve ödemeler.

## Ne okunur

Müşteriler (programda varsa vergi numarası, e-posta ve web adresiyle), vade tarihi ve kalan tutarıyla faturalar ve alınan ödemeler. Curahold Odoo içine hiçbir şey yazmaz: orada hiçbir şeyi oluşturamaz, değiştiremez ya da silemez.

## Bağlama

**Ayarlar → Veri kaynakları**'nda **Muhasebe programları**'nı bul ve **Odoo bağla**'yı seç. Sonra:

1. Odoo'da profilini aç → Tercihler → Hesap Güvenliği ve bir API anahtarı oluştur.
2. Odoo adresini ve kullanıcı adını not al. Odoo.sh'ta ya da kendi sunucunda veritabanı adını da.
3. Aşağıya gir. Odoo Online'da API erişimi Custom planını gerektirir (Odoo'nun kuralı).

## Sınırlar ve zamanlama

Odoo sabit bir sınır yayımlamaz; Curahold küçük bir sunucuyu yormamak için saniyede yaklaşık iki istekte kalır. Odoo 19 ve sonrası JSON-2 API ile, eski sürümler JSON-RPC ile okunur (o zaman veritabanı adı gerekir). Değişiklikler saatte bir okunur.

## Bir sorun olursa

Odoo bağlantıyı kabul etmeyi bırakırsa (iptal edilmiş anahtar ya da oturum), bağlantı Ayarlar → Bağlantılar'da "Sorun var" olarak işaretlenir ve yöneticilere bir kez haber verilir; sayfasında **Yeniden bağla**'yı seç. Hız sınırı cevabı hata değildir: çalışma durur, yerini saklar ve bir sonraki sefer devam eder.

## Ayrıca bak

- [Muhasebe programları](/docs/tr/accounting/)
