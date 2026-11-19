---
title: Başvuru: kişiler, arama ve bildirimler
section: reference
order: 23
summary: Kim olduğun, iş arkadaşların, arama, bildirimler ve takvim akışı.
---
# Başvuru: kişiler, arama ve bildirimler

Her istek bir kişi olarak yapılır. `GET /me` o kişinin kim olduğunu, ne yapabildiğini ve hangi şirkette olduğunu söyler; buradan başla.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /me` | Anahtarın arkasındaki kişi: ad, rol, yetkiler, koltuk, dil; ve şirket: ad, saat dilimi, para birimi, "müşteri" için kullandığı kelime, müşteri alanları. |
| `PATCH /me` | Kendi adını, dilini, bildirim tercihlerini ve ekran tercihlerini değiştirir. |
| `GET /me/export` | Curahold’un senin hakkında tuttuğu her şeyi tek bir dosya olarak indirir (erişim ve taşınabilirlik hakkın); önce kimliğini doğrulamanı ister, günde en fazla üç kez, her indirme etkinlik kaydına yazılır. |
| `GET /me/start` | Kişinin üründeki ilk adımlarından geriye kalanlar. |
| `GET /me/sessions` | Nerelerde oturumun açık: cihazlar ve her birinin en son ne zaman kullanıldığı. |
| `DELETE /me/sessions/:id` | Cihazlarından birinin oturumunu kapatır. |
| `POST /me/sessions/sign-out-others` | Bu cihaz dışındaki tüm cihazlardan çıkış yapar. |
| `GET /me/security` | İkinci adımın: doğrulama uygulaması, passkey'ler, kalan kurtarma kodları ve şirketinin bunu zorunlu tutup tutmadığı. |
| `POST /me/security/totp` | Doğrulama uygulaması kurulumunu başlatır (yalnızca tarayıcı oturumu). |
| `POST /me/security/totp/confirm` | Uygulamayı ilk koduyla onaylar; on adet tek kullanımlık kurtarma koduyla yanıt verir. |
| `DELETE /me/security/totp` | Doğrulama uygulamasını ve kurtarma kodlarını kaldırır. |
| `POST /me/security/recovery-codes` | Yeni kurtarma kodları üretir; eskileri çalışmaz olur. |
| `POST /me/security/passkeys/options` | Passkey eklemek için seçenekler (WebAuthn). |
| `POST /me/security/passkeys` | Tarayıcının oluşturduğu passkey'i ekler. |
| `DELETE /me/security/passkeys/:id` | Passkey'lerinden birini kaldırır. |
| `POST /me/confirm/options` | Hassas bir değişiklikten önce kimliğini nasıl onaylayabileceğin. |
| `POST /me/confirm/email` | Onay kodunu e-postayla gönderir (yalnızca ikinci adım yoksa). |
| `POST /me/confirm` | Kimliğini onaylar; on dakika boyunca hassas değişiklikler yapılabilir. |
| `GET /me/delivery` | Bu kişinin bildirimleri nereden alabileceği: e-posta ya da şirketin bağladığı bir sohbet uygulaması. |
| `GET /me/calendar` | Takvim akışı adresin olup olmadığı. |
| `POST /me/calendar` | Görevlerin için gizli bir takvim adresi üretir; yeniden istenirse eskisinin yerine geçer. |
| `DELETE /me/calendar` | Takvim adresini kapatır. |
| `GET /calendar/:file` | Takvim akışının kendisi (iCalendar): bitiş tarihi olan açık görevler. |
| `GET /people` | Şirketteki herkes, ekip üyelikleriyle; ve ekipler. |
| `GET /search` | Müşterileri, görevleri, kayıtları, panoları ve kişileri ada göre arar (`q`, en az iki harf). |
| `GET /notifications` | Bildirimlerin; en yenisi başta. |
| `GET /notifications/count` | Kaç tanesi okunmamış. |
| `POST /notifications/read` | Bildirimleri okundu işaretler: bazılarını ya da hepsini. |
| `GET /pulse` | Ucuz bir "görebildiğim bir şey değişti mi?" sorusu: en yeni değişikliğin anı. |

## Ayrıntılar

### `GET /me`

Anahtarın arkasındaki kişi: ad, rol, yetkiler, koltuk, dil; ve şirket: ad, saat dilimi, para birimi, "müşteri" için kullandığı kelime, müşteri alanları.

### `PATCH /me`

Kendi adını, dilini, bildirim tercihlerini ve ekran tercihlerini değiştirir.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 120 karakter |
| `locale` | şunlardan biri: en \| tr \| ar \| he \| fa \| zh-Hans \| zh-Hant \| ja \| ko | isteğe bağlı | boş (null) olabilir |
| `onboarded` | evet/hayır | isteğe bağlı |  |
| `prefs` | nesne | isteğe bağlı |  |

### `GET /me/export`

Curahold’un senin hakkında tuttuğu her şeyi tek bir dosya olarak indirir (erişim ve taşınabilirlik hakkın); önce kimliğini doğrulamanı ister, günde en fazla üç kez, her indirme etkinlik kaydına yazılır.

### `GET /me/start`

Kişinin üründeki ilk adımlarından geriye kalanlar.

### `GET /me/sessions`

Nerelerde oturumun açık: cihazlar ve her birinin en son ne zaman kullanıldığı.

### `DELETE /me/sessions/:id`

Cihazlarından birinin oturumunu kapatır.

### `POST /me/sessions/sign-out-others`

Bu cihaz dışındaki tüm cihazlardan çıkış yapar.

### `GET /me/security`

İkinci adımın: doğrulama uygulaması, passkey'ler, kalan kurtarma kodları ve şirketinin bunu zorunlu tutup tutmadığı.

### `POST /me/security/totp`

Doğrulama uygulaması kurulumunu başlatır (yalnızca tarayıcı oturumu).

### `POST /me/security/totp/confirm`

Uygulamayı ilk koduyla onaylar; on adet tek kullanımlık kurtarma koduyla yanıt verir.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `code` | metin | zorunlu |  |

### `DELETE /me/security/totp`

Doğrulama uygulamasını ve kurtarma kodlarını kaldırır.

### `POST /me/security/recovery-codes`

Yeni kurtarma kodları üretir; eskileri çalışmaz olur.

### `POST /me/security/passkeys/options`

Passkey eklemek için seçenekler (WebAuthn).

### `POST /me/security/passkeys`

Tarayıcının oluşturduğu passkey'i ekler.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `challengeId` | metin | zorunlu | en çok 40 karakter |
| `response` | nesne (ad → değer) | zorunlu |  |
| `name` | metin | isteğe bağlı | en çok 80 karakter |

### `DELETE /me/security/passkeys/:id`

Passkey'lerinden birini kaldırır.

### `POST /me/confirm/options`

Hassas bir değişiklikten önce kimliğini nasıl onaylayabileceğin.

### `POST /me/confirm/email`

Onay kodunu e-postayla gönderir (yalnızca ikinci adım yoksa).

### `POST /me/confirm`

Kimliğini onaylar; on dakika boyunca hassas değişiklikler yapılabilir.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `code` | metin | isteğe bağlı |  |
| `emailCode` | metin | isteğe bağlı |  |
| `recoveryCode` | metin | isteğe bağlı | en az 8 karakter; en çok 20 karakter |
| `passkey` | nesne | isteğe bağlı |  |

### `GET /me/delivery`

Bu kişinin bildirimleri nereden alabileceği: e-posta ya da şirketin bağladığı bir sohbet uygulaması.

### `GET /me/calendar`

Takvim akışı adresin olup olmadığı.

### `POST /me/calendar`

Görevlerin için gizli bir takvim adresi üretir; yeniden istenirse eskisinin yerine geçer.

### `DELETE /me/calendar`

Takvim adresini kapatır.

### `GET /calendar/:file`

Takvim akışının kendisi (iCalendar): bitiş tarihi olan açık görevler. Gizli değer dosya adıdır; anahtar gönderilmez.

### `GET /people`

Şirketteki herkes, ekip üyelikleriyle; ve ekipler.

### `GET /search`

Müşterileri, görevleri, kayıtları, panoları ve kişileri ada göre arar (`q`, en az iki harf). Türkçe harfler beklendiği gibi eşleşir: `i`, `ı` ve `İ` birbirini bulur.

**Sorgu:** `q`

### `GET /notifications`

Bildirimlerin; en yenisi başta. `unread=1` daraltır, `before` geriye sayfalar.

**Sorgu:** `filter`, `unread`, `limit`, `before`

### `GET /notifications/count`

Kaç tanesi okunmamış.

### `POST /notifications/read`

Bildirimleri okundu işaretler: bazılarını ya da hepsini.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `ids` | kimlik listesi | isteğe bağlı | en çok 100 öğe |
| `all` | evet/hayır | isteğe bağlı |  |
| `unread` | evet/hayır | isteğe bağlı |  |

### `GET /pulse`

Ucuz bir "görebildiğim bir şey değişti mi?" sorusu: en yeni değişikliğin anı. Listeleri yeniden yüklemeden önce bunu sor.
