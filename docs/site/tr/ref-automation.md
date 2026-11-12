---
title: Başvuru: otomasyonlar ve planlar
section: reference
order: 25
summary: Kendi kendine çalışan kurallar ve yeniden kullanılabilen görev planları.
---
# Başvuru: otomasyonlar ve planlar

Otomasyon bir kuraldır: bir şey olduğunda (bir tarih yaklaşır, bir görev taşınır, bir müşteri sessizleşir) ve koşullar tutuyorsa bir şey yapar (görev açar, bildirir, alan değiştirir). Her kural bir durum için bir kez çalışır. Plan, tarihli görevlerden oluşan yeniden kullanılabilir bir şablondur.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /automations` | Şirketin kuralları; her birinin en son ne zaman çalıştığıyla. |
| `POST /automations` | Kural ekler. |
| `PATCH /automations/:id` | Kuralı değiştirir ya da açıp kapatır. |
| `DELETE /automations/:id` | Kuralı çöp kutusuna taşır; orada 30 gün kalır. |
| `GET /automations/:id/runs` | Bir kuralın yaptıkları; en yenisi başta. |
| `POST /automations/preview` | Bir kuralın bugün nelere uygulanacağı. |
| `POST /automations/:id/run` | Zamanlanmış bir kuralı sıradaki saati beklemeden şimdi çalıştırır; yine de durum başına bir kez çalışır. |
| `GET /plans` | Planlar: yeniden kullanılabilir görev şablonları. |
| `POST /plans` | Plan ekler. |
| `PATCH /plans/:id` | Planı değiştirir. |
| `DELETE /plans/:id` | Planı siler. |

## Ayrıntılar

### `GET /automations`

Şirketin kuralları; her birinin en son ne zaman çalıştığıyla.

### `POST /automations`

Kural ekler.

**Gerekenler:** yetki `automations.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `enabled` | evet/hayır | zorunlu |  |
| `trigger` | değer | zorunlu |  |
| `conditions` | nesne listesi | zorunlu | en çok 10 öğe |
| `action` | değer | zorunlu |  |
| `preset` | metin | isteğe bağlı | en çok 40 karakter; boş (null) olabilir |

### `PATCH /automations/:id`

Kuralı değiştirir ya da açıp kapatır.

**Gerekenler:** yetki `automations.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 120 karakter |
| `enabled` | evet/hayır | isteğe bağlı |  |
| `trigger` | değer | isteğe bağlı |  |
| `conditions` | nesne listesi | isteğe bağlı | en çok 10 öğe |
| `action` | değer | isteğe bağlı |  |

### `DELETE /automations/:id`

Kuralı çöp kutusuna taşır; orada 30 gün kalır. Cevapta `trashId` gelir.

**Gerekenler:** yetki `automations.manage`

### `GET /automations/:id/runs`

Bir kuralın yaptıkları; en yenisi başta.

**Gerekenler:** yetki `automations.manage`

### `POST /automations/preview`

Bir kuralın bugün nelere uygulanacağı. Hiçbir şeyi değiştirmez.

**Gerekenler:** yetki `automations.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `trigger` | değer | zorunlu |  |
| `conditions` | nesne listesi | zorunlu | en çok 10 öğe |

### `POST /automations/:id/run`

Zamanlanmış bir kuralı sıradaki saati beklemeden şimdi çalıştırır; yine de durum başına bir kez çalışır.

**Gerekenler:** yetki `automations.manage`

### `GET /plans`

Planlar: yeniden kullanılabilir görev şablonları.

### `POST /plans`

Plan ekler.

**Gerekenler:** yetki `org.manage` · plan: `playbooks`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `description` | metin | isteğe bağlı | en çok 500 karakter |
| `boardId` | kimlik | zorunlu |  |
| `column` | metin | isteğe bağlı | en çok 24 karakter; boş (null) olabilir |
| `anchor` | şunlardan biri: start \| renewal \| close | isteğe bağlı |  |
| `tasks` | nesne listesi | zorunlu | en az 1 öğe; en çok 40 öğe |

### `PATCH /plans/:id`

Planı değiştirir.

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `description` | metin | isteğe bağlı | en çok 500 karakter |
| `boardId` | kimlik | zorunlu |  |
| `column` | metin | isteğe bağlı | en çok 24 karakter; boş (null) olabilir |
| `anchor` | şunlardan biri: start \| renewal \| close | isteğe bağlı |  |
| `tasks` | nesne listesi | zorunlu | en az 1 öğe; en çok 40 öğe |

### `DELETE /plans/:id`

Planı siler. Daha önce açtığı görevler kalır.

**Gerekenler:** yetki `org.manage`
