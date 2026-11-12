---
title: Geliştiriciler için sözlük
section: developers
order: 9
summary: API'nin ve bu belgelerin kullandığı kelimeler; her biri bir cümleyle.
---
# Geliştiriciler için sözlük

API'nin ve bu belgelerin kullandığı kelimeler. Ürün, şirketin "müşteri" kelimesini değiştirmesine izin verir (partner, üye, danışan…); API her zaman `account` der.

## Alan anahtarı

Bir müşteri ya da kayıt alanının değişmeyen adı (`renewal_date`, `arr`). Etiketler değişebilir ve çevrilir; anahtarlar değişmez.

## API anahtarı

Bir betiğin, anahtarı oluşturan kişi olarak çalışmasını sağlayan gizli değer. `chk_` ile başlar, bir kez gösterilir; yalnızca okuyabilir ya da değişiklik yapabilir. Bak: [API anahtarları](/docs/tr/api-keys/).

## Dış kimlik ve kaynak

Bir müşterinin, kaydın ya da destek kaydının geldiği sistemdeki kimliği ve o sistemin adı. İkisi birlikte, aynı şeyin iki kez eklenmek yerine güncellenmesini sağlar.

## Görev

Bir panodaki tek bir iş; kişileri, bitiş tarihi, önceliği ve isteğe bağlı olarak müşterisi ve kaydı vardır. `parentId` taşıyan görev alt görevdir.

## Idempotency anahtarı

Bir değişiklikle birlikte `Idempotency-Key` başlığında gönderdiğin değer. Aynı anahtar yeniden gönderilirse ilk cevap geri gelir, hiçbir şey iki kez yapılmaz. Anahtarlar iki gün hatırlanır.

## İmza anahtarı

Bir webhook'un mesajlarının imzalandığı gizli değer (`whsec_…`); webhook eklenirken bir kez gösterilir. Bak: [Webhook'lar](/docs/tr/webhooks/).

## Kayıt ve kayıt türü

Bir müşterinin altında tutulan her şey: kişi, fırsat, destek kaydı ya da şirketin tanımladığı bir tür. Kayıt türü, kayıtlarının hangi alanları taşıdığını söyler.

## Koltuk

Bir kişinin en başta ne yapabildiği: tam koltuk görür ve değiştirir, izleyici koltuğu yalnızca görür. İzleyicinin oluşturduğu anahtar değişiklik yapamaz.

## Müşteri (account)

Baktığın şirket. Adreslerde ve alanlarda `account` olarak geçer. Kendi alanları `fields` içinde, bir yöneticinin tanımladığı anahtarlarla durur.

## Otomasyon

Kendi kendine çalışan kural: bir şey olduğunda ve koşullar tutuyorsa görev açar, kişilere bildirir ya da bir alanı değiştirir. Her durum için bir kez çalışır.

## Pano

Görevlerin durduğu yer. Panonun sütunları, onu görebilen kişileri, kendi görev alanları ve açıksa bir talep formu vardır.

## Plan

Yeniden kullanılabilir şablon: günleri bir başlangıç tarihinden ileri ya da bir yenileme tarihinden geri sayılan görevler listesi.

## Sağlık skoru

Bir müşteri için 0 ile 100 arasında bir sayı; geciken işler, son temastan beri geçen süre ve açık destek kayıtları gibi sinyallerden hesaplanır. Bak: [Zaman çizelgesi ve sağlık skoru](/docs/tr/timeline-and-health/).

## Sürüm ve baseVersion

Her görev, her değişiklikte büyüyen bir `version` taşır. Görevi değiştirirken okuduğun sürümü `baseVersion` olarak gönder: bu arada başkası aynı alanı değiştirdiyse onun üzerine yazmak yerine en güncel görevle birlikte `409` alırsın.

## Sütun ve durum

Bir panonun sütunu. Görevin `status` değeri, içinde durduğu sütunun anahtarıdır; bir sütun görevlerini bitmiş sayabilir.

## Şirket adresi

Her şirketin kendi adresi vardır: `https://sirketin.curahold.com`. API, belgeler ve yapay zekâ bağlayıcısı bu adresin altındadır.

## Webhook

Bir şey değiştiğinde Curahold'un senin adresine gönderdiği mesaj; böylece tekrar tekrar sormana gerek kalmaz.

## Yetki ve rol

Rol, adı olan bir yetki kümesidir (`accounts.manage`, `users.manage`…). Her istek, arkasındaki kişinin rolüne göre, veritabanının içinde denetlenir.
