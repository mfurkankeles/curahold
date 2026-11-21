---
title: Başvuru: müşteriler
section: reference
order: 20
summary: Müşteriler, alanları, zaman çizelgesi, toplantılar ve sağlık skoru.
---
# Başvuru: müşteriler

Müşteri (adreslerde "account"), baktığınız şirkettir. Kendi alanları `fields` içinde, yöneticinin tanımladığı alan anahtarlarıyla durur. Bir kişi yalnızca rolünün görmesine izin verdiği müşterileri alır.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /accounts` | Müşterileri listeler. |
| `POST /accounts` | Müşteri ekler. |
| `GET /accounts/:id` | Tek bir müşteri; kişinin görebildiği bütün alanlarıyla. |
| `PATCH /accounts/:id` | Müşteriyi değiştirir: ad, sahip, ekip, alanlar, görüşme sıklığı; arşivler ya da geri alır. |
| `DELETE /accounts/:id` | Müşteriyi kayıtları, zaman çizelgesi ve portal kişileriyle birlikte çöp kutusuna taşır; 30 gün boyunca geri alınabilir. |
| `POST /accounts/bulk` | Birçok müşteriyi birden değiştirir: yeni sahip, yeni ekip, arşivleme ya da geri alma. |
| `POST /accounts/import` | Bir dosyanın satırlarından müşteri alır (CSV ya da Excel sizin tarafınızda okunur); sütundan alana eşlemeyle. |
| `GET /imports` | Son müşteri içe aktarmaları; en yenisi başta. |
| `POST /imports/:id/undo` | Bir içe aktarmayı 30 gün içinde geri alır: eklediklerini kaldırır, değiştirdiklerini eski haline getirir. |
| `PUT /account-fields` | Müşteri alanlarının listesini değiştirir (yönetici işi): anahtarlar, her dildeki etiketler, türler, seçenekler, kimin görüp düzenleyebileceği. |
| `GET /accounts/whitespace` | Hangi müşteride hangi ürün var, hangisinde yok: bir türün kayıtları müşteri başına ve bir alanın seçeneği başına sayılır. |
| `GET /accounts/:id/timeline` | Bir müşteriyle olan her şey, en yenisi başta: notlar, aramalar, toplantılar, e-postalar, biten görevler, değişiklikler. |
| `POST /accounts/:id/activities` | Zaman çizelgesine not, arama, toplantı ya da e-posta kaydeder. |
| `GET /accounts/:id/flow` | Bir müşteri için departmanlar arası akış: her departmandaki sahibi, beklediği ürün işi (başlık, durum, sprint bitişi, departman; pano yalnızca açabiliyorsanız), ona verilen sözler ve devir kartları. |
| `PUT /accounts/:id/team` | Müşterinin bir departmandaki sahibini belirler (`userId: null` ile kaldırır). |
| `POST /accounts/:id/promises` | Müşteriye verilen bir sözü kaydeder (`body`; isteğe bağlı `recordId`, `activityId`, `dueDate`). |
| `PATCH /promises/:id` | Bir sözü değiştirir ya da tutuldu olarak işaretler (`kept: true`). |
| `DELETE /promises/:id` | Bir sözü siler. |
| `GET /handovers` | Görebildiğiniz devir kartları, en yenisi başta: açık olanlar ya da `status=all` ile hepsi. |
| `GET /handovers/:id` | Bir devir kartının tamamı: paydaşlar ve duruşları, açık sözler, bekleyen ürün talepleri, kapanış ve yenileme tarihleri, müşterinin yıllık değeri (o alanı görebiliyorsanız) ve devralabilecek kişiler. |
| `POST /handovers` | Bir fırsatın devir kartını elle hazırlar (`sourceKind`: `record` ya da `task`, `sourceId`). |
| `PATCH /handovers/:id` | Açık bir kartın özetini ya da önerilen planını değiştirir veya kartı kaldırır (`status: dismissed`). |
| `POST /handovers/:id/confirm` | Devri onaylar: `ownerId` devralan departmanda müşterinin sahibi olur, plan (`planId` ya da önerilen) uygulanır ve sahibe haber verilir. |
| `GET /stories/linkable` | Bir müşteri talebinin bağlanabileceği ürün işleri (`q` başlıklarda arar): başlık, durum ve kaç müşterinin beklediği; yeni talep için Ürün'ün talep panoları. |
| `POST /request-links` | Bir müşteri talebini bir işe bağlar (`storyId`, `accountId`, `source`: account, ticket, meeting, portal ya da task; isteğe bağlı `sourceId` ve `note`). |
| `DELETE /request-links/:id` | Bir bağı kaldırır. |
| `PATCH /request-links/:id` | Bağla birlikte saklanan "yayında" mesaj taslağını düzenler. |
| `POST /request-links/:id/told` | Müşteriye işin yayında olduğunun söylendiğini işaretler (mesajı kendiniz gönderdiniz). |
| `POST /request-links/:id/close-portal` | Bağın arkasındaki portal talebini kapatır: talep bitti sütununa geçer, portal kendi mesajını gönderir ve müşteriden onay ister. |
| `GET /flow/settings` | Şirketin akış ayarları: kazanılan fırsatın devir kartı alıp almadığı, önerdiği plan ve "müşteriye haber ver" görevlerinin gittiği pano. |
| `PUT /flow/settings` | Bu ayarları değiştirir (`handover`, `handoverPlanId`, `loopBoardId`). |
| `POST /assist/draft` | Asistandan bir taslak (model yoksa ya da sınır aşıldıysa şablondan): `handover_note`, `shipped_message` ya da `meeting_promises`. |
| `PATCH /activities/:id` | Kaydedilmiş bir etkinliği değiştirir ya da üste sabitler. |
| `DELETE /activities/:id` | Kaydedilmiş bir etkinliği çöp kutusuna taşır; orada 30 gün kalır. |
| `GET /accounts/:id/meetings` | Bir müşterinin toplantıları, değerlendirmeleri ve aramaları; sonraki adımlarıyla. |
| `POST /accounts/:id/meetings` | Bir toplantıyı kimlerin katıldığı, ne konuşulduğu ve sonraki adımlarla kaydeder; her adım seçilen panoda bir görev olur. |
| `POST /activities/:id/next-steps` | Kaydedilmiş bir toplantıya yeni sonraki adımlar ekler. |
| `GET /accounts/:id/planned` | Bir müşterinin henüz yapılmamış toplantıları (`upcoming`) ve son yapılan, ertelenen ya da iptal edilenlerden kısa bir kuyruk (`past`). |
| `POST /accounts/:id/planned` | Bir toplantı planlar: türü, ne zaman başladığı, iki taraftan kimlerin davet edildiği, gündemi ve tekrarlanıp tekrarlanmadığı. |
| `PATCH /planned/:id` | Henüz yapılmamış bir toplantıyı değiştirir — zamanı, türü, kişileri, gündemi ya da tekrarı. |
| `POST /planned/:id/hold` | Yapıldı olarak işaretler: kaydedilmiş toplantıyı zaman çizelgesine yazar ve ikisini bağlar. |
| `POST /planned/:id/postpone` | Bir nedenle erteler (silinmez, kalır); isteğe bağlı olarak yeni bir gün için yenisini planlar. |
| `POST /planned/:id/cancel` | Bir nedenle iptal eder — iptal olarak kayıtta kalır; hiçbir şey silinmez. |
| `GET /meeting-types` | Bu şirketin kaydettiği toplantı türleri; her biri kendi adı ve gündem şablonuyla. |
| `PUT /meeting-types` | Şirketin toplantı türlerini kaydeder (yönetici işi). |
| `GET /accounts/:id/health` | Sağlık skoru; onu neyin oynattığı ve son 90 gündeki seyriyle. |
| `GET /accounts/:id/finance` | Bağlı muhasebe programından: para birimine göre açık bakiye ve vadesi geçen tutar, en eski gecikme günü, son ödeme ve son faturalar. |
| `GET /health/config` | Bu şirkette sağlık skorunun nasıl hesaplandığı. |
| `POST /health/preview` | Yeni bir sağlık ayarının kaydetmeden önce ne vereceği: her bantta kaç müşteri olduğu ve en düşükler. |
| `PUT /health/config` | Sağlık skoru ayarlarını kaydeder ve her müşteriyi yeniden hesaplar. |
| `GET /accounts/:id/time` | Bir müşterinin görevlerine girilen süre: toplam, son 30 gün ve kişi başına. |
| `POST /accounts/:id/plans` | Bir müşteriye plan uygular: her adım bir görev olur; başlangıç gününden ileri ya da yenileme tarihinden geri tarihlenir. |
| `GET /renewals/links` | Bir müşteri listesi için: her birinin açık yenileme fırsatı ve anlaşmaları. |
| `PUT /rhythm` | Hedefler, müşterilerin ne sıklıkla değerlendirildiği ve hatırlatmaların ne zaman gittiği: tek bir şirket ayarı. |
| `POST /rollups/recompute` | Kayıtlardan toplanan müşteri alanlarını yeniden hesaplar (tanımları değiştikten sonra). |

## Ayrıntılar

### `GET /accounts`

Müşterileri listeler. `q` ada göre arar, `owner` bir kişi kimliği ya da `me` alır, `archived=1` arşivlenenleri verir, `limit` ve `offset` sayfalar. `signals=1` gecikmiş ve takılmış iş sayılarını ekler.

**Sorgu:** `q`, `owner`, `archived`, `limit`, `offset`, `signals`

### `POST /accounts`

Müşteri ekler.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 200 karakter |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `teamId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `currency` | metin | isteğe bağlı | boş (null) olabilir |

