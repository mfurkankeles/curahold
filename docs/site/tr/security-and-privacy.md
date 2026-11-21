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

Oturumlar cihaza bağlıdır; kopyalanan bir çerez başka bir makinede çalışmaz. Cihaz sınırı aşılırsa en eski oturum kapanır. Ayarlarınız → Cihazlar'dan açık oturumlarınızı görüp kapatabilirsiniz.

## Passkey ve ikinci adım

E-postadaki bağlantının yanında **passkey** (parmak izi, yüz ya da cihaz PIN'i) ile giriş yapabilir ve **ikinci adım** ekleyebilirsiniz: bir doğrulama uygulaması ve telefonu kaybetmeye karşı on tek kullanımlık kurtarma kodu. Bunları **Cihazlarım → Giriş güvenliği**'nden kurarsınız; diğer tüm cihazlardan tek seferde çıkış da oradadır. Yönetici, **Ayarlar → Giriş**'ten ikinci adımı yöneticiler ya da herkes için zorunlu tutabilir; her girişte sunucuda denetlenir. Tek oturum açma (SSO) ile girenlere yeniden sorulmaz: bunu kimlik sağlayıcı yapar. Kimse dışarıda kalmaz: yönetici birinin ikinci adımını sıfırlayabilir, kendi sunucusunda çalışan kurulumlarda sunucu ortamından sıfırlama vardır (`RESET_SECOND_STEP`).

Rol, tek oturum açma ya da SCIM değiştirmek, API anahtarı oluşturmak, kişisel veriyi dışa aktarmak ya da silmek, bir kişiyi çıkarmak ve aktivite kaydını dışa aktarmak, girişiniz on dakikadan eskiyse kimliğinizi onaylamanızı ister (passkey, uygulama kodu ya da e-postayla gelen kod).

## Cihazda tutulanlar

Bağlantı yokken okuyabilmeniz için uygulama, son gördüğünüz listelerin bir kopyasını tarayıcının kendi deposunda tutar (görevleriniz, panolar, müşteriler, gelen kutusu; dosya ekleri ve ayarlar tutulmaz). Bu kopya yalnızca o cihazda ve o tarayıcıdadır, hiçbir yere gönderilmez. Çıkış yaptığınızda ya da oturumunuzun sunucuda sonlandırıldığı ilk bağlantıda silinir. Ortak kullanılan bir bilgisayarda işiniz bitince çıkış yapın.

## Aktivite kaydı

Girişler, ikinci adımlar, kişi ve rol değişiklikleri, bağlantılar, API anahtarları, webhook'lar ve kişisel veri işlemleri aktivite kaydına yazılır. Ayarlar → Aktivite kaydı'ndan görülür. Bir kayıt asla değiştirilmez ve uygulamanın kullandığı veritabanı rolü bile kayıt silemez; 12 ay sonra gece temizliği kaydı kaldırır (veritabanı son 90 güne ait hiçbir kaydın silinmesine izin vermez). **Günlüğü dışa aktar** kaydı sürekli bir SHA-256 parmak iziyle indirir; son parmak izi de kayda yazılır, böylece bir kopya sonradan doğrulanabilir.

## Müşteri portalı

Müşteri portalı ayrı bir alan adında, ayrı oturum ve çerezle çalışır. Portal isteklerini çalıştıran veritabanı rolünün hiçbir tabloda yetkisi yoktur; yalnızca giriş yapan kişinin kendi şirketine ait, paylaşılmış verileri döndüren fonksiyonları çağırabilir. Ayrıntılar: [Müşteri portalı](/docs/tr/customer-portal/).

## Curahold desteğinin erişimi

Curahold desteği bir şirkete yalnızca bir kişinin izniyle girer: yardım talebindeki kutu işaretlenir, süre seçilir (24 saat – 7 gün). Destek o kişinin gördüğünü görür ve yalnızca bakar: hiçbir şeyi değiştiremez. Erişim seçilen süre dolunca biter ve istendiği an kapatılır. Her giriş ve süre boyunca desteğin baktıkları, destek çalışanının adıyla aktivite kaydına yazılır. Yöneticiler **Ayarlar → Güvenlik → Destek erişimi**'nden bunu yalnızca yöneticilere açabilir ya da tamamen kapatabilir. Ayrıntılar: [Destek almak](/docs/tr/getting-help/).

## Kişisel veriler

Ayarlar → Kişiler'de bir kişinin menüsünden:

- **Verilerini indir:** o kişiyle ilgili kayıtlar tek dosyada.
- **Kişisel verilerini sil:** ad ve e-posta kaldırılır; yaptığı işler anonim olarak kalır. Müşterilerini ve açık görevlerini önce başka birine devredebilirsiniz.
- **Silme**, kişinin CuraAI'ye sorduklarını, bildirimlerini, sohbet bağlantılarını, passkey'lerini ve ikinci adımlarını, oturum kayıtlarını ve yapay zekâ ekibinin notlarında adresinin ya da tam adının geçtiği yerleri de kaldırır. Yasa gereği kalanlar: faturalar, şirket adına koşulları kimin kabul ettiğinin kaydı ve adres olmadan (yalnızca parmak iziyle) rıza kayıtları.
- **Müşterilerinizdeki kişiler** (Ayarlar → Müşteri portalı → Giriş yapabilen kişiler): gizliliği yöneten bir yönetici **Verileri indir** ya da **Kişisel verileri sil** diyebilir. Silme, portal hesabının kendisini siler; yazdıkları adı olmadan kalır.

### Şirketin tamamını silmek

Bir yönetici **Ayarlar → Şirket → Şirketi sil**'de şirketin adresini yazarak isteyebilir. 30 gün boyunca hiçbir şey silinmez: şirket her zamanki gibi çalışır, dışa aktarma yapılabilir ve herhangi bir yönetici iptal edebilir. Sonra dosyalar ve bağlantı anahtarları dahil her şey kalıcı olarak silinir ve neyin kaldırıldığını sayan bir silme belgesi saklanır (ad ya da adres içermez). Faturalar vergi mevzuatı gereği kalır. Yedekler barındırma sağlayıcısının takvimine göre silinir.

### Kişisel veri talepleri

**Ayarlar → Şirket → Kişisel veri talepleri**'nde gizlilik yetkisi olan kişiler, birinin kendi verileriyle ilgili yaptığı her talebi geçerli yasayla birlikte kaydeder: bilgi ve erişim, düzeltme, silme, işlemenin kısıtlanması, itiraz, veri taşınabilirliği ya da rızanın geri alınması. Son gün bu yasaya göre dolar (örneğin KVKK'da 30 gün, GDPR'de bir takvim ayı, Kore'nin PIPA'sında 10 gün); süresi geçen talep simgeyle ve kırmızıyla işaretlenir. İş bitince talebi yanıtlandı ya da reddedildi olarak işaretleyin; her değişiklik aktivite kaydında yer alır. İşin kendisini kişinin dışa aktarma ve silme işlemleriyle yaparsınız.

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
| Aktivite kaydı | 12 ay |
| Kişisel veri talepleri (yanıtlandıktan ya da reddedildikten sonra) | Kapandıktan sonra 3 yıl |
| Yardım talepleri, mesajları ve dosyaları | Son değişiklikten 24 ay sonra |
| CuraAI'ye sorulanlar | Şirketinizin seçtiği süre (değiştirilmediyse 30 gün) |
| Silinen bir şirket | Talepten 30 gün sonra silinir |

## Saklanan sırlar

CRM ve sohbet bağlantılarının erişim bilgileri ile webhook gizli anahtarları şifrelenmiş olarak saklanır. API anahtarlarının yalnızca özeti tutulur; anahtarın kendisi bir kez gösterilir ve bir daha görülemez.

## Tek oturum açma (SSO) ve SCIM {#sso}

Ayarlar → **Tek oturum açma (SSO)** bölümünde: **Protokol** seçin, **Kimlik sağlayıcınıza şu bilgileri verin** altındaki değerleri kimlik sağlayıcınıza verin, **Kimlik sağlayıcının bilgileri** alanlarını doldurun, kaydedin ve **Girişi dene** düğmesine basın. Test kimseyi oturum açtırmaz ve SSO'yu açmaz. **Bu şirket için SSO'yu zorunlu kıl** ancak kayıtlı bilgilerin tam aynısıyla bir test geçtikten sonra ve geçiş anahtarı ya da doğrulama uygulaması olan bir yedek yönetici seçildiğinde açılır.

Test geçmezse nedenini söyler:

- istemci parolası reddedildi (sağlayıcıda yenilendi): yenisini **İstemci parolası** alanına yapıştırıp kaydedin;
- imza eşleşmedi (sağlayıcı anahtarını ya da sertifikasını yeniledi): SAML için yenisini **IdP imzalama sertifikası** alanına yapıştırın; OpenID Connect yeni anahtarı kendisi alır;
- yanıt başka bir uygulama içindi ya da süresi dolmuştu: **Yayımcı (issuer)**, **İstemci kimliği** değerlerini ve sağlayıcının saatini kontrol edin;
- sağlayıcıya ulaşılamadı: **Token uç noktası** ve **JWKS URL'si** adreslerini kontrol edin, sonra bir dakika bekleyin.

Oturum açan kişiler yalnızca sağlayıcının girişi tamamlamadığını görür ve giriş sayfasına döner.

**SCIM sağlama**: **Token oluştur** token'ı bir kez gösterir; onu **SCIM temel URL'si** ile birlikte sağlayıcıya verin. Orada devre dışı bırakılan kişinin tüm oturumları ve API anahtarları anında kapanır; ad değişikliği de gelir. Yeni token oluşturmak eskisini anında durdurur.
