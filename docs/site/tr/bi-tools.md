---
title: BI aracı bağlama
section: help
order: 8.5
summary: Power BI, Excel, Fabric, Tableau, Looker Studio, Qlik, Zoho Analytics ve diğerleri, adım adım, bir analiz anahtarıyla.
---
# BI aracı bağlama

Curahold'da BI araçları için yalnızca okunabilen tek bir **analiz akışı** var. Power BI, Excel, Microsoft Fabric, Tableau, Qlik ve Zoho Analytics onu **OData akışı** olarak okur; Looker Studio, betikler ve diğer araçlar aynı verileri **JSON ya da CSV** olarak alır. Bu yoldan Curahold'da hiçbir şey değiştirilemez.

Aşağıdaki menü adları araçların İngilizce arayüzündeki gibidir; Türkçe arayüzde karşılıklarını seçin.

## Başlamadan önce {#key}

Veri dışa aktarma iznin olmalı (yöneticilerde ve müdürlerde vardır).

1. **Ayarlar → Analiz ve BI**'ı açın ve **Yeni analiz anahtarı**'na tıklayın. Bir ad verin (ör. "Power BI satış panosu"), okuyabileceği veri kümelerini ve departmanları, bir de bitiş tarihini seçin ve oluşturun. Anahtarı hemen kopyalayın: yalnızca bir kez gösterilir ve `chb_` ile başlar.
   ![Yeni analiz anahtarı düğmesi işaretli](img/bi-new.webp)
2. Aynı sayfada **BI araçları için analiz akışı** altında, aracınızın istediği adresin yanındaki **Kopyala**'ya tıklayın. Şirketinizin adresiyle şöyle görünürler:
   ![İki akış adresi ve Kopyala düğmeleri işaretli](img/bi-feed.webp)

OData akışı (Power BI, Excel, Fabric, Tableau, Qlik, Zoho Analytics):

```text
https://sirketiniz.curahold.com/api/analytics/odata/
```

JSON ve CSV (Looker Studio, betikler, diğer araçlar):

```text
https://sirketiniz.curahold.com/api/analytics/v1/
```

Araç nasıl giriş yapacağını sorduğunda **Basic**'i seçin: kullanıcı adına herhangi bir şey yazın, parola olarak anahtarı yapıştırın.

Anahtar, Curahold'da sizin gördüğünüzü okur: aynı müşteriler, panolar ve alanlar. Rolünüzün göremediği bir alan sütun olarak bile gelmez. Şirketten ayrılırsanız ya da dışa aktarma izninizi kaybederseniz anahtar durur. **Gizli değeri yenile** aynı anahtara yeni bir değer verir; **İptal et** onu hemen sonlandırır.

## Veri kümeleri

| Veri kümesi | İçinde ne var |
| --- | --- |
| `Customers` | Her müşteri için bir satır; görebildiğiniz her müşteri alanı ayrı bir sütun |
| `Renewals` | Yenileme tarihi olan müşteriler: değer, sağlık ve açık yenileme fırsatları |
| `HealthHistory` | Her müşterinin her günkü sağlık skoru |
| `Opportunities` | Satış hunisi: tutar, aşama, durum, kapanış tarihi |
| `Tickets` | Destek talepleri |
| `Contacts` | Müşterilerindeki kişiler |
| `Records…` | Eklediğiniz her kayıt türü için bir veri kümesi (sözleşmeler, riskler…) |
| `Boards`, `Tasks`, `TaskAssignees` | Panolar, görevleri ve her görev-atanan kişi için bir satır |
| `Sprints`, `SprintBurndown` | Sprintler ile günlük kapsam ve kalan iş |
| `People` | Ad ve rol; sahip ve atanan kimliklerine ad koymak için |

Her veri kümesinde `Id` ve `ModifiedAt` (satırın son değiştiği an) bulunur. Çoğunda `IsDeleted` de var: arşivlenen satırlar akışta `IsDeleted = true` ile kalır, böylece bir yenileme onları raporlarından çıkarabilir. Veri kümelerini kimlik sütunlarıyla birleştir: `Tasks.CustomerId` → `Customers.Id`, `Tasks.BoardId` → `Boards.Id`, `OwnerId` → `People.Id`.

## Power BI

