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

| Betik | Ne ölçer | Süre |
| --- | --- | --- |
| `npx tsx scripts/quality/static.mts` | İndirilen dosya boyutları, sözlükler, eski ad izleri, stil düzeni, bağımlılık açıkları | ~5 sn |
| `npx tsx scripts/quality/server.mts` | Türkçe arama ve sıralama, aynı anda düzenleme, tekrar eden istek, silme, güvenlik başlıkları, izolasyon | ~10 sn |
| `npx tsx scripts/quality/browser.mts [load tap live big axe fit]` | Telefonda ilk açılış, dokunma gecikmesi, canlı yenileme, büyük pano, erişilebilirlik, sığmayan metin | bölüm başına 1–5 dk |
| `npx tsx scripts/quality/lighthouse.mts` | Satış sitesi ve yardım sayfaları (Lighthouse, mobil) | ~2 dk |
| `PERF_DATABASE_URL=… npx tsx scripts/perf.ts` | Gerçek Postgres'te büyük şirketle API süreleri | ~1 dk |
| `npx tsx scripts/quality/cost.mts [koltuk]` | Koltuk başı aylık maliyet ve brüt marj | anında |

Tanımlar: "orta seviye telefon, 4G" = 9 Mbit/sn iniş, 1,5 Mbit/sn çıkış, istek başına 165 ms gecikme ve
4 kat yavaşlatılmış işlemci (Chrome'un "Fast 4G" profili). "Yavaş 4G" Lighthouse'un mobil puanında
kullandığı daha sert profildir (1,6 Mbit/sn, 562 ms). API süreleri yerel makinede, ağ gecikmesi olmadan
ölçüldü; AB'den ölçüm canlı ortam kurulunca yapılacak.

## Kararlar (ürün sahibi, 12 Kasım 2026)

1. Canlı kanal: şirket başına Cloudflare Durable Object + WebSocket Hibernation. Kendi sunucusu modunda
   aynı arayüzle Node WebSocket + Postgres LISTEN/NOTIFY. WebSocket'in engellendiği ağlarda bugünkü
   yoklamaya düşer.
2. Yeni şablonlar (5): hizmet firmaları (ajans, danışmanlık, profesyonel hizmet), yazılım ve teknoloji
   satanlar, BT ve yönetilen hizmet sağlayıcıları, toptan ve üretim (bayi, kilit müşteri), lojistik ve operasyon
   hizmetleri. Finans/sigorta aracılığı ve işe alım firmaları talep gelince.
3. Dakikalık geri dönüş (PITR) ilk ödeyen müşteriyle açılır (ayda ~$105 sabit).
4. Bu tura alınanlar: koltuk paylaşımı tespiti ve yöneticiye uyarı (Güvenilirlik paketi); GitHub'da
   Docker imajı derleme kontrolü (deploy değil); fiyatlar onaylandı (Team $19 / $15, Business $35 / $29).
5. Yedek: kod GitHub'da özel `curahold` reposunda; her paketin sonunda push edilir. Otomatik deploy yok.

## Durum (her commit'te güncellenir)

| Paket | Durum |
| --- | --- |
| 0. Yedek | Tamam: tüm commit'ler GitHub'da |
| 1. Ölçüm | Tamam (aşağıda) |
| 2. Güvenilirlik | Sürüyor (alt paketler aşağıda) |
| 3. Kişiselleştirme | Bekliyor |
| 4. Gerçek zamanlılık | Bekliyor |
| 5. Hız | Bekliyor |
| 6. Sadelik | Bekliyor |
| 7. Tasarım | Bekliyor |
| 8. 4. aşamadan kalanlar | Bekliyor |
| 9. Yük testi ve marj doğrulama | Bekliyor |

Güvenilirlik alt paketleri (✓ = bitti): Türkçe arama ve sıralama ✓ · eski önekler ✓ · tekrar eden istek (idempotency) ✓ ·
çöp kutusu · müşteri ve kayıtlarda sürüm · şirket saatine göre "bugün" ✓ · güvenlik başlıkları ve istek
sınırı · uç başına izolasyon testi · hata kaydı ve iş durumu · koltuk paylaşımı tespiti · çevrimdışı
kuyruk · yedek ve geri yükleme provası.

## Başlangıç ölçümü (12 Kasım 2026, kod değişmeden)

Puanlar: Kişiselleştirme 5 · Güvenilirlik 4 · Hız 5 · Gerçek zamanlılık 2 · Sadelik 6 · İşlevsellik 6 ·
Tasarım 4 · Brüt marj 8 (yük testiyle doğrulanınca kesinleşir).

### Kişiselleştirme: 5/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| Hizmet firmaları ve teknoloji satanlar için şablon | 5 şablon: müşteri başarısı, hesap yönetimi, satış, destek, boş | İkisi de yok |
| Şablon terimleri, alanları, kayıt türlerini, panoları, aşamaları, otomasyonları, modülleri getirir | Terim, müşteri alanları, ekipler, panolar, otomasyonlar | Kayıt türleri, aşamalar ve modüller şablonda yok |
| Her şey ayar | Var: alanlar, kayıt türleri, aşamalar, sütunlar, roller, ekipler, ana sayfalar, otomasyonlar, sağlık skoru, bildirim kanalları, sessiz saatler, dil, para birimi, saat dilimi, logo | Yok: çalışma günleri ve tatil takvimi, marka rengi, modül açıp kapama |
| Şirketin terimi her yerde görünür | Yalnızca "müşteri" sözcüğü değişebiliyor. 106 metin şirketin sözcüğünü kullanıyor; 102 İngilizce ve 107 Türkçe metinde sözcük sabit yazılı | 100'den fazla metin; fırsat, kişi, yenileme, pano sözcükleri hiç değişmiyor |
| Ayar değişikliği önizlenir, geçmişe yazılır, geri alınır | İşlem günlüğü var; önizleme otomasyon, sağlık skoru ve içe aktarmada var | Ayarlar için geri alma yok |
| Kurulum dışa aktarılır ve kopyalanır | Yok | Yok |
| 50 özel alan ve 10 kayıt türüyle hız hedefleri tutar | Ölçülmedi | Yük testinde ölçülecek |
| Üç farklı uydurma şirketle senaryolar | Tek demo şirketi | Yok |
| Yeni dil = bir çeviri dosyası | 2.894 metin iki dilde de tam. Kodda 58 "Türkçe mi?" kontrolü, sözlük dışında 340 çift dilli metin | Üçüncü dil bugün kod değişikliği ister |

### Güvenilirlik: 4/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| Aynı anda düzenlemede kayıp yok | Görevlerde sürüm numarası var: farklı alanlar birleşiyor, aynı alan reddedilip kullanıcıya söyleniyor | Müşteri ve kayıtlarda sürüm yok: aynı alanı iki kişi değiştirirse ikincisi sessizce eziyor |
| Tekrar eden istek kopya oluşturmaz | Aynı istek iki kez gidince 2 görev oluşuyor | Idempotency yok |
| Yan etkiler outbox'ta | Bildirimler ve webhook'lar işlemle birlikte yazılıyor, yeniden deneniyor | CRM'e yazma ve sohbet mesajları ayrıca incelenecek; canlı sinyal yok |
| Çevrimdışı değişiklik kaybolmaz | Çevrimdışıyken okunuyor; yazma hata veriyor | Kuyruk yok |
| Arka plan işlerinin son başarılı çalışması görünür, iki hatada haber gider | Senkron çalışmaları görünüyor | Diğer işler görünmüyor, hata bildirimi yok |
| Her API ucu için izolasyon testi | 58 tablonun 58'inde satır düzeyi güvenlik açık. 238 API adresinin 114'ü kayda kimlikle erişiyor; 12 izolasyon testi ve 17 dosyada dağınık kontroller var | Uç başına sistematik test yok |
| Due date saat diliminde kaymaz | Tarihler saat içermiyor (kaymaz), ama sunucu "bugün"ü 12 yerde UTC'ye göre hesaplıyor | İstanbul'da 00:00–03:00 arası geciken sayıları bir gün geriden gelir |
| Türkçe arama ve sıralama hatasız | Arama 5/12 (isik, seker, cagri, ozturk, unal bulamıyor), müşteri listesi 5/12, sıralamada 12 addan 9'u yanlış yerde | Bozuk |
| Silinen 30 gün çöp kutusunda | Görev ve müşteri kalıcı siliniyor | Yok |
| Yedek ve geri yükleme provası | Canlı ortam yok; kendi sunucusu belgesinde pg_dump tarifi var | Yok |
| Çökmede uygulama açılır ve söyler | Çevrimdışı okuma var | Entegrasyon çökmesi senaryoları test edilmedi |
| Güvenlik | Bağımlılıklarda açık 0. Giriş, kayıt ve destek uçlarında sınır var | API yanıtlarında güvenlik başlığı ve CSP yok; genel istek sınırı yok (1,6 sn'de 400 istek, hiçbiri reddedilmedi); OWASP gözden geçirmesi yapılmadı |
| Cihaz sınırı ve koltuk paylaşımı tespiti | Cihaz sınırı var ve testli | Paylaşım tespiti yok |
| KVKK ve GDPR | Dışa aktarma ve silme ürün içinde ve testli | Saklama süreleri uygulanmıyor; okuma erişimleri kayda geçmiyor |
| Hatalar kayda girer | Sunucu hataları yalnızca konsola; tarayıcı hataları yalnızca destek talebine ekleniyor | Kayıt yok |

### Hız: 5/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| İlk açılış LCP ≤ 1,5 sn (telefon, 4G) | 1,40 sn (yavaş 4G'de 4,26 sn); ağ 3,3 sn sonra sakinleşiyor | Sınırda tutuyor |
| Tekrar açılış ≤ 0,5 sn | 0,67 sn | 0,17 sn fazla |
| Sayfa kayması (CLS) ≤ 0,05 | 0,53 | 10 kat fazla |
| İlk ekran JavaScript ≤ 170 KB | 332 KB, tek dosya; stil 31 KB | 162 KB fazla, bölünmemiş |
| Her dokunuş ≤ 100 ms, INP ≤ 200 ms | 9 etkileşimde %75'lik dilim 112 ms, en yavaş 192 ms (takvimi açmak) | INP sınırda; 100 ms hedefi bazı ekranlarda aşılıyor |
| API okuma p95 ≤ 150 ms, yazma ≤ 250 ms | Yerelde, 306 kişilik ve 210 bin görevli şirkette 63 okuma: ortanca 28 ms, p95 139 ms, en yavaş 345 ms (iş raporu). Görev ekleme 55 ms, taşıma 33 ms | p95 tutuyor; en yavaş istek hedefin üstünde; AB'den ölçülmedi |
| 20 bin görevli pano ≤ 300 ms | 90 sn'de açılmadı; 15 bin kart ve 170 bin öğe çiziliyor | Sanal liste yok |
| 2 bin müşterili liste ≤ 300 ms | 500 satır çiziliyor (11 bin öğe) | Sanal liste yok; gerçek veritabanında süre ölçülecek |
| Ctrl K ≤ 100 ms | 240–260 ms | 2,5 kat |
| Satış sitesi ve yardım Lighthouse ≥ 95 | Site: performans 100, erişilebilirlik 95, en iyi uygulamalar 100, SEO 90. Yardım: 95–100, 92, 100, 90 | SEO (hreflang) ve yardım sayfalarında erişilebilirlik |

### Gerçek zamanlılık: 2/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| Başkasının değişikliği ≤ 1 sn | 14,0 / 21,0 / 24,7 sn (30 sn'de bir soruyor) | 14–25 kat |
| Hiçbir değişiklik kaçmaz (artan numara) | Görev, kayıt ve okunmamış sayaçları karşılaştırılıyor | Şirket başına değişiklik numarası yok |
| Kanal yalnızca sinyal taşır | Bugünkü yoklama da yalnızca sayaç taşıyor | Kanal yok |
| Görev panelinde kim bakıyor | Yok | Yok |
| CRM anlık bildirimi | Saatlik senkron | Yok |
| Boşta maliyet ~0 | Açık her sekme 30 sn'de bir istek atıyor (1.000 koltukta ayda ~11 milyon istek) | Karar bekliyor |

### Sadelik: 6/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| İlk görev 60 sn, kurulum 15 dk | İnsanla ölçülmedi; kurulum sihirbazı ve otomatik senaryosu var | Ölçülecek |
| Görevde yalnızca başlık zorunlu | Öyle | Tutuyor |
| Her ekranda tek ana eylem | 43 ekranın 2'sinde birden fazla ana düğme | 2 ekran |
| Kapalı modül menüde yer kaplamaz | Modül kavramı yok; menü herkese aynı | Yok |
| Sadeleştirme listesi | Hazırlanmadı | Sadelik paketinde sunulacak |

### İşlevsellik: 6/10

364 otomatik test ve 36 tarayıcı senaryosu geçiyor. On çekirdek işin uçtan uca tarayıcı senaryosu:
3'ü tam (kurulum, müşteri sayfası, portal), 6'sı kısmi (CRM: yalnızca demo CRM; görev: sohbet
uygulamaları ve e-posta yolu tarayıcıda denenmiyor; hatırlatma ve otomasyonlar: yalnızca kural
önizlemesi; raporlar: ekip görünümü ve 1:1 yok; dışa aktarma, API, webhook: yalnızca API anahtarı ve
yapay zekâ bağlantısı; destek: Servis Konsolu henüz yapılmadı), 1'i yok (abonelik ve Docker kurulumu).
Kısmi olanların eksik yolları sunucu testleriyle kapsanıyor.

### Tasarım: 4/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| Tek tasarım sistemi, tek seferlik stil yok | Token'lar var; ama ekranlarda 196 tek seferlik stil, kurallarda 103 doğrudan yazılmış renk, 32 farklı köşe yarıçapı, 30 farklı yazı boyu, boşlukların %53'ü 4 px ızgarasının dışında | Dağınık |
| Animasyonlar 150–200 ms | 127 sürenin 99'u aralık dışında (80 ms – 1,4 sn) | Çoğu dışında |
| axe ile 0 ihlal | Açık temada 443, koyu temada 412 bulgu (43 ekranın hepsinde; çoğu ortak çerçeveden tekrar ediyor: ad uyuşmazlığı, küçük dokunma hedefi, iç içe düğme, renk kontrastı) | 0 değil |
| Taşma ve kesilme yok | Yana kayan ekran yok. Kesilen etiket: 375 px'te 68, 768 px'te 66, 1440 px'te 57 (bir kısmı bilerek kısaltılan veri) | Ayıklanıp düzeltilecek |
| Her ekranın boş, yükleniyor, hata, çevrimdışı, yetkisiz hali | Envanter çıkarılmadı | Tasarım paketinde |
| 375 / 768 / 1440, TR + EN, açık + koyu kontrol | Bu ölçümde 3 birleşim tarandı | Tam tarama tasarım paketinde |

### Brüt marj: 8/10

| Hedef | Şu an | Fark |
| --- | --- | --- |
| 1.000 koltukta ≤ $0,25 / koltuk / ay | Model: $0,067 (canlı kanalla $0,061; dakikalık geri dönüşle birlikte $0,161) | Tutuyor; kullanım rakamlarının çoğu henüz varsayım |
| En ucuz planda brüt marj ≥ %90 | 1.000 koltukta %94,4 (yıllık %94,5); Paddle koltuk başına $0,75–1,00 alıyor | Tutuyor. 200 koltuğun altında dakikalık geri dönüş açılırsa %90'ın altına iner |
| Maliyet modeli betiği | `scripts/quality/cost.mts`, fiyatlar 12 Kasım 2026'da sağlayıcıların sayfalarından okundu | Var |

### Kurallara göre durum

- Eski çalışma adı: dosyalarda 0. Kısa önekleri: 35 dosyada 73, 12 dosyada 22 ve 7 dosyada 8 kez geçiyor.
- Ürünün adı 172 dosyada 845 kez açık yazılı; tek yerden değişmiyor.
- Tam test paketi: 364 sunucu testi 116 sn sürüyor. Tarayıcı senaryolarının süresi bir sonraki tam
  çalıştırmada ölçülecek; toplamın 5 dakikayı geçmemesi gerekiyor.
- Sızıntı taraması temiz.
