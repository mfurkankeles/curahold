# VERBİS hazırlık formu

> scripts/compliance/legal-pack.ts tarafından veri envanterinden (shared/src/compliance/dataInventory.ts) üretilir. Taslak — avukat onayı gerekli.

**Kayıt yükümlülüğü.** Türkiye’de kurulu veri sorumlusu: 50’den az çalışan **ve** yıllık mali bilanço toplamı 100 milyon TL’den az ise kayıt muafiyeti vardır (Kurul Kararı 2023/1154); özel nitelikli veri işlemek ana faaliyet değildir. **Yurt dışında kurulu veri sorumlusu ise büyüklüğünden bağımsız olarak kaydolmak ve Türkiye’de bir temsilci atamak zorundadır.** Şirketin nerede kurulacağı kararı (araştırma §5) bu formu doğrudan etkiler.

**Veri sorumlusu:** [Şirket unvanı] · MERSİS [MERSİS no.] · KEP [KEP address] · İrtibat kişisi: [ad soyad]

## İşleme faaliyetleri

| Faaliyet | Amaç | Veri konusu kişi grubu | Kişisel veri kategorisi | Hukuki sebep | Saklama süresi | Alıcı grupları | Yurt dışına aktarım |
| --- | --- | --- | --- | --- | --- | --- | --- |
| accounts | Hizmetin sunulması: hesaplar, giriş, bildirimler | Müşteri şirketlerin kullanıcıları | Kimlik, İletişim, Mesleki deneyim | KVKK m. 5/2-c (sözleşmenin kurulması veya ifası) | Hesap açık olduğu sürece; kapandıktan 30 gün sonra silinir (yedekler 35 gün içinde üzerine yazılır) | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme |
| security | Hesap güvenliği, kötüye kullanımın tespiti, koltuk başına cihaz sınırı | Kullanıcılar, portal kişileri, giriş sayfası ziyaretçileri | İşlem güvenliği | KVKK m. 5/2-ç (hukuki yükümlülük, 5651 s. Kanun) ve m. 5/2-f (meşru menfaat) | 12 ay, sonra silinir | Cloudflare, Inc., Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme |
| customerData | Müşterinin belgelenmiş talimatıyla işleme (Veri işleme sözleşmesi) | Müşterilerin kendi müşterileri, iletişim kişileri ve çalışanları | Kimlik, İletişim, Müşteri işlem | Veri sorumlusu müşteridir; Curahold veri işleyendir (KVKK m. 12) | Sözleşme süresince; her an dışa aktarılabilir; bitişten 30 gün sonra silinir, yedekler 35 gün içinde | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace), Anthropic PBC | Evet — KVKK m. 9 standart sözleşme |
| trialLeads | Deneme talebinin değerlendirilmesi, kişiyle iletişim, denemenin açılması | Deneme talep eden kişiler | Kimlik, İletişim, Mesleki deneyim | KVKK m. 5/2-c (sözleşmenin kurulması) ve m. 5/2-f (meşru menfaat) | Deneme başlamazsa talepten itibaren 12 ay; başlarsa hesap verisi gibi | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme |
| consentRecords | Rıza ve izinlerin ispatı; geri alınanlara uyulması | Ziyaretçiler, kullanıcılar, deneme başvuranları | Pazarlama, İşlem güvenliği | KVKK m. 5/2-ç (hukuki yükümlülük; Ticari İletişim Yönetmeliği m. 7(10), 13) | İzin sona erdikten sonra 3 yıl; çerez tercihleri 3 yıl | Cloudflare, Inc., Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme |
| contracts | Sözleşmenin ispatı (tıklayarak kabul kaydı) | Koşulları kabul eden yöneticiler | Kimlik, İletişim, Hukuki işlem | KVKK m. 5/2-c ve m. 5/2-e (bir hakkın tesisi, kullanılması veya korunması) | Sözleşme süresi artı 10 yıl (zamanaşımı) | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme |
| billing | Faturalama ve muhasebe | Ödeyen şirketlerin fatura yetkilileri | Finans, Müşteri işlem | KVKK m. 5/2-c ve m. 5/2-ç (VUK, TTK) | 10 yıl (TTK m. 82) | Paddle.com Market Ltd, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme |
| support | Destek taleplerinin yanıtlanması | Yardım isteyen kullanıcılar | Kimlik, İletişim, Müşteri işlem, Görsel ve işitsel kayıtlar | KVKK m. 5/2-c ve m. 5/2-f | Talep kapandıktan sonra 24 ay; kayıtlar 7 gün | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace), Anthropic PBC | Evet — KVKK m. 9 standart sözleşme |
| ai | Ürün içinde yanıt vermek (yalnızca şirket yapay zekâyı açarsa); model eğitimi için asla kullanılmaz | Yapay zekâ asistanına soran kullanıcılar; soruda adı geçen kişiler | Kimlik, Müşteri işlem | Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır | Konuşma kayıtları 30 gün; sağlayıcıda [30 gün — teyit], eğitim yok | Anthropic PBC, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme |
| website | Web sitesinin çalışması; onayla, sitenin ve reklamlarımızın ölçülmesi | Web sitesi ziyaretçileri | Pazarlama, İşlem güvenliği | Zorunlu çerezler için m. 5/2-f; analiz ve reklam için açık rıza (m. 5/1) ve yurt dışına aktarım için m. 9 | Çerezler sayfasında yazdığı gibi | Cloudflare, Inc. | Evet — KVKK m. 9 standart sözleşme |
| marketing | Ürün haberleri ve tekliflerin e-postayla gönderilmesi | Pazarlama e-postasına onay verenler | Pazarlama, İletişim | Açık rıza (m. 5/1) ve 6563 s. Kanun kapsamında ticari ileti onayı (İYS) | İzin geri alınana kadar; ret, gönderilmeyecekler listesinde tutulur | Google LLC / Google Ireland Ltd (Google Workspace), Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme |

## Kişisel veri kategorileri (VERBİS listesinden)

- Kimlik
- İletişim
- Mesleki deneyim
- İşlem güvenliği
- Müşteri işlem
- Pazarlama
- Hukuki işlem
- Finans
- Görsel ve işitsel kayıtlar

## Yurt dışındaki alıcılar ve standart sözleşme durumu

| Alıcı | Ülke | Amaç | Standart sözleşme (Türkçe, imzalı, 5 iş günü içinde bildirim) |
| --- | --- | --- | --- |
| Cloudflare, Inc. | US, [R2 location] | Uygulamanın barındırılması, önündeki ağ, dosya depolama (R2), gelen e-postanın yönlendirilmesi. | Sorulacak |
| Supabase, Inc. | [EU region] | Hesapları, şirket verilerini ve yedekleri tutan veritabanı (PostgreSQL). | Sorulacak |
| Google LLC / Google Ireland Ltd (Google Workspace) | IE, US | Şirketimizin kendi e-posta kutuları ve ürünün e-postalarının (giriş bağlantıları, hatırlatmalar, özetler) Workspace SMTP aktarıcısıyla gönderilmesi. | Sorulacak |
| Paddle.com Market Ltd | GB, US | Satıcı (merchant of record) olarak ödemeler, faturalar ve satış vergisi (yalnızca ödeyen şirketin fatura yetkilisi). | Sorulacak |
| Anthropic PBC | US | Yerleşik yapay zekâ asistanının (CuraAI, yardım, destek) yanıtları. Yalnızca gereken en az veri gönderilir; model eğitmek için asla kullanılmaz. | Sorulacak |
| Resend, Inc. | US | Ayrı bir e-posta gönderim hizmeti — bugün kullanılmıyor; yalnızca ürünün e-posta hacmi Workspace aktarıcısını aşarsa (30 gün önceden duyurulur). | Sorulacak |
| Google LLC | US | "Google ile giriş" ve Google E-Tablolar — yalnızca şirket açarsa. | Sorulacak |
| Microsoft Corporation | US | "Microsoft ile giriş" ve Excel — yalnızca şirket açarsa. | Sorulacak |

## İdari ve teknik tedbirler

Veri işleme sözleşmesi Ek 2’deki tedbirler (kaynak: SECURITY.md): şirketler arası ayrım (satır düzeyinde güvenlik), aktarımda ve depolamada şifreleme, rol temelli erişim, işlem kayıtları, yedekleme ve geri yükleme denemesi, zafiyet yönetimi, ihlal müdahale planı (72 saat), çalışan gizlilik taahhütleri, alt işleyen denetimi, silme ve imha.
