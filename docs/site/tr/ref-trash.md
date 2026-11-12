---
title: Başvuru: çöp kutusu
section: reference
order: 27
summary: Son 30 günde silinenler: listeleme, geri alma, kalıcı silme.
---
# Başvuru: çöp kutusu

Bir müşteriyi, kaydı, görevi, zaman çizelgesi girişini, sayfayı, kayıtlı raporu ya da kuralı silmek onu çöp kutusuna taşır; o `DELETE` isteğinin cevabında bir `trashId` gelir. 30 gün boyunca eskisi gibi geri alınabilir: aynı kimlikle, onunla birlikte giden her şeyle ve başka şeylerin ona tuttuğu bağlarla. 30 gün dolunca dosyalarıyla birlikte silinir. Herkes kendi sildiğini görür ve geri alır; şirket ayarlarını değiştirebilen ya da gizliliği yöneten kişi hepsini görür ve bir şeyi hemen kalıcı olarak silebilir. Yorumlar, tek tek dosyalar, süre kayıtları ve webhook ya da anahtar gibi ayarlar doğrudan silinir, buradan geçmez.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /trash` | Hâlâ geri alınabilenleri en yenisi önce, 50'şer listeler. |
| `POST /trash/:id/restore` | Eskisi gibi geri getirir. |
| `DELETE /trash/:id` | 30 günü beklemeden, dosyalarıyla birlikte şimdi kalıcı olarak siler. |

## Ayrıntılar

### `GET /trash`

Hâlâ geri alınabilenleri en yenisi önce, 50'şer listeler. `kind` tek bir türe indirir (`account`, `record`, `task`, `activity`, `page`, `report`, `automation`), `q` adlarda arar, `before` (elindeki son öğenin `deletedAt` değeri) sonraki 50'yi verir. Cevaptaki `manage`, bu kişinin kalıcı silip silemeyeceğini söyler.

**Sorgu:** `kind`, `q`, `before`

### `POST /trash/:id/restore`

Eskisi gibi geri getirir. `dropped`, bağlı oldukları şey bu arada kalıcı olarak silindiği için dışarıda kalan satırları tablo tablo sayar; `unlinked` aynı nedenle boşaltılan bağları listeler. `409 trash_parent_first`, bağlı olduğu şeyin de çöp kutusunda olduğunu söyler (önce onu geri al; adı `parentLabel` içinde), `409 trash_parent_gone` artık hiç olmadığını, `409 trash_conflict` aynı CRM kimliğini ya da e-postayı şimdi başka bir şeyin tuttuğunu. Reddedilen istek hiçbir şeyi değiştirmez.

**Gerekenler:** yazabilen bir koltuk

### `DELETE /trash/:id`

30 günü beklemeden, dosyalarıyla birlikte şimdi kalıcı olarak siler. Şirket ayarlarını değiştirme ya da gizliliği yönetme yetkisi gerekir.
