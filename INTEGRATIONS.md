# Entegrasyonlar: durum, canlıya çıkış ve yol haritası

Araştırma tarihi: 12 Kasım 2026. Fiyat ve kurallar o gün okunan kaynaklardan; her
satırın kaynağı en altta. "Doğrulanacak" yazan yerler ilgili geliştirici hesabı
açılınca ilk iş olarak kontrol edilecek.

## Kısa cevap

Native entegrasyon yapabiliyoruz ve ürünün içinde var: kullanıcı kendi CRM'ine
giriş yapar, Curahold'a izin verir, neyin geleceğini ve hangi alanın nereye
yazılacağını seçer, eşitleme iki yönlü çalışır. Demoda görülen bilgilendirme
penceresi yalnızca demoya özeldi (demo tarayıcıda çalışır, gerçek bir hesaba
giriş yapamaz); artık demoda da aynı akış uydurma verili bir CRM ile çalışıyor.

Canlıya çıkmak için eksik olan kod değil, **her sağlayıcıda ürün sahibinin
açacağı geliştirici hesabı ve bazılarında onay süreci**.

## Bugün üründe olan

| Bağlayıcı | Giriş | Okur | Yazar | Not |
| --- | --- | --- | --- | --- |
| Salesforce | OAuth | her nesne, özel nesneler dahil | evet | sandbox seçilebilir |
| HubSpot | OAuth | şirket, kişi, anlaşma, özel nesneler | evet | |
| Dynamics 365 | OAuth (Microsoft) | her tablo | evet | kurum adresi sorulur |
| Pipedrive | OAuth | kurum, kişi, anlaşma | evet | |
| Zoho CRM | OAuth | her modül | evet | veri merkezi kendiliğinden bulunur |
| Google Sheets, Excel | OAuth | seçilen tablo | evet | satır anahtarı seçilir |
| Zendesk, Freshdesk, Intercom, Jira Service Management | anahtar | destek kayıtları | hayır | |
| Açık API ve webhook'lar | API anahtarı | | | listede olmayan her araç için |

Eşitleme bugün saatte bir çeker, Curahold'da yapılan değişikliği hemen yazar.
CRM'den anlık bildirim (webhook) henüz yok; "Gerçek zamanlılık" paketinde.

## Canlıya çıkmak için sağlayıcı başına gerekenler

| Sağlayıcı | Açılacak hesap | Onay | Ücret | Sınır |
| --- | --- | --- | --- | --- |
| Salesforce | Partner hesabı (ücretsiz) | müşterinin yöneticisi uygulamayı kurar; listeleme isteğe bağlı | güvenlik incelemesi: ücretli uygulamada başvuru başına $999, ücretsizde $0 | aşağıdaki dört güvenlik kontrolü zorunlu |
| HubSpot | Geliştirici hesabı (ücretsiz) | listelenmeden 25 kuruluma kadar; listelenince sınırsız | listeleme ücretsiz, gelir payı yok | listeleme için 3 ayrı hesapta kurulum, gizlilik ve şartlar sayfası, demo videosu |
| Pipedrive | Geliştirici (sandbox) hesabı | özel uygulama onaysız, doğrudan kurulum linkiyle; Marketplace için inceleme (21 iş gününe kadar) | yok | günlük istek bütçesi müşterinin planına bağlı |
| Zoho CRM | API Console kaydı | yok | yok | istek kredisi müşterinin planından |
| Dynamics 365 | Microsoft Entra'da çok kiracılı uygulama + Microsoft partner hesabı | yayıncı doğrulaması (ücretsiz); doğrulanmamış uygulamaya çoğu kurumda yalnızca yönetici izin verebilir | yok | |
| Google Sheets | Google Cloud projesi | Google OAuth doğrulaması | yok | (zaten yapılacaklar listesinde) |

### Salesforce: en çok dikkat isteyen

1. **Yeni "connected app" açılamıyor.** Spring '26 sürümünden beri varsayılan
   olarak kapalı; yerine "External Client App" kullanılıyor. Birden çok müşteriye
   dağıtım, ikinci nesil yönetilen paket (2GP) ile yapılıyor.
2. **Kurulmamış uygulamaya giriş engelli.** Eylül 2025'ten beri bir kullanıcı,
   kurumuna kurulmamış bir uygulamaya kendi başına izin veremiyor (özel bir
   yetkisi yoksa). Pratikte: müşterinin Salesforce yöneticisi bizim paketimizi
   bir kez kurar, sonra bağlantı normal çalışır. Bağlantı ekranımız bunu açıkça
   söylemeli ve kurulum linkini vermeli.
