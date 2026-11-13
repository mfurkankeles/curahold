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
6. Yardımcının (CuraAI) motoru: cevaplar belgelerden, cihazda, soru başına $0 (seçenek A). Cevabı bir dil
   modelinin yazması (seçenek B, soru başına yaklaşık $0,0006 ve yeni bir alt işleyen) şimdi yok; ileride
   üst pakete ek özellik olarak eklenebilir.
7. INTEGRATIONS.md'deki beş madde önerildiği gibi onaylandı (Salesforce liste dışı paket, sabit IP için
   küçük aktarıcı, HubSpot listelemesi üç kurulumdan sonra, sıradaki bağlayıcılar Bitrix24 + Freshsales +
   Zendesk Sell, Zapier ve Make uygulaması).

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

Sıra dışı istekler (ürün sahibi, 13 Kasım): **Destek masası ekranı** (SUPPORT.md) ve **destek için
oturum kaydı** (rrweb tam oturum tekrarı; şeffaf kurgu — SUPPORT.md "Oturum kaydı") yapıldı; ardından
QUALITY sırasına dönülüyor. Aynı gün: **destek masası kendi alt alanına taşındı** (`desk.<alan adı>`) ve **demo bir web sitesi oldu**:
`curahold.com/demo` — rol/hedef/alana göre süzülen 14 rehberli tur (EN+TR); her tur canlı demonun üstünde gerçek ekrandaki gerçek
öğeyi gösterir; `tests/e2e/tours.ts` her turun her adımını (51 adım) tarayıcıda yürütür. Oturum kaydının depolama notu: parçalar şimdilik Postgres'te base64 metin;
hacim büyürse gövdeler R2'ye, indeks Postgres'te kalır. Kayıtlar 7 gün sonra silinir (KVKK).

Güvenilirlik alt paketleri (✓ = bitti): Türkçe arama ve sıralama ✓ · eski önekler ✓ · tekrar eden istek (idempotency) ✓ ·
çöp kutusu ✓ · şirket saatine göre "bugün" ✓ · tam test koşusu 5 dakikanın altında ✓ · uç başına izolasyon testi ✓
(ana API; portal ve kendi sunucusu modu için aynı tarama sırada) · müşteri ve kayıtlarda sürüm · güvenlik başlıkları
ve istek sınırı · hata kaydı ve iş durumu · koltuk paylaşımı tespiti · çevrimdışı kuyruk · yedek ve geri yükleme
provası · OAuth girişlerine PKCE ve anahtar yenileme kilidi (INTEGRATIONS.md).
Güvenilirlik puanı: başlangıçta 4 → şimdi 6,5 (15 hedefin 5'i tamam, 4'ü kısmen).

Uç başına izolasyon testi (12 Kasım, `tests/isolation-routes.test.ts`):

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Kimlikle bir şeye erişen adres | 116; 12 elle yazılmış izolasyon testi ve dağınık kontroller | 116'nın 109'u otomatik deneniyor; kalan 7'sinin parametresi kimlik değil (alan adı, sağlayıcı adı, gizli adres) ve nedeni testte yazılı |
| Deneme | — | öbür şirketin yöneticisi, bu şirketin gerçek bir kimliği ve kendi çalışanından kabul edilecek bir gövdeyle çağırıyor |
| Sonuç | — | 109 / 109 "bulunamadı" (404); başarı 0, sunucu hatası 0 |
| Çağrılardan sonra bu şirketin verisi | ölçülmüyordu | 51 tablonun her satırı öncekiyle aynı; çağıranın kendi şirketi de aynı |
| Başka şirketin kimliğine "boş ama başarılı" cevap veren adres | 9 (veri sızmıyordu: boş liste, sıfır sayaç ya da hiçbir şey yapmayan işlem) | 0: dokuzu da artık 404 veriyor |
| Yeni adres eklenince | elle test yazılmazsa denenmiyordu | adresler koddan okunuyor: yeni adres kendiliğinden deneniyor; hangi tabloya ait olduğu söylenmemişse test düşüyor |

