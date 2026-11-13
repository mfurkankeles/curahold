# Destek: talep konuşması, e-postayla cevap ve bakılan ürünlerden alınanlar

12 Kasım 2026. Ürün sahibinin isteği: "bilet açınca e-posta gelsin, e-postadan cevap
verince bilete düşsün, Curahold ekibi kendi arasında not paylaşabilsin"; ayrıca iki
büyük ürünün (bir CRM, bir destek masası) nasıl çalıştığına bakıp alınabilecekleri
çıkarmak.

## Nasıl bakıldı, ne alındı, ne alınmadı

İki ürünün çalışan birer kurulumu **yalnızca okunarak** gezildi (hiçbir şey
kaydedilmedi, gönderilmedi; açılan formlar kaydedilmeden kapatıldı) ve kamuya açık
belgeleri okundu.

Alınan: **genel ürün kalıpları** (bir toplantının hangi parçalardan oluştuğu, bir
talebin "sıra kimde" diye durum göstermesi, e-postanın talebe nasıl bağlandığı gibi).
Alınmayan ve repoya girmeyen: o kurulumlara özel alan adları, liste değerleri,
süreçler, görünüm adları, ekran metinleri, müşteri ya da kişi adı, herhangi bir veri.
Bu belgedeki ve koddaki her ad ve metin Curahold için yazıldı.

### Destek masasından alınan kalıplar

| Kalıp | Curahold'da |
| --- | --- |
| Talep bir konuşmadır: iki taraf da üzerine yazar | **yapıldı** (bu paket) |
| Durum "sıra kimde"yi söyler | **yapıldı**: Destekte / Cevabın bekleniyor / Çözüldü |
| Cevap e-postayla gelir, e-posta yanıtlanınca talebe düşer | **yapıldı** |
| Ekibin kendi notu: müşteriye görünmez, gönderilmez | **yapıldı** |
| Talebe iş arkadaşı eklemek (haberdar edilenler) | **yapıldı** |
| "Ne zamana lazım" tarihi | **yapıldı** |
| Sorunun olduğu ekranın bağlantısı, ekran görüntüsü, teknik ayrıntı | vardı (form zaten topluyordu) |
| Yazarken belgelerden cevap önerisi | vardı |
| Hazır cevaplar (sık verilen cevabı tek tıkla eklemek) | sırada |
| Kuyruk görünümleri: bana ait, atanmamış | **yapıldı** (destek masası ekranı, 13 Kasım) |
| Kuyruk görünümleri: süresi dolmak üzere, uzun süredir güncellenmeyen | sırada (süre hedefiyle birlikte) |
| Cevap süresi hedefi (ilk cevap, çözüm) ve aşım uyarısı | sırada |
| Talebin yanında müşteri bilgisi, ilgili eski talepler | **yapıldı** (destek masası ekranı) |
| Talebi üstüne almak ve bırakmak | **yapıldı** (destek masası ekranı) |

### CRM'den alınan kalıplar

| Kalıp | Curahold'da |
| --- | --- |
| Takvim: gün, hafta, ay görünümü; başkasının takvimini açmak | **yapıldı** (takvim paketi: gün, hafta, ay, yıl; ekip takvimi yetkisi) |
| Toplantı önceden planlanır; durumu olur (planlandı, yapıldı, ertelendi, iptal + neden) | karar verildi (13 Kasım): yapılıyor, bkz. QUALITY.md |
| Toplantı türü şirketin kendi listesinden seçilir; türe göre not başlıkları | karar verildi: planlı toplantıyla birlikte |
| Tekrarlayan toplantı | karar verildi: planlı toplantıyla birlikte |
| Liste solda, kayıt sağda (bölünmüş görünüm) | yok. Öneri: Sadelik paketi |
| Kayıtlı görünümler, yanında canlı sayaç | kısmen (görev filtreleri kaydediliyor; sayaç yok) |
| Her alanın yanında yerinde düzenleme | var (müşteri sayfası, görev paneli) |
| Ana sayfada role göre panolar, "bugünkü görevler" | var |