3. **Dört zorunlu güvenlik kontrolü** (11 Mayıs 2026'dan beri; ikiden fazla
   müşteri kurumunda kullanılan partner uygulamaları için): PKCE, yenileme
   anahtarının her kullanımda değişmesi, 30 gün kullanılmayan anahtarın
   düşmesi, yenileme isteklerinin belirli IP adreslerinden gelmesi.
   - Bizde hazır: anahtar değişimini kaydediyoruz.
   - Eksik: PKCE (küçük iş) ve **sabit çıkış IP adresi**. Cloudflare Workers
     varsayılan olarak sabit adresle çıkmaz (doğrulanacak). Seçenekler aşağıda.
4. **AppExchange'te listelenmek şart değil**, ama Salesforce güvenlik
   incelemesini paketlenmiş uygulamalar üzerinden yürütmeye gidiyor. İnceleme
   4–9 hafta sürüyor. Yıllık listeleme ücreti konusunda kaynaklar çelişiyor
   (bazıları yılda $150 diyor, bazıları 2023'te kaldırıldığını); partner hesabı
   açılınca sorulacak.

### HubSpot

Yeni geliştirici platformunda açılan uygulama, Marketplace'te listelenene kadar
en çok 25 hesaba kurulabiliyor. Listeleme ücretsiz. İlk üç müşteri kurulumundan
sonra başvurmak yeterli; o zamana kadar sınır bizi durdurmaz.

### Pipedrive

Özel uygulama onay istemiyor ve herhangi bir Pipedrive hesabına doğrudan
linkle kurulabiliyor; bununla başlanır. Pipedrive istekleri müşterinin günlük
bütçesinden düşüyor, webhook'lar düşmüyor: anlık bildirime geçince hem hızlanır
hem müşterinin bütçesini harcamayız.

## Listede olmayan CRM'ler için yol

Pazar dağınık: Salesforce yaklaşık %20–22, HubSpot %5–6, Dynamics %4–5, Zoho
%3–4; kalan yarıdan fazlası yüzlerce küçük CRM'e bölünmüş. Hepsine tek tek
bağlayıcı yazmak gerekmiyor; üç katmanlı yol yeterli.

**1. Kendi bağlayıcılarımız (önerilen ana yol).** Bağlayıcı sözleşmesi hazır;
yeni bir CRM yaklaşık 200 satır ve bir test dosyası. Maliyeti sıfır, marjı
bozmaz. Sıradaki adaylar, hedef kitleye göre:

| Aday | Neden | Giriş |
| --- | --- | --- |
| Bitrix24 | Türkiye ve çevre pazarlarda yaygın | OAuth |
| Freshsales | küçük ve orta ekiplerde yaygın | API anahtarı ya da OAuth |
| Zendesk Sell | destek tarafını zaten bağlıyoruz | OAuth |
| monday CRM, Attio, Close, Copper | yeni nesil ekipler | OAuth / anahtar |
| Odoo | üretim ve toptan şablonumuzun kitlesi | anahtar |
| SAP Sales Cloud, Oracle | yalnızca kurumsal müşteri isterse | |

**2. Zapier ve Make uygulaması.** Açık API'miz ve webhook'larımız hazır olduğu
için kurması kolay. Binlerce aracı bağlar; ücretini müşteri kendi planıyla
öder, bize maliyeti yok.

**3. Tablo ve dosya.** Google Sheets, Excel ve CSV içe aktarma zaten var; hiçbir
API'si olmayan araç için bile çalışır.

**Önerilmeyen: "birleşik API" servisleri.** Tek entegrasyonla onlarca CRM vaat
ediyorlar ama bağlantı başına ücret alıyorlar: Merge ayda $650 (10 bağlantı),
sonrası bağlantı başına $65; Apideck ayda $599'dan; Unified.to ayda $750'den;
Nango ayda $50 + bağlantı başına $1. 100 müşteride Merge ayda yaklaşık $6.500
eder. "Yeni ücretli servis yok" ve "en yüksek brüt marj" kurallarına aykırı;
üstelik müşteri verisi bir aracıdan geçer.

## Kodda yapılacaklar

| İş | Paket |
| --- | --- |
| Demoda "Bağlan" gerçek akışı çalıştırsın | yapıldı |
| OAuth girişlerine PKCE | Güvenilirlik |
| Anahtar yenilemede bağlantı başına kilit (iki istek aynı anda yenilemesin) | Güvenilirlik |
| Bağlantı ekranında "yöneticin önce şunu kurmalı" adımı (Salesforce, Dynamics) | Kişiselleştirme / Sadelik |
| CRM'den anlık bildirim: HubSpot ve Pipedrive webhook, Zoho bildirim, Dynamics değişiklik takibi, Salesforce değişiklik olayları | Gerçek zamanlılık |
| Salesforce paketi (External Client App + 2GP) | canlıya çıkış öncesi |
| Yeni bağlayıcılar (karara göre) | 4. aşamadan kalanlar |

## Karar bekleyenler

1. **Salesforce dağıtımı.**
   A. External Client App + listesiz paket; müşteri yöneticisi kurulum linkiyle
   kurar. Güvenlik incelemesine ilk ücretli Salesforce müşterisinden önce
   başvurulur. **(öneri: hızlı, ücret yalnızca gerektiğinde)**
   B. Baştan AppExchange'te listelenmek: görünürlük sağlar, 4–9 hafta ve
   başvuru ücreti.
2. **Sabit çıkış IP adresi** (Salesforce'un dördüncü kontrolü için).
   A. Yalnızca Salesforce anahtar yenileme isteklerini geçiren küçük, sabit
   adresli bir aktarıcı: ayda yaklaşık $4–6 sabit, koltuk başına değil.
   **(öneri; partner hesabı açılıp kontrolün bizim akışta zorunlu olduğu
   doğrulandıktan sonra)**
   B. Cloudflare'in kurumsal sabit adres eklentisi: pahalı, şimdilik gereksiz.
3. **HubSpot listelemesi.** İlk üç müşteri kurulumundan sonra başvur (ücretsiz,
   25 kurulum sınırını kaldırır). **(öneri: evet)**
4. **Sıradaki bağlayıcılar.** Bitrix24, Freshsales, Zendesk Sell; sonrası talebe
   göre. **(öneri)**
5. **Zapier ve Make uygulaması.** **(öneri: evet; maliyeti yok, uzun kuyruğu
   kapatır)**

## Ürün sahibinin açacağı hesaplar (hepsi ücretsiz)

Salesforce Partner Community · HubSpot geliştirici hesabı · Pipedrive geliştirici
sandbox hesabı · Zoho API Console · Microsoft Entra uygulaması ve Microsoft
partner hesabı (yayıncı doğrulaması için alan adı e-postası gerekir) · Google
Cloud projesi. Her birinde üretilen "client id" ve "client secret" sunucunun
gizli ayarlarına yazılır; şifreler ve ödeme adımları ürün sahibinde kalır.

## Kaynaklar

- Salesforce: [Partner uygulamaları için güvenlik kontrolleri SSS](https://help.salesforce.com/s/articleView?id=005387798&language=en_US&type=1) · [External Client Apps](https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.external_client_apps.htm&type=5) · [Kurulmamış uygulama kısıtı](https://help.salesforce.com/s/articleView?id=005228838&language=en_US&type=1) · [Yeni connected app neden kapalı](https://www.concret.io/blog/why-new-connected-app-is-greyed-out-in-salesforce-and-how-to-fix-it) · [Güvenlik incelemesi ücreti](https://appnigma.ai/blogs/salesforce-security-review-guide-2026/) · [Salesforce partner sayfası: inceleme](https://partners.salesforce.com/s/education/appinnovators/Security_Review?language=en)
- HubSpot: [Kurulum sınırları duyurusu](https://community.hubspot.com/t5/Developer-Announcements/New-Marketplace-Distribution-App-Install-Limits/td-p/1203411) · [Listeleme şartları](https://appnigma.ai/blogs/hubspot-marketplace-complete-guide/)
- Pipedrive: [Uygulama türleri](https://pipedrive.readme.io/docs/marketplace-creating-a-proper-app) · [Onay süreci](https://pipedrive.readme.io/docs/marketplace-app-approval-process) · [İstek bütçesi ve webhook'lar](https://truto.one/blog/how-to-integrate-with-the-pipedrive-api-2026-engineering-guide/)
- Microsoft: [Yayıncı doğrulaması](https://learn.microsoft.com/en-au/entra/identity-platform/publisher-verification-overview) · [Neden gerekli](https://developer.nylas.com/docs/provider-guides/microsoft/verification-guide.md)
- Zoho: [İstek kredileri](https://help.zoho.com/portal/en/community/topic/kaizen-203-answering-your-questions-handling-api-limits-and-error-responses?page=2) · [API'ye genel bakış](https://pipeline.zoominfo.com/sales/zoho-crm-api)
- Diğer CRM'ler: [Hangi CRM ne istiyor](https://www.apideck.com/blog/crm-partnership-guide.md) · [Bitrix24 OAuth](https://apidocs.bitrix24.com/settings/oauth/index.html) · [Freshsales OAuth](https://developers.freshworks.com/docs/app-sdk/v3.0/deal/oauth-implementation-in-apps/)
- Pazar payı: [IDC özeti](https://crmswitch.com/crm-industry/crm-market-share/) · [Uzun kuyruk](https://addtocrm.com/blog/crm-long-tail-beyond-salesforce-hubspot)
- Birleşik API fiyatları: [Karşılaştırma](https://truto.one/blog/which-unified-api-platform-has-the-most-developer-friendly-pricing/) · [Merge fiyatı](https://getknit.dev/blog/understanding-merge-dev-pricing-finding-the-right-unified-api-for-your-integration-needs/) · [Unified.to](https://unified.to/blog/best_unified_api_for_crm_in_2026)