### `GET /accounts/:id`

Tek bir müşteri; kişinin görebildiği bütün alanlarıyla.

### `PATCH /accounts/:id`

Müşteriyi değiştirir: ad, sahip, ekip, alanlar, görüşme sıklığı; arşivler ya da geri alır. Yalnızca gönderdiğiniz alanlar değişir.

**Gerekenler:** tam kullanıcı · bazı değişiklikler için: yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 200 karakter |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `teamId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `archived` | evet/hayır | isteğe bağlı |  |
| `reviewDays` | tam sayı | isteğe bağlı | en az 0; en çok 730; boş (null) olabilir |
| `currency` | metin | isteğe bağlı | boş (null) olabilir |
| `baseVersion` | tam sayı | isteğe bağlı | en az 1 |

### `DELETE /accounts/:id`

Müşteriyi kayıtları, zaman çizelgesi ve portal kişileriyle birlikte çöp kutusuna taşır; 30 gün boyunca geri alınabilir. Görevleri kalır, müşterisiz olur. Cevapta `trashId` gelir.

**Gerekenler:** yetki `accounts.manage`

### `POST /accounts/bulk`

Birçok müşteriyi birden değiştirir: yeni sahip, yeni ekip, arşivleme ya da geri alma. Cevapta bir geri alma kimliği gelir.

**Gerekenler:** yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `ids` | kimlik listesi | zorunlu | en az 1 öğe; en çok 500 öğe |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `teamId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `archived` | evet/hayır | isteğe bağlı |  |

