---
title: Başvuru: kayıtlar
section: developers
order: 21
summary: Kişiler, fırsatlar, destek kayıtları ve kendi tanımladığın türler.
---
# Başvuru: kayıtlar

Kayıt, bir müşterinin altında tutulan her şeydir: kişi, fırsat, destek kaydı ya da şirketinin tanımladığı bir tür (sözleşmeler, ürünler, riskler). Her türün kendi alanları vardır; kayıt bunları `fields` içinde taşır.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /record-types` | Bu şirketin tuttuğu kayıt türleri; alanlarıyla. |
| `POST /record-types` | Yeni bir kayıt türü tanımlar. |
| `PATCH /record-types/:id` | Bir türü değiştirir: adı, alanları, liste sütunları, sırası; ya da arşivler. |
| `DELETE /record-types/:id` | İçinde kayıt kalmamış bir türü siler; kayıt varsa cevap `type_not_empty` olur. |
| `GET /records` | Bir türün (`type`), bir müşterinin (`account`) ya da ikisinin kayıtlarını listeler. |
| `GET /records/:id` | Tek bir kayıt. |
| `POST /records` | Bir müşterinin altına, bir türden kayıt ekler. |
| `PATCH /records/:id` | Bir kaydı değiştirir; yalnızca gönderdiğin alanlar değişir. |
| `DELETE /records/:id` | Bir kaydı yorumları ve dosyalarıyla siler. |
| `POST /records/:id/comments` | Bir kayda yorum yazar; `@ad` ile anılan kişiye bildirim gider. |
| `DELETE /record-comments/:id` | Bir kayıttaki kendi yorumunu siler. |
| `POST /records/:id/files` | Bir kayda dosya ekler (multipart yükleme, istek başına bir dosya). |
| `POST /records/:id/plans` | Bir anlaşmaya ya da herhangi bir kayda plan uygular: görevleri kayda ve müşterisine bağlanır. |
| `PUT /tickets/:source/:externalId` | Kendi sisteminin adı ve kimliğiyle bir destek kaydı oluşturur ya da günceller. |
| `POST /inbound/tickets/:token` | Yukarıdakinin anahtar gönderemeyen sistemler için hali: gizli değer adresin içindedir (Ayarlar → Geliştiriciler). |

## Ayrıntılar

### `GET /record-types`

Bu şirketin tuttuğu kayıt türleri; alanlarıyla.

### `POST /record-types`

Yeni bir kayıt türü tanımlar.

**Gerekenler:** yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: RECORD_KINDS | isteğe bağlı | varsayılan custom |
| `key` | metin | isteğe bağlı |  |
| `name` | nesne | isteğe bağlı |  |
| `fields` | fieldSchema listesi | isteğe bağlı | en çok 150 öğe |

### `PATCH /record-types/:id`

Bir türü değiştirir: adı, alanları, liste sütunları, sırası; ya da arşivler.

**Gerekenler:** yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | nesne | isteğe bağlı |  |
| `fields` | fieldSchema listesi | isteğe bağlı | en çok 150 öğe |
| `position` | tam sayı | isteğe bağlı | en az 0; en çok 1000 |
| `archived` | evet/hayır | isteğe bağlı |  |
| `columns` | metin listesi | isteğe bağlı | en çok 20 öğe; boş (null) olabilir |

### `DELETE /record-types/:id`

İçinde kayıt kalmamış bir türü siler; kayıt varsa cevap `type_not_empty` olur.

**Gerekenler:** yetki `accounts.manage`

### `GET /records`

Bir türün (`type`), bir müşterinin (`account`) ya da ikisinin kayıtlarını listeler. `q` ada göre, `owner` kişiye göre arar; `limit` ve `offset` sayfalar.

**Sorgu:** `type`, `account`, `q`, `owner`, `archived`, `limit`, `offset`

### `GET /records/:id`

Tek bir kayıt. `full=1` yorumlarını, dosyalarını ve bağlı görevlerini ekler.

**Sorgu:** `full`

### `POST /records`

Bir müşterinin altına, bir türden kayıt ekler.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `typeId` | kimlik | zorunlu |  |
| `accountId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `parentId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 300 karakter |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `currency` | metin | isteğe bağlı | boş (null) olabilir |

### `PATCH /records/:id`

Bir kaydı değiştirir; yalnızca gönderdiğin alanlar değişir.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 300 karakter |
| `accountId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `parentId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `archived` | evet/hayır | isteğe bağlı |  |
| `currency` | metin | isteğe bağlı | boş (null) olabilir |

### `DELETE /records/:id`

Bir kaydı yorumları ve dosyalarıyla siler.

**Gerekenler:** yetki `accounts.manage`

### `POST /records/:id/comments`

Bir kayda yorum yazar; `@ad` ile anılan kişiye bildirim gider.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `body` | metin | zorunlu | en çok 10000 karakter |
| `fileIds` | kimlik listesi | isteğe bağlı | en çok 10 öğe |

### `DELETE /record-comments/:id`

Bir kayıttaki kendi yorumunu siler.

### `POST /records/:id/files`

Bir kayda dosya ekler (multipart yükleme, istek başına bir dosya).

**Gerekenler:** yazabilen bir koltuk

### `POST /records/:id/plans`

Bir anlaşmaya ya da herhangi bir kayda plan uygular: görevleri kayda ve müşterisine bağlanır.

**Gerekenler:** yazabilen bir koltuk · plan: `playbooks`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `planId` | kimlik | zorunlu |  |
| `start` | tarih (YYYY-AA-GG) | isteğe bağlı |  |

### `PUT /tickets/:source/:externalId`

Kendi sisteminin adı ve kimliğiyle bir destek kaydı oluşturur ya da günceller. Yeniden gönderince yalnızca gönderdiğin değişir.

**Gerekenler:** yazabilen bir koltuk

### `POST /inbound/tickets/:token`

Yukarıdakinin anahtar gönderemeyen sistemler için hali: gizli değer adresin içindedir (Ayarlar → Geliştiriciler).
