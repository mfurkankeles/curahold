---
title: API anahtarları
section: developers
order: 2
summary: Kişisel anahtar oluşturma, okuma ya da yazma yetkisi, süre ve iptal.
---
# API anahtarları

API anahtarı, bir kişinin adına çalışan bir paroladır. Herkes kendi anahtarını oluşturur; yönetici başkası adına anahtar üretemez.

## Oluşturma

1. Tendwell'de **Ayarların** sayfasını aç.
2. **API anahtarları ve bağlı uygulamalar** bölümünde **Yeni API anahtarı**na tıkla.
3. Bir ad ver, gerekiyorsa **Değişiklik yapabilsin** kutusunu işaretle ve geçerlilik süresini seç (30, 90, 365 gün ya da süresiz).
4. Anahtar `twk_` ile başlar ve **yalnızca bir kez** gösterilir. Bir parola yöneticisine kaydet.

## Kullanma

Her istekte `Authorization` başlığıyla gönder:

```bash
curl https://sirketin.tendwell.com/api/me \
  -H "Authorization: Bearer twk_..."
```

Anahtarla yapılan istekler, anahtarın sahibinin yaptığı istekler gibi işlenir: aynı müşterileri görür, aynı alanlar ona kapalıdır.

## Okuma ve yazma

- **Yalnızca okur** (varsayılan): `GET` istekleri çalışır; diğerleri `403 read_only_token` döner.
- **Okur ve değiştirir:** görev, müşteri, kayıt açabilir ve güncelleyebilir. İzleyici koltuğundaki kişiler yazma yetkili anahtar oluşturamaz.

Bir anahtar asla şu işleri yapamaz: yeni anahtar oluşturmak, bir uygulamaya OAuth onayı vermek, "Onun gözünden bak" kullanmak.

## İptal ve gözetim

- Anahtarlarını Ayarların sayfasından görür, istediğini **İptal et** ile hemen kapatırsın.
- Kişileri yöneten yöneticiler Ayarlar → Geliştirici'de şirketteki tüm anahtarları ve bağlı uygulamaları görür ve iptal edebilir.
- Her anahtarın son kullanıldığı zaman görünür. Oluşturma ve iptal aktivite kaydına yazılır.
- Bir kişi şirketten ayrılıp devre dışı bırakıldığında anahtarları da çalışmaz.

> **Güvenlik:** Anahtarı koda gömme, ortam değişkeninde tut. Sızdığından şüphelenirsen iptal et ve yenisini oluştur. Tendwell anahtarın kendisini saklamaz, yalnızca özetini tutar.
