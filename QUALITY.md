# Curahold kalite turu

Bu dosya iki şeydir: ürün sahibinin 12 Kasım 2026 tarihli talimatı (aşağıda, olduğu gibi) ve en altta
her paketle güncellenen ölçümler. Her paketten önce okunur. Talimat metninde yalnızca iki yer
değişti: eski iç aracın repo adı ile eski çalışma adının örnekleri çıkarıldı, çünkü bu dosyanın
kendisi de aynı kurallara (sızıntı taraması, eski addan iz kalmaması) uymak zorunda.

---

Curahold'un büyük kısmı bitti: 1, 2, 3, 5 ve 6. aşamalar tamam. Bu tur yeni fikir turu değil;
sağlamlaştırma, kişiselleştirme derinliği ve cila turu. Kararlaştırılmış ama bitmemiş tek iş
4. aşamadan kalanlar (eklentiler ve Servis Konsolu); onlar da bu çıtayla biter.

Curahold bağımsız bir B2B SaaS ürünü; hiçbir şirkete ait ya da özel değil. Her sektörden B2B
şirket kullanabilir: yazılım ve teknoloji satanlar, ajans ve danışmanlık gibi hizmet firmaları,
müşteri ilişkisini yöneten her ekip. Bu yüzden her şirket aracı kendi işine göre kurabilmeli.

Hedef: dünyanın en güvenilir, en hızlı, gerçek zamanlı, en sade, en kişiselleştirilebilir, en
güzel ve brüt marjı en yüksek müşteri ve hesap yönetimi aracı. Bu sözleri aşağıda ölçülebilir
hedeflere çevirdim. Her iddiayı ölçümle göster: "hızlandı" değil, "1,8 sn → 0,6 sn".

Bu mesajı repoda QUALITY.md olarak kaydet; her paketten önce oku, ölçümleri orada güncel tut.

## İki hedef çakışırsa öncelik
1. Veri güvenliği ve doğruluk: kayıp yok, yanlış veri yok, şirketler arası sızıntı yok
2. Hız
3. Sadelik ve kişiselleştirme: varsayılan sade, derinlik isteyene açık; ikisi rakip değil
4. Gerçek zamanlılık
5. Tasarım
6. Özellik sayısı

Brüt marj bu sıranın içinde değil; her kararın uyması gereken bütçe.

## Hedefler (önce her birinin bugünkü değerini ölç)

### Kişiselleştirme
- Kurulumda sektör şablonu seçilir. Şablon terimleri, alanları, kayıt türlerini, panoları,
  aşamaları, otomasyonları ve açık modülleri getirir. Bugünkü şablonlara (müşteri başarısı,
  hesap yönetimi, satış, destek, boş) en az hizmet firmaları (ajans, danışmanlık, profesyonel
  hizmet) ve teknoloji satanlar için şablon ekle. Başka hangi B2B segmentlerinin gerektiğini
  araştır, seçenek + öneriyle bana sor.
- Şirkete özel her şey ayar; hiçbiri kod değişikliği ya da yeni yayın gerektirmez: terimler
  (müşteri, hesap, firma, marka…), alanlar ve kayıt türleri, aşamalar ve pano sütunları, roller
  ve yetkiler, ekip yapısı, role göre ana sayfa ve görünümler, otomasyonlar ve eşikleri, sağlık
  skoru kuralları, bildirim kanalları ve sessiz saatler, dil, para birimi, saat dilimi, çalışma
  günleri ve tatil takvimi, logo ve marka rengi (müşteri portalı ve e-postalar dahil).
- Hiçbir şirketin terimi, verisi ya da iş akışı varsayılan değil. Arayüzde, e-postada, sohbet
  mesajlarında ve raporlarda şirketin seçtiği terim görünür.
- Her ayar değişikliği önizlenir, geçmişe yazılır ve geri alınabilir. Bir şirketin bütün
  kurulumu dışa aktarılıp başka bir çalışma alanına kopyalanabilir.
- Kişiselleştirme hızı düşürmez, güncellemeyi bozmaz: 50 özel alanlı, 10 kayıt türlü bir şirket
  de aşağıdaki hız hedeflerini tutturur.
- Kontrol: çekirdek senaryoları üç farklı uydurma şirketle koş: yazılım satan bir firma, bir
  ajans ya da danışmanlık, bir destek ekibi.

