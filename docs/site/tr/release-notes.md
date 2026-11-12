---
title: Sürüm notları
section: releases
order: 1
summary: Neler yeni, neler değişti.
---
# Sürüm notları

## Kasım 2026

### Dosyadan görev aktarma, arşiv ve hız

- **Dosyadan görev aktar:** başka araçtan CSV/Excel ile geçiş; sütunlar kendiliğinden tanınır, bildirim gitmez, 30 gün içinde geri alınır.
- **Arşiv:** tamamlanan görevler 90 gün sonra (pano ayarından değişir) panonun arşivine taşınır; raporlarda sayılır, tek tıkla geri gelir.
- **Hız:** büyük şirketlerde sayfalar belirgin biçimde hızlandı. 300 kişi, 6.000 müşteri ve 120.000 görevle ölçüldü: pano, görevlerim, müşteriler, arama ve gelen kutusu için sunucu saniyenin onda biri civarında ya da daha kısa sürede yanıt veriyor.

### Uygulama olarak kur, çevrimdışı oku, canlı yenileme

- **Kur:** Tendwell telefona ve bilgisayara uygulama olarak kurulur (Android/Chrome/Edge: adına tıkla → Tendwell’i kur; iPhone: Paylaş → Ana Ekrana Ekle).
- **Çevrimdışı okuma:** bağlantı yokken uygulama açılır ve son gördüklerini gösterir; çıkış yapınca cihazdaki kopya silinir.
- **Canlı yenileme:** başkasının eklediği kart, taşıdığı görev, yazdığı yorum ve yeni bildirimler yarım dakika içinde kendiliğinden görünür.
- Bağlantı koptuğunda hata mesajları artık ne olduğunu söylüyor.

### Hedefler, değerlendirme ritmi ve dürtmeler

- **Hedefler:** dönem (ay, çeyrek, yıl) ve fırsat türü başına hedef; Raporlar’da ve satış hattının üstünde kazanılan, ağırlıklı tahmin ve eşit tempo aynı çubukta. “Önde / Yolunda / Geride” ve kalan her hafta ne kazanmak gerektiği.
- **İş değerlendirmeleri:** şirket genelinde ya da müşteri başına ritim (örneğin 90 günde bir); Müşteriler → Değerlendirmeler zamanı gelenleri sıralar, kaydedince sıradaki tarih ilerler.
- **Dürtmeler:** perşembe günleri yerinde sayan görevlerin listesi; istenirse birkaç gün geciken iş ekip liderine bir kez bildirilir.
- **Panolar:** tamamlanan sütunu en yeni kartları gösterir, eskiler tek tıkla açılır.

### CRM, raporlar ve görevlerin fazlası

- **Satış hattı:** fırsatlar aşama aşama sütunlarda; sürükle-bırak, Kazanıldı/Kaybedildi, ağırlıklı tahmin. Fırsat türleri: yeni iş, genişleme, yenileme.
- **Raporlar:** açık/geciken/biten işler, zamanında bitirme, hafta hafta akış, kişi ve pano bazında yük, sağlık dağılımı, yenilemeler, aşama bazında fırsatlar.
- **Ekip ve 1:1:** kişi başına yük ve tek kişilik hazırlık görünümü.
- **Zaman çizelgesi (Gantt):** başlangıç ve son tarihe göre çubuklar; pano, kişi ya da müşteri bazında.
- **Gelen kutusu:** tüm bildirimler tek sayfada, filtrelerle.
- **Görevler:** panoya özel alanlar ve bitirmek için zorunlu alanlar, takip etme, “şunu bekliyor” bağlantıları, başlangıç tarihi, süre kaydı, kayıtlı kontrol listeleri, görev geçmişi, benzer görev uyarısı.
- **Panolar:** filtreler, kayıtlı ve paylaşılan görünümler, talep formu.
- **Müşteriler:** tek tıkla plan uygulama (onboarding, yenileme hazırlığı), müşteri başına toplam süre.
- **Menü ve yazı tipi:** gruplanmış sol menü; yeni yazı tipleri (Figtree ve Bricolage Grotesque, açık lisanslı).

### Kolay kullanım

- **Hızlı ekleme:** görevi konuşur gibi yaz; “cuma”, “haftaya”, “15 kasım”, @kişi, #müşteri, !öncelik ve “her pazartesi” okunur. Birden çok satır, birden çok görev olur. N tuşu, + Yeni ya da telefonda alttaki +.
- **Tek tıkla bitir:** listelerde ve kartlarda yuvarlak işaret; geri alınabilir. Görev penceresinde **Tamamla**.
- **Yeni yerleşim:** simgeli menü, tek **+ Yeni** düğmesi, Görevlerim’in yanında geciken ve bugünkü görev sayısı; telefonda alt çubuk.
- **Koyu tema** ve **klavye kısayolları** (? tuşu hepsini gösterir).
- **Başlarken** kartı ve **Yenilikler** penceresi.
- **Takvim:** bir günün üzerindeki + o güne görev ekler.
- Boş ekranlar ne yapılacağını söyler; yüklenirken sayfanın şekli görünür.

