---
title: Başvuru: görevler ve panolar
section: reference
order: 22
summary: Görevler, alt görevler, yorumlar, dosyalar, süre, panolar ve kayıtlı görünümler.
---
# Başvuru: görevler ve panolar

Görev bir panoda, panonun sütunlarından birinde durur (`status` sütun anahtarıdır). Bir müşteriye ve bir kayda bağlı olabilir. Görevi değiştirmek için son gördüğün `version` gerekir; API rehberindeki "Aynı anda değişiklik" bölümüne bak.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /boards` | Kişinin görebildiği panolar; sütunları ve görev alanlarıyla. |
| `POST /boards` | Pano ekler: sütunları, kimin gördüğü, görev alanları ve talep formu. |
| `PATCH /boards/:id` | Panoyu değiştirir. |
| `DELETE /boards/:id` | Panoyu görevleriyle birlikte arşivler. |
| `GET /boards/:id/tasks` | Bir panonun görevleri. |
| `POST /boards/:id/requests` | Panonun formu üzerinden talep gönderir: formun sütununa, kimseye atanmadan düşer. |
| `POST /boards/:id/import` | Bir dosyanın satırlarından tek bir panoya görev alır. |
| `GET /boards/:id/imports` | Bir panoya yaptığın son görev içe aktarmaları; en yenisi başta. |
| `POST /task-imports/:id/undo` | Bir görev içe aktarmasını geri alır: sonradan kimsenin dokunmadıkları kaldırılır ve çöp kutusuna tek bir öğe olarak gider (`trashId`). |
| `PUT /boards/:id/portal` | Bir panoyu portalda müşterilere açar ya da kapatır (yönetici kararı). |
| `GET /tasks` | Panolar genelinde görevler. |
| `GET /calendar` | `from` ile `to` arasında (en çok 430 gün) hangi güne ne düşüyor: son tarihine göre görevler, yapılmış toplantı, arama ve değerlendirmeler, yenilemeler, zamanı gelen iş değerlendirmeleri. |
| `GET /calendars` | Kendininkinden başka kimin takvimini açabileceğin: `who` olarak verilebilecek ekipler ve kişiler. |
| `GET /tasks/counts` | Kişinin açık görevlerinden kaçı gecikmiş, kaçı bugün bitiyor (şirketin saatine göre). |
| `GET /tasks/similar` | Eklenmek üzere olana benzeyen açık görevler (aynı kelimeler, aynı müşteri ya da pano); çift kaydı önlemek için. |
| `POST /tasks` | Görev ekler. |
| `GET /tasks/:id` | Tek bir görev; yorumları, dosyaları, alt görevleri, bağlantıları, süresi ve geçmişiyle. |
| `PATCH /tasks/:id` | Görevi değiştirir. |
| `PATCH /tasks/:id/pm` | Görevin ürün yönetimi alanlarını ayarlar: `issueType` (epic, story, task, bug, subtask, spike), `storyPoints` (0 ya da fazlası, veya null) ve `epicId` (aynı panodaki bir epik, ya da null). |
| `GET /boards/:id/sprints` | Bir panonun sprintleri, sırayla. |
| `POST /boards/:id/sprints` | Sprint ekler (`name`, isteğe bağlı `goal`, `startsOn`, `endsOn`). |
| `GET /boards/:id/backlog` | Panonun hiçbir sprintte olmayan üst düzey görevleri, sıra düzeninde. |
| `GET /boards/:id/epics` | Panonun epikleri ve her birine bağlı hikaye sayısı (`childCount`). |
| `GET /boards/:id/pm` | Bu panoda ürün yönetiminin (kayıt türleri, hikaye puanları, epikler, sprintler, backlog) açık olup olmadığı. |
| `PUT /boards/:id/pm` | Bir panoda ürün yönetimini açar ya da kapatır (`enabled`: true, false ya da panonun sütunlarını izlemek için null). |
| `GET /sprints/:id` | Tek bir sprint. |
| `PATCH /sprints/:id` | Sprintin adını, hedefini ya da tarihlerini değiştirir. |
| `PUT /sprints/:id/state` | Sprinti `future`, `active` ya da `closed` durumuna alır. |
| `DELETE /sprints/:id` | Sprinti arşivler; kayıtları backlog'a döner. |
| `GET /sprints/:id/items` | Bir sprintteki görevler, sıra düzeninde. |
| `PUT /sprints/:id/items` | Aynı panodaki görevleri sprinte koyar (`taskIds`). |
| `DELETE /sprints/:id/items/:taskId` | Görevi sprintten çıkarıp backlog'a döndürür. |
| `GET /sprints/:id/summary` | Güncel toplamlar: puan ve kayıt sayıları (biten ve tümü), kayıt türüne göre dağılımla. |
| `GET /sprints/:id/burndown` | Bir sprintin burndown'ı: güne göre kalan hikaye puanları ve kayıtlar, bugün için canlı bir noktayla. |
| `DELETE /tasks/:id` | Görevi alt görevleri, yorumları, süre kayıtları ve dosyalarıyla çöp kutusuna taşır; orada 30 gün kalır. |
| `POST /tasks/bulk` | Birçok görevi birden değiştirir: sütun, atanan, bitiş tarihi, öncelik, arşiv. |
| `POST /undo/:id` | Birçok görevde ya da müşteride yapılan değişikliğin eski halini geri getirir. |
| `POST /tasks/:id/comments` | Göreve yorum yazar. |
| `DELETE /comments/:id` | Bir göreve yazdığın yorumu, içindeki dosyalarla birlikte siler. |
| `POST /tasks/:id/files` | Göreve dosya ekler (multipart yükleme, istek başına bir dosya). |
| `GET /files/:id` | Dosyayı indirir. |
| `DELETE /files/:id` | Dosyayı siler. |
| `POST /tasks/:id/links` | İki görevi bağlar: biri diğerini engeller ya da ilişkilidirler. |
| `DELETE /tasks/:id/links/:other` | İki görev arasındaki bağlantıyı kaldırır. |
| `POST /tasks/:id/time` | Göreve bir gün için dakika olarak süre girer. |
| `DELETE /time/:id` | Kendi süre kaydını siler. |
| `POST /tasks/:id/checklist` | Göreve adımları alt görev olarak ekler; elle ya da bir kontrol listesi şablonundan. |
| `PUT /tasks/:id/watch` | Görevi takip eder: değişikliklerinden haberin olur. |
| `DELETE /tasks/:id/watch` | Görevi takip etmeyi bırakır. |
| `POST /tasks/:id/mute` | Bir görev için yorum bildirimlerini durdurur ya da yeniden açar. |
| `PUT /tasks/:id/portal` | Görevi portalda müşterisiyle paylaşır ya da paylaşmayı bırakır. |
| `GET /checklists` | Kontrol listesi şablonları. |
| `POST /checklists` | Kontrol listesi şablonu kaydeder. |
| `DELETE /checklists/:id` | Kontrol listesi şablonunu siler. |
| `GET /views` | Bir panodaki kayıtlı görünümlerin (filtreler, gruplama, sıra). |
| `POST /views` | Görünüm kaydeder. |
| `PATCH /views/:id` | Kayıtlı görünümü değiştirir. |
| `DELETE /views/:id` | Kayıtlı görünümü siler. |

## Ayrıntılar

### `GET /boards`

Kişinin görebildiği panolar; sütunları ve görev alanlarıyla.

### `POST /boards`

Pano ekler: sütunları, kimin gördüğü, görev alanları ve talep formu.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `visibility` | şunlardan biri: org \| team \| private | zorunlu |  |
| `teamId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `memberIds` | kimlik listesi | isteğe bağlı | en çok 200 öğe |
| `columns` | nesne listesi | isteğe bağlı | en az 1 öğe; en çok 12 öğe |
| `notify` | nesne listesi | isteğe bağlı | en çok 5 öğe |
| `taskFields` | taskFieldsSchema | isteğe bağlı |  |
| `form` | nesne | isteğe bağlı | boş (null) olabilir |
| `archiveDays` | tam sayı | isteğe bağlı | en az 7; en çok 3650; boş (null) olabilir |