### `POST /accounts/import`

Bir dosyanın satırlarından müşteri alır (CSV ya da Excel sizin tarafınızda okunur); sütundan alana eşlemeyle. Var olan müşteriler ada ya da kaynaktaki kimliğine göre eşlenir.

**Gerekenler:** yetki `accounts.manage` · yetki `accounts.view_all`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `fileName` | metin | isteğe bağlı | en çok 200 karakter |
| `rows` | nesne (ad → değer) listesi | zorunlu | en çok MAX_IMPORT_ROWS öğe |
| `mapping` | nesne | zorunlu |  |
| `newFields` | nesne listesi | isteğe bağlı | en çok 40 öğe |
| `runAutomations` | evet/hayır | isteğe bağlı |  |
| `locale` | şunlardan biri: en \| tr \| ar \| he \| fa \| zh-Hans \| zh-Hant \| ja \| ko \| hi \| ms | isteğe bağlı |  |

### `GET /imports`

Son müşteri içe aktarmaları; en yenisi başta.

**Gerekenler:** yetki `accounts.manage`

### `POST /imports/:id/undo`

Bir içe aktarmayı 30 gün içinde geri alır: eklediklerini kaldırır, değiştirdiklerini eski haline getirir. Eklediği müşteriler çöp kutusuna tek bir öğe olarak gider (`trashId`).

