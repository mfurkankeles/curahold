---
title: Başvuru: ortak planlar
section: reference
order: 27
summary: Şirketin kendi başlangıç planı, müşterileri için yürüttüğü planlar, şablonları ve paylaşılan ilerleme raporu.
---
# Başvuru: ortak planlar

Ortak plan iki tarafın ortak planıdır: `vendor` (şirketin kendi planında Curahold; bir müşterinin planında şirket) ve `customer`. Adımlar aşamalarda durur, birbirini bekler (`dependsOn`) ve çoğu ürünün gördüğüyle kendiliğinden tamamlanır (`signal`). Her değişiklik, sunucunun hesapladığı planın tamamıyla cevaplanır: ağırlıklı tamamlanma, sıranın kimde olduğu, takılma işaretleri, kaynaklarıyla sağlık sinyalleri. Bir planı okumak önce onu bu sinyallerle ilerletir.

> Bu sayfa ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır. Biçimler şurada: [Nesneler](/docs/tr/ref-objects/).

## Bütün adresler

| | |
| --- | --- |
| `GET /onboarding/self` | Şirketin kendi başlangıç planı. |
| `GET /onboarding/self/summary` | O planın yalnızca başlığı: ağırlıklı tamamlanma ve sıradaki adım. |
| `GET /onboarding/settings` | Şirketin ortak plan ayarları: fırsat kazanılınca taslak plan açın (`fromHandover`, açılana kadar kapalı), açılacak şablon (`templateId`: bir şablonun kimliği, hazır bir şablonun anahtarı ya da her seferinde sormak için `ask`) ve isteğe bağlı kurallar (`rules`: bir müşteri alanı ve değeri → bir şablon; ilk uyan geçerli). |
| `PUT /onboarding/settings` | Bu ayarları değiştirir (şirket ayarlarını değiştirebilen kişi). |
| `GET /onboarding-plans` | Görebildiğiniz tüm müşteri planları; ilerleme, bekleme günleri ve takılma işaretleriyle. |
| `POST /onboarding-plans` | Bir müşteri (`accountId`) için şablondan plan açar (`templateId`: şablon kimliği ya da yerleşik anahtar; yoksa şirketin varsayılanı). |
| `GET /onboarding-plans/:id` | Bir planın tamamı: adımlar, iki tarafın kişileri, hedefler, ortak sorunlar, veri eşleme tablosu, şubeler, önce/sonra rakamları, sağlık sinyalleri ve şirketin kendi planında kurulum testlerinin durumu. |
| `PATCH /onboarding-plans/:id` | Planın adını, durumunu, sorumlusunu, karşılama metnini, devir notunu, hedef gününü ya da müşterinin portalda görüp görmediğini (`portalVisible`) değiştirir. |
| `POST /onboarding-plans/:id/finish` | Planı bitirir: bugünkü sağlık skoru ve rakamlar başlangıç değeri olarak saklanır; Onboarding'de yaşayan plan Müşteri Başarısı'na bir devir kartı verir (`handoverId`). |
| `GET /onboarding-plans/:id/report` | Plandan kurulan ilerleme raporu: tamamlanma, aşamalar, kimin beklendiği, sıradaki üç adım, açık sorunlar, veri kuralları, kurulum testleri, hedefler ve rakamlar. |
| `POST /onboarding-plans/:id/share` | O rapora salt okunur bir bağlantı oluşturur (`url`; gizli kısım bir kez gösterilir). |
| `DELETE /onboarding-plans/:id/share` | Rapor bağlantısını kapatır. |
| `GET /share/onboarding/:secret` | Paylaşılan rapor, giriş gerekmeden: yalnızca raporun gösterdiği; not ve iletişim bilgisi yok. |
| `POST /onboarding-plans/:id/steps` | Kendi adımınızı ekler (`title`, `phase`, `side`; isteğe bağlı `dueOn`, `after`, `required`). |
| `PATCH /onboarding-steps/:id` | Bir adımı değiştirir: durum, sorumlu (`ownerId`) ya da müşterinin kişisi (`personId`), tarihler, gecikme nedeni, metin, zorunluluk. |
| `DELETE /onboarding-steps/:id` | Bir adımı siler; onu bekleyen adımlar artık beklemez. |
| `PUT /onboarding-plans/:id/phases` | Planın aşamaları sırasıyla (`phases`: `key` ve `name`; yeni bir aşama için `key` verilmez, o zaman adı gerekir). |
| `PUT /onboarding-plans/:id/steps/order` | Adımları bir aşamada bu sıraya koyar (`phase`, `ids`); başka bir aşamadaki adım bu aşamaya geçer. |
| `POST /onboarding-plans/:id/template` | Şablonunu bekleyen kazanılmış müşteri taslağı (`ask`): seçilen şablondan (`templateId`) yeniden oluşturur. |
| `POST /onboarding-steps/:id/answer` | Bir adımın kısa formu: adımın adını verdiği müşteri alanları için `values` müşterinin kaydına yazılır, sonra adım tamamlanır. |
| `POST /onboarding-steps/:id/files` | Bir adıma dosya ekler (multipart `file`); diğerleri gibi bir dosyadır ve `GET /files/:id` ile indirilir. |
| `POST /onboarding-steps/:id/request` | Adım ürün işini bekliyor: onu bir işe (`storyId`) bir müşteri isteği daha olarak bağlar; Ürün'ün iş listesi bunu sayar. |
| `POST /onboarding-plans/:id/people` | Bir tarafa kişi ekler (`side`, `name`, `role`, `duty`, `contact`; isteğe bağlı `userId`). |
| `PATCH /onboarding-people/:id` | Plandaki bir kişiyi değiştirir. |
| `DELETE /onboarding-people/:id` | Bir kişiyi plandan çıkarır. |
| `POST /onboarding-plans/:id/goals` | Hedef ekler (`title`, `priority`, `targetOn`; isteğe bağlı `proofUrl`). |
| `PATCH /onboarding-goals/:id` | Bir hedefi değiştirir; `status: done` ulaşıldığı günü kaydeder. |
| `DELETE /onboarding-goals/:id` | Bir hedefi siler. |
| `POST /onboarding-plans/:id/issues` | Ortak bir sorun bildirir: konu, ayrıntı, hamlenin kimde olduğu (`side`), tür, aciliyet, son gün, ilgili adım. |
| `PATCH /onboarding-issues/:id` | Bir sorunu değiştirir, diğer tarafa geçirir ya da çözer (`status: resolved`). |
| `POST /onboarding-issues/:id/ticket` | Sorunu müşterinin destek talebine bağlar (`recordId`; bağı kaldırmak için `null`). |
| `DELETE /onboarding-issues/:id` | Bir sorunu siler. |
| `POST /onboarding-plans/:id/fields` | Veri eşleme tablosuna satır ekler: alan, hedef, tür, zorunluluk, örnek, gelen değer. |
| `PATCH /onboarding-fields/:id` | Bir satırı değiştirir, geleni kaydeder (`received`; dört kural bunun üzerinde çalışır) ya da işaretler: `checked` (müşteri doğru görünüyor der) ve `verified` (sizin tarafınız kontrol etti). |
| `DELETE /onboarding-fields/:id` | Veri eşleme tablosundan bir satırı siler. |
| `POST /onboarding-plans/:id/sites` | Yayılıma bir şube ekler (`name`, `region`, `stages`). |
| `PATCH /onboarding-sites/:id` | Bir şubeyi ya da bir aşamadaki durumunu değiştirir (`stages: { "<aşama>": "todo\|doing\|done\|na" }`). |
| `DELETE /onboarding-sites/:id` | Bir şubeyi kaldırır. |
| `PATCH /onboarding-metrics/:id` | Önce/sonra rakamı: `baseline` (eski yöntem), `current`, `target` ve yükseğin mi daha iyi olduğu. |
| `GET /onboarding-templates` | Yerleşik şablonlar (kopyalamak için) ve şirketin kendi şablonları; her birinin kaç kez kullanıldığı ve tamamlandığıyla. |
| `POST /onboarding-templates` | Şablon oluşturur: yerleşik birinden (`from: "standard"`), şirketin kendi şablonunun kopyasından (`from: <kimlik>`), süren bir plandan (`fromPlan`) ya da yazılarak (`blueprint`). |
| `PATCH /onboarding-templates/:id` | Bir şablonun adını, özetini ya da adımlarını değiştirir; ondan yapılmış planlar kendilerininkini korur. |
| `DELETE /onboarding-templates/:id` | Bir şablonu kaldırır. |

