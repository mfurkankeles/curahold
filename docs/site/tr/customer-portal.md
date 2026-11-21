---
title: Müşteri portalı
section: help
order: 12
summary: Panoları müşterilerine açmak; müşterinin talep açması, yanıt yazması ve neleri asla göremeyeceği.
---
# Müşteri portalı

Müşteri portalı, seçtiğiniz panoları müşterilerinin çalışanlarına açar. Müşteri kendi adresinden giriş yapar (örn. `acme.curahold-portal.com`), kendi şirketi için açık talepleri ve durumlarını görür, yeni talep açar ve yanıt yazar.

## Müşteri neyi görür, neyi asla görmez

| Görür | Asla görmez |
|---|---|
| Kendi şirketinin, **seninle paylaşılmış** görevleri | Başka müşterilerin hiçbir görevi |
| Başlık, açıklama, durum (sütun için seçtiğiniz adla) | İç notlar ve iç yorumlar |
| **Müşteriye yanıt** olarak yazılan yorumlar | Ekibiniz, rolleri, diğer kişiler |
| Panoda izin verdiğiniz ayrıntılar (bitiş tarihi, öncelik, kim ilgileniyor) | Müşteri alanları, fırsatlar, sağlık skoru, kayıtlar |
| | Diğer panolar, diğer şirketler, Curahold'un kendisi |

Portal ayrı bir alan adında çalışır; uygulamanın oturumu, çerezleri ve API'si oradan hiçbir şekilde erişilebilir değildir. Portal isteklerini çalıştıran veritabanı rolü hiçbir tabloyu okuyamaz; yalnızca giriş yapan kişinin kendi şirketine ait verileri döndüren portal fonksiyonlarını çağırabilir.

## Açmak (yöneticiler)

1. **Ayarlar → Müşteri portalı → Müşteri portalı açık.** Müşterilerin giriş adresi burada görünür.
2. Açmak istediğiniz panonun **ayarlarında → Müşteri portalı**:
   - **Bu panoyu müşterilere aç**
   - **Yeni talepler şuraya düşer:** bir sütun seçin. Yeni talep, müşterinin sorumlusuna atanır.
   - **Müşterinin her sütun için gördüğü ad:** "Hukuk onayı bekliyor" yerine "İnceleniyor" gibi. Boş bırakırsanız sütunun adı görünür.
   - **Müşterinin gördüğü ayrıntılar:** bitiş tarihi, öncelik, kim ilgileniyor.

   Daha hızlısı, henüz açık pano yokken: **Ayarlar → Müşteri portalı** panolarını listeler; taleplerin düşeceği panoda **… panosunu müşterilere aç**'a tıklayın (talepler ilk sütununa düşer).

Özel panolar müşterilere açılamaz. Ayardaki şalter kapanınca portal herkes için hemen kapanır.

## Kişileri davet etmek

**Ayarlar → Müşteri portalı → Giriş yapabilen kişiler** ya da müşteri sayfasındaki **Müşteri portalı** bölümünden: ad ve e-posta yazıp **Davet et**'e tıklayın. Müşterinin sorumlusu ve yöneticiler davet gönderebilir.

- Davet bağlantısı 7 gün geçerlidir ve bir kez kullanılır. Sonraki girişler, şirketinizin açtığı yollardan biriyle olur (aşağıda).
- Şirketindeki birinin adresi davet edilemez; portal müşteriler içindir.
- **Kapat** ile erişim ve açık oturumları hemen biter.

## Giriş yolları

**Ayarlar → Müşteri portalı → Müşteriler nasıl giriş yapar** bölümünden müşterilerinize uyan yolları seçersiniz:

| Yol | Nasıl çalışır |
|---|---|
| **E-posta kodu ve bağlantısı** | Tek e-postada 6 haneli kod ve bağlantı gelir; ikisi de bir kez ve 30 dakika çalışır. Kod, e-postayı telefonda okuyup bilgisayardan girmeyi sağlar. Beş yanlış deneme bir kodu bitirir; üst üste on yanlış kod o kişinin kodlarını 15 dakika durdurur (e-postadaki bağlantı çalışmaya devam eder). |
| **Google** | Kişi şirket Google hesabıyla girer. Şirketi hesabını kapatırsa portala da giremez. |
| **Microsoft** | Microsoft 365 hesabıyla girer. İlk Microsoft girişi bir kez e-postaya gelen kodla onaylanır; sonra hesabın kendisi tanınır. |
| **Passkey** | Parmak izi, yüz tanıma ya da cihaz PIN'i. En güvenli yol; kişi ilk girişten sonra **Hesabınız** sayfasından ekler. Passkey yalnızca o portalın adresinde çalışır, sahte bir sitede işe yaramaz. |
| **Şifre** | İsteyen müşteriler için (varsayılan kapalı). En az 10 karakter; 5 yanlış denemede 15 dakika kilitlenir; "Şifremi unuttum" e-postayla yenilenir. |

- **Açık kalma süresi:** 1, 7, 30 (varsayılan) ya da 90 gün.
- **Giriş bildirimi:** Google, Microsoft, passkey ya da şifreyle giriş yapılınca kişiye "yeni giriş" e-postası gider (kapatılabilir).
- Bir yolu kapatınca o yolla açılmış oturumlar da kapanır; süreyi kısaltınca eski oturumlar biter. En az bir giriş yolu (e-posta, Google, Microsoft ya da şifre) açık kalmalıdır.
- Giriş formu, bir adresin erişimi olup olmadığını belli etmez. Bir adrese saatte en fazla 5 e-posta gider.
- Müşterinin çalışanı **Hesabınız** sayfasından passkey ekler, şifresini belirler, bağlı Google/Microsoft hesabını kaldırır ya da her yerden çıkış yapar.

## Görevleri paylaşmak ve yanıt yazmak

- Müşterinin açtığı talepler kendiliğinden paylaşılır.
- Ekibinizin açtığı bir görevi göstermek için görev panelinde **Müşteriyle paylaşılıyor** kutusunu işaretleyin (görevin bir müşterisi olmalı ve panosu açık olmalı).
- Paylaşılan bir görevde yorum yazarken **İç not** (varsayılan) ya da **Müşteriye yanıt** seçin. Müşteriye yanıtlar turuncu çizgiyle ve "Müşteri görür" etiketiyle ayrılır; müşteriye e-postayla da gider.
- Müşterinin yazdıkları "Müşteri" etiketiyle görünür ve görevin sorumlusuna bildirim olarak gelir.
- Bir görevin müşterisi değiştirilirse paylaşım kendiliğinden kalkar; bir müşterinin konuşması başka bir müşteriye asla geçmez.

## Müşterilerden gelen dosyalar

Müşteriler yalnızca kendileriyle paylaşılan isteklere ve taleplere, bir de başlangıç planlarının adımlarına dosya gönderebilir. Başka hiçbir yere değil.

- Belge, resim, tablo, CSV, PDF ve ZIP; her biri en fazla 25 MB. Her dosya türüne ve ilk baytlarına göre denetlenir ve her zaman indirilerek açılır.
- Müşterilerin toplamda ne kadar gönderebileceğini Ayarlar → **Müşteri portalı** → **Müşterilerden gelen dosyalar**'dan belirlersiniz (değiştirmezseniz 2.048 MB). Dolunca müşteriye dosyayı başka yolla göndermesi söylenir.
- Müşterinin gönderdiği her dosya o müşterinin zaman çizelgesinde görünür.

## Sınırlar

Bir kişi günde en fazla 30 talep ve 200 yanıt yazabilir.