1. Power BI Desktop'ta **Get data → OData feed**'i seçin.
2. OData adresini yapıştırın ve **OK**'e basın.
3. **Basic**'i seçin. Kullanıcı adı: herhangi bir şey. Parola: analiz anahtarınız. **Connect**'e basın.
4. Navigator'da istediğiniz veri kümelerini işaretleyin ve **Load**'a basın (önce sütun çıkarmak için **Transform data**).
5. Yayımladıktan sonra semantik modelin **Settings → Data source credentials** bölümünde yine **Basic** ve anahtarla giriş yapın, **scheduled refresh**'i açın.

Power BI hizmeti Basic giriş için ağ geçidi (gateway) isterse anahtarı **Web API key** olarak kullanın: **Transform data → Advanced editor**'da kaynağı `OData.Feed("https://sirketiniz.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])` diye yazın; Power BI sorunca **Web API**'yi seçip anahtarı yapıştırın.

**Büyük veri kümeleri.** Artımlı yenileme için aralığı adrese yazın; Curahold göndermeden önce süzer:

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://sirketiniz.curahold.com/api/analytics/odata/Tasks?$filter=CreatedAt ge " & Start & " and CreatedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

Sonra tablonun artımlı yenileme kuralını her zamanki gibi ayarlayın ve `ModifiedAt` sütunuyla **Detect data changes**'i işaretleyin; böylece satırları değişen bir dönem yeniden okunur.

## Excel

1. Windows için Excel'de **Data → Get Data → From Other Sources → From OData Feed**'i seçin.
2. OData adresini yapıştırın ve **OK**'e basın.
3. **Basic**'i seçin, herhangi bir kullanıcı adı yazın, parola olarak anahtarı yapıştırın, **Connect**'e basın.
4. Navigator'da veri kümelerini seçin ve **Load**'a basın.
5. **Data → Refresh All** ne zaman isterseniz en güncel veriyi getirir.

## Microsoft Fabric

1. Çalışma alanında **New item → Dataflow Gen2**'yi, sonra **Get data → OData**'yı seçin.
2. OData adresini yapıştırın. Bağlantı kimlik bilgilerinde **Basic**'i seçin: herhangi bir kullanıcı adı, parola olarak anahtar.
3. Veri kümelerini seçin, gerekirse düzenleyin ve bir **data destination** (lakehouse ya da warehouse) ekleyin.
4. **Publish**'e basın, sonra veri akışına bir yenileme takvimi koyun.

Bir veri hattının **Copy activity**'si de aynı akışı OData bağlayıcısı ve Basic girişle okuyabilir.

## Tableau

1. Tableau Desktop'ta **Connect → To a Server → OData**'yı seçin.
2. Sunucu olarak tek bir veri kümesinin adresini yapıştırın, ör. `https://sirketiniz.curahold.com/api/analytics/odata/Customers`.
3. **Use username and password**'ü seçin: herhangi bir kullanıcı adı, parola olarak anahtar. **Sign In**'e basın.
4. Tableau OData'yı **extract** olarak okur. İstediğiniz her veri kümesi için bir OData bağlantısı daha ekleyin ve kimlik sütunlarıyla ilişkilendirin.
5. Tableau Cloud'a ya da Server'a yayımlarken kimlik bilgilerini gömün ve bir extract yenileme takvimi koyun.

## Looker Studio

Looker Studio'nun böyle bir akışı okuması için bir bağlayıcı gerekir. **Curahold'un kendi Looker Studio bağlayıcısı yakında.** O zamana kadar:

1. Yeni bir Google E-Tablosu'nda A1 hücresine şunu yazın: `=IMPORTDATA("https://sirketiniz.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=ANAHTARINIZ")`.
2. Looker Studio'da **Create → Data source → Google Sheets**'i seçin ve o tabloyu gösterin.
3. Bunun için ayrı bir anahtar oluşturun ve yalnızca tablonun ihtiyaç duyduğu veri kümeleriyle sınırlayın: tabloyu düzenleyebilen herkes formüldeki anahtarı görebilir. Tablo fazla kişiyle paylaşılırsa anahtarı Curahold'da iptal edin.

Bir tabloyu **CRM ve tablolar** (Ayarlar → CRM ve tablolar) ile güncel tutup Looker Studio'da o tabloyu da kullanabilirsiniz.

## Qlik

1. Qlik Sense ya da Qlik Cloud'da **Add data → OData**'yı (ya da **Create new connection → OData**) seçin.
2. OData adresini yapıştırın, kimlik doğrulamada **Basic**'i seçin: herhangi bir kullanıcı adı, parola olarak anahtar.
3. Veri kümelerini seçip yükleyin; yeniden yüklemeyi uygulamanın ayarlarından takvime bağlayın.