### Güvenilirlik
- Aynı anda düzenlenen kayıtta hiçbir değişiklik kaybolmaz: kayıt sürümü (version) kontrolü;
  farklı alanlar birleşir, aynı alan çakışırsa "X az önce değiştirdi" uyarısı ve geri al.
- Her yazma isteğinde idempotency key: yeniden deneme ya da çift tıklama asla kopya oluşturmaz.
- Yan etkiler (bildirim, Slack/Teams/Google Chat mesajı, e-posta, webhook, CRM'e yazma, canlı
  yenileme sinyali) işlemle aynı transaction'da outbox'a yazılır: kaybolmaz, iki kez gitmez,
  başarısızsa yeniden denenir.
- Bağlantı yokken yapılan değişiklik kaybolmaz: kuyrukta bekler, bağlantı gelince gönderilir;
  çakışırsa kullanıcıya gösterilir.
- Otomasyonlar ve CRM senkronu eksik ya da geç gelen veriyle çalışmaz, bekler; yarım senkron
  hiçbir şeyi silmez. Her arka plan işinin son başarılı çalışması görünür; üst üste iki kez
  başarısız olursa yöneticiye haber gider.
- Şirketler arası izolasyon: her API ucu için "A şirketindeki kullanıcı B'nin kaydını göremez,
  değiştiremez" otomatik testi (RLS + kod); müşteri portalı ve kendi sunucusu modu dahil.
- Due date'ler saat dilimi ve yaz saati geçişinde kaymaz (testli).
- Türkçe: arama, sıralama ve isim eşleştirme İ/ı, ş, ğ gibi harflerde hatasız
  ("isik" araması "Işık"ı, "istanbul" araması "İstanbul"u bulur).
- Silinen her şey 30 gün çöp kutusunda durur, geri alınabilir.
- Yedek: günlük otomatik + haftalık şifreli site dışı kopya; geri yükleme provası yazılı ve bir
  kez denenmiş. İlk ödeyen müşteriyle dakikalık geri dönüş (PITR) gerekecek: maliyetini göster,
  kararı bana bırak.
- Çalışma süresi (uptime) ≥ %99,9: veritabanı ya da bir entegrasyon çökerse uygulama yine
  açılır, son veriyi gösterir ve ne olduğunu söyler.
- Güvenlik: OWASP Top 10 gözden geçirmesi, bağımlılıklarda yüksek/kritik açık 0, istek sınırı
  (rate limit), sıkı CSP, gizli anahtarlar yalnızca secret'ta. Cihaz sınırı ve koltuk paylaşımı
  tespiti testli.
- KVKK ve GDPR: kişisel veriyi dışa aktarma ve silme ürün içinden yapılır, saklama süreleri
  uygulanır, her erişim ve işlem kayda geçer, veri AB'de durur.
- Her sunucu ve tarayıcı hatası kayda girer (ücretsiz bir yolla). Kullanıcı teknik hata değil,
  ne olduğunu ve ne yapacağını söyleyen bir mesaj görür.

### Hız
- İlk açılış (orta seviye telefon, 4G): ana içerik ≤ 1,5 sn'de görünür (LCP); tekrar açılış
  ≤ 0,5 sn; sayfa kayması (CLS) ≤ 0,05.
- İlk ekranın JavaScript'i ≤ 170 KB (gzip); geri kalanı ihtiyaç anında yüklenir.
- Her tıklama, sürükleme ve yazma ≤ 100 ms'de ekranda karşılık bulur (optimistic UI; hata
  olursa geri alınır ve söylenir). INP ≤ 200 ms (4x CPU yavaşlatmalı telefonda).
- API: okuma p95 ≤ 150 ms, yazma p95 ≤ 250 ms (p95 = isteklerin %95'i; AB'den ölç). N+1 sorgu
  yok, her sık sorgunun indeksi var. Cloudflare Smart Placement'ı ve Hyperdrive önbelleğini
  değerlendir.
- 20 bin görevli pano ve 2 bin müşterili liste ≤ 300 ms'de çizilir (sanal liste).
  Ctrl K araması ≤ 100 ms.
- Satış sitesi ve yardım sayfaları Lighthouse'ta (mobil) her kategoride ≥ 95.

### Gerçek zamanlılık
- Başkasının yaptığı değişiklik (kart, taşıma, yorum, bildirim, Slack/Teams/Google Chat'ten
  gelen işlem) sayfa yenilemeden ≤ 1 sn'de (p95) görünür. Bugün yaklaşık 30 sn; ölçerek doğrula.