## Bu pakette yapılan

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Talebe cevap | talep bir kez gidiyordu; cevap, destek hangi yolu kullanırsa oradan geliyordu ve üründe görünmüyordu | cevap talebin üzerinde: destek yazar, kişi üründe ya da e-postayı yanıtlayarak cevaplar |
| Durum | Alındı / Yanıtlandı / Çözüldü (destek elle işaretliyordu) | sıra kimdeyse o: her mesaj sırayı kendiliğinden karşı tarafa geçirir |
| E-postayla cevap | yoktu | e-postanın yanıt adresi talebe özel (reply+<belirteç>@…); adres yoksa yanıtlanan iletinin kimliğiyle bulunur; aynı e-posta iki kez gelirse bir kez yazılır |
| Kimden gelen e-posta kabul edilir | — | yalnızca talebi açan, haberdar edilenler ve Curahold ekibi; ekipten geldiğini söyleyen e-posta ancak gönderen alan adı doğrulanmışsa (DMARC) kabul edilir |
| Ekibin kendi notu | yoktu | talebin üzerinde durur, yalnızca destek adresine gider; şirkete gösterilmez, gönderilmez; uygulamanın veritabanı rolü notu okuyamaz (testli) |
| Haberdar edilenler | yoktu | talebi açan 10 iş arkadaşına kadar ekler: okur, cevap e-postasını alır, cevap yazar |
| Okunmamış cevap | görünmüyordu | CuraAI düğmesinde sayı, listede işaret |
| Destek ekibinin kuyruğu | yoktu (yalnızca e-posta ya da webhook) | `GET /api/desk/requests`: şirketler arası, sıra destekte olanlar ve işi durduranlar üstte; `GET …/:ref` notlarla birlikte; `POST …/:ref/messages` cevap ya da not |
| Test | 13 (talep gönderme ve erişim izni) | +18 (`tests/help-thread.test.ts`): konuşma, haberdar edilenler, notların sızmaması (API ve doğrudan SQL), anahtarlar, e-postanın bulunması, alıntının ayıklanması, sahte gönderen |
| Başka şirketin talebi | — | 4 yeni adres uç başına izolasyon taramasında: hepsi 404 |
| Maliyet | — | $0/koltuk/ay: gelen e-posta Cloudflare'in e-posta yönlendirmesiyle doğrudan uygulamaya gelir (sınırsız ve ücretsiz); giden e-posta zaten kullanılan sağlayıcıdan |

## Destek masası ekranı (13 Kasım)

Ürün sahibinin kararı: **B, ekran yapılsın.** Curahold ekibinin kendi ekranı; merkez
adreste `/desk`. Müşteri şirketlerin adreslerinde böyle bir sayfa yok.

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Ekibin çalıştığı yer | e-posta kutusu ve API | ekran: solda kuyruklar, ortada o kuyruğun talepleri, sağda açık talep |
| Kuyruklar | tek liste (API) | Bizi bekleyenler · Kimsenin almadıkları · Benimkiler · Müşteriyi bekleyenler · Çözülenler · Bütün talepler; yanlarında sayı; 30 saniyede bir ve sekmeye dönünce yenilenir |
| Talebin yanında | yalnızca konuşma | şirket (plan, kişi sayısı, ne zamandan beri, deneme bitişi), soran kişi ve rolü, işi durdurup durdurmadığı, ne zamana lazım olduğu, dosyalar, şirketin diğer talepleri |
| Cevap ve ekip notu | API'de `internal: true` | aynı kutuda iki seçenek; not sarı ve kesik çizgili, "yalnızca Curahold ekibi görür" yazısıyla; "Gönder ve çözüldü işaretle" tek tık |
| Talebi üstüne almak | yoktu | Üstüme al / Bırak; ilk cevabı yazan kendiliğinden üstüne alır |
| Müşterinin gözünden bakmak | ortak anahtarla, adı elle yazarak | kişi izin verdiyse tek düğme; ziyaret şirketin etkinlik kaydına ekip üyesinin adı ve adresiyle yazılır. Ortak anahtar artık kimseyi adlandıramadığı için içeri giremez |
| Giriş | ortak anahtar (kimin yaptığı belli değil) | kişiye özel: ekip listesindeki adrese 6 haneli kod (10 dakika, tek kullanım, kod başına 5 deneme, saatte 5 kod); listede olmayana aynı cevap verilir, kod gitmez |
| Oturum | — | 8 saat; çerez yalnızca masanın adresine gider (HttpOnly, SameSite=Strict), ayrı bir gizli anahtarla imzalı; her değişiklik bir formun gönderemeyeceği başlığı taşımak zorunda; ekip listesinden çıkarılanın oturumu o an biter |
| Kim ne yaptı | kayıt yoktu | masanın kendi kaydı: kim hangi talebi açtı, cevapladı, not düştü, üstüne aldı, bıraktı, çözdü, içeri bağlantısı aldı |
| Şirketlerin bu tablolara erişimi | — | yok: masanın üç tablosunda satır güvenliği açık ve hiçbir kural, hiçbir yetki tanımlı değil; uygulamanın veritabanı rolü okuyamaz (testli) |
| Talep referansı | eski çalışma adının ön ekiyle | `CH-000123` |
| Test | 31 (talep ve konuşma) | +11 (`tests/desk.test.ts`) ve tarayıcıda 1 senaryo: kodla giriş, listede olmayan adres, kuyruk, not, cevap, üstüne alma, çözme, telefonda tek sütun, çıkış |
| Tarayıcı testinin bulduğu hatalar | — | 2: merkez adres denetimi adresteki kapı numarasında takılıyordu (yerelde masa hiç açılmıyordu); yeni Chrome'da kaydırma çağrısı söz (promise) döndürdüğü için ekran ilk mesajda boşalıyordu. İkisi de düzeltildi, ilki testte |
| İndirilen kod | — | masa ayrı bir parça: 4,4 KB (gzip) + 2,0 KB stil; yalnızca `/desk` açılınca iner, müşterilerin uygulaması büyümedi |
| Maliyet | — | $0/koltuk/ay: yeni servis yok; kod e-postası zaten kullanılan sağlayıcıdan gider |