### `PATCH /boards/:id`

Panoyu değiştirir. İçinde görev olan sütun kaldırılamaz.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `visibility` | şunlardan biri: org \| team \| private | zorunlu |  |
| `teamId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `memberIds` | kimlik listesi | isteğe bağlı | en çok 200 öğe |
| `columns` | nesne listesi | isteğe bağlı | en az 1 öğe; en çok 12 öğe |
| `notify` | nesne listesi | isteğe bağlı | en çok 5 öğe |
| `taskFields` | taskFieldsSchema | isteğe bağlı |  |
| `form` | nesne | isteğe bağlı | boş (null) olabilir |
| `archiveDays` | tam sayı | isteğe bağlı | en az 7; en çok 3650; boş (null) olabilir |

### `DELETE /boards/:id`

Panoyu görevleriyle birlikte arşivler.

**Gerekenler:** yazabilen bir koltuk

### `GET /boards/:id/tasks`

Bir panonun görevleri. `q` başlıklarda arar, `archived=1` arşivlenenleri verir, `offset` sayfalar.

**Sorgu:** `archived`, `q`, `offset`

### `POST /boards/:id/requests`

Panonun formu üzerinden talep gönderir: formun sütununa, kimseye atanmadan düşer.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | zorunlu | en az 1 karakter; en çok 300 karakter |
| `description` | metin | isteğe bağlı | en çok 20000 karakter |
| `accountId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |

### `POST /boards/:id/import`

Bir dosyanın satırlarından tek bir panoya görev alır. Kimseye bildirim gitmez, kural çalışmaz.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `fileName` | metin | isteğe bağlı | en çok 200 karakter |
| `rows` | nesne (ad → değer) listesi | zorunlu | en az 1 öğe; en çok MAX_TASK_ROWS öğe |
| `mapping` | nesne | zorunlu |  |
| `locale` | şunlardan biri: en \| tr | isteğe bağlı |  |
| `includeDone` | evet/hayır | isteğe bağlı |  |

### `GET /boards/:id/imports`

Bir panoya yaptığın son görev içe aktarmaları; en yenisi başta.

### `POST /task-imports/:id/undo`

Bir görev içe aktarmasını geri alır: sonradan kimsenin dokunmadıkları kaldırılır ve çöp kutusuna tek bir öğe olarak gider (`trashId`).

**Gerekenler:** yazabilen bir koltuk

### `PUT /boards/:id/portal`

Bir panoyu portalda müşterilere açar ya da kapatır (yönetici kararı).

**Gerekenler:** yazabilen bir koltuk · yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `enabled` | evet/hayır | zorunlu |  |
| `intake` | metin | zorunlu | en az 1 karakter; en çok 60 karakter |
| `labels` | nesne (ad → değer) | isteğe bağlı | varsayılan {} |
| `fields` | şunlardan biri: PORTAL_FIELDS listesi | isteğe bağlı | en çok PORTAL_FIELDS.length öğe; varsayılan [] |

### `GET /tasks`

Panolar genelinde görevler. `assignee` bir kişi kimliği ya da `me` alır; `from` ve `to` bitiş tarihini sınırlar; `board` tek panoya daraltır.

**Sorgu:** `assignee`, `from`, `to`, `span`, `board`

### `GET /calendar`

`from` ile `to` arasında (en çok 430 gün) hangi güne ne düşüyor: son tarihine göre görevler, yapılmış toplantı, arama ve değerlendirmeler, yenilemeler, zamanı gelen iş değerlendirmeleri. `who`: `me` (varsayılan), `all` (görebildiğin her şey), `p:<kişi kimliği>` ya da `t:<ekip kimliği>`; son ikisi ekip arkadaşlarının takvimini görme yetkisi ister ve yalnızca zaten görebildiğini gösterir.

**Sorgu:** `from`, `to`, `who`

### `GET /calendars`

Kendininkinden başka kimin takvimini açabileceğin: `who` olarak verilebilecek ekipler ve kişiler. Yetki yoksa boştur.

### `GET /tasks/counts`

Kişinin açık görevlerinden kaçı gecikmiş, kaçı bugün bitiyor (şirketin saatine göre).

### `GET /tasks/similar`

Eklenmek üzere olana benzeyen açık görevler (aynı kelimeler, aynı müşteri ya da pano); çift kaydı önlemek için.

**Sorgu:** `title`, `boardId`, `accountId`

### `POST /tasks`

Görev ekler. `parentId` verilirse alt görev olur.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `boardId` | kimlik | zorunlu |  |
| `parentId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `title` | metin | zorunlu | en az 1 karakter; en çok 300 karakter |
| `description` | metin | isteğe bağlı | en çok 20000 karakter |
| `status` | metin | isteğe bağlı | en çok 24 karakter |
| `assigneeIds` | kimlik listesi | isteğe bağlı | en çok 10 öğe |
| `accountId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `priority` | şunlardan biri: low \| normal \| high \| urgent | isteğe bağlı |  |
| `position` | sayı | isteğe bağlı |  |
| `repeat` | nesne | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `startDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `recordId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `GET /tasks/:id`

Tek bir görev; yorumları, dosyaları, alt görevleri, bağlantıları, süresi ve geçmişiyle.

### `PATCH /tasks/:id`