Qlik'in REST bağlayıcısı da JSON adresiyle (`…/api/analytics/v1/Customers.json`) çalışır: Basic giriş ve `next` alanı üzerinden "next URL" sayfalama.

## Zoho Analytics

1. **Create → New Workspace → Web URL / Feeds**'i (web akışından içe aktarma) seçin.
2. Tek bir veri kümesinin adresini yapıştırın: OData adresi (`…/api/analytics/odata/Customers`) ya da CSV adresi (`…/api/analytics/v1/Customers.csv`).
3. Kimlik doğrulamada **Basic**'i seçin: herhangi bir kullanıcı adı, parola olarak anahtar.
4. Sayfalama için **next page URL**'i seçin: OData'da `@odata.nextLink`, JSON'da `next`.
5. İçe aktarmanın ne sıklıkla yineleneceğini ayarlayın.

## Metabase / Superset

Metabase ve Superset web akışlarını değil veritabanlarını okur. Doğrudan bağlantı Curahold'un yakında gelecek **veri ambarına aktarma** özelliğiyle (BigQuery ya da Snowflake'e) mümkün olacak. O zamana kadar, kurulumunuz dosya yüklemeye izin veriyorsa `…/api/analytics/v1/<veri-kümesi>.csv` adresinden aldığınız CSV'yi yükleyin.

## Diğer araçlar ve betikler

JSON ve CSV adresi şunları alır:

| Seçenek | Anlamı |
| --- | --- |
| `limit` | Sayfa başına satır, en çok 5000 (varsayılan 1000) |
| `page` ya da `offset` | Sayfa numarasıyla ya da satırla sayfalama |
| `cursor` | Önceki sayfanın `next` değeri (büyük veri kümelerinde en hızlısı) |
| `since` | Yalnızca bu tarihte ya da sonrasında değişen satırlar, ör. `2026-11-01` |
| `fields` | Yalnızca bu sütunlar, ör. `Id,Name,ModifiedAt` |
| `filter`, `orderby` | OData `$filter` ve `$orderby` ile aynı ifadeler |
| `count=1` | Toplam satır sayısını da döndür |

Anahtarı Basic (parola) olarak ya da `Authorization: Bearer chb_…` ile gönderin. Bir JSON sayfası `{ "dataset": "Tasks", "rows": [...], "next": "…" }` biçimindedir; CSV sayfaları sonraki adresi `Link` başlığında verir. Domo, SAP Analytics Cloud, Quick BI ve FineBI gibi araçlar JSON ya da OData adresini aynı yolla okur.

OData akışı `$select`, `$filter` (`eq ne gt ge lt le`, `and`, `or`, `not`, `contains`, `startswith`, `endswith`), `$orderby`, `$top`, `$skip`, `$count` ve `/$count` anlar. `$expand` sunmaz: veri kümelerini kimlik sütunlarıyla birleştir.

## Yenileme ve sınırlar

- Büyük veri kümeleri 1.000 satırlık sayfalarla gelir; BI araçları sonraki sayfa bağlantısını kendileri izler.
- **Yalnızca değişenler:** `ModifiedAt` üzerinde süzün (`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`) ya da JSON'da `since` kullanın. `Prefer: odata.track-changes` başlığıyla son sayfa bir `@odata.deltaLink` de verir; o bağlantı sonradan yalnızca değişenleri döndürür.
- Her anahtar saniyede yaklaşık iki istek yapabilir ve her şirketin günlük bir satır kotası vardır. Aşılınca akış 429 döner ve ne zaman yeniden denenebileceğini söyler.
- Her okuma kaydedilir (kim, hangi anahtar, hangi veri kümesi, kaç satır) ve Ayarlar'da **Son çekimler** altında görünür.

## Bir şey ters giderse

- **401 / araç yeniden kimlik soruyor:** anahtar yanlış, iptal edilmiş ya da süresi dolmuş; ya da kullanıcı adı isteyen bir araçta bu alan boş bırakılmış: oraya herhangi bir şey yazın.
- **403:** anahtarın sahibinin artık veri dışa aktarma izni yok.
- **Bir veri kümesi için 404:** anahtar başka veri kümeleri ya da departmanlarla sınırlı, ya da veri kümesinin alanları sahibin rolüne kapalı.
- **Mesajlı 400:** sorgu akışın desteklemediği bir şey kullanıyor; mesaj onu söyler.
