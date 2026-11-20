---
title: Erişilebilirlik beyanı
section: legal
order: 10
summary: Curahold ne kadar erişilebilir: hedeflediğimiz standart (WCAG 2.2 AA), nasıl kontrol ettiğimiz, neyin çalıştığı, neyin henüz çalışmadığı ve bir sorunu bize nasıl bildireceğin.
---
# Erişilebilirlik beyanı

Curahold'u kullanan herkes için çalışmalı: yalnızca klavyeyle, ekran okuyucuyla, yakınlaştırılmış ekranda, yüksek kontrast ya da azaltılmış hareketle, telefonda ve sağdan sola yazılan bir dilde. Bu beyan ürünü (uygulama, müşteri portalı, onboarding merkezi ve Ofis'iyle birlikte platform konsolu), web sitesini, belgeleri ve demoyu kapsar.

## Standart

Hedefimiz **Web İçeriği Erişilebilirlik Yönergeleri (WCAG) 2.2, AA düzeyi**. Curahold bugün bu standarda **kısmen uygun**: büyük bölümü AA düzeyini karşılıyor; bildiğimiz eksikler aşağıda. "Kısmen" aynı zamanda engelli kullanıcıların ürünü henüz bizimle birlikte test etmediği anlamına geliyor; bunu değiştirmek istiyoruz.

## Nasıl kontrol ediyoruz

- **Her sürümde** otomatik bir kontrol (axe-core, gerçek bir tarayıcıda) her yüzeyin ana ekranlarını dolaşır — dolu, boş, formda hata varken ve bir pencere açıkken — İngilizce, Türkçe ve Arapça olarak, açık ve koyu temada, masaüstü ve telefon genişliğinde. Ciddi ya da kritik bir sorun bulursa sürüm durur.
- Aynı kontrol klavye yolunu da yürür: ilk durak "İçeriğe geç" bağlantısıdır, her durakta odağın nerede olduğu görünür, pencereler odağı içinde tutar ve kapanınca geri verir, hiçbir yer odağı hapsetmez.
- Her büyük değişiklikte elle: giriş yapma, görev, müşteri, destek talebi, onboarding adımı, kurulum testi ve onaylar boyunca klavye yolu; ekran okuyucunun okuduğu adlar ve roller; açık ve koyu temada metnin, grafiklerin, rozetlerin ve durum noktalarının renk kontrastı; %200 yakınlaştırma, 320 piksel genişliğinde pencere ve geniş metin aralığı; azaltılmış hareket; dokunma hedefleri; sağdan sola dillerde ayna düzen.

## Neler çalışıyor

- **Klavye**: her işlem faresiz yapılabilir; panoda kart taşımak da (Boşluk ile kaldır, ok tuşlarıyla taşı, Boşluk ile bırak, Esc ile vazgeç). Tüm kısayolları görmek için `?` tuşuna bas. Her sayfa "İçeriğe geç" bağlantısıyla başlar.
- **Ekran okuyucular**: düğmelerin, alanların ve simgelerin adı var; sayfalarda bölge işaretleri ve başlıklar var; kendiliğinden beliren mesajlar (kaydedilen bir değişiklik, başarısız bir istek, bir form hatası) okunur; grafiklerin yanında sayılarının metin tablosu bulunur.
- **Görme**: metin ve kontroller açık ve koyu temada AA kontrast oranlarını karşılar; bir durum yalnızca renkle değil, bir kelime ya da simgeyle de gösterilir; düzen %200 yakınlaştırmada ve 320 piksel genişlikte yana kaydırma gerektirmeden çalışır.
- **Hareket**: sisteminde "hareketi azalt" açıksa animasyonlar ve sayarak yükselen rakamlar durur; 3D Ofis de durağan kalır, kamera kaymadan geçer.
- **Dil**: her sayfa kendi dilini söyler, böylece ekran okuyucu doğru sesle okur; Arapça, İbranice ve Farsça sağdan sola dizilir.
- **3D Ofis**: 3D zemindeki her şey metin olarak da var — yanındaki oda ve koltuk listesi ve istediğin an geçebileceğin 2D kat planı.

## Bilinen eksikler

- 3D görünümün kendisi klavyeyle ya da ekran okuyucuyla gezilemiyor; aynı bilgiyi taşıyan yandaki listeyi ya da 2D planı kullan.
- Platform konsolunun talep listelerinde ve Ofis'teki isim etiketlerinde bir talebin ya da koltuğun durumu renkli bir noktayla gösteriliyor. Ekran okuyucular durumu okuyor; ekranda ise Ofis'in açıklaması her rengi adlandırıyor ve talep ya da koltuk açılınca durum yazıyla görünüyor.
- Hukuki sayfalar yalnızca İngilizce ve Türkçe yazıldı; diğer dillerde İngilizce açılırlar.
- Ekip arkadaşlarının ya da müşterilerinin yazdığı metin (görev başlığı, yorum, dosya) yazdıkları gibi gösterilir; yükledikleri resimlere açıklama ekleyemeyiz.
- Bazı sayfalar bağlı bir araçtan gelen içeriği gösterir (ör. bir e-postanın gövdesi). Bunu aracın gönderdiği gibi gösteriyoruz ve erişilebilirliğini garanti edemiyoruz.

## Bize yaz

Bir şeyi kullanmak zor ya da imkânsızsa lütfen bize söyle — bu bir hatadır ve öyle ele alırız.

- **Giriş yapmışsan**: menüden **Yardım**'ı aç ve **Desteğe yaz**'ı seç. Konuya "erişilebilirlik" yaz ki doğru kişiye ulaşsın.
- **Hesabın yoksa**: **[erişilebilirlik iletişim adresi]** adresine yaz.

Hangi sayfada, ne yapmaya çalıştığını ve hangi tarayıcıyla, hangi yardımcı teknolojiyi kullandığını yaz. Beş iş günü içinde yanıtlarız; bir şey hızlıca düzeltilemiyorsa sana bir çıkış yolu söyleriz.

Bu beyan en son 20 Kasım 2026'da gözden geçirildi.