Çöp kutusu (12 Kasım):

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Silinen müşteri, kayıt, görev, zaman çizelgesi girişi, sayfa, rapor, otomasyon | o anda kalıcı siliniyordu | 30 gün çöp kutusunda; aynı kimlikle, altındakilerle ve başka şeylerin ona tuttuğu bağlarla geri geliyor |
| "Eskisi gibi" ne kadar eskisi gibi | ölçülemezdi | silmeden önce ve geri aldıktan sonra şirketin 51 tablosu satır satır aynı (7 türün her biri için testli) |
| Kopya almadan silen yol | 9 / 9 | 0 / 9 (7 tür + 2 içe aktarma geri alma); yenisi eklenirse test düşüyor |
| Silmenin ulaştığı tablo | 22, hiçbiri saklanmıyordu | 22'si de kopyalanıyor; gönderilmiş bildirimler ile portal oturumları ve tek kullanımlık bağlantıları bilerek dışarıda |
| Silinen müşterinin ya da kaydın dosyaları | satır gidiyor, dosya depoda süresiz kalıyordu | çöp kutusuyla birlikte siliniyor (30 gün dolunca ya da yönetici "kalıcı olarak sil" deyince) |
| CRM'e bağlı müşteri | silinince eşitleme onu bırakıyordu, geri dönüş yoktu | çöpteyken eşitleme onu geri getirmiyor; geri alınınca yeniden izliyor (testli) |
| Geri almanın ürettiği webhook ve bildirim | — | 0 (kimseye "yeni" diye haber gitmiyor; testli) |
| Kim görür, kim geri alır | — | herkes kendi sildiğini; şirket ayarı ya da gizlilik yetkisi olan hepsini. Kopyalar uygulamanın veritabanı rolüyle okunamıyor; başka şirket ve görüntüleyici koltuğu doğrudan SQL ile de reddediliyor (testli) |
| Geri gelemeyen durum | — | nedeniyle reddediliyor ve hiçbir şey değişmiyor: bağlı olduğu şey de çöpte (önce o), artık yok, ya da yerini başkası almış (aynı CRM kimliği) |
| Büyük şirkette süre (6.012 müşteri, 210 bin görev, 300 bin yorum; Postgres 16, `scripts/quality/trash.mts`) | müşteri silme 10 ms · görev silme 4 ms | kopyayla 45 ms · 24 ms; geri alma 18 ms · 11 ms |
| Test | 0 | 14 test (`tests/trash.test.ts`) + eşitleme testi + tarayıcı senaryosu + demoda kontrol; 77 ilgili test gerçek Postgres 16'da da geçiyor |
| "Sor": silmeyle ilgili sorular | cevap yoktu | "silinen görevi nasıl geri alırım" ve benzeri 4 soru doğru bölümü buluyor; toplam 48 soruda ilk cevap 47, ilk üç 48/48, emin olduğu 41'in 41'i doğru |

Sonraki paketlere not: silme ve geri alma başka açık sayfalara anında yansımıyor ve webhook olarak gitmiyor
(silme önceden de gitmiyordu). Canlı kanal kurulurken (Gerçek zamanlılık) ikisi de olay olarak eklenecek.

Araya giren işler (ürün sahibinin 12 Kasım isteği):

| İş | Önce | Sonra |
| --- | --- | --- |
| Demoda "Salesforce bağla" | bilgilendirme penceresi | gerçek akış: izin, neyin geleceği, alan eşleme, ilk eşitleme (uydurma verili CRM ile) |
| CRM'lerle canlıya çıkış araştırması | yok | INTEGRATIONS.md: sağlayıcı başına hesap, onay, ücret, sınır; 5 karar maddesi |
| Geliştirici rehberi: belgelenen adres | elle yazılmış yaklaşık 35 | koddan üretilen 138 (açık adreslerin tamamı), her biri alanlarıyla |
| Geliştirici rehberi: sayfa | 7 | 19 (hızlı başlangıç, kendi aracını bağla, 7 başvuru sayfası, nesneler, hatalar) |
| Belgelerin koddan geri kalması | mümkündü | test engelliyor (yeni adres açıklamasız kalamaz) |
| Demoda "Geliştirici rehberi" bağlantısı | boşa gidiyordu | demo ile birlikte gelen belgeleri açıyor |
| Açılış dili | tarayıcının diline göre | İngilizce; Türkçe seçenek (demoda EN \| TR, üründe kişi ve şirket ayarı) |
| "Sor" (ürün ve belgeler): ilk cevabın doğruluğu | yoktu | 44 gündelik soruda 43 (%98); doğru sayfa ilk üçte 44/44 |
| "Sor": emin olduğunda doğruluk | yoktu | emin olduğu 36 cevabın 36'sı doğru; emin değilse en yakın yerleri listeler |
| "Sor": cevap süresi ve maliyeti | yoktu | yaklaşık 2 ms, cihazda; soru başına $0; yazılan hiçbir şey cihazdan çıkmaz |
| Belgelerin ana sayfası | bölüm listesi | tek soru kutusu, dört giriş, ilk üç adım, en çok sorulanlar, son güncellenenler |
| Belge sayfası | 41 | 42 (geliştirici sözlüğü); her sayfada güncelleme tarihi ve okuma süresi |
| Bağlantılar sayfası | 205 kelime | her CRM için ayrı bölüm (ne gelir, yöneticinin onayı ne zaman gerekir) |