**Gerekenler:** yetki `accounts.manage`

### `PUT /account-fields`

Müşteri alanlarının listesini değiştirir (yönetici işi): anahtarlar, her dildeki etiketler, türler, seçenekler, kimin görüp düzenleyebileceği.

**Gerekenler:** yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `fields` | fieldSchema listesi | zorunlu | en çok 150 öğe |

### `GET /accounts/whitespace`

Hangi müşteride hangi ürün var, hangisinde yok: bir türün kayıtları müşteri başına ve bir alanın seçeneği başına sayılır.

**Sorgu:** `type`, `field`

### `GET /accounts/:id/timeline`

Bir müşteriyle olan her şey, en yenisi başta: notlar, aramalar, toplantılar, e-postalar, biten görevler, değişiklikler. `before` ve `limit` sayfalar.

**Sorgu:** `before`, `limit`

### `POST /accounts/:id/activities`

Zaman çizelgesine not, arama, toplantı ya da e-posta kaydeder.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: ACTIVITY_KINDS | isteğe bağlı | varsayılan note |
| `body` | metin | zorunlu | en az 1 karakter; en çok 20000 karakter |
| `happenedAt` | tarih ve saat | isteğe bağlı |  |
| `contactIds` | kimlik listesi | isteğe bağlı | en çok 20 öğe |
| `pinned` | evet/hayır | isteğe bağlı |  |

### `GET /accounts/:id/flow`

Bir müşteri için departmanlar arası akış: her departmandaki sahibi, beklediği ürün işi (başlık, durum, sprint bitişi, departman; pano yalnızca açabiliyorsanız), ona verilen sözler ve devir kartları.

### `PUT /accounts/:id/team`

Müşterinin bir departmandaki sahibini belirler (`userId: null` ile kaldırır). Müşteri yöneticileri, departman liderleri ve müşterinin sahibi yapabilir.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `departmentId` | kimlik | zorunlu |  |
| `userId` | kimlik | zorunlu | boş (null) olabilir |

### `POST /accounts/:id/promises`

Müşteriye verilen bir sözü kaydeder (`body`; isteğe bağlı `recordId`, `activityId`, `dueDate`). Devir kartı açık olanları listeler.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `body` | metin | zorunlu | en az 1 karakter; en çok 500 karakter |
| `recordId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `activityId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |

### `PATCH /promises/:id`

Bir sözü değiştirir ya da tutuldu olarak işaretler (`kept: true`).

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `body` | metin | isteğe bağlı | en az 1 karakter; en çok 500 karakter |
| `kept` | evet/hayır | isteğe bağlı |  |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |

### `DELETE /promises/:id`

Bir sözü siler. Cevap sözü taşır; geri yazılabilir.

**Gerekenler:** tam kullanıcı

### `GET /handovers`

Görebildiğiniz devir kartları, en yenisi başta: açık olanlar ya da `status=all` ile hepsi.

**Sorgu:** `status`

### `GET /handovers/:id`

Bir devir kartının tamamı: paydaşlar ve duruşları, açık sözler, bekleyen ürün talepleri, kapanış ve yenileme tarihleri, müşterinin yıllık değeri (o alanı görebiliyorsanız) ve devralabilecek kişiler.