Görevi değiştirir. `baseVersion` gönder; bu arada başkası başka alanları değiştirdiyse iki değişiklik de kalır, aynı alanı değiştirdiyse en güncel görevle birlikte `409` alırsın.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `baseVersion` | tam sayı | zorunlu | en az 1 |
| `title` | metin | isteğe bağlı | en az 1 karakter; en çok 300 karakter |
| `description` | metin | isteğe bağlı | en çok 20000 karakter |
| `status` | metin | isteğe bağlı | en çok 24 karakter |
| `assigneeIds` | kimlik listesi | isteğe bağlı | en çok 10 öğe |
| `accountId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `priority` | şunlardan biri: low \| normal \| high \| urgent | isteğe bağlı |  |
| `position` | sayı | isteğe bağlı |  |
| `repeat` | nesne | isteğe bağlı | boş (null) olabilir |
| `fields` | nesne (ad → değer) | isteğe bağlı |  |
| `startDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `recordId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `PATCH /tasks/:id/pm`

Görevin ürün yönetimi alanlarını ayarlar: `issueType` (epic, story, task, bug, subtask, spike), `storyPoints` (0 ya da fazlası, veya null) ve `epicId` (aynı panodaki bir epik, ya da null). `baseVersion` gönder; eski sürüm en güncel görevle birlikte `409` alır.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `baseVersion` | tam sayı | zorunlu | en az 1 |
| `issueType` | şunlardan biri: ISSUE_TYPES | isteğe bağlı |  |
| `storyPoints` | sayı | isteğe bağlı | en az 0; en çok 1000; boş (null) olabilir |
| `epicId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `GET /boards/:id/sprints`

Bir panonun sprintleri, sırayla. `state` (future, active, closed) listeyi daraltır.

**Sorgu:** `state`

### `POST /boards/:id/sprints`

Sprint ekler (`name`, isteğe bağlı `goal`, `startsOn`, `endsOn`). `future` olarak başlar.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `goal` | metin | isteğe bağlı | en çok 2000 karakter |
| `startsOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `endsOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |

### `GET /boards/:id/backlog`

Panonun hiçbir sprintte olmayan üst düzey görevleri, sıra düzeninde. `open=1` bitenleri hariç tutar.

**Sorgu:** `open`

### `GET /boards/:id/epics`

Panonun epikleri ve her birine bağlı hikaye sayısı (`childCount`).

### `GET /boards/:id/pm`

Bu panoda ürün yönetiminin (kayıt türleri, hikaye puanları, epikler, sprintler, backlog) açık olup olmadığı.

### `PUT /boards/:id/pm`

Bir panoda ürün yönetimini açar ya da kapatır (`enabled`: true, false ya da panonun sütunlarını izlemek için null).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `enabled` | evet/hayır | zorunlu | boş (null) olabilir |

### `GET /sprints/:id`

Tek bir sprint.

### `PATCH /sprints/:id`

Sprintin adını, hedefini ya da tarihlerini değiştirir.

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bak.

### `PUT /sprints/:id/state`

Sprinti `future`, `active` ya da `closed` durumuna alır. Panoda aynı anda yalnızca bir sprint aktif olabilir (`409`, `reason: sprint_active`). Kapatırken `moveIncompleteTo` bitmemiş kayıtları backlog'a (null) ya da başka bir sprinte taşır.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `state` | şunlardan biri: SPRINT_STATES | zorunlu |  |
| `moveIncompleteTo` | kimlik | isteğe bağlı | boş (null) olabilir |

### `DELETE /sprints/:id`

Sprinti arşivler; kayıtları backlog'a döner.

**Gerekenler:** yazabilen bir koltuk

### `GET /sprints/:id/items`

Bir sprintteki görevler, sıra düzeninde.

### `PUT /sprints/:id/items`

Aynı panodaki görevleri sprinte koyar (`taskIds`). Kapanmış sprint görev almaz.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `taskIds` | kimlik listesi | zorunlu | en az 1 öğe; en çok 200 öğe |

### `DELETE /sprints/:id/items/:taskId`

Görevi sprintten çıkarıp backlog'a döndürür.

**Gerekenler:** yazabilen bir koltuk

### `GET /sprints/:id/summary`

Güncel toplamlar: puan ve kayıt sayıları (biten ve tümü), kayıt türüne göre dağılımla. Biten, durumu bitmiş sayılan bir sütun olandır.

### `GET /sprints/:id/burndown`

Bir sprintin burndown'ı: güne göre kalan hikaye puanları ve kayıtlar, bugün için canlı bir noktayla.

### `DELETE /tasks/:id`

Görevi alt görevleri, yorumları, süre kayıtları ve dosyalarıyla çöp kutusuna taşır; orada 30 gün kalır. Yalnızca açan kişi ya da her görevi silebilen biri yapabilir. Cevapta `trashId` gelir.

