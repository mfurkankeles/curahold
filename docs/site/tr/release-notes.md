---
title: Sürüm notları
section: releases
order: 1
summary: Neler yeni, neler değişti.
---
# Sürüm notları

## Kasım 2026

### Playbook’lar, kendiliğinden başlayan yenilemeler, para birimleri; raporlar ile paneller ayrı

- **Playbook’lar:** ekibinin işi yapma şeklini tarihli adımlar olarak yaz; adımlar uygulandığı tarihten itibaren ya da müşterinin yenileme tarihinden veya fırsatın kapanış tarihinden geriye doğru sayılır. Ayarlar → Playbook’lar’da dört hazır örnekten (yenileme, onboarding, iş değerlendirmesi, fırsatı kapatma) başla.
- **Kendiliğinden başlayan yenilemeler:** ne kadar önceden (örneğin 180 gün) ve hangi playbook’la başlayacağını seç; her sabah yenileme işi müşterinin sorumlusu için açılır, istersen bir yenileme fırsatıyla birlikte. Tarihi geçmiş adımlar bugüne yığılan görevler yerine tek bir "geride kalanlar" görevinde toplanır.
- **Para birimleri:** bir müşteri ya da fırsat kendi para biriminde olabilir; toplamlar, hedefler ve raporlar Ayarlar → Para birimleri’nde tuttuğun kurlarla şirketin para biriminde gösterilir.
- **Kendi başına açılan fırsat:** her sayfanın üstünde alanları, görevleri (tek görev ya da bütün bir playbook ekle) ve kendi yorum akışıyla açılır: @anma, küçük kart olarak görünen linkler, dosyalar ve yapıştırılan ekran görüntüleri.
- **Yenilemeler görünümü:** her yenilemenin yanında yenileme fırsatı (tıklayınca açılır) ve sözleşmesi.
- **Hedefler sana göre:** hedef yok, tüm fırsatlar için tek hedef ya da fırsat türüne göre hedef; her tür açılıp kapatılabilir. İş değerlendirmesi yapmayan şirketler bu bölümü kapatabilir.
- **Raporlar ve paneller ayrı:** rapor verinin kendisidir: liste, ara toplamlı gruplu satırlar ya da tablo (matris); istersen üstünde grafik. Panel birkaç raporun grafiğini yan yana koyar ve hepsini tek bir kişi ya da ekip için gösterebilir. Hedefe göre gösterge grafiği.
- **Favoriler:** bir müşteriyi, kaydı, panoyu, raporu ya da paneli yıldızla; menünün en üstünde durur.
- **Planlar ve ödeme:** 14 günlük ücretsiz deneme, ardından Team ya da Business; ödeme Paddle üzerinden. Kullanıcı sayısı katılan kişileri kendiliğinden izler. Plan yokken her şey okunur ve dışa aktarılır, yalnızca değişiklik yapılamaz. Kendi sunucuna kurduğunda abonelik yok.
- **Kendi sunucun:** Curahold bir şirketin kendi duvarları içinde de çalışır: tek şirket, kendi Postgres’i, ekler kendi diskinde, e-postalar kendi posta sunucusundan; Docker ile birkaç dakikada kurulur. Ayrıntılar *Curahold’u kendi sunucunda çalıştırmak* sayfasında.
- **Daha derli toplu Raporlar sayfası:** listedeki çubuklar aynı yerden başlayıp aynı yerde bitiyor, rakamlar alt alta duruyor; kartlar ikişerli ve aynı boyda, yanlarında boşluk kalmıyor.
- **Toplantılar:** müşteri sayfasında o müşteriyle yapılan bütün toplantılar, iş değerlendirmeleri ve aramalar; kimlerin katıldığı, notlar ve sonraki adımlarla. Kaydederken yazdığın her sonraki adım müşteriye bağlı bir görev olur. İş değerlendirmelerindeki "Yapıldı" artık toplantı formunu açıyor.
- **Yeni görev ayrıntıları soruyor:** bir sütunun altındaki "Görev ekle" ve "Yeni görev" aynı pencereyi açar: açıklama, müşteri, bağlı olduğu kayıt, atananlar, son tarih, öncelik, tekrar, pano, sütun ve panonun kendi alanları. Başlığa "cuma @Ayşe #Acme !yüksek" yazmak alanları yine kendiliğinden doldurur.
- **Hazır kayıt türleri:** sözleşmeler, riskler, ürün talepleri ve teklifler tek tıkla.
- **Küçük düzeltmeler:** Değerlendirmeler’deki Tamam düğmesi artık kenardan taşmıyor; ürünler görünümündeki "+" görev açmadan önce soruyor ve görevi açmayı öneriyor; kişilerde onları kimin eklediği görünüyor ve her listenin sütunlarını sen seçiyorsun; fırsatlar hafta, ay, çeyrek ya da istediğin tarihlere göre daraltılabiliyor.


### Kendi raporun, hazır paneller ve yeni görünüm

- **Rapor oluşturucu:** neye bakacağını seç, daralt, grupla, özetle, grafiğini seç; kaydet, paylaş, CSV olarak al. 26 hazır rapor başlangıç için duruyor.
- **Paneller:** yedi hazır panel (satış hunisi, yenileme ve risk, müşteri sağlığı, ekip performansı…) tek tıkla eklenir; raporlarını kart olarak koyarsın.
- **Yeni renkler ve hareket:** çivit ve mor-mavi; sayfalar, sayılar ve grafikler artık hareketle geliyor (cihazında “hareketi azalt” açıksa durur).
- Tutarlar para birimi simgesiyle gösteriliyor.

### Dosyadan görev aktarma, arşiv ve hız

- **Dosyadan görev aktar:** başka araçtan CSV/Excel ile geçiş; sütunlar kendiliğinden tanınır, bildirim gitmez, 30 gün içinde geri alınır.
- **Arşiv:** tamamlanan görevler 90 gün sonra (pano ayarından değişir) panonun arşivine taşınır; raporlarda sayılır, tek tıkla geri gelir.
- **Hız:** büyük şirketlerde sayfalar belirgin biçimde hızlandı. 300 kişi, 6.000 müşteri ve 120.000 görevle ölçüldü: pano, görevlerim, müşteriler, arama ve gelen kutusu için sunucu saniyenin onda biri civarında ya da daha kısa sürede yanıt veriyor.

### Uygulama olarak kur, çevrimdışı oku, canlı yenileme

- **Kur:** Curahold telefona ve bilgisayara uygulama olarak kurulur (Android/Chrome/Edge: adına tıkla → Curahold’u kur; iPhone: Paylaş → Ana Ekrana Ekle).
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
