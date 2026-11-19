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
| `GET /analytics/odata` | BI araçları için analiz akışı (OData v4): bu anahtarın ya da kişinin okuyabileceği veri kümeleri. |
| `GET /analytics/odata/` | Analiz akışının hizmet belgesi. |
| `GET /analytics/odata/:set` | Bir veri kümesi, sayfa sayfa (`@odata.nextLink`); `$metadata` her veri kümesinin sütunlarını XML olarak verir. |
| `GET /analytics/odata/:set/:sub` | `$count` ile: bir veri kümesinin satır sayısı, düz metin olarak. |
| `GET /analytics/v1` | Analiz akışının veri kümeleri; sütunları, JSON ve CSV adresleriyle. |
| `GET /analytics/v1/` | Aynı veri kümesi listesi. |
| `GET /analytics/v1/:file` | Bir veri kümesi, `Ad.json` ya da `Ad.csv` olarak: `limit`, `page`, `offset`, `cursor`, `since`, `fields`, `filter`, `orderby`, `count`. |
| `GET /dev/analytics/keys` | Analiz anahtarların; sınırları ve son 30 gündeki kullanımlarıyla; `scope=all` ile herkesinki (kişileri yönetenler için). |
| `POST /dev/analytics/keys` | Analiz anahtarı üretir (yalnızca tarayıcıda, dışa aktarma izni gerekir): `name`, `datasets`, `departments`, `expiresInDays`. |
| `POST /dev/analytics/keys/:id/rotate` | Analiz anahtarlarından birine yeni bir gizli değer verir; eskisi hemen durur. |
| `DELETE /dev/analytics/keys/:id` | Bir analiz anahtarını iptal eder. |
| `GET /dev/analytics/datasets` | Bir analiz anahtarına verebileceğin veri kümeleri; sütunlarıyla. |
| `GET /dev/analytics/pulls` | Analiz akışından son okumalar: seninkiler ya da kişileri yönetenler için herkesinki. |

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

### `GET /analytics/odata`

BI araçları için analiz akışı (OData v4): bu anahtarın ya da kişinin okuyabileceği veri kümeleri. Sondaki eğik çizgiyle aynıdır. Analiz anahtarıyla Basic parolası, Bearer belirteci ya da `?key=` olarak okunur; dışa aktarma izni gerekir. Bkz. "BI aracı bağlama".

### `GET /analytics/odata/`

Analiz akışının hizmet belgesi.

### `GET /analytics/odata/:set`

Bir veri kümesi, sayfa sayfa (`@odata.nextLink`); `$metadata` her veri kümesinin sütunlarını XML olarak verir. `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$skiptoken`, `$deltatoken` alır.

### `GET /analytics/odata/:set/:sub`

`$count` ile: bir veri kümesinin satır sayısı, düz metin olarak.

### `GET /analytics/v1`

Analiz akışının veri kümeleri; sütunları, JSON ve CSV adresleriyle. Sondaki eğik çizgiyle aynıdır.

### `GET /analytics/v1/`

Aynı veri kümesi listesi.

### `GET /analytics/v1/:file`

Bir veri kümesi, `Ad.json` ya da `Ad.csv` olarak: `limit`, `page`, `offset`, `cursor`, `since`, `fields`, `filter`, `orderby`, `count`. Sonraki sayfa `next` alanında (JSON) ya da `Link` başlığında (CSV).

### `GET /dev/analytics/keys`

Analiz anahtarların; sınırları ve son 30 gündeki kullanımlarıyla; `scope=all` ile herkesinki (kişileri yönetenler için).

**Sorgu:** `scope`

### `POST /dev/analytics/keys`

Analiz anahtarı üretir (yalnızca tarayıcıda, dışa aktarma izni gerekir): `name`, `datasets`, `departments`, `expiresInDays`. Anahtar bir kez gösterilir.

**Gerekenler:** yetki `data.export`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `datasets` | metin listesi | isteğe bağlı | en az 1 öğe; en çok 100 öğe; boş (null) olabilir; varsayılan null |
| `departments` | şunlardan biri: ANALYTICS_DEPARTMENTS listesi | isteğe bağlı | en az 1 öğe; en çok 4 öğe; boş (null) olabilir; varsayılan null |
| `expiresInDays` | tam sayı | isteğe bağlı | en az 1; en çok 730; varsayılan 365 |

### `POST /dev/analytics/keys/:id/rotate`

Analiz anahtarlarından birine yeni bir gizli değer verir; eskisi hemen durur. Yenisi bir kez gösterilir.

**Gerekenler:** yetki `data.export`

### `DELETE /dev/analytics/keys/:id`

Bir analiz anahtarını iptal eder.

### `GET /dev/analytics/datasets`

Bir analiz anahtarına verebileceğin veri kümeleri; sütunlarıyla.

### `GET /dev/analytics/pulls`

Analiz akışından son okumalar: seninkiler ya da kişileri yönetenler için herkesinki.
