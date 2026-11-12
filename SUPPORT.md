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
| Kuyruk görünümleri: bana ait, atanmamış, süresi dolmak üzere, N gündür güncellenmeyen | sırada (kuyruk API'de var, ekranı yok) |
| Cevap süresi hedefi (ilk cevap, çözüm) ve aşım uyarısı | sırada |
| Talebin yanında müşteri bilgisi, ilgili eski talepler | sırada |

### CRM'den alınan kalıplar

| Kalıp | Curahold'da |
| --- | --- |
| Takvim: gün, hafta, ay görünümü; başkasının takvimini açmak | **yapıldı** (takvim paketi: gün, hafta, ay, yıl; ekip takvimi yetkisi) |
| Toplantı önceden planlanır; durumu olur (planlandı, yapıldı, ertelendi, iptal + neden) | **yok**: bugün yalnızca yapılmış toplantı kaydediliyor. Öneri: sıradaki paket |
| Toplantı türü şirketin kendi listesinden seçilir; türe göre not başlıkları | yok. Öneri: planlı toplantıyla birlikte |
| Tekrarlayan toplantı | yok. Öneri: planlı toplantıyla birlikte |
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
3. Kendi sunucusunda çalıştıran müşteri için: posta sunucusu gelen iletiyi
   `POST /api/desk/mail` adresine `SUPPORT_MAIL_KEY` ile iletir.

`SUPPORT_REPLY_DOMAIN` ayarlanmadıysa e-postalar yanıt adresi taşımaz ve "cevap için
Curahold'u aç" der; konuşma üründe aynı şekilde çalışır.

## Karar bekleyenler

1. **Destek ekibi için ekran.** Bugün ekip e-postayla ve API'yle cevaplıyor.
   A. Şimdilik böyle kalsın; ilk 20–30 müşteriye kadar e-posta yeter. **(öneri)**
   B. Ürünün içinde ayrı bir "destek masası" ekranı: kuyruk, talep, hazır cevaplar,
   süre hedefleri. Yaklaşık bir paketlik iş; maliyeti yok.
2. **Planlı toplantılar.** Toplantıyı önceden takvime koymak, türünü seçmek, sonra
   notunu ve sonucunu yazmak.
   A. Sıradaki pakete al. **(öneri: takvim artık hazır, en çok eksikliği hissedilecek yer)**
   B. Kişiselleştirme paketiyle birlikte.

## Kaynaklar

- [How are incoming emails threaded to tickets](https://support.zendesk.com/hc/en-us/articles/8396827889946-How-are-incoming-emails-threaded-to-tickets)
- [Why does the email thread into the wrong ticket](https://support.zendesk.com/hc/en-us/articles/4408821051034-Why-do-emails-thread-to-the-wrong-ticket-)
- [Salesforce: getFormattedThreadingToken](https://developer.salesforce.com/docs/atlas.en-us.254.0.apexref.meta/apexref/apex_System_EmailMessages_getFormattedThreadingToken.htm)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
