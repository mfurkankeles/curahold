---
title: Başvuru: anahtarlar, webhook'lar ve gelen adres
section: reference
order: 26
summary: Ayarlar → Geliştiriciler sayfasının yaptıkları; eksiksiz olsun diye.
---
# Başvuru: anahtarlar, webhook'lar ve gelen adres

Bunlar Ayarlar → Geliştiriciler sayfasının çağırdığı adreslerdir. Bir anahtar başka anahtar üretemez ya da silemez: anahtar üretmek için tarayıcıda oturum açmış bir kişi gerekir. Webhook'lar ve gelen adres, bağlantıları yönetme yetkisi olan birinin yazabilen anahtarıyla yönetilebilir.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /dev/keys` | Anahtarların ve bağlı uygulamaların; `scope=all` ile herkesinki (kişileri yönetenler için). |
| `POST /dev/keys` | Anahtar üretir (yalnızca tarayıcıda). |
| `DELETE /dev/keys/:id` | Bir anahtarı ya da bağlı uygulamayı iptal eder. |
| `GET /dev/webhooks` | Şirketin webhook'ları; son gönderimleriyle. |
| `POST /dev/webhooks` | Webhook ekler: bir adres ve istediği olaylar. |
| `PATCH /dev/webhooks/:id` | Webhook'u değiştirir, duraklatır ya da yeniden başlatır. |
| `DELETE /dev/webhooks/:id` | Webhook'u siler. |
| `POST /dev/webhooks/:id/test` | Şimdi örnek bir olay gönderir ve alıcının ne cevap verdiğini bildirir. |
| `GET /dev/inbound` | Gelen destek kaydı adresinin açık olup olmadığı ve en son ne zaman kullanıldığı. |
| `POST /dev/inbound` | Gelen adresi açar (ya da yenisiyle değiştirir); adres bir kez gösterilir. |
| `DELETE /dev/inbound` | Gelen adresi kapatır. |
| `GET /dev-hooks` | GitHub ve GitLab webhook'larının açık olup olmadığı ve adresleri. |
| `POST /dev-hooks/:provider` | `github` ya da `gitlab` webhook'unu açar ya da gizli değerini yeniler. |
| `DELETE /dev-hooks/:provider` | Webhook'u kapatır. |
| `POST /inbound/dev/:provider` | GitHub'ın (`github`, `X-Hub-Signature-256` ile imzalı) ve GitLab'ın (`gitlab`, `X-Gitlab-Token` ile) olaylarını gönderdiği yer. |
| `POST /inbound/segment/:source` | Segment'in ürün olaylarını gönderdiği yer (`x-signature`, HMAC-SHA256 ile imzalı). |
| `GET /tasks/:id/dev` | Bir göreve bağlı dallar, çekme istekleri ve commit'ler; durumları ve kontrolleriyle, bir satırlık özetle. |
| `GET /boards/:id/dev-links` | Bağlantısı olan, bir panodaki her görevin geliştirme özeti. |
| `DELETE /dev-links/:id` | Bir görevden tek bir bağlantıyı kaldırır. |

## Ayrıntılar

### `GET /dev/keys`

Anahtarların ve bağlı uygulamaların; `scope=all` ile herkesinki (kişileri yönetenler için).

**Sorgu:** `scope`

### `POST /dev/keys`

Anahtar üretir (yalnızca tarayıcıda). Anahtar bir kez gösterilir.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `canWrite` | evet/hayır | isteğe bağlı | varsayılan false |
| `expiresInDays` | tam sayı | isteğe bağlı | en az 1; en çok 730; boş (null) olabilir; varsayılan 365 |

### `DELETE /dev/keys/:id`

Bir anahtarı ya da bağlı uygulamayı iptal eder.

### `GET /dev/webhooks`

Şirketin webhook'ları; son gönderimleriyle.

**Gerekenler:** yetki `connections.manage`

### `POST /dev/webhooks`

Webhook ekler: bir adres ve istediği olaylar. İmza anahtarı bir kez gösterilir.

**Gerekenler:** yetki `connections.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `url` | metin | zorunlu | en çok 500 karakter |
| `events` | şunlardan biri: WEBHOOK_EVENTS listesi | zorunlu | en az 1 öğe |

### `PATCH /dev/webhooks/:id`

Webhook'u değiştirir, duraklatır ya da yeniden başlatır.

**Gerekenler:** yetki `connections.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `active` | evet/hayır | isteğe bağlı |  |
| `events` | şunlardan biri: WEBHOOK_EVENTS listesi | isteğe bağlı | en az 1 öğe |

### `DELETE /dev/webhooks/:id`

Webhook'u siler.

**Gerekenler:** yetki `connections.manage`

### `POST /dev/webhooks/:id/test`

Şimdi örnek bir olay gönderir ve alıcının ne cevap verdiğini bildirir.

**Gerekenler:** yetki `connections.manage`

### `GET /dev/inbound`

Gelen destek kaydı adresinin açık olup olmadığı ve en son ne zaman kullanıldığı.

**Gerekenler:** yetki `connections.manage`

### `POST /dev/inbound`

Gelen adresi açar (ya da yenisiyle değiştirir); adres bir kez gösterilir.

**Gerekenler:** yetki `connections.manage`

### `DELETE /dev/inbound`

Gelen adresi kapatır.

**Gerekenler:** yetki `connections.manage`

### `GET /dev-hooks`

GitHub ve GitLab webhook'larının açık olup olmadığı ve adresleri. Bağlantıları yönetme yetkisi gerekir.

**Gerekenler:** yetki `connections.manage`

### `POST /dev-hooks/:provider`

`github` ya da `gitlab` webhook'unu açar ya da gizli değerini yeniler. Adres ve gizli değer gösterilir; bir görevi (`CURA-` ve kimliğinin ilk 8 karakteri) anan dallar, çekme istekleri ve commit'ler ona bağlanır.

**Gerekenler:** yetki `connections.manage`

### `DELETE /dev-hooks/:provider`

Webhook'u kapatır. Kurulmuş bağlantılar kalır.

**Gerekenler:** yetki `connections.manage`

### `POST /inbound/dev/:provider`

GitHub'ın (`github`, `X-Hub-Signature-256` ile imzalı) ve GitLab'ın (`gitlab`, `X-Gitlab-Token` ile) olaylarını gönderdiği yer. İnsanlar için değil.

### `POST /inbound/segment/:source`

Segment'in ürün olaylarını gönderdiği yer (`x-signature`, HMAC-SHA256 ile imzalı). Her olay, kişinin e-postasıyla eşleşen müşteride bir etkinliğe dönüşür. İnsanlar için değil.

### `GET /tasks/:id/dev`

Bir göreve bağlı dallar, çekme istekleri ve commit'ler; durumları ve kontrolleriyle, bir satırlık özetle.

### `GET /boards/:id/dev-links`

Bağlantısı olan, bir panodaki her görevin geliştirme özeti.

### `DELETE /dev-links/:id`

Bir görevden tek bir bağlantıyı kaldırır.

**Gerekenler:** yazabilen bir koltuk
