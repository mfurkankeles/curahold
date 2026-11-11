---
title: Müşteri portalı
section: help
order: 12
summary: Panoları müşterilerine açmak; müşterinin talep açması, yanıt yazması ve neleri asla göremeyeceği.
---
# Müşteri portalı

Müşteri portalı, seçtiğin panoları müşterilerinin çalışanlarına açar. Müşteri kendi adresinden giriş yapar (örn. `acme.tendwell-portal.com`), kendi şirketi için açık talepleri ve durumlarını görür, yeni talep açar ve yanıt yazar.

## Müşteri neyi görür, neyi asla görmez

| Görür | Asla görmez |
|---|---|
| Kendi şirketinin, **seninle paylaşılmış** görevleri | Başka müşterilerin hiçbir görevi |
| Başlık, açıklama, durum (sütun için seçtiğin adla) | İç notlar ve iç yorumlar |
| **Müşteriye yanıt** olarak yazılan yorumlar | Ekibin, rolleri, diğer kişiler |
| Panoda izin verdiğin ayrıntılar (bitiş tarihi, öncelik, kim ilgileniyor) | Müşteri alanları, fırsatlar, sağlık skoru, kayıtlar |
| | Diğer panolar, diğer şirketler, Tendwell'in kendisi |

Portal ayrı bir alan adında çalışır; uygulamanın oturumu, çerezleri ve API'si oradan hiçbir şekilde erişilebilir değildir. Portal isteklerini çalıştıran veritabanı rolü hiçbir tabloyu okuyamaz; yalnızca giriş yapan kişinin kendi şirketine ait verileri döndüren portal fonksiyonlarını çağırabilir.

## Açmak (yöneticiler)

1. **Ayarlar → Müşteri portalı → Müşteri portalı açık.** Müşterilerin giriş adresi burada görünür.
2. Açmak istediğin panonun **ayarlarında → Müşteri portalı**:
   - **Bu panoyu müşterilere aç**
   - **Yeni talepler şuraya düşer:** bir sütun seç. Yeni talep, müşterinin sorumlusuna atanır.
   - **Müşterinin her sütun için gördüğü ad:** "Hukuk onayı bekliyor" yerine "İnceleniyor" gibi. Boş bırakırsan sütunun adı görünür.
   - **Müşterinin gördüğü ayrıntılar:** bitiş tarihi, öncelik, kim ilgileniyor.

Özel panolar müşterilere açılamaz. Ayardaki şalter kapanınca portal herkes için hemen kapanır.

## Kişileri davet etmek

**Ayarlar → Müşteri portalı → Giriş yapabilen kişiler** ya da müşteri sayfasındaki **Müşteri portalı** bölümünden: ad ve e-posta yaz, **Davet et**. Müşterinin sorumlusu ve yöneticiler davet gönderebilir.

- Şifre yoktur: kişi e-postasına gelen bağlantıyla girer. Davet bağlantısı 7 gün, giriş bağlantısı 30 dakika geçerlidir ve bir kez kullanılır.
- Şirketindeki birinin adresi davet edilemez; portal müşteriler içindir.
- **Kapat** ile erişim ve açık oturumları hemen biter.

## Görevleri paylaşmak ve yanıt yazmak

- Müşterinin açtığı talepler kendiliğinden paylaşılır.
- Ekibin açtığı bir görevi göstermek için görev panelinde **Müşteriyle paylaşılıyor** kutusunu işaretle (görevin bir müşterisi olmalı ve panosu açık olmalı).
- Paylaşılan bir görevde yorum yazarken **İç not** (varsayılan) ya da **Müşteriye yanıt** seç. Müşteriye yanıtlar turuncu çizgiyle ve "Müşteri görür" etiketiyle ayrılır; müşteriye e-postayla da gider.
- Müşterinin yazdıkları "Müşteri" etiketiyle görünür ve görevin sorumlusuna bildirim olarak gelir.
- Bir görevin müşterisi değiştirilirse paylaşım kendiliğinden kalkar; bir müşterinin konuşması başka bir müşteriye asla geçmez.

## Sınırlar

Bir kişi günde en fazla 30 talep ve 200 yanıt yazabilir. Giriş bağlantısı saatte en fazla 5 kez istenebilir; giriş formu, bir adresin erişimi olup olmadığını belli etmez.
