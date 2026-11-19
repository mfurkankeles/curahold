---
title: Paraşüt (muhasebe)
section: help
order: 8.25
summary: Paraşüt'i yalnızca okunur bağla: her müşterinin sayfasında açık bakiye, vadesi geçmiş faturalar ve ödemeler.
---
# Paraşüt (muhasebe)

Paraşüt'ten müşteriler, satış faturaları ve tahsilatlar.

## Ne okunur

Müşteriler (programda varsa vergi numarası, e-posta ve web adresiyle), vade tarihi ve kalan tutarıyla faturalar ve alınan ödemeler. Curahold Paraşüt içine hiçbir şey yazmaz: orada hiçbir şeyi oluşturamaz, değiştiremez ya da silemez.

## Bağlama

**Ayarlar → Veri kaynakları**'nda **Muhasebe programları**'nı bul ve **Paraşüt bağla**'yı seç. Sonra:

1. Şirketin için Paraşüt destekten API erişimi iste; sana bir client ID ve client secret gönderirler.
2. Şirket numaran adres çubuğunda uygulama.parasut.com/ adresinden sonraki sayıdır.
3. Bunları bir Paraşüt kullanıcısının e-postası ve şifresiyle gir. Şifre bir anahtar almak için bir kez kullanılır ve saklanmaz.

## Sınırlar ve zamanlama

Paraşüt 10 saniyede yaklaşık 10 isteğe izin verir ve sayfa başına 25 satır döner; "şu tarihten beri değişen" süzgeci olmadığı için her çalışma listeleri baştan okur. Küçük bir işletme için bu birkaç düzine sayfadır. Tutarlar faturanın para biriminde okunur (TRY, USD, EUR, GBP).

## Bir sorun olursa

Paraşüt bağlantıyı kabul etmeyi bırakırsa (iptal edilmiş anahtar ya da oturum), bağlantı Ayarlar → Bağlantılar'da "Sorun var" olarak işaretlenir ve yöneticilere bir kez haber verilir; sayfasında **Yeniden bağla**'yı seç. Hız sınırı cevabı hata değildir: çalışma durur, yerini saklar ve bir sonraki sefer devam eder.

## Ayrıca bak

- [Muhasebe programları](/docs/tr/accounting/)