### Müşteriler

- **Kart görünümü:** her müşteride geciken görevler, sağlık, yenileme, duran görevler ve temassızlık işaretleri; önce ilgi bekleyenler.
- **Yenilemeler görünümü:** 12 ay, ay ay; risk altındaki tutar.
- **Ürün haritası:** kimde hangi ürün var, boşluktan tek tıkla çapraz satış görevi.

### Müşteri portalı

- **Panoları müşterilere açma:** yeni taleplerin düşeceği sütun, müşterinin gördüğü sütun adları ve ayrıntılar pano bazında seçilir.
- **Müşteri tarafı:** kendi alan adında, şifresiz bağlantıyla giriş; kendi şirketinin paylaşılan talepleri, yeni talep ve yanıt.
- **Ekip tarafı:** görevi müşteriyle paylaşma, **İç not / Müşteriye yanıt** seçimi, müşterinin yazdıkları için bildirim.
- **Güvenlik:** ayrı alan adı ve oturum, tablo yetkisi olmayan veritabanı rolü, müşteri bazında ayrım, şirket şalteri.
- **Giriş yolları şirketin seçimi:** e-posta kodu ve bağlantısı, Google, Microsoft, passkey ve şifre; açık kalma süresi ve yeni giriş bildirimi.

### Yardım ve destek erişimi

- **Yardım formu:** konu, etki, başlık, açıklama ve tekrar adımları; yazarken ilgili belge önerileri.
- **Ekran görüntüleri:** sekmeyi çekme, yapıştırma, sürükleme; vurgulama ve gizli kalması gerekeni kapatma.
- **Teknik bilgiler:** tarayıcı, son sayfalar, hatalar ve başarısız istekler; gönderilmeden önce gösterilir, istenen çıkarılır.
- **Onaylı destek erişimi:** kutu işaretlenirse süreli (24 saat – 7 gün), varsayılan olarak yalnızca okuma, istendiği an kapatılır, her giriş kayıtta.
- **Şirket ayarı:** desteğe kim erişim verebilir (herkes, yalnızca yöneticiler, hiç kimse).

### Destek talepleri

- **Zendesk, Freshdesk, Intercom ve Jira Service Management** bağlantıları: adres ve API anahtarıyla, yalnızca okuyarak.
- **Salesforce ve Dynamics vakaları** destek talebi olarak.
- **Her araç için** API ve gelen webhook adresi.
- Talepler müşteriye adı, web adresi ya da talep edenin e-posta alan adıyla bağlanır; zaman çizelgesinde, açık talep sayısında ve sağlık skorunda (Destek yükü) görünür.

### Zaman çizelgesi, sağlık skoru ve haftalık özet

- **Müşteri zaman çizelgesi:** not, görüşme, toplantı ve e-posta kaydı; görevler, yorumlar, yeni kişiler ve skor değişiklikleri tek akışta. Önemli notları sabitleme.
- **Nedenini gösteren sağlık skoru:** her müşteri için 0–100; ağırlıkları şirket seçer, her puanın nedeni bir tık uzakta, son haftaların eğilimi grafikte. CRM'e de yazılabilir.
- **Pazartesi haftalık özeti:** yenilemeler, skoru düşenler ve en büyük nedeni, sessiz kalanlar.
- **AI bağlayıcısı:** asistan artık zaman çizelgesini ve skoru okuyor, görüşme notu ekleyebiliyor.

### Geliştirici platformu ve AI bağlayıcısı

- **Claude ve ChatGPT bağlayıcısı (MCP):** asistanınla müşterilerini sorgula, özet ve sunum hazırlat, görev açtır. Asistan senin adına ve senin yetkilerinle çalışır.
- **Kişisel API anahtarları:** okuma ya da yazma yetkili, süreli ya da süresiz; Ayarların sayfasından.
- **Webhook'lar:** görev, müşteri, kayıt ve yorum değişikliklerinde imzalı mesaj; yeniden deneme ve test gönderimi.
- **Belgeler:** bu site, Türkçe ve İngilizce.

### Gündelik iş

- Ctrl K / ⌘ K ile her yerden arama.
- Görevlerde ve müşterilerde toplu değişiklik, 30 dakika içinde geri alma.
- Tekrarlayan görevler: bitiş tarihine ya da tamamlanma tarihine göre hesaplanır.
- Listeleri Excel ya da CSV olarak indirme.
- Sessiz saatler ve görevi sessize alma.

### Kim neyi görür

- Role göre müşteri erişimi: tümü, ekibinin ya da yalnızca kendi müşterileri.
- Alan bazında görme ve değiştirme yetkisi.
- Role göre ana sayfalar ve on kart türü.
- "Onun gözünden bak": bir kişinin ekranını salt okunur olarak gör.
