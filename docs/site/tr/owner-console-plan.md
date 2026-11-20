---
title: Sahip konsolu: plan, yatırımcılar, pazartesi özeti ve anlık bildirimler
section: reference
order: 42
summary: Platform sahibi ve işletmeci için — sahip konsolunda Plan ve hedefler (hedefler, bütçe ve harcama, kilometre taşları, yatırım pencereleri, yatırımcı görüşmeleri), iş planı dosyasını yükleme, haftalık CEO e-postası ve sahibin cihazlarına gelen anlık bildirimler.
---
# Sahip konsolu: plan, yatırımcılar, pazartesi özeti ve anlık bildirimler

> Platform sahibi ve sunucuyu işleten kişi için. Müşteriler bunların hiçbirini görmez: hepsi sahip konsolundadır
> (`desk.<alan adınız>`) ve yalnızca kimlik doğrulama uygulamasıyla giriş yapan platform sahibi açabilir.

**Plan ve hedefler** sayfasının üstünde üç görünüm vardır: **Hedefler ve görevler**, **Bütçe ve yatırım** ve
**Pazartesi özeti**. Her görünümün kendi adresi vardır (`/plan`, `/plan?q=investors`, `/plan?q=summary`); böylece bir
e-postadaki ya da anlık bildirimdeki bağlantı doğru görünümü açar.

## Hedefler ve görevler {#targets}

Huninin aylık hedefleri (site ziyaretçisi, deneme talebi, onay, aktivasyon, ödeyen şirket, koltuk, MRR, ARR, fatura,
kaybedilen şirket) ve bu ay gerçekte olanlar; geçen günlere göre gidişatıyla. Altında planın iki **kilometre taşı**
bulunur; hedefleri burada girilir, ölçümleri **Bütçe ve yatırım** görünümündedir.

## İş planını yükleme {#import}

**Plandan yükle**, planın hedef dosyasını (`targets.json`) okur ve seçtiğiniz senaryo için kaç hedef, bütçe satırı,
yatırım penceresi ve görev içerdiğini, hiçbir şey kaydedilmeden önce gösterir. **Yükle** hepsini birlikte kaydeder;
biçimi bozuk bir dosya hiçbir şey yüklemez ve nedenini söyler. Yeniden yüklemek güvenlidir: girdiğiniz harcama, pencere
durumları ve notlar korunur; hiçbir görev iki kez eklenmez.

İşletmeci aynısını terminalden de yapabilir:

```bash
DATABASE_URL=postgres://… npx tsx scripts/plan/load-targets.ts --file targets.json --scenario baz
```

`DATABASE_URL` olmadan ya da `--dry-run` ile yalnızca dosyayı okur ve neyi yükleyeceğini yazar.

## Bütçe ve yatırım {#investors}

- **Bütçe ve harcama**: her ayın planlanan bütçesi (plandan ya da sizin eklediğiniz satırlar), gerçekte harcanan (siz
  girersiniz) ve ödenen faturalardan gelen gelir, planın beklediği gelirin yanında. Elinizdeki nakdi girdiğinizde konsol
  **kalan süreyi** hesaplar: bu ayın ve sonraki iki ayın planlanan harcamasından planın beklediği gelir çıkarıldığında
  nakdin kaç ay yeteceği.
- **Kilometre taşları**: **genişleyen şirket** — en az 3 aydır ödeyen ve son 30 günde en az iki departmanda iş başlatmış
  şirket; **tamamen geçen şirket** — en az 6 aydır ödeyen, bir dış CRM ya da iş takip aracına bağlanmış ve artık
  Curahold'da çalışan şirket (bağlantı kapalı ya da son 30 günde yeni kayıtların %80'i Curahold'da açılmış). İkisi de
  şirketler genelinde gerçek veriden sayılır; yalnızca sayılar gösterilir.
- **Yatırım pencereleri**: bir turun ne zaman açılabileceği, ne kadar toplanacağı ve önce nelerin gerçekleşmesi gerektiği.
  Plan dosyası ön tohum ve tohum pencerelerini getirir (lansmandan sonraki 4–7. ve 10–14. aylar). Pencere ilerledikçe
  durumunu değiştirin (planlandı, hazırlanıyor, açık, kapandı); **Kenara alındı** pencereyi silmek yerine listede soluk
  olarak tutar.
- **Yatırımcı görüşmeleri**: görüştüğünüz melek yatırımcılar, fonlar ve programlar; sizin girdiğiniz aşama, sonraki adım
  ve tarihi, tutar ve bağlı olduğu pencereyle. Kaldırılan bir yatırımcı 30 gün boyunca **Geri getir** ile geri
  getirilebilir. Bu listeyi yalnızca siz görürsünüz.

## Pazartesi özeti {#summary}

Konsol her pazartesi 06:00 UTC'de (İstanbul'da 09:00) size geçen haftayı anlatan tek bir e-posta gönderir: hedefe karşı
gerçekleşen, yeni ve bekleyen deneme talepleri, gelir ve faturalar, sunucu hataları, başarısız eşitlemeler ve uyarılar,
yapay zekâ ekibinin onayınızı bekleyen önerileri, bir müşterinin işini durduran destek talepleri, bu ayın bütçesi ve kalan
süre, sıradaki yatırım penceresi ve bu hafta yapılacak yatırımcı adımları. Konsolun kendi sayılarından yazılır — yapay
zekâ modeli kullanılmaz, bu yüzden hiçbir maliyeti yoktur ve hiçbir şey uydurmaz — ve saatlik iş kaç kez çalışırsa
çalışsın haftada bir kez gider.

**Pazartesi özeti** görünümünden onu kapatabilir, dilini seçebilir (Türkçe ya da İngilizce; anlık bildirimler de aynı
seçimi izler), şu an yazılsaydı nasıl olacağını önizleyebilir ve hemen kendinize gönderebilirsiniz. `PLATFORM_OWNER`
adresine (ya da ilk destek ekibi adresine) gider.

## Cihazlarınıza anlık bildirim {#phones}

Bir müşterinin işini durduran destek talepleri, sistem uyarıları (çok sayıda hata, yavaş yanıt, bekleyen bildirimler) ve
pazartesi özeti, konsol kapalıyken bile cihazlarınıza anlık bildirim olarak gelebilir. Ücretsizdir: mesajı
tarayıcının kendi bildirim hizmeti taşır ve yalnızca sizin cihazınızın okuyabileceği biçimde şifrelenir.

1. İşletmeci bir kez bir anahtar çifti oluşturup sunucuya ekler (aşağıya bakın).
2. Konsolu cihazınızda açın, **Plan ve hedefler → Pazartesi özeti → Bu cihazı ekle**'yi seçin ve bildirimlere izin
   verin. iPhone'da önce konsolu ana ekrana ekleyin (Paylaş → Ana Ekrana Ekle) ve oradan açın.
3. **Deneme gönder** çalıştığını gösterir. **Kaldır** bir cihazı durdurur; tarayıcısı vazgeçen cihaz kendiliğinden kaldırılır.

İşletmeci için: `npx tsx scripts/plan/vapid-keys.ts`, `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` değerlerini yazar;
ikisini de ekleyin (özel olanı gizli değer olarak) ve isterseniz `VAPID_SUBJECT` (bir `mailto:` adresi; varsayılanı
sahibin adresi). Bunlar olmadan konsol anlık bildirimlerin hazır olmadığını söyler; e-posta uyarıları çalışmaya devam
eder. Anahtarları sonradan değiştirmek, her cihazın yeniden eklenmesi demektir.
