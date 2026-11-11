---
title: Güvenlik ve KVKK
section: help
order: 9
summary: Veri ayrımı, oturumlar, aktivite kaydı, kişisel verilerin dışa aktarılması ve silinmesi.
---
# Güvenlik ve KVKK

## Şirketler birbirini göremez

Her sorgu, veritabanında satır düzeyinde güvenlik kurallarıyla çalışır. Bir şirketin verisi başka bir şirketin adresinden, API'sinden ya da bağlayıcısından hiçbir şekilde okunamaz. Rol ve alan kuralları da aynı katmanda uygulanır.

## Oturumlar ve cihazlar

Oturumlar cihaza bağlıdır; kopyalanan bir çerez başka bir makinede çalışmaz. Cihaz sınırı aşılırsa en eski oturum kapanır. Ayarların → Cihazlar'dan açık oturumlarını görüp kapatırsın.

## Aktivite kaydı

Girişler, kişi ve rol değişiklikleri, bağlantılar, API anahtarları, webhook'lar ve kişisel veri işlemleri aktivite kaydına yazılır. Ayarlar → Aktivite kaydı'ndan görülür.

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
| İçe aktarmayı geri alma bilgisi | 30 gün |
| Webhook teslim kayıtları | 7 gün |
| İptal edilmiş API anahtarları | 30 gün |

## Saklanan sırlar

CRM ve sohbet bağlantılarının erişim bilgileri ile webhook gizli anahtarları şifrelenmiş olarak saklanır. API anahtarlarının yalnızca özeti tutulur; anahtarın kendisi bir kez gösterilir ve bir daha görülemez.
