---
title: Başvuru: ana sayfalar, panolar ve raporlar
section: reference
order: 24
summary: Ana sayfaların ve gösterge panolarının arkasındaki veri; rapor oluşturucu.
---
# Başvuru: ana sayfalar, panolar ve raporlar

Ana sayfalar ve gösterge panoları kartlardan oluşur; `GET /pages/:id/data` her kartın soran kişi için ne gösterdiğini verir. Raporlar müşteriler, görevler, kayıtlar ve etkinlikler üzerine sorulardır; kaydetmeden çalıştırabilir ya da saklayabilirsin.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /pages` | Ana sayfalar; `kind=dashboard` ile gösterge panoları. |
| `GET /pages/:id` | Tek bir sayfa: kartları ve düzeni. |
| `GET /pages/:id/data` | Sayfanın kartlarının soran kişi için gösterdiği. |
| `POST /pages/preview` | Sayfa kaydedilmeden önce kartların ne göstereceği. |
| `POST /pages` | Sayfa ekler. |
| `POST /pages/from-template` | Hazır bir gösterge panosunu kendi sayfan olarak ekler. |
| `PATCH /pages/:id` | Sayfayı değiştirir. |
| `PUT /pages/order` | Sayfaların sırasını belirler. |
| `DELETE /pages/:id` | Sayfayı siler. |
| `GET /reports/work` | İşe genel bakış: açık, gecikmiş, bu hafta biten ve atanmamış; panoya ve kişiye göre. |
| `GET /reports/person/:id` | Tek kişiye genel bakış: ne bitirdi, ne gecikti, ne geliyor, kimlere bakıyor. |
| `GET /reports/catalog` | Bir raporun nelerden kurulabileceği: kaynaklar, alanları ve hazır raporlar. |
| `POST /reports/run` | Bir rapor tanımını çalıştırır ve satırlarını döndürür. |
| `GET /reports/saved` | Kişinin görebildiği kayıtlı raporlar. |
| `GET /reports/saved/:id` | Tanımıyla birlikte tek bir kayıtlı rapor. |
| `POST /reports/saved` | Rapor kaydeder. |
| `PATCH /reports/saved/:id` | Kayıtlı raporu değiştirir. |
| `DELETE /reports/saved/:id` | Kayıtlı raporu siler. |

## Ayrıntılar

### `GET /pages`

Ana sayfalar; `kind=dashboard` ile gösterge panoları.

**Sorgu:** `kind`

### `GET /pages/:id`

Tek bir sayfa: kartları ve düzeni.

### `GET /pages/:id/data`

Sayfanın kartlarının soran kişi için gösterdiği. Gösterge panosu `person` (kimlik ya da `me`) ya da `team` ile daraltılabilir.

**Sorgu:** `person`, `team`

### `POST /pages/preview`

Sayfa kaydedilmeden önce kartların ne göstereceği.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `cards` | nesne listesi | zorunlu | en çok 24 öğe |

### `POST /pages`

Sayfa ekler.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `kind` | şunlardan biri: home \| dashboard | isteğe bağlı |  |
| `cards` | nesne listesi | isteğe bağlı | en çok 24 öğe |
| `homeFor` | metin listesi | isteğe bağlı | en çok 50 öğe |
| `sharedWith` | metin listesi | isteğe bağlı | en çok 50 öğe |
| `filters` | nesne | isteğe bağlı |  |

### `POST /pages/from-template`

Hazır bir gösterge panosunu kendi sayfan olarak ekler.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `template` | metin | zorunlu | en çok 40 karakter |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 80 karakter |

### `PATCH /pages/:id`

Sayfayı değiştirir.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 80 karakter |
| `kind` | şunlardan biri: home \| dashboard | isteğe bağlı |  |
| `cards` | nesne listesi | isteğe bağlı | en çok 24 öğe |
| `homeFor` | metin listesi | isteğe bağlı | en çok 50 öğe |
| `sharedWith` | metin listesi | isteğe bağlı | en çok 50 öğe |
| `filters` | nesne | isteğe bağlı |  |

### `PUT /pages/order`

Sayfaların sırasını belirler.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `ids` | kimlik listesi | zorunlu | en çok 200 öğe |

### `DELETE /pages/:id`

Sayfayı siler.

**Gerekenler:** yetki `org.manage`

### `GET /reports/work`

İşe genel bakış: açık, gecikmiş, bu hafta biten ve atanmamış; panoya ve kişiye göre. `board` tek panoya daraltır.

**Sorgu:** `board`

### `GET /reports/person/:id`

Tek kişiye genel bakış: ne bitirdi, ne gecikti, ne geliyor, kimlere bakıyor.

### `GET /reports/catalog`

Bir raporun nelerden kurulabileceği: kaynaklar, alanları ve hazır raporlar.

### `POST /reports/run`

Bir rapor tanımını çalıştırır ve satırlarını döndürür. Hiçbir şey saklanmaz.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `def` | nesne | zorunlu |  |
| `resolve` | evet/hayır | isteğe bağlı |  |

### `GET /reports/saved`

Kişinin görebildiği kayıtlı raporlar.

### `GET /reports/saved/:id`

Tanımıyla birlikte tek bir kayıtlı rapor.

### `POST /reports/saved`

Rapor kaydeder.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `description` | metin | isteğe bağlı | en çok 500 karakter |
| `def` | nesne | zorunlu |  |
| `shared` | evet/hayır | isteğe bağlı |  |

### `PATCH /reports/saved/:id`

Kayıtlı raporu değiştirir.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 120 karakter |
| `description` | metin | isteğe bağlı | en çok 500 karakter |
| `def` | nesne | isteğe bağlı |  |
| `shared` | evet/hayır | isteğe bağlı |  |

### `DELETE /reports/saved/:id`

Kayıtlı raporu siler.

**Gerekenler:** yazabilen bir koltuk