Bu pakette yapılmayanlar (sırada): hazır cevaplar, cevap süresi hedefi ve aşım uyarısı,
masadan dosya eklemek, talebi başka bir ekip üyesine atamak (bugün herkes kendi üstüne alır).

## Oturum kaydı (13 Kasım)

Ürün sahibinin isteği: "son 1 haftalık oturumların tamamını tutalım, bir hata alınca ne
yaptığını görelim; bizde kalsın, müşteri bilmesin." Seçenek olarak **tam oturum tekrarı
(DOM video, rrweb)** seçildi.

**Önemli — gizlilik duruşu.** "Müşteriden gizli" kısmı kullanıcıdan saklı şekilde
kurulmadı: KVKK/GDPR kullanıcının ekranını kaydetmek için bildirim ister, ürünün izne
dayalı destek modeliyle çelişir ve satışta risktir. Onun yerine **şeffaf ama arka planda**
kuruldu: bildirilen (belgelerde + alt-işleyici sayfasında), **yöneticinin kapatabildiği**,
her girdiyi maskeleyen, **7 gün** sonra silinen, **şirketin kendi kayıtlarını göremediği**
bir kayıt. Ürün sahibinin canlıya alırken kendi gizlilik bildirimine bunu yansıtması
gerekir (dayanağı: Ayarlar → Güvenlik anahtarı ve "Destek için oturum kaydı" belge sayfası).