Görünüm ve gezinme (ürün sahibinin 12 Kasım akşamı isteği):

| İş | Önce | Sonra |
| --- | --- | --- |
| Sayfa başlığının yanında ikon | 0 sayfa | 18 sayfa: menüdeki ikonunun aynısı, yumuşak bir karede |
| Bölüm başlığı, sekme, alan etiketi ve ayar menüsü satırında ikon | 0 yer | 63 yer (ana sayfa kartları ve sayfa sekmeleri, görev ve kayıt paneli, ayarlar, raporlar, müşteri sayfası) |
| İkonlu ana düğme | "Sayfayı düzenle" ve "Yeni sayfa" dahil çoğu yalnızca yazı | 30 düğme ikonlu (ekle, davet et, kaydet, bağla, içe aktar, gönder) |
| Ürünün kendi ikon takımı | 78 ikon | 90 ikon (hepsi aynı ızgara ve çizgi kalınlığı; dışarıdan ikon ya da yazı tipi yok, ek ücret $0) |
| Görevlerim'de görevin içinden alt göreve geçince geri dönüş | yoktu; paneli kapatıp görevi yeniden bulmak gerekiyordu | panelin başında "← ana görevin adı"; tek tıkla ana göreve döner, sayfa değişmez (testli) |
| Geldiğin yere dönen "geri" | yoktu: 4 alt ekranda sabit bir "üst listeye git" bağlantısı vardı (müşteri, bire bir, panel, rapor); Yenilemeler'den açılan müşteri "Tüm müşteriler"e dönüyordu | başka bir ekrandan açılan her ekranın üstünde "← geldiğin yerin adı"; doğrudan bağlantıyla açılan 13 tür alt ekranda üst ekranına götürür (testli) |
| Tarayıcının geri tuşu olmayan yerde (gömülü demo, kurulu uygulama) geri dönmek | mümkün değildi: demoda gezinme geçmişi tutulmuyordu | uygulama kendi izini tutuyor; demo da aynı izle çalışıyor |
| Yol çubuğu | yoktu | üst ekranı olan sayfalarda "Müşteriler / müşteri adı"; geri düğmesinin söylediğinden fazlasını söylediğinde görünür |
| Görev ve kayıt panelinde bir öncekine dönüş | yoktu (yalnızca alt görev → ana görev) | görevden kayda, kayıttan göreve, bağlı göreve geçişte "← önceki" |
| Görevin içindeki kayıt bağlantısı | tıklayınca görünür bir şey olmuyordu (kayıt görevin altında açılıyordu) | kaydı açıyor; geri düğmesi göreve döndürüyor |
| Yenilemeler, İş değerlendirmeleri, Ürünler başlığı | üçünde de "Müşteriler" | kendi başlığı, ikonu ve açıklaması ("Sözleşme yenilemeleri: hangi müşteri ne zaman yenileniyor…") |
| Yenilemeler'den Ürünler'e geçince | menüde "Tüm müşteriler" yanıyor, adres /accounts oluyor; cihaz seçimi saklayamıyorsa (demo) kart listesine düşüyordu | Ürünler'in kendi adresi ve menüde kendi satırı var; menü, başlık ve içerik aynı yeri gösteriyor (testli) |
| Yardım | menüdeki "Curahold'a sor" üç sekmeli bir pencere açıyordu | her ekranın sağ altında sabit "CuraAI" düğmesi ve sohbeti; kapatınca konuşma kalır; cevap yetmezse "Desteğe yaz" soruyla birlikte açılır. Motor aynı (karar A): cevap belgelerden, cihazda, soru başına $0 |
| "Desteğin bakmasına izin ver" | tek satır ve bir düğme; ne anlama geldiği yazmıyordu | ne olduğu iki cümleyle, üç güvence (yalnızca senin gördüğünü görür ve değiştiremez; kendiliğinden kapanır; her giriş kayda yazılır), açık/kapalı durumu, "Yalnızca okuma erişimi ver" |
| Ana sayfadaki "Ekip yükü" | 6 sütunlu düz tablo: 5 kişi için 25 rakam, sıfırlar dahil | kişi satırları: avatar, müşteri sayısı ve tutar, açık iş çubuğu (geciken kısmı kırmızı), yalnızca gerektiğinde "geciken" ve "riskli" etiketi, sorun yoksa "Yolunda"; satır o kişinin sayfasını açar |
| Rapor tabloları | gölgeli başlık bandı, her hücre aynı ağırlıkta | bant yok, ilk sütun satırın adı olarak kalın, toplam sütununda büyüklüğü gösteren çubuk |
| Paneller'e girince ilk grafiği görmek | panel listesi ve "Ekle" denecek 7 hazır şablon: bir yöneticinin eklemesi + 2 tık | 0 tık: 7 hazır panel şirketle birlikte, kendi verisiyle dolu gelir; Paneller en son bakılan paneli açar (testli; ilk açan yönetici olmasa da gelir) |
| Panelden panele geçmek | listeye dön, seç (2 tık) | üstteki adlardan tek tık |
| Panel silmek | yalnızca "Paneli düzenle"nin içinde | araç çubuğunda "Sil": çöp kutusuna gider, bildirimden ya da 30 gün içinde geri alınır; silinen hazır panel kendiliğinden geri gelmez, "Panel ekle" artık olmayanları listeler (testli) |
| Takvim görünümü | yalnızca ay | gün, hafta, ay, yıl; görünüm, gün ve kimin takvimi adreste |
| Takvimde görünen | yalnızca son tarihli görevler | 6 tür: görev, yapılan toplantı, arama ve değerlendirme, yenileme, zamanı gelen iş değerlendirmesi; her biri kendi rengi ve ikonuyla, tek tıkla açılıp kapanır |
| Başkasının takvimi | yoktu ("Herkes" ya da "Benimkiler") | yeni yetki "ekip arkadaşlarının takvimini görme": yönetici ve ekip lideri rollerine verildi, diğer rollere Roller ekranından verilebilir; sahibi tek kişiyi ya da bütün ekibi seçer (ekip lideri kendi ekiplerini, yönetici herkesi) |
| Yetkinin açtığı yeni veri | — | 0: yalnızca soranın zaten görebildiğini daraltır. Yetkisiz istek 403, erişim dışındaki kişi ya da ekip 404, başka şirketin kişisi 404, özel pano görevi görünmez (10 test, `tests/calendar.test.ts`) |
| Yardım talebine cevap | talep bir kez gidiyor, cevap üründe görünmüyordu | talep bir konuşma: destek cevaplar, kişi üründe ya da e-postayı yanıtlayarak yazar; durum sıranın kimde olduğunu söyler (ayrıntı ve ölçümler: SUPPORT.md) |
| Destek ekibinin kendi notu | yoktu | talebin üzerinde durur; şirkete gösterilmez, gönderilmez, uygulamanın veritabanı rolü okuyamaz (testli) |
| Talepte iş arkadaşı ve "ne zamana lazım" | yoktu | talebi açan 10 kişiye kadar haberdar eder; isteğe bağlı tarih |