## Ayrıntılar

### `GET /onboarding/self`

Şirketin kendi başlangıç planı. Bir yöneticinin ilk ziyareti onu açar; şirketteki herkes okuyabilir.

### `GET /onboarding/self/summary`

O planın yalnızca başlığı: ağırlıklı tamamlanma ve sıradaki adım.

### `GET /onboarding/settings`

Şirketin ortak plan ayarları: fırsat kazanılınca taslak plan açın (`fromHandover`, açılana kadar kapalı), açılacak şablon (`templateId`: bir şablonun kimliği, hazır bir şablonun anahtarı ya da her seferinde sormak için `ask`) ve isteğe bağlı kurallar (`rules`: bir müşteri alanı ve değeri → bir şablon; ilk uyan geçerli). E-posta hatırlatmaları her kişinin kendi tercihidir (`prefs.events.onboarding`).

### `PUT /onboarding/settings`

Bu ayarları değiştirir (şirket ayarlarını değiştirebilen kişi).

**Gerekenler:** yazabilen bir koltuk · yetki `org.manage`

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `fromHandover` | evet/hayır | isteğe bağlı |  |
| `templateId` | metin | isteğe bağlı | en çok 60 karakter; boş (null) olabilir |
| `rules` | nesne listesi | isteğe bağlı | en çok MAX_TEMPLATE_RULES öğe |