### `POST /handovers`

Bir fırsatın devir kartını elle hazırlar (`sourceKind`: `record` ya da `task`, `sourceId`). Fırsat başına bir kez; kazanılan fırsat kendiliğinden alır.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `sourceKind` | şunlardan biri: record \| task | zorunlu |  |
| `sourceId` | kimlik | zorunlu |  |

### `PATCH /handovers/:id`

Açık bir kartın özetini ya da önerilen planını değiştirir veya kartı kaldırır (`status: dismissed`).

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `summary` | metin | isteğe bağlı | en çok 8000 karakter |
| `planId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `status` | şunlardan biri: open \| dismissed | isteğe bağlı |  |

### `POST /handovers/:id/confirm`

Devri onaylar: `ownerId` devralan departmanda müşterinin sahibi olur, plan (`planId` ya da önerilen) uygulanır ve sahibe haber verilir.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `ownerId` | kimlik | zorunlu |  |
| `planId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `summary` | metin | isteğe bağlı | en çok 8000 karakter |

### `GET /stories/linkable`

Bir müşteri talebinin bağlanabileceği ürün işleri (`q` başlıklarda arar): başlık, durum ve kaç müşterinin beklediği; yeni talep için Ürün'ün talep panoları.

**Sorgu:** `q`

### `POST /request-links`

Bir müşteri talebini bir işe bağlar (`storyId`, `accountId`, `source`: account, ticket, meeting, portal ya da task; isteğe bağlı `sourceId` ve `note`). Aynı talep iki kez tek bağdır.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `storyId` | kimlik | zorunlu |  |
| `accountId` | kimlik | zorunlu |  |
| `source` | şunlardan biri: REQUEST_SOURCES | zorunlu |  |
| `sourceId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `note` | metin | isteğe bağlı | en çok 2000 karakter |

### `DELETE /request-links/:id`

Bir bağı kaldırır.

**Gerekenler:** tam kullanıcı

### `PATCH /request-links/:id`

Bağla birlikte saklanan "yayında" mesaj taslağını düzenler.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `draft` | metin | zorunlu | en çok 8000 karakter |

### `POST /request-links/:id/told`

Müşteriye işin yayında olduğunun söylendiğini işaretler (mesajı kendiniz gönderdiniz).

**Gerekenler:** tam kullanıcı

### `POST /request-links/:id/close-portal`

Bağın arkasındaki portal talebini kapatır: talep bitti sütununa geçer, portal kendi mesajını gönderir ve müşteriden onay ister. İşin bitmesi bunu kendiliğinden yapmaz.

**Gerekenler:** tam kullanıcı

### `GET /flow/settings`

Şirketin akış ayarları: kazanılan fırsatın devir kartı alıp almadığı, önerdiği plan ve "müşteriye haber ver" görevlerinin gittiği pano.

### `PUT /flow/settings`

Bu ayarları değiştirir (`handover`, `handoverPlanId`, `loopBoardId`). Otomasyon yönetme yetkisi gerekir.

**Gerekenler:** tam kullanıcı · yetki `automations.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `handover` | evet/hayır | isteğe bağlı |  |
| `handoverPlanId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `loopBoardId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `POST /assist/draft`

Asistandan bir taslak (model yoksa ya da sınır aşıldıysa şablondan): `handover_note`, `shipped_message` ya da `meeting_promises`. Hiçbir şey kaydedilmez.

**Gerekenler:** tam kullanıcı

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `PATCH /activities/:id`