- Hiçbir değişiklik kaçmaz: şirket başına artan bir değişiklik numarası tut; bağlantı koparsa
  geri gelince kaldığı numaradan devam edip eksikleri çeker.
- Canlı kanal veri taşımaz, yalnızca "şu kayıt değişti" sinyali taşır; veri normal API'den,
  aynı yetki kontrolüyle gelir. İstemci sinyalleri kısa süre toplayıp tek istekte çeker.
- Görev panelinde o an başka kimin baktığı görünür.
- CRM'in ücretsiz anlık bildirimi (webhook) varsa saatlik senkronu beklemeden o kaydı çek.
- Boşta duran bağlantının maliyeti ~0 olmalı. Önerim: şirket başına bir Cloudflare Durable
  Object + WebSocket Hibernation; kendi sunucusu modunda aynı arayüz, Node'da WebSocket +
  Postgres LISTEN/NOTIFY; WebSocket'i engelleyen ağlarda bugünkü yenilemeye düşer.
  Alternatifleri maliyetleriyle göster, bu kararı bana sor.

### Sadelik
- Yeni bir kullanıcı yardım almadan ilk görevini 60 sn'de açar; teknik olmayan bir ekip
  yöneticisi şirketini 15 dk'da tek başına kurar.
- Görev açarken zorunlu alan yalnızca başlık. Her ayarın mantıklı bir varsayılanı var; hiç ayar
  yapmadan da tam çalışır.
- Her ekranda tek bir ana eylem.
- Şablon, şirketin işine göre modülleri açar (ör. ajansta süre kaydı, yazılım satanda fırsatlar
  ve yenilemeler); gerisi kapalı gelir, tek tıkla açılır. Kapalı modül menüde yer kaplamaz.
- Sadeleştirme listesi çıkar: kaldırılacak, birleşecek ya da varsayılanda kapalı olacaklar.
  Seçenek + öneriyle bana sun; onayım olmadan hiçbir şeyi kaldırma.

### İşlevsellik
Şu çekirdek işler uçtan uca kusursuz çalışır; her biri için bir otomatik tarayıcı senaryosu yaz:
1. Şirket kurulumu: şablon, davet, roller ve kimin ne yapabildiği
2. CRM bağlantısı ve iki yönlü senkron (Salesforce, HubSpot, Dynamics 365, Pipedrive, Zoho,
   Google Sheets); CRM'siz kullanım ve Excel/CSV içe aktarma
3. Görev: oluştur, ata, taşı, bitir; web, telefon ve Slack/Teams/Google Chat'ten; hiçbiri
   bağlı değilse e-posta bildirimiyle
4. Müşteri sayfası: alanlar, kayıtlar (kişiler, fırsatlar, kendi kayıt türleri), sağlık skoru
   ve nedeni, zaman çizelgesi, paydaşlar, yenileme
5. Hatırlatma, dürtme, eskalasyon, haftalık özet ve otomasyonlar
6. Raporlar, ekip görünümü ve 1:1 hazırlığı
7. Müşteri portalı
8. Dışa aktarma, API, webhook ve yapay zekâ asistanı bağlantısı
9. Abonelik ve koltuklar (Paddle); kendi sunucusunda kurulum (Docker)
10. Destek talebi ve Servis Konsolu

Daha önce istediğim ama yarım kalan bir şey varsa listele; bu tura alıp almamayı bana sor.

### Tasarım
- Tek tasarım sistemi: renk, boşluk (8 px ızgara), yazı, köşe ve gölge token'ları; her bileşen
  tek yerde, ekranlarda tek seferlik stil yok.
- Her ekranın boş, yükleniyor, hata, çevrimdışı ve yetkisiz hali tasarlanmış. 300 ms'den kısa
  yüklemede hiçbir şey gösterme, uzunsa iskelet göster.
- Animasyonlar 150–200 ms ve "azaltılmış hareket" tercihine uyar. WCAG 2.2 AA, axe ile 0 ihlal,
  her şey klavyeyle yapılabilir.
- Türkçe metinler uzundur: hiçbir yerde taşma, kesilme ya da sıkışma yok.
- Her ekranı (uygulama, müşteri portalı, satış sitesi, yardım sayfaları) 375 / 768 / 1440 px
  genişlikte, TR + EN, açık + koyu temada ekran görüntüsüyle kontrol et; hizasız, sıkışık ya da
  taşan her şeyi düzelt. Önce/sonra görsellerini bana göster.