### `GET /onboarding-plans`

Görebildiğiniz tüm müşteri planları; ilerleme, bekleme günleri ve takılma işaretleriyle. `account` tek müşteriye, `open=1` sürenlere indirir.

**Sorgu:** `account`, `open`

### `POST /onboarding-plans`

Bir müşteri (`accountId`) için şablondan plan açar (`templateId`: şablon kimliği ya da yerleşik anahtar; yoksa şirketin varsayılanı). Müşteri başına bir süren plan.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `accountId` | kimlik | zorunlu |  |
| `templateId` | metin | isteğe bağlı | en çok 60 karakter; boş (null) olabilir |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 160 karakter |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `startOn` | tarih (YYYY-AA-GG) | isteğe bağlı |  |

### `GET /onboarding-plans/:id`

Bir planın tamamı: adımlar, iki tarafın kişileri, hedefler, ortak sorunlar, veri eşleme tablosu, şubeler, önce/sonra rakamları, sağlık sinyalleri ve şirketin kendi planında kurulum testlerinin durumu.

### `PATCH /onboarding-plans/:id`

Planın adını, durumunu, sorumlusunu, karşılama metnini, devir notunu, hedef gününü ya da müşterinin portalda görüp görmediğini (`portalVisible`) değiştirir.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 160 karakter |
| `status` | şunlardan biri: draft \| active \| paused \| cancelled | isteğe bağlı |  |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `welcome` | metin | isteğe bağlı | en çok 4000 karakter |
| `note` | metin | isteğe bağlı | en çok 8000 karakter |
| `targetOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `portalVisible` | evet/hayır | isteğe bağlı |  |

### `POST /onboarding-plans/:id/finish`

Planı bitirir: bugünkü sağlık skoru ve rakamlar başlangıç değeri olarak saklanır; Onboarding'de yaşayan plan Müşteri Başarısı'na bir devir kartı verir (`handoverId`).

**Gerekenler:** yazabilen bir koltuk

### `GET /onboarding-plans/:id/report`

Plandan kurulan ilerleme raporu: tamamlanma, aşamalar, kimin beklendiği, sıradaki üç adım, açık sorunlar, veri kuralları, kurulum testleri, hedefler ve rakamlar.

### `POST /onboarding-plans/:id/share`

O rapora salt okunur bir bağlantı oluşturur (`url`; gizli kısım bir kez gösterilir). Yeniden paylaşmak eski bağlantının yerini alır.

**Gerekenler:** yazabilen bir koltuk

### `DELETE /onboarding-plans/:id/share`

Rapor bağlantısını kapatır.

**Gerekenler:** yazabilen bir koltuk

### `GET /share/onboarding/:secret`

Paylaşılan rapor, giriş gerekmeden: yalnızca raporun gösterdiği; not ve iletişim bilgisi yok.

### `POST /onboarding-plans/:id/steps`

Kendi adımınızı ekler (`title`, `phase`, `side`; isteğe bağlı `dueOn`, `after`, `required`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | zorunlu | en az 1 karakter; en çok 200 karakter |
| `body` | metin | isteğe bağlı | en çok 2000 karakter; default  |
| `phase` | metin | zorunlu |  |
| `side` | şunlardan biri: vendor \| customer \| both | zorunlu |  |
| `dueOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `after` | metin listesi | isteğe bağlı | en çok 10 öğe; varsayılan [] |
| `required` | evet/hayır | isteğe bağlı | varsayılan true |