Kaydedilmiş bir etkinliği değiştirir ya da üste sabitler.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: ACTIVITY_KINDS | isteğe bağlı |  |
| `body` | metin | isteğe bağlı | en çok 20000 karakter |
| `happenedAt` | tarih ve saat | isteğe bağlı |  |
| `contactIds` | kimlik listesi | isteğe bağlı | en çok 20 öğe |
| `pinned` | evet/hayır | isteğe bağlı |  |
| `title` | metin | isteğe bağlı | en çok 300 karakter |
| `minutes` | tam sayı | isteğe bağlı | en az 1; en çok 1440; boş (null) olabilir |
| `userIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |

### `DELETE /activities/:id`

Kaydedilmiş bir etkinliği çöp kutusuna taşır; orada 30 gün kalır. Cevapta `trashId` gelir.

**Gerekenler:** tam kullanıcı

### `GET /accounts/:id/meetings`

Bir müşterinin toplantıları, değerlendirmeleri ve aramaları; sonraki adımlarıyla. `kind` tek türe daraltır, `before` geriye sayfalar.

**Sorgu:** `kind`, `before`

### `POST /accounts/:id/meetings`

Bir toplantıyı kimlerin katıldığı, ne konuşulduğu ve sonraki adımlarla kaydeder; her adım seçilen panoda bir görev olur.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: MEETING_KINDS | isteğe bağlı | varsayılan meeting |
| `title` | metin | isteğe bağlı | en çok 300 karakter; default  |
| `body` | metin | isteğe bağlı | en çok 20000 karakter; default  |
| `happenedAt` | tarih ve saat | isteğe bağlı |  |
| `minutes` | tam sayı | isteğe bağlı | en az 1; en çok 1440; boş (null) olabilir |
| `contactIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `userIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `nextSteps` | nesne listesi | isteğe bağlı | en çok 20 öğe |
| `boardId` | kimlik | isteğe bağlı |  |

### `POST /activities/:id/next-steps`

Kaydedilmiş bir toplantıya yeni sonraki adımlar ekler.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `steps` | nesne listesi | zorunlu | en az 1 öğe; en çok 20 öğe |
| `boardId` | kimlik | zorunlu |  |

### `GET /accounts/:id/planned`

Bir müşterinin henüz yapılmamış toplantıları (`upcoming`) ve son yapılan, ertelenen ya da iptal edilenlerden kısa bir kuyruk (`past`).

### `POST /accounts/:id/planned`

Bir toplantı planlar: türü, ne zaman başladığı, iki taraftan kimlerin davet edildiği, gündemi ve tekrarlanıp tekrarlanmadığı. Yapılana kadar zaman çizelgesine düşmez.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: MEETING_KINDS | isteğe bağlı | varsayılan meeting |
| `typeLabel` | metin | isteğe bağlı | en çok 80 karakter; default  |
| `title` | metin | isteğe bağlı | en çok 300 karakter; default  |
| `agenda` | metin | isteğe bağlı | en çok 20000 karakter; default  |
| `startsAt` | tarih ve saat | zorunlu |  |
| `minutes` | tam sayı | isteğe bağlı | en az 1; en çok 1440; boş (null) olabilir |
| `contactIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `userIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `repeat` | şunlardan biri: MEETING_REPEATS | isteğe bağlı | varsayılan none |

### `PATCH /planned/:id`

Henüz yapılmamış bir toplantıyı değiştirir — zamanı, türü, kişileri, gündemi ya da tekrarı.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `kind` | şunlardan biri: MEETING_KINDS | isteğe bağlı |  |
| `typeLabel` | metin | isteğe bağlı | en çok 80 karakter |
| `title` | metin | isteğe bağlı | en çok 300 karakter |
| `agenda` | metin | isteğe bağlı | en çok 20000 karakter |
| `startsAt` | tarih ve saat | isteğe bağlı |  |
| `minutes` | tam sayı | isteğe bağlı | en az 1; en çok 1440; boş (null) olabilir |
| `contactIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `userIds` | kimlik listesi | isteğe bağlı | en çok 30 öğe |
| `repeat` | şunlardan biri: MEETING_REPEATS | isteğe bağlı |  |

### `POST /planned/:id/hold`

