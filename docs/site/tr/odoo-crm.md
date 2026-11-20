---
title: Odoo CRM
section: help
order: 8.12
summary: Odoo'daki şirketleri, kişileri ve fırsatları Curahold ile iki yönlü eşit tut.
---
# Odoo CRM

Odoo Online, Odoo.sh ya da kendi sunucundaki Odoo'dan şirketler, kişileri ve fırsatlar, iki yönlü eşit tutulur: Odoo'daki değişiklik bir saat içinde gelir, Curahold'daki değişiklik hemen gider.

## Curahold'da {#connect}

1. **Ayarlar → CRM ve tablolar**'nı aç ve kutucuğundaki **Odoo CRM bağla**'ya tıkla.
   ![Odoo CRM kutucuğu, işaretli](img/b19-odoocrm-tile.webp)

Sonra dört alanı doldur ve **Kontrol et ve bağla**'a tıkla:

- **Odoo adresi**, örneğin:

```text
https://yourcompany.odoo.com
```

- **Veritabanı adı**: yalnızca Odoo.sh'ta ya da birden çok veritabanı olan kendi sunucunda.
- **Kullanıcı adı (e-posta)**: Curahold'un yetkileriyle çalışacağı Odoo kullanıcısı.
- **API anahtarı**: aşağıya bak.

Ardından **Şirketler**, **Kişiler** ve **Fırsatlar**'ı işaretle, önerilen alan eşlerini kontrol et ve **Eşitlemeyi başlat**'a tıkla. Bir fırsat %100 olasılıkta kazanılmış, Odoo arşivlediğinde kaybedilmiş sayılır.

## Odoo'da

1. Sağ üstte resmine tıkla → **Tercihler** (Odoo 17 ve sonrasında: **Profilim**).
2. **Hesap Güvenliği**'ni aç ve **Yeni API Anahtarı**'na tıkla.
3. Bir ad yaz (örneğin `Curahold`), ne kadar geçerli olacağını seç ve **Anahtar oluştur**'a tıkla.
4. Anahtarı kopyala. Odoo onu bir kez gösterir.

Odoo Online'da API erişimi **Custom** planını gerektirir (Odoo'nun kuralı). CRM uygulaması kurulu olmalı.

## Sınırlar ve zamanlama

Odoo sabit bir sınır yayımlamaz; Curahold saniyede yaklaşık iki istekte kalır. Odoo 19 ve sonrası JSON-2 API ile, eski sürümler JSON-RPC ile cevap verir; Odoo JSON-RPC'yi 20. sürümde kaldırıyor. Odoo 19'da bir anahtar en çok üç ay geçerlidir: süresi dolmadan yenisini yap ve yeniden bağlan.

## Çakışmalar, hatalar ve kaldırma

İki taraf aynı alanı değiştirdiyse bağlantı için seçilen kural karar verir (varsayılan: sonraki değişiklik). Reddedilen bir değer, Odoo'nun kendi mesajıyla bağlantının **Durum** sekmesinde bekler. İptal edilmiş ya da süresi dolmuş anahtar bağlantıyı **Bakılması gerek** olarak işaretler: **Yeniden bağla** ile yeni anahtarı yapıştır; eşleme kalır. **Kaldır** anahtarı siler; gelmiş müşteriler ve kayıtlar Curahold'da kalır.

## Ayrıca bakın

- [Bağlantılar ve CRM](/docs/tr/connections/)
- [Odoo (muhasebe)](/docs/tr/accounting-odoo/)
