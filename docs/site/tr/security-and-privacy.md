---
title: Güvenlik ve KVKK
section: help
order: 10
summary: Veri ayrımı, oturumlar, aktivite kaydı, kişisel verilerin dışa aktarılması ve silinmesi.
---
# Güvenlik ve KVKK

## Şirketler birbirini göremez

Her sorgu, veritabanında satır düzeyinde güvenlik kurallarıyla çalışır. Bir şirketin verisi başka bir şirketin adresinden, API'sinden ya da bağlayıcısından hiçbir şekilde okunamaz. Rol ve alan kuralları da aynı katmanda uygulanır.

## Oturumlar ve cihazlar

Oturumlar cihaza bağlıdır; kopyalanan bir çerez başka bir makinede çalışmaz. Cihaz sınırı aşılırsa en eski oturum kapanır. Ayarların → Cihazlar'dan açık oturumlarını görüp kapatırsın.

## Passkey ve ikinci adım

E-postadaki bağlantının yanında **passkey** (parmak izi, yüz ya da cihaz PIN'i) ile giriş yapabilir ve **ikinci adım** ekleyebilirsin: bir doğrulama uygulaması ve telefonu kaybetmeye karşı on tek kullanımlık kurtarma kodu. Bunları **Cihazlarım → Giriş güvenliği**'nden kurarsın; diğer tüm cihazlardan tek seferde çıkış da oradadır. Yönetici, **Ayarlar → Giriş**'ten ikinci adımı yöneticiler ya da herkes için zorunlu tutabilir; her girişte sunucuda denetlenir. Tek oturum açma (SSO) ile girenlere yeniden sorulmaz: bunu kimlik sağlayıcı yapar. Kimse dışarıda kalmaz: yönetici birinin ikinci adımını sıfırlayabilir, kendi sunucusunda çalışan kurulumlarda sunucu ortamından sıfırlama vardır (`RESET_SECOND_STEP`).

Rol, tek oturum açma ya da SCIM değiştirmek, API anahtarı oluşturmak, kişisel veriyi dışa aktarmak ya da silmek, bir kişiyi çıkarmak ve aktivite kaydını dışa aktarmak, girişin on dakikadan eskiyse kimliğini onaylamanı ister (passkey, uygulama kodu ya da e-postayla gelen kod).

## Cihazda tutulanlar

Bağlantı yokken okuyabilmen için uygulama, son gördüğün listelerin bir kopyasını tarayıcının kendi deposunda tutar (görevlerin, panolar, müşteriler, gelen kutusu; dosya ekleri ve ayarlar tutulmaz). Bu kopya yalnızca o cihazda ve o tarayıcıdadır, hiçbir yere gönderilmez. Çıkış yaptığında ya da oturumun sunucuda sonlandırıldığı ilk bağlantıda silinir. Ortak kullanılan bir bilgisayarda işin bitince çıkış yap.

## Aktivite kaydı

Girişler, ikinci adımlar, kişi ve rol değişiklikleri, bağlantılar, API anahtarları, webhook'lar ve kişisel veri işlemleri aktivite kaydına yazılır. Ayarlar → Aktivite kaydı'ndan görülür. Kayda yalnızca eklenir; uygulamanın kullandığı veritabanı rolüyle bile değiştirilemez ya da silinemez. **Günlüğü dışa aktar** kaydı sürekli bir SHA-256 parmak iziyle indirir; son parmak izi de kayda yazılır, böylece bir kopya sonradan doğrulanabilir.

## Müşteri portalı

Müşteri portalı ayrı bir alan adında, ayrı oturum ve çerezle çalışır. Portal isteklerini çalıştıran veritabanı rolünün hiçbir tabloda yetkisi yoktur; yalnızca giriş yapan kişinin kendi şirketine ait, paylaşılmış verileri döndüren fonksiyonları çağırabilir. Ayrıntılar: [Müşteri portalı](/docs/tr/customer-portal/).

## Curahold desteğinin erişimi

Curahold desteği bir şirkete yalnızca bir kişinin izniyle girer: yardım talebindeki kutu işaretlenir, süre seçilir (24 saat – 7 gün). Destek o kişinin gördüğünü görür ve yalnızca bakar: hiçbir şeyi değiştiremez. Erişim seçilen süre dolunca biter ve istendiği an kapatılır. Her giriş ve süre boyunca desteğin baktıkları, destek çalışanının adıyla aktivite kaydına yazılır. Yöneticiler **Ayarlar → Güvenlik → Destek erişimi**'nden bunu yalnızca yöneticilere açabilir ya da tamamen kapatabilir. Ayrıntılar: [Destek almak](/docs/tr/getting-help/).

## Kişisel veriler

Ayarlar → Kişiler'de bir kişinin menüsünden:

- **Verilerini indir:** o kişiyle ilgili kayıtlar tek dosyada.
- **Kişisel verilerini sil:** ad ve e-posta kaldırılır; yaptığı işler anonim olarak kalır. Müşterilerini ve açık görevlerini önce başka birine devredebilirsin.

## Saklama süreleri

| Veri | Süre |
| --- | --- |
| Bildirimler | 90 gün |
| Kapanmış oturumlar | 90 gün |
| Eşitleme geçmişi | 90 gün |
| [Çöp kutusundaki](/docs/tr/trash/) silinmiş müşteriler, kayıtlar, görevler ve diğerleri | 30 gün; sonra dosyalarıyla birlikte silinir; yönetici daha erken silebilir |
| İçe aktarmayı geri alma bilgisi | 30 gün |
| Webhook teslim kayıtları | 7 gün |
| Hata kayıtları (ne, nerede bozuldu — istek içeriği asla) | 30 gün |
| İptal edilmiş API anahtarları | 30 gün |

## Saklanan sırlar

CRM ve sohbet bağlantılarının erişim bilgileri ile webhook gizli anahtarları şifrelenmiş olarak saklanır. API anahtarlarının yalnızca özeti tutulur; anahtarın kendisi bir kez gösterilir ve bir daha görülemez.