Yapıldı olarak işaretler: kaydedilmiş toplantıyı zaman çizelgesine yazar ve ikisini bağlar. Tekrarlıysa bir sonraki planlanır. Sonraki adımlar aynı anda kararlaştırılabilir.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `body` | metin | isteğe bağlı | en çok 20000 karakter; default  |
| `happenedAt` | tarih ve saat | isteğe bağlı |  |
| `minutes` | tam sayı | isteğe bağlı | en az 1; en çok 1440; boş (null) olabilir |
| `nextSteps` | nesne listesi | isteğe bağlı | en çok 20 öğe |
| `boardId` | kimlik | isteğe bağlı |  |

### `POST /planned/:id/postpone`

Bir nedenle erteler (silinmez, kalır); isteğe bağlı olarak yeni bir gün için yenisini planlar.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `reason` | metin | isteğe bağlı | en çok 2000 karakter; default  |
| `startsAt` | tarih ve saat | isteğe bağlı |  |

### `POST /planned/:id/cancel`

Bir nedenle iptal eder — iptal olarak kayıtta kalır; hiçbir şey silinmez.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `reason` | metin | isteğe bağlı | en çok 2000 karakter; default  |

### `GET /meeting-types`

Bu şirketin kaydettiği toplantı türleri; her biri kendi adı ve gündem şablonuyla.

### `PUT /meeting-types`

Şirketin toplantı türlerini kaydeder (yönetici işi).

**Gerekenler:** yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `types` | nesne listesi | zorunlu | en çok 40 öğe |

### `GET /accounts/:id/health`

Sağlık skoru; onu neyin oynattığı ve son 90 gündeki seyriyle.

### `GET /accounts/:id/finance`

Bağlı muhasebe programından: para birimine göre açık bakiye ve vadesi geçen tutar, en eski gecikme günü, son ödeme ve son faturalar. "Finans rakamlarını görme" izni gerekir; bağlı program yoksa `finance` null döner.

**Gerekenler:** yetki `finance.view`

### `GET /health/config`

Bu şirkette sağlık skorunun nasıl hesaplandığı.

**Gerekenler:** yetki `accounts.manage`

### `POST /health/preview`

Yeni bir sağlık ayarının kaydetmeden önce ne vereceği: her bantta kaç müşteri olduğu ve en düşükler.

**Gerekenler:** yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `config` | nesne | zorunlu |  |

### `PUT /health/config`

Sağlık skoru ayarlarını kaydeder ve her müşteriyi yeniden hesaplar.

**Gerekenler:** tam kullanıcı · yetki `accounts.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `config` | nesne | zorunlu |  |

### `GET /accounts/:id/time`

Bir müşterinin görevlerine girilen süre: toplam, son 30 gün ve kişi başına.

### `POST /accounts/:id/plans`

Bir müşteriye plan uygular: her adım bir görev olur; başlangıç gününden ileri ya da yenileme tarihinden geri tarihlenir.

**Gerekenler:** tam kullanıcı · plan: `playbooks`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `planId` | kimlik | zorunlu |  |
| `start` | tarih (YYYY-AA-GG) | isteğe bağlı |  |

### `GET /renewals/links`

Bir müşteri listesi için: her birinin açık yenileme fırsatı ve anlaşmaları.

**Sorgu:** `accounts`

### `PUT /rhythm`

Hedefler, müşterilerin ne sıklıkla değerlendirildiği ve hatırlatmaların ne zaman gittiği: tek bir şirket ayarı.

**Gerekenler:** tam kullanıcı

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `targets` | nesne | isteğe bağlı |  |
| `reviewDays` | tam sayı | isteğe bağlı | en az 0; en çok 730 |
| `staleDays` | tam sayı | isteğe bağlı | en az 0; en çok 365 |
| `escalateDays` | tam sayı | isteğe bağlı | en az 0; en çok 90 |
| `renewal` | nesne | isteğe bağlı |  |

### `POST /rollups/recompute`

Kayıtlardan toplanan müşteri alanlarını yeniden hesaplar (tanımları değiştikten sonra).

**Gerekenler:** yetki `accounts.manage`