- Özgün ol: rakiplerin adını, terimini ya da arayüzünü kopyalama.

### Brüt marj
- 1.000 aktif koltuk ölçeğinde altyapı maliyeti koltuk başı ayda ≤ $0,25; en ucuz planda bile
  brüt marj ≥ %90 (Paddle ücreti dahil).
- Bir maliyet modeli betiği yaz: ölçülen kullanım (istek, CPU süresi, veritabanı boyutu, canlı
  bağlantı ve mesaj, e-posta, dosya) × Cloudflare, Supabase, Resend ve Paddle'ın güncel fiyatı
  = $/koltuk/ay. Ücretsiz görüntüleme koltukları ve deneme hesapları da modele girsin. Her
  pakette güncelle.
- Yeni ücretli servis ya da aylık ücret yok; gerekirse önce seçenek + öneriyle bana sor. Koltuk
  başı ücret alan üçüncü parti servis kullanma. Yapay zekâ maliyeti bizde değil, müşterinin
  kendi planında kalır.

## Nasıl çalışacaksın
0. Yedek: kod şu an yalnızca bu oturumda duruyor, GitHub'a hiç gitmedi. GitHub'da boş, private
   bir `mfurkankeles/curahold` reposu açacağım; açılınca bağla ve tüm commit'leri push et.
   Bundan sonra her paketin sonunda push et. Bu yalnızca yedek: hiçbir yere otomatik deploy
   bağlama. Canlıya alma yalnızca ben "yayına al" deyince, benim hesaplarımla olur.
1. Ölçüm (kod değiştirmeden): her hedefin bugünkü değeri; Hedef / Şu an / Fark tablosu, her
   boyuta 0–10 puan, en büyük 5 risk ve benim vermem gereken kararlar (seçenek + öneri).
2. Paketler: önerim Güvenilirlik → Kişiselleştirme → Gerçek zamanlılık → Hız → Sadelik →
   Tasarım → 4. aşamadan kalanlar → Yük testi ve marj doğrulama. Gerekirse sırayı değiştir,
   nedenini yaz. Kararımı bekleyen maddeler dışında beklemeden ilerle.
3. Yük testi (yerelde): 200 kullanıcı, 50'si aynı anda düzenliyor, 50 pano, 20 bin görev,
   2 bin müşteri, 50 özel alan. p95 süreleri, canlı yenileme gecikmesini, hata oranını ve
   koltuk başı maliyeti ölç.
4. Her boyutta puan ≥ 9 olup tüm hedefler tutunca bu tur biter.

## Kurallar
- Testler yalın: her pakette ilgili testleri bir kez, yayından önce tam paketi bir kez
  çalıştır; aynı testi tekrar tekrar koşma. Yeni testi yalnızca kritik yollara yaz (veri kaybı,
  izolasyon, kaçan değişiklik, senkron, kişiselleştirme). Tam paket 5 dakikayı geçmesin.
- Her paket ayrı commit. Deploy yok.
- Eski iç aracın reposu ve canlı sitesi salt okunur. Oradan ya da başka
  bir yerden gerçek şirket, kişi ya da müşteri adı, ID ya da veri gelmez; sızıntı taraması her
  pakette temiz. Demo yalnızca uydurma veriyle.
- Ürünün adı Curahold. Eski çalışma adının izi kalmasın: kod, metin, doküman, demo ve iç
  önekler dahil (eski adın kendisi ve ondan türeyen kısa önekler). Ad, alan adı ve logo tek bir yerden
  değişebilsin.
- Her metin Türkçe ve İngilizce eksiksiz ve doğru; yeni bir dil eklemek yalnızca bir çeviri
  dosyası eklemek olsun.
- Bir işi "başlıyorum" deyip bırakma: bu cevapta yapabildiğin kadarını yap, sonra nerede
  kaldığını açıkça yaz.

## Her paketin sonunda (Türkçe, kısa, sade)
- Ne yapıldı
- Önce → sonra ölçümler ve puanlar
- Maliyet etkisi ($/koltuk/ay)
- Benden karar bekleyenler (seçenek + öneri)
- Sıradaki paket; demo linki güncel

---

# Ölçümler

Ölçümler `scripts/quality/` altındaki betiklerle alınır ve her paketin sonunda burada güncellenir.
