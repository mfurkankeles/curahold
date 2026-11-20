---
title: Ürün e-postası Google Workspace üzerinden (SMTP aktarıcısı)
section: developers
order: 11
summary: Yöneticiler ve işletmeciler için — Curahold'un kendi e-postalarını (giriş bağlantıları, hatırlatmalar, özetler) Google Workspace SMTP aktarıcısıyla göndermek; barındırılan hizmet ve kendi sunucunuz için ayarlar, sınırlar ve ayrı bir gönderim hizmetinin ne zaman gerektiği.
---
# Ürün e-postası Google Workspace üzerinden (SMTP aktarıcısı)

> Yöneticiler ve işletmeciler için. Önce DNS rehberini (*Google Workspace ile alan adınızda e-posta*) tamamlayın: aktarıcı ancak SPF, DKIM ve DMARC geçerse iyi teslim eder.

Curahold giriş bağlantıları, hatırlatmalar, deneme bildirimleri ve özetler gönderir. Sıradan bir Gmail kutusu bir uygulamanın e-postası için tasarlanmamıştır; Google'ın **SMTP aktarma hizmeti** bunun içindir. Google Workspace içinde kalır; başka bir e-posta hizmeti gerekmez.

## 1. Aktarıcıyı açın

Yönetici konsolu → Uygulamalar → Google Workspace → Gmail → **Yönlendirme** → **SMTP aktarma hizmeti** → Yapılandır:

- **İzin verilen göndericiler:** yalnızca alan adlarımdaki adresler.
- **Kimlik doğrulama:** **SMTP kimlik doğrulaması gerektir** kutusunu işaretleyin (barındırılan hizmet sabit adresi olmayan sunucularda çalışır; izin listesine eklenmek yerine giriş yapar). Sabit adresli kendi sunucunuzda "Yalnızca belirtilen IP adreslerinden gelen postaları kabul et" de seçilebilir.
- **Şifreleme:** **TLS şifrelemesi gerektir** kutusunu işaretleyin.
- Kaydedin. Etkinleşmesi bir saati bulabilir.

## 2. Gönderen hesap

Aktarıcıya giriş yapacak kullanıcıyı seçin (sahibin hesabı yeter), 2 Adımlı Doğrulama açık olsun ve onun için bir **uygulama şifresi** oluşturun (Google hesabı → Güvenlik → Uygulama şifreleri). Ürün e-postalarının kendi alan adınızdan gelmesi için `no-reply@`’yi bu kullanıcının takma adı yapın.

## 3. Curahold'a söyleyin

**Barındırılan (Cloudflare Workers)** — gizli değer olarak (`wrangler secret put …`):

| Ayar | Değer |
| --- | --- |
| `SMTP_RELAY_USER` | 2. adımdaki kullanıcı, örn. `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | onun uygulama şifresi |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay` (üstteki ikisi varsa kendiliğinden seçilir) |
| `SMTP_RELAY_HOST`, `SMTP_RELAY_PORT` | yalnızca varsayılanları (`smtp-relay.gmail.com`, `587`) değiştirmek için |

Kod yolu `api/src/lib/smtpRelay.ts`'dir (587 numaralı portta STARTTLS; Workers'ta 25 numaralı port kapalıdır).

**Kendi sunucunuzda** — `.env` dosyasında:

```
SMTP_URL=smtp://owner%40example.com:UYGULAMA-ŞİFRESİ@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

(`%40`, kullanıcı adındaki et işaretidir.) Uygulamayı yeniden başlatın.

## 4. Kontrol

Çıkış yapıp bir giriş bağlantısı isteyin. İleti `no-reply@…` adresinden gelmeli ve **Orijinali göster**'de SPF, DKIM ve DMARC **PASS** görünmeli. Hiçbir şey gelmezse uygulama günlüğü hangi SMTP adımının başarısız olduğunu yazar (greeting, starttls, auth, rcpt to…).

## 5. Sınırlar — ve ayrı bir gönderim hizmeti ne zaman gerekir

Aktarıcı **kullanıcı başına günde 10.000 alıcıya** kadar kabul eder (Google'ın yayımladığı sınır; değişebilir, yönetici yardımından kontrol edin). Ürün e-postasını ayrı bir gönderim hizmetine taşımak — şirket sahibinin kararı ve ücretli — şu durumlardan **herhangi biri** olduğunda gerekir:

- günlük ürün e-postası düzenli olarak sınırın **yarısını** (günde 5.000 alıcı) geçerse;
- teslim edilebilirlik düşerse: geri dönmeler **%2**'nin üstüne çıkarsa, şikâyetler **%0,1**'e yaklaşırsa ya da postalar spam'e düşmeye başlarsa;
- ileti bazında teslim olaylarına (webhook) ya da farklı e-posta türleri için ayrı gönderim itibarına ihtiyaç olursa;
- **pazarlama kampanyaları** planlanırsa — bunlar asla aktarıcıdan gönderilmez.

Geçiş bir ayardır: barındırılan hizmette ayrı bir gönderim hizmeti için sürücü zaten vardır (`EMAIL_PROVIDER=resend` ve `RESEND_API_KEY`). Önce Alt işleyenler sayfasına ekleyin ve yöneticilere 30 gün önceden bildirin.

## 6. Posta gitmediğinde {#failures}

Geçici bir ret (`421`, `450`, `451` ya da kopan bir bağlantı) yeni bir bağlantıyla bir kez daha denenir. Kalıcı bir ret denenmez: `535` (uygulama parolası değişti ya da iptal edildi: yenisini oluşturup `SMTP_RELAY_PASSWORD` değerini değiştirin), `550 5.4.5` (günlük sınır), `550 5.1.1` (var olmayan bir adres). Kişiler bu durumda kendi dillerinde "E-postayı şu anda gönderemedik. Lütfen birkaç dakika sonra yeniden deneyin; sorun sürerse yöneticinize haber verin." görür, aktarıcının yanıtını asla görmez; o yanıt SMTP adımıyla birlikte uygulamanın hata kaydına gider.
