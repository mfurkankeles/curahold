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

## Cihazda tutulanlar

Bağlantı yokken okuyabilmen için uygulama, son gördüğün listelerin bir kopyasını tarayıcının kendi deposunda tutar (görevlerin, panolar, müşteriler, gelen kutusu; dosya ekleri ve ayarlar tutulmaz). Bu kopya yalnızca o cihazda ve o tarayıcıdadır, hiçbir yere gönderilmez. Çıkış yaptığında ya da oturumun sunucuda sonlandırıldığı ilk bağlantıda silinir. Ortak kullanılan bir bilgisayarda işin bitince çıkış yap.

## Aktivite kaydı

Girişler, kişi ve rol değişiklikleri, bağlantılar, API anahtarları, webhook'lar ve kişisel veri işlemleri aktivite kaydına yazılır. Ayarlar → Aktivite kaydı'ndan görülür.

## Müşteri portalı

Müşteri portalı ayrı bir alan adında, ayrı oturum ve çerezle çalışır. Portal isteklerini çalıştıran veritabanı rolünün hiçbir tabloda yetkisi yoktur; yalnızca giriş yapan kişinin kendi şirketine ait, paylaşılmış verileri döndüren fonksiyonları çağırabilir. Ayrıntılar: [Müşteri portalı](/docs/tr/customer-portal/).

## Curahold desteğinin erişimi

Curahold desteği bir şirkete yalnızca bir kişinin izniyle girer: yardım talebindeki kutu işaretlenir, süre seçilir (24 saat – 7 gün). Destek o kişinin gördüğünü görür, varsayılan olarak yalnızca bakar; değişiklik iznini yalnızca yöneticiler verir. Erişim istendiği an kapatılır. Her giriş ve izinle yapılan her değişiklik, destek çalışanının adıyla aktivite kaydına yazılır. Yöneticiler **Ayarlar → Güvenlik → Destek erişimi**'nden bunu yalnızca yöneticilere açabilir ya da tamamen kapatabilir. Ayrıntılar: [Destek almak](/docs/tr/getting-help/).

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
