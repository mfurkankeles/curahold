---
title: Başvuru: kurulum sağlığı
section: reference
order: 29
summary: Kurulum kontrolleri ve "Kurulumu test et" listesi: okuyun, bir adımı çalıştırın, sonucu kaydedin, canlıya geçişi onaylayın.
---
# Başvuru: kurulum sağlığı

Kurulum sağlığı, şirketin kendi verisi üzerinde çalışan ucuz kontrollerdir (model yok, maliyet yok); her biri sade bir cümle, neden önemli olduğu ve düzelten ekranla gelir. Her şey çağıranın yetkisiyle okunur: herkes düzeltebileceği kontrolleri, yöneticiler hepsini görür. Burada hiçbir şey düzeltilmez; bir test adımı adının söylediğini yapar (bir test talebi, bir eşitleme, bir kuralın deneme çalıştırması), fazlasını değil. Her deneme gördüğüyle birlikte saklanır.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /setup-health` | Çağıranın düzeltebileceği kontroller, en önemlisi başta: `status`, `problem`, `why`, `fix` (ekran) ve `failing`, `found`, `fixed` sayıları. |
| `POST /setup-health/check` | Aynı kontroller, şimdi çalıştırılır ve kalanlar hatırlanır; sonraki okuma kaçının düzeldiğini sayabilir. |
| `POST /setup-health/:id/confirm` | Buradan okunamayan bir kontrol için (e-posta alan adı kayıtları): `done: true` yapıldığını söyler, `false` geri alır. |
| `GET /setup-test` | Şirketin test adımları; her biri `status`, `required`, son denemeler (`runs`, her birinin gördüğüyle), `issue` ve saklanan `input` ile; ayrıca `bundles` ve canlıya geçiş `gate` bilgisi. |
| `POST /setup-test/:id/run` | Sunucunun çalıştırabildiği bir adımı çalıştırır (test talebi, bir eşitleme, kuralın deneme çalıştırması) ve denemeyi saklar. |
| `POST /setup-test/:id/mark` | Bir kişinin adım hakkındaki kararı: `pass`, `fail`, `skipped` (yalnızca isteğe bağlı adımlar) ya da `todo`; isteğe bağlı `note` ile. |
| `POST /setup-test/:id/input` | Adımın neyle deneneceği (bir müşteri, bir bağlantı, bir çalışma arkadaşı); sonraki deneme için saklanır. |
| `POST /setup-test/:id/issue` | Kalan bir adımı soruna çevirir (varsa şirketin onboarding planında da görünür). |
| `POST /setup-test/approve` | Her zorunlu adım geçtikten sonra canlıya geçiş onayı: `side: customer` (şirketin bir yöneticisi) ya da `vendor` (Curahold). |
| `POST /setup-test/reset` | Listeyi baştan başlatır (yöneticiler). |

## Ayrıntılar

### `GET /setup-health`

Çağıranın düzeltebileceği kontroller, en önemlisi başta: `status`, `problem`, `why`, `fix` (ekran) ve `failing`, `found`, `fixed` sayıları. `?area=sync,import` bazı alanlarla sınırlar.

### `POST /setup-health/check`

Aynı kontroller, şimdi çalıştırılır ve kalanlar hatırlanır; sonraki okuma kaçının düzeldiğini sayabilir. Cevap `GET /setup-health` ile aynıdır.

### `POST /setup-health/:id/confirm`

Buradan okunamayan bir kontrol için (e-posta alan adı kayıtları): `done: true` yapıldığını söyler, `false` geri alır.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `done` | evet/hayır | zorunlu |  |

### `GET /setup-test`

Şirketin test adımları; her biri `status`, `required`, son denemeler (`runs`, her birinin gördüğüyle), `issue` ve saklanan `input` ile; ayrıca `bundles` ve canlıya geçiş `gate` bilgisi.

### `POST /setup-test/:id/run`

Sunucunun çalıştırabildiği bir adımı çalıştırır (test talebi, bir eşitleme, kuralın deneme çalıştırması) ve denemeyi saklar. Cevap listenin tamamıdır.

### `POST /setup-test/:id/mark`

Bir kişinin adım hakkındaki kararı: `pass`, `fail`, `skipped` (yalnızca isteğe bağlı adımlar) ya da `todo`; isteğe bağlı `note` ile.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `status` | şunlardan biri: todo \| pass \| fail \| skipped | zorunlu |  |
| `note` | metin | isteğe bağlı | en çok 500 karakter |

### `POST /setup-test/:id/input`

Adımın neyle deneneceği (bir müşteri, bir bağlantı, bir çalışma arkadaşı); sonraki deneme için saklanır. `value: null` seçimi ona bırakır.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `value` | kimlik | zorunlu | boş (null) olabilir |

### `POST /setup-test/:id/issue`

Kalan bir adımı soruna çevirir (varsa şirketin onboarding planında da görünür). Adım geçince kendiliğinden kapanır.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | isteğe bağlı | en az 1 karakter; en çok 200 karakter |

### `POST /setup-test/approve`

Her zorunlu adım geçtikten sonra canlıya geçiş onayı: `side: customer` (şirketin bir yöneticisi) ya da `vendor` (Curahold). İkisi de varsa kurulum tamamdır.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `side` | şunlardan biri: customer \| vendor | zorunlu |  |
| `approve` | evet/hayır | zorunlu |  |

### `POST /setup-test/reset`

Listeyi baştan başlatır (yöneticiler). Denemeler kayıtta kalır.