| Ölçüm | Nasıl |
| --- | --- |
| Ne kaydedilir | Sayfanın kendisi (rrweb): hangi ekran, hangi düğme, uygulamanın ne çizdiği |
| Ne kaydedilmez | Yazılan hiçbir şey: her girdi maskeli (`maskAllInputs`); `rr-block` işaretli öğeler dışarıda |
| Nereye | Kişinin tarayıcısı olayları gz'leyip toplu gönderir (`POST /api/replay`); base64 metin olarak `replay_chunks`'ta |
| Şirket okuyabilir mi | Hayır: `replay_sessions`/`replay_chunks` tablolarında uygulama veritabanı rolüne hiç yetki yok (satır güvenliği açık, politika yok). Yazma da okuma da sahip (owner) bağlantısıyla, kodda kişiye göre sınırlanarak yapılır (testli) |
| Kim okur | Yalnızca destek masası, sahip bağlantısıyla; talebin yanında kişinin son 7 günlük kayıtları listelenir, biri oynatılır |
| Her oynatma | Masanın kaydına yazılır (`desk_log`, action `replay`) |
| Kapatma | Yönetici: Ayarlar → Güvenlik → Destek erişimi → "Destek için oturum kaydı". Kapalıyken sunucu 204 + `x-curahold-record: off` döner, tarayıcı durur. `/me` artık `recordSessions: true` demez |
| Saklama | 7 gün; saatlik iş eski kayıtları siler (parçalar cascade) |
| Önizleme/destek ziyareti | Kaydedilmez (`/me` bu oturumlarda `recordSessions`'ı kapalı verir) |
| İndirilen kod | rrweb (271 KB gzip 83 KB) ayrı parça, yalnızca kayıt açıkken açılış **sonrası** iner; uygulamanın ana paketi değişmedi. Oynatıcı (rrweb-player) yalnızca bir kayıt izlenince, destek masasında iner |
| Maliyet | $0/koltuk/ay: yeni servis yok, rrweb MIT bir kütüphane (kendi sunucumuzda), kayıtlar aynı veritabanında |
| Depolama notu | Şimdilik Postgres'te (base64 metin). Hacim büyürse parça gövdeleri R2'ye taşınır, indeks Postgres'te kalır (QUALITY.md) |
| Test | 6 (`tests/replay.test.ts`): kayıt açma/ekleme, adres maskeleme, aynı partinin iki kez gelmesi, başkasının kaydına yazamama, şirketin okuyamaması (tenant rolü reddedilir), kapatınca durma, masada listeleme + oynatma + kayda yazma, bir haftadan eski kaydın silinmesi |

## Nasıl çalışır

1. Kişi **Desteğe yaz** der. Talep "Destekte" durumunda başlar; destek adresine tüm
   ayrıntılarla bir e-posta gider (yanıt adresi talebe özeldir).
2. Destek cevaplar: e-postayı yanıtlayarak ya da kuyruk API'siyle. Kişiye ve haberdar
   edilenlere e-posta gider; talep "Cevabın bekleniyor" olur; CuraAI düğmesinde işaret çıkar.
3. Kişi üründe ya da e-postayı yanıtlayarak cevap yazar. Alıntının üstündeki metin
   alınır; talep yeniden "Destekte" olur.
4. Destek kendi arasında not bırakmak isterse e-postanın ilk satırına `#not` yazar
   (ya da API'de `internal: true`). Not yalnızca destek adresine gider.
5. Kişi **Çözüldü olarak işaretle** der ya da destek cevabıyla birlikte çözüldü yapar.
   Yeni bir mesaj talebi yeniden açar.

## Canlıya alırken (ürün sahibinin yapacakları)

Hepsi ücretsiz; hiçbiri yeni bir servis değil.

1. E-posta cevapları için bir alt alan adı ayır (ör. `reply.<alan adın>`) ve
   Cloudflare'de **Email Routing → bu alan adına gelen her şeyi Worker'a gönder** kuralını aç.
2. Worker ayarlarına ekle: `SUPPORT_REPLY_DOMAIN` (o alt alan adı), `SUPPORT_STAFF`
   (destek ekibinin e-posta adresleri, virgülle), `SUPPORT_EMAIL` (ekibin ortak kutusu),
   `STAFF_KEY` (zaten var).
   `SUPPORT_STAFF` aynı zamanda destek masasına kimin girebileceğini belirler: listedeki
   adresler `app.<alan adın>/desk` adresinde e-postalarına gelen kodla giriş yapar.
   Birini listeden çıkarmak oturumunu o an bitirir.
3. Kendi sunucusunda çalıştıran müşteri için: posta sunucusu gelen iletiyi
   `POST /api/desk/mail` adresine `SUPPORT_MAIL_KEY` ile iletir.

`SUPPORT_REPLY_DOMAIN` ayarlanmadıysa e-postalar yanıt adresi taşımaz ve "cevap için
Curahold'u aç" der; konuşma üründe aynı şekilde çalışır.

## Kararlar (13 Kasım)

1. **Destek ekibi için ekran: B.** Yapıldı (yukarıdaki bölüm).
2. **Planlı toplantılar: hem A hem B.** Sıradaki paket olarak yapılıyor; şirkete göre
   ayarlanan kısmı (toplantı türleri, türe göre not başlıkları) aynı pakette.
3. **Menüdeki "Ürünler" girişi kalıyor.**

## Kaynaklar

- [How are incoming emails threaded to tickets](https://support.zendesk.com/hc/en-us/articles/8396827889946-How-are-incoming-emails-threaded-to-tickets)
- [Why does the email thread into the wrong ticket](https://support.zendesk.com/hc/en-us/articles/4408821051034-Why-do-emails-thread-to-the-wrong-ticket-)
- [Salesforce: getFormattedThreadingToken](https://developer.salesforce.com/docs/atlas.en-us.254.0.apexref.meta/apexref/apex_System_EmailMessages_getFormattedThreadingToken.htm)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