Entegrasyonlar (INTEGRATIONS.md'deki beş karar, 12 Kasım gecesi):

| İş | Önce | Sonra |
| --- | --- | --- |
| İki yönlü CRM bağlayıcısı | 5 (hepsi sunucuda uygulama kaydı ister) | 8: Bitrix24, Freshsales ve Zendesk Sell eklendi; üçü de CRM'in içinde üretilen anahtarla bağlanır, sunucuda kayıt ya da onay gerekmez (22 test, `tests/keyed-crm.test.ts`) |
| Hiçbir şey ayarlanmamış bir sunucuda bağlanabilen CRM | 0 | 3 |
| Okuma sırası (yeni bağlayıcılar) | — | en yeni değişiklik önce: okuma sırasında değişen satır en kötü ihtimalle iki kez okunur, iki sayfanın arasına düşüp kaybolmaz |
| Anahtarın gidebileceği adres | — | Bitrix24: yalnızca açık https adresi (yerel ve özel ağ adresleri reddedilir); Freshsales ve Zendesk Sell: yalnızca servisin kendi alan adı |
| Salesforce girişinde tek kullanımlık kanıt (PKCE) | yok; yeni External Client App'te varsayılan olarak zorunlu olduğu için giriş reddedilirdi | var; kanıt tarayıcıdan geçen adreste okunamaz (mühürlü) |
| Aynı bağlantının anahtarını aynı anda yenileyen iki süreç | ikisi de yeniler; her kullanımda değişen anahtarda ikincisi reddedilir ve bağlantı "yeniden bağlan" durumuna düşer | 1 yenileme; ikincisi yenisini kullanır (testli) |
| Salesforce anahtar isteklerinin çıkış adresi | değişken (Workers) | ayar girilince sabit adresli aktarıcıdan; ayar yokken doğrudan. Aktarıcı tek dosya, 0 bağımlılık; Salesforce anahtar adresi dışındaki 8 adres türünü, yanlış anahtarı, yanlış yöntemi ve büyük gövdeyi reddeder (testli) |
| Salesforce paketi | yok | proje + adım adım kılavuz (`integrations/salesforce`); paketi üretmek Partner hesabını bekliyor |
| Zapier ve Make | yok | 9 tetikleyici, 6 işlem, 1 arama; ikisi tek tanımdan; hepsi gerçek API'ye karşı koşuyor (8 test); Zapier'ın kendi şema denetiminde 0 hata |
| Dışarıdan gelen tetikleyici mesajında imza kontrolü (Zapier) | — | değiştirilmiş, eski (5 dakikadan) ya da başka sırla imzalanmış mesaj atılır (testli) |
| Yeni ücretli servis | — | 0. Aktarıcı açılırsa ayda yaklaşık $4–6 sabit (koltuk başına değil); açılana kadar $0 |

Güvenilirlik paketine eklenen iki not (bu işte görüldü, bu işte değiştirilmedi):

- Pipedrive'ın tam okuması eskiden yeniye sıralı ve sayfa numarasıyla ilerliyor: okuma sürerken
  değişen bir satır sona kayar ve arkasındaki bir satır iki sayfanın arasına düşebilir. Yeni
  bağlayıcılardaki gibi "en yeni önce" sıraya çevrilecek.
- Eşitleme, bir sonraki koşunun başlangıcını "görülen en yeni değişiklik" olarak alıyor. Okuma
  sürerken değişen ve çoktan geçilmiş bir satır, daha sonra okunan daha yeni bir satır yüzünden
  atlanabilir. Başlangıç, "okumanın başladığı an" ile "görülen en yeni"nin erken olanı olmalı.

Test süreleri (12 Kasım gece, 2 çekirdek): birim 490 test, 46 dosya, 122 sn (tarayıcı testi aynı anda koşarken) ·
tarayıcı 40 senaryo + belgeler, hepsi geçti · demo 41 sn. Birim + tarayıcı birlikte 5 dakikanın altında.

Test süreleri (12 Kasım, 2 çekirdek): birim 140 sn → 88 sn (404 → 420 test, 41 dosya) · tarayıcı 189 sn →
189 sn (36 → 37 senaryo + belgeler) · demo 45 sn → 43 sn. Birim + tarayıcı 5,5 dk → 4,6 dk (demo testiyle
5,3 dk). Kazanç: veritabanı koşu başında bir kez kuruluyor (şema + iki örnek şirket), her test dosyası onun
kopyasından başlıyor. Ölçüm: boş bir veritabanını açmak 2,6 sn, şemayı ve örnekleri kurmak 0,8 sn, hazır
kopyayı yüklemek 0,5 sn; dosya başına yaklaşık 2,9 sn. Çöp kutusundan önce aynı 404 test 77 sn sürüyordu;
aradaki 11 sn yeni testlerin süresi. Gerçek Postgres'e karşı koşuda (TEST_DATABASE_URL) eskisi gibi her
kurulum kendi veritabanını açıyor.
Açık not: hazır kopyaya geçilen ilk tam koşuda bir test düştü ve hangisi olduğu kayda geçmedi. Sonraki
dokuz tam koşuda tekrarlamadı (biri bilinen bir nedenle düştü: başvuru sayfaları yeniden üretilmemişti;
düzeltildi). Artık her tam koşunun çıktısı dosyaya yazılıyor; tekrarlarsa adıyla düzeltilecek.

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