### `PATCH /onboarding-steps/:id`

Bir adımı değiştirir: durum, sorumlu (`ownerId`) ya da müşterinin kişisi (`personId`), tarihler, gecikme nedeni, metin, zorunluluk. Ürünün kendisi tamamladığı adım elle işaretlenemez (`400`), başka adımı bekleyen adım da (`409`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `status` | şunlardan biri: todo \| doing \| done \| blocked \| skipped | isteğe bağlı |  |
| `ownerId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `personId` | kimlik | isteğe bağlı | boş (null) olabilir |
| `startOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `dueOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `delayReason` | metin | isteğe bağlı | en çok 500 karakter |
| `title` | metin | isteğe bağlı | en az 1 karakter; en çok 200 karakter |
| `body` | metin | isteğe bağlı | en çok 2000 karakter |
| `required` | evet/hayır | isteğe bağlı |  |

### `DELETE /onboarding-steps/:id`

Bir adımı siler; onu bekleyen adımlar artık beklemez.

**Gerekenler:** yazabilen bir koltuk

### `PUT /onboarding-plans/:id/phases`

Planın aşamaları sırasıyla (`phases`: `key` ve `name`; yeni bir aşama için `key` verilmez, o zaman adı gerekir). Yalnızca bu planın aşamalarını yeniden adlandırır, sıralar, ekler ya da kaldırır; şablonuna dokunmaz. İçinde adım kalan bir aşama kaldırılamaz (`409`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `phases` | nesne listesi | zorunlu | en az 1 öğe; en çok MAX_PHASES öğe |

### `PUT /onboarding-plans/:id/steps/order`

Adımları bir aşamada bu sıraya koyar (`phase`, `ids`); başka bir aşamadaki adım bu aşamaya geçer.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `phase` | metin | zorunlu |  |
| `ids` | kimlik listesi | zorunlu | en az 1 öğe; en çok 200 öğe |

### `POST /onboarding-plans/:id/template`

Şablonunu bekleyen kazanılmış müşteri taslağı (`ask`): seçilen şablondan (`templateId`) yeniden oluşturur. Yeni planı döner.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `templateId` | metin | zorunlu | en az 1 karakter; en çok 60 karakter |

### `POST /onboarding-steps/:id/answer`

Bir adımın kısa formu: adımın adını verdiği müşteri alanları için `values` müşterinin kaydına yazılır, sonra adım tamamlanır.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `values` | nesne (ad → değer) | zorunlu |  |

### `POST /onboarding-steps/:id/files`

Bir adıma dosya ekler (multipart `file`); diğerleri gibi bir dosyadır ve `GET /files/:id` ile indirilir.

**Gerekenler:** yazabilen bir koltuk

### `POST /onboarding-steps/:id/request`

Adım ürün işini bekliyor: onu bir işe (`storyId`) bir müşteri isteği daha olarak bağlar; Ürün'ün iş listesi bunu sayar.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `storyId` | kimlik | zorunlu |  |
| `note` | metin | isteğe bağlı | en çok 2000 karakter |

### `POST /onboarding-plans/:id/people`

Bir tarafa kişi ekler (`side`, `name`, `role`, `duty`, `contact`; isteğe bağlı `userId`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `side` | şunlardan biri: SIDES | zorunlu |  |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `role` | şunlardan biri: ROLES | isteğe bağlı | varsayılan other |
| `duty` | metin | isteğe bağlı | en çok 300 karakter; default  |
| `contact` | metin | isteğe bağlı | en çok 200 karakter; default  |
| `userId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `PATCH /onboarding-people/:id`

Plandaki bir kişiyi değiştirir. Yalnızca gönderdiğiniz alanlar değişir.

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `DELETE /onboarding-people/:id`

Bir kişiyi plandan çıkarır.

**Gerekenler:** yazabilen bir koltuk

### `POST /onboarding-plans/:id/goals`

Hedef ekler (`title`, `priority`, `targetOn`; isteğe bağlı `proofUrl`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | zorunlu | en az 1 karakter; en çok 200 karakter |
| `priority` | şunlardan biri: GOAL_PRIORITIES | isteğe bağlı | varsayılan must |
| `status` | şunlardan biri: GOAL_STATUSES | isteğe bağlı | varsayılan planned |
| `targetOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `doneOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `proofUrl` | metin | isteğe bağlı | en çok 500 karakter; boş (null) olabilir |

### `PATCH /onboarding-goals/:id`

Bir hedefi değiştirir; `status: done` ulaşıldığı günü kaydeder.

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `DELETE /onboarding-goals/:id`

Bir hedefi siler.

**Gerekenler:** yazabilen bir koltuk

### `POST /onboarding-plans/:id/issues`

Ortak bir sorun bildirir: konu, ayrıntı, hamlenin kimde olduğu (`side`), tür, aciliyet, son gün, ilgili adım.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | zorunlu | en az 1 karakter; en çok 200 karakter |
| `body` | metin | isteğe bağlı | en çok 4000 karakter; default  |
| `side` | şunlardan biri: SIDES | isteğe bağlı | varsayılan vendor |
| `type` | şunlardan biri: ISSUE_TYPES | isteğe bağlı | varsayılan question |
| `urgency` | şunlardan biri: URGENCIES | isteğe bağlı | varsayılan normal |
| `dueOn` | tarih (YYYY-AA-GG) | isteğe bağlı | boş (null) olabilir |
| `stepId` | kimlik | isteğe bağlı | boş (null) olabilir |

### `PATCH /onboarding-issues/:id`

Bir sorunu değiştirir, diğer tarafa geçirir ya da çözer (`status: resolved`).

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `POST /onboarding-issues/:id/ticket`

Sorunu müşterinin destek talebine bağlar (`recordId`; bağı kaldırmak için `null`). Talep kopyalanmaz; çözülünce sorun da çözülür.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `recordId` | kimlik | zorunlu | boş (null) olabilir |

### `DELETE /onboarding-issues/:id`

Bir sorunu siler. Geçmeyen kurulum testinin sorunu silinemez (`409`): test geçince çözülür.

**Gerekenler:** yazabilen bir koltuk

### `POST /onboarding-plans/:id/fields`

Veri eşleme tablosuna satır ekler: alan, hedef, tür, zorunluluk, örnek, gelen değer.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `target` | metin | isteğe bağlı | en çok 120 karakter; default  |
| `type` | şunlardan biri: FIELD_TYPES | isteğe bağlı | varsayılan text |
| `required` | evet/hayır | isteğe bağlı | varsayılan false |
| `example` | metin | isteğe bağlı | en çok 300 karakter; default  |
| `received` | metin | isteğe bağlı | en çok 300 karakter; boş (null) olabilir |
| `proofUrl` | metin | isteğe bağlı | en çok 500 karakter; boş (null) olabilir |

### `PATCH /onboarding-fields/:id`

Bir satırı değiştirir, geleni kaydeder (`received`; dört kural bunun üzerinde çalışır) ya da işaretler: `checked` (müşteri doğru görünüyor der) ve `verified` (sizin tarafınız kontrol etti).

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `DELETE /onboarding-fields/:id`

Veri eşleme tablosundan bir satırı siler.

**Gerekenler:** yazabilen bir koltuk

### `POST /onboarding-plans/:id/sites`

Yayılıma bir şube ekler (`name`, `region`, `stages`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `region` | metin | isteğe bağlı | en çok 80 karakter; default  |
| `stages` | değer | isteğe bağlı | varsayılan {} |

### `PATCH /onboarding-sites/:id`

Bir şubeyi ya da bir aşamadaki durumunu değiştirir (`stages: { "<aşama>": "todo|doing|done|na" }`).

**Gerekenler:** yazabilen bir koltuk

Biçimi gönderilene göre değişen bir gövde alır; bu alanın rehberine bakın.

### `DELETE /onboarding-sites/:id`

Bir şubeyi kaldırır.

**Gerekenler:** yazabilen bir koltuk

### `PATCH /onboarding-metrics/:id`

Önce/sonra rakamı: `baseline` (eski yöntem), `current`, `target` ve yükseğin mi daha iyi olduğu.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `title` | metin | isteğe bağlı | en az 1 karakter; en çok 120 karakter |
| `unit` | metin | isteğe bağlı | en çok 20 karakter |
| `baseline` | n | zorunlu |  |
| `current` | n | zorunlu |  |
| `target` | n | zorunlu |  |
| `better` | şunlardan biri: up \| down | isteğe bağlı |  |

### `GET /onboarding-templates`

Yerleşik şablonlar (kopyalamak için) ve şirketin kendi şablonları; her birinin kaç kez kullanıldığı ve tamamlandığıyla.

### `POST /onboarding-templates`

Şablon oluşturur: yerleşik birinden (`from: "standard"`), şirketin kendi şablonunun kopyasından (`from: <kimlik>`), süren bir plandan (`fromPlan`) ya da yazılarak (`blueprint`).

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | zorunlu | en az 1 karakter; en çok 120 karakter |
| `summary` | metin | isteğe bağlı | en çok 1000 karakter; default  |
| `kind` | şunlardan biri: self \| client | isteğe bağlı |  |
| `from` | metin | isteğe bağlı | en çok 60 karakter |
| `fromPlan` | kimlik | isteğe bağlı |  |
| `blueprint` | nesne | isteğe bağlı |  |

### `PATCH /onboarding-templates/:id`

Bir şablonun adını, özetini ya da adımlarını değiştirir; ondan yapılmış planlar kendilerininkini korur.

**Gerekenler:** yazabilen bir koltuk

| Alan | Tür | | Not |
| --- | --- | --- | --- |
| `name` | metin | isteğe bağlı | en az 1 karakter; en çok 120 karakter |
| `summary` | metin | isteğe bağlı | en çok 1000 karakter |
| `blueprint` | nesne | isteğe bağlı |  |

### `DELETE /onboarding-templates/:id`

Bir şablonu kaldırır.

**Gerekenler:** yazabilen bir koltuk