**Gerekenler:** yazabilen bir koltuk

### `POST /tasks/bulk`

Birçok görevi birden değiştirir: sütun, atanan, bitiş tarihi, öncelik, arşiv. Cevapta bir geri alma kimliği gelir.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `ids` | kimlik listesi | zorunlu | en az 1 öğe; en çok 500 öğe |
| `status` | metin | isteğe bağlı | en çok 24 karakter |
| `addAssignee` | kimlik | isteğe bağlı |  |
| `removeAssignee` | kimlik | isteğe bağlı |  |
| `dueDate` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `priority` | şunlardan biri: low \| normal \| high \| urgent | isteğe bağlı |  |
| `archived` | evet/hayır | isteğe bağlı |  |

### `POST /undo/:id`

Birçok görevde ya da müşteride yapılan değişikliğin eski halini geri getirir.

**Gerekenler:** yazabilen bir koltuk

### `POST /tasks/:id/comments`

Göreve yorum yazar. `visibility: customer` yorumu müşteri portalında gösterir; `@ad` ile anılan kişiye bildirim gider.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `body` | metin | zorunlu | en çok 10000 karakter |
| `visibility` | şunlardan biri: internal \| customer | isteğe bağlı | varsayılan internal |
| `fileIds` | kimlik listesi | isteğe bağlı | en çok 10 öğe |

### `DELETE /comments/:id`

Bir göreve yazdığın yorumu, içindeki dosyalarla birlikte siler.

### `POST /tasks/:id/files`

Göreve dosya ekler (multipart yükleme, istek başına bir dosya).

**Gerekenler:** yazabilen bir koltuk

### `GET /files/:id`

Dosyayı indirir. `inline=1` tarayıcıdan kaydetmek yerine göstermesini ister.

**Sorgu:** `inline`

### `DELETE /files/:id`

Dosyayı siler.

### `POST /tasks/:id/links`

İki görevi bağlar: biri diğerini engeller ya da ilişkilidirler.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `otherId` | kimlik | zorunlu |  |
| `kind` | şunlardan biri: blocks \| blocked_by \| relates | zorunlu |  |

### `DELETE /tasks/:id/links/:other`

İki görev arasındaki bağlantıyı kaldırır.

**Gerekenler:** yazabilen bir koltuk

**Sorgu:** `kind`

### `POST /tasks/:id/time`

Göreve bir gün için dakika olarak süre girer.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `minutes` | tam sayı | zorunlu | en az 1; en çok 1440 |
| `day` | tarih (YYYY-AA-GG) | isteğe bağlı |  |
| `note` | metin | isteğe bağlı | en çok 500 karakter |

### `DELETE /time/:id`

Kendi süre kaydını siler.

**Gerekenler:** yazabilen bir koltuk

### `POST /tasks/:id/checklist`

Göreve adımları alt görev olarak ekler; elle ya da bir kontrol listesi şablonundan.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `templateId` | kimlik | isteğe bağlı |  |
| `items` | metin listesi | isteğe bağlı | en çok 50 öğe |

### `PUT /tasks/:id/watch`

Görevi takip eder: değişikliklerinden haberin olur.

### `DELETE /tasks/:id/watch`

Görevi takip etmeyi bırakır.

### `POST /tasks/:id/mute`

Bir görev için yorum bildirimlerini durdurur ya da yeniden açar.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `muted` | evet/hayır | zorunlu |  |

### `PUT /tasks/:id/portal`

Görevi portalda müşterisiyle paylaşır ya da paylaşmayı bırakır.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `shared` | evet/hayır | zorunlu |  |

### `GET /checklists`

Kontrol listesi şablonları.

### `POST /checklists`

Kontrol listesi şablonu kaydeder.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `items` | metin listesi | zorunlu | en az 1 öğe; en çok 50 öğe |

### `DELETE /checklists/:id`

Kontrol listesi şablonunu siler.

**Gerekenler:** yazabilen bir koltuk

### `GET /views`

Bir panodaki kayıtlı görünümlerin (filtreler, gruplama, sıra).

**Sorgu:** `board`

### `POST /views`

Görünüm kaydeder.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `boardId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `name` | metin | zorunlu | en az 1 karakter; en çok 80 karakter |
| `filters` | nesne | zorunlu |  |
| `shared` | evet/hayır | isteğe bağlı |  |

### `PATCH /views/:id`

Kayıtlı görünümü değiştirir.

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 80 karakter |
| `filters` | nesne | isteğe bağlı |  |
| `shared` | evet/hayır | isteğe bağlı |  |

### `DELETE /views/:id`

Kayıtlı görünümü siler.
