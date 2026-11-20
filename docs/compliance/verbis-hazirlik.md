# VERBİS hazırlık formu

> scripts/compliance/legal-pack.ts tarafından veri envanterinden (shared/src/compliance/dataInventory.ts) üretilir. Taslak — avukat onayı gerekli.

**Kayıt yükümlülüğü.** Türkiye’de kurulu veri sorumlusu: 50’den az çalışan **ve** yıllık mali bilanço toplamı 100 milyon TL’den az ise kayıt muafiyeti vardır (Kurul Kararı 2023/1154); özel nitelikli veri işlemek ana faaliyet değildir. **Yurt dışında kurulu veri sorumlusu ise büyüklüğünden bağımsız olarak kaydolmak ve Türkiye’de bir temsilci atamak zorundadır.** Şirketin nerede kurulacağı kararı (araştırma §5) bu formu doğrudan etkiler.

**Veri sorumlusu:** [Şirket unvanı] · MERSİS [MERSİS no.] · KEP [KEP address] · İrtibat kişisi: [ad soyad]

## İşleme faaliyetleri

| Faaliyet | Amaç | Veri konusu kişi grubu | Kişisel veri kategorisi | Hukuki sebep | Saklama süresi | Alıcı grupları | Yurt dışına aktarım |
| --- | --- | --- | --- | --- | --- | --- | --- |
| accounts | Hizmetin sunulması: hesaplar, giriş, bildirimler | Müşteri şirketlerin kullanıcıları | Kimlik, İletişim, Mesleki deneyim | KVKK m. 5/2-c (sözleşmenin kurulması veya ifası) | Hesap açık olduğu sürece; silinen kişi hemen (iş kaydı anonim kalır); şirketin tamamı bir yöneticinin silme talebinden 30 gün sonra, silme belgesiyle (yedekler 35 gün içinde üzerine yazılır) | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| security | Hesap güvenliği, kötüye kullanımın tespiti, koltuk başına cihaz sınırı | Kullanıcılar, portal kişileri, giriş sayfası ziyaretçileri | İşlem güvenliği | KVKK m. 5/2-ç (hukuki yükümlülük, 5651 s. Kanun) ve m. 5/2-f (meşru menfaat) | 12 ay, sonra silinir | Cloudflare, Inc., Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| customerData | Müşterinin belgelenmiş talimatıyla işleme (Veri işleme sözleşmesi) | Müşterilerin kendi müşterileri, iletişim kişileri ve çalışanları | Kimlik, İletişim, Müşteri işlem | Veri sorumlusu müşteridir; Curahold veri işleyendir (KVKK m. 12) | Sözleşme süresince; her an dışa aktarılabilir; şirket silme isteğinden 30 gün sonra silinir (dosyalar, bağlantı anahtarları ve önbellekler dahil), yedekler 35 gün içinde; faturalar vergi mevzuatı gereği saklanır | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace), Anthropic PBC | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| trialLeads | Deneme talebinin değerlendirilmesi, kişiyle iletişim, denemenin açılması | Deneme talep eden kişiler | Kimlik, İletişim, Mesleki deneyim | KVKK m. 5/2-c (sözleşmenin kurulması) ve m. 5/2-f (meşru menfaat) | Deneme başlamazsa talepten itibaren 12 ay; başlarsa hesap verisi gibi | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| consentRecords | Rıza ve izinlerin ispatı; geri alınanlara uyulması | Ziyaretçiler, kullanıcılar, deneme başvuranları | Pazarlama, İşlem güvenliği | KVKK m. 5/2-ç (hukuki yükümlülük; Ticari İletişim Yönetmeliği m. 7(10), 13) | Kayıttan sonra 3 yıl; yürürlükteki izin dayanıldığı sürece saklanır; çerez tercihleri 3 yıl; kayıtlar değiştirilemez, yalnızca anonimleştirilir | Cloudflare, Inc., Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| contracts | Sözleşmenin ispatı (tıklayarak kabul kaydı) | Koşulları kabul eden yöneticiler | Kimlik, İletişim, Hukuki işlem | KVKK m. 5/2-c ve m. 5/2-e (bir hakkın tesisi, kullanılması veya korunması) | Sözleşme süresi artı 10 yıl (zamanaşımı) | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace) | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| billing | Faturalama ve muhasebe | Ödeyen şirketlerin fatura yetkilileri | Finans, Müşteri işlem | KVKK m. 5/2-c ve m. 5/2-ç (VUK, TTK) | 10 yıl (TTK m. 82) | Paddle.com Market Ltd, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyenlere aktarım; Paddle.com Market Ltd: ayrı veri sorumlusuna aktarım, veri sorumlusundan veri sorumlusuna sözleşme) |
| support | Destek taleplerinin yanıtlanması | Yardım isteyen kullanıcılar | Kimlik, İletişim, Müşteri işlem, Görsel ve işitsel kayıtlar | KVKK m. 5/2-c ve m. 5/2-f | Talebin son değişikliğinden sonra 24 ay; kayıtlar 7 gün | Cloudflare, Inc., Supabase, Inc., Google LLC / Google Ireland Ltd (Google Workspace), Anthropic PBC | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| ai | Ürün içinde yanıt vermek (bir yönetici yapay zekâyı açana kadar kapalı ve yalnızca kişi bilgilendirmeyi kabul ettikten sonra); model eğitimi için asla kullanılmaz | Yapay zekâ asistanına soran kullanıcılar; soruda adı geçen kişiler | Kimlik, Müşteri işlem | Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır | Sorular şirketin seçtiği süre kadar: hiç, 7, 30 (varsayılan), 90 ya da 365 gün; cevaplar saklanmaz (yalnızca belgelerden derlenen bir cevap 7 gün yeniden kullanılabilir); kişiyle birlikte silinir; sağlayıcıda [30 gün — teyit], eğitim yok | Anthropic PBC, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| aiDrafts | Kişinin okuyup değiştireceği bir yanıt, takip ya da özet taslağı hazırlamak; kişi onaylamadan hiçbir şey kaydedilmez ya da gönderilmez (bir yönetici yapay zekâyı açana kadar kapalı); model eğitimi için asla kullanılmaz | Taslak isteyen kullanıcılar; taslağın hazırlandığı kayıtta adı geçen müşteri kişileri ve çalışma arkadaşları | Kimlik, İletişim, Müşteri işlem | Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır | Asistan taslak saklamaz: onaylanan taslak kaydedildiği kayıtta, o kaydın saklama süresiyle durur; sağlayıcıda [30 gün — teyit], eğitim yok | Anthropic PBC, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| publicAsk | Web sitemizde ya da belgelerimizde bir ziyaretçinin sorusunu yapay zekâyla cevaplamak (yalnızca ziyaretçi bilgilendirmeyi kabul ettikten sonra); model eğitimi için asla kullanılmaz | Web sitemizde ya da belgelerimizde asistana soru soran ziyaretçiler | İşlem güvenliği, Diğer | KVKK m. 5/1 (açık rıza); istek sınırı için IP adresi m. 5/2-f; yurt dışındaki yapay zekâ sağlayıcısına aktarım m. 9 | Soru Curahold’da saklanmaz; belgelerden derlenen bir cevap, sorunun tek yönlü özeti altında 7 gün yeniden kullanılabilir; bilgilendirmeye verilen cevap rıza kaydı olarak saklanır; sağlayıcıda [30 gün — teyit], eğitim yok | Cloudflare, Inc., Supabase, Inc., Anthropic PBC | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| humanCheck | Robotları herkese açık formlardan uzak tutmak (Cloudflare Turnstile; bulmaca yok, izleme çerezi yok) | Herkese açık bir formu dolduran ziyaretçiler (deneme talebi, kayıt, portal girişi) | İşlem güvenliği | KVKK m. 5/2-f (meşru menfaat: güvenlik); yurt dışı aktarım m. 9 | Curahold saklamaz; Cloudflare'de kendi koşullarına göre | Cloudflare, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| sessionRecording | Curahold desteğinin, kişinin bildirdiği hatayı görmesi (varsayılan kapalı) | Destek kayıtlarını açan şirketin kullanıcıları | Görsel ve işitsel kayıtlar | Müşteri adına (veri işleyen) | 7 gün | Cloudflare, Inc., Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| aiTeam | Curahold'un kendi işleri; yapay zekâ ekibi yalnızca önerir, her dış eylemi bir kişi onaylar | Curahold'un kendi işletmecileri; işletmecinin görevinde adı geçen müşteri kişileri | Kimlik, İletişim | KVKK m. 5/2-f (meşru menfaat) | Görev bitene ya da not silinene kadar; silinen kişinin geçtiği yerler karartılır | Anthropic PBC, Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| breachLog | Yasanın istediği ihlal kaydı (GDPR md. 33(5); KVKK Kurul kararı 2019/10; DPA §7) | Kişisel veri ihlalinden etkilenen kişiler (ad değil, sayı ve veri türü olarak) | İşlem güvenliği | KVKK m. 5/2-ç (hukuki yükümlülük) | İhlal kapandıktan sonra 5 yıl [avukat teyit edecek] | Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| website | Web sitesinin çalışması; onayla, sitenin ve reklamlarımızın ölçülmesi | Web sitesi ziyaretçileri | Pazarlama, İşlem güvenliği | Zorunlu çerezler için m. 5/2-f; analiz ve reklam için açık rıza (m. 5/1) ve yurt dışına aktarım için m. 9 | Çerezler sayfasında yazdığı gibi | Cloudflare, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |
| marketing | Ürün haberleri ve tekliflerin e-postayla gönderilmesi | Pazarlama e-postasına onay verenler | Pazarlama, İletişim | Açık rıza (m. 5/1) ve 6563 s. Kanun kapsamında ticari ileti onayı (İYS) | İzin geri alınana kadar; ret, gönderilmeyecekler listesinde tutulur | Google LLC / Google Ireland Ltd (Google Workspace), Supabase, Inc. | Evet — KVKK m. 9 standart sözleşme (veri işleyene aktarım) |

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
- Diğer

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
