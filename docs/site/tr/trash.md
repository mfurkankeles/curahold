---
title: Çöp kutusu
section: help
order: 6.5
summary: Sildiğin şey 30 gün durur ve eskisi gibi geri alınabilir. Kim neyi görür, kalıcı silme nasıl yapılır.
---
# Çöp kutusu

Curahold'da bir şeyi silmek hemen kesinleşmez. Silinen şey çöp kutusuna taşınır, orada 30 gün kalır ve eskisi gibi geri alınabilir. 30 gün dolunca dosyalarıyla birlikte kalıcı olarak silinir.

## Çöp kutusuna ne gider

| Sildiğin | Onunla birlikte giden | Kalan |
| --- | --- | --- |
| Müşteri | Kayıtları (kişiler, fırsatlar ve diğerleri), zaman çizelgesi, toplantıları, sağlık geçmişi ve portal kişileri | Görevleri panolarında kalır, müşterisiz olur |
| Görev | Alt görevleri, yorumları, süre kayıtları, takipçileri, bağlantıları ve dosyaları | Başka hiçbir şeye dokunulmaz |
| Kayıt | Yorumları ve dosyaları | Ona bağlı görevler |
| Zaman çizelgesi girişi ya da toplantı | Yalnızca kendisi | Toplantının sonraki adımları görev olarak kalır |
| Sayfa, kayıtlı rapor, otomasyon | Yalnızca kendisi | Otomasyonun daha önce açtığı görevler |

Bir içe aktarmayı geri almak, o içe aktarmanın eklediği her şeyi çöp kutusuna tek bir öğe olarak koyar.

Bazı şeyler doğrudan silinir, çöp kutusundan geçmez: tek bir yorum, tek bir dosya, bir süre kaydı, kayıtlı bir görünüm, bir webhook ya da API anahtarı.

## Geri almak

Silmenin hemen ardından ekranın altındaki bildirimde **Geri al** çıkar. Daha sonra menünü aç (sol altta), **Çöp kutusu**'nu seç, öğeyi bul ve **Geri al** de.

Eskisi gibi döner: aynı adreste, onunla birlikte giden her şeyle. Başka şeylerin ona tuttuğu bağlar yeniden kurulur: müşterinin görevleri yine onu gösterir; biri o arada bir görevi başka bir müşteriye bağladıysa o bağa dokunulmaz. Bir CRM'e bağlıysa eşitleme onu yeniden izler. Kimseye bildirim gitmez, webhook gönderilmez: geri gelmek yeni bir haber değildir.

Üç şey geri gelmez: onunla ilgili daha önce gönderilmiş bildirimler ile müşterinin portal kişilerinin açık oturumları ve tek kullanımlık bağlantıları. Yeniden giriş yaparlar; kabul edilmemiş bir davetin yeniden gönderilmesi gerekir.

### Henüz geri gelemiyorsa

- **Bağlı olduğu şey de çöp kutusunda.** Kayıt müşterisine, alt görev üst görevine ihtiyaç duyar. Curahold hangisi olduğunu söyler; önce onu geri al.
- **Bağlı olduğu şey artık yok.** Örneğin o kayıt türü kaldırılmış. Geri alınamaz.
- **Yerini başka bir şey almış.** Aynı CRM kimliğini şimdi başka bir müşteri, aynı e-postayı başka bir portal kişisi taşıyor. Önce onu değiştir ya da kaldır.

Altındaki bir şey bağlı olduğu şeyi kalıcı olarak yitirdiyse gerisi yine de geri gelir; mesaj kaç öğenin dışarıda kaldığını söyler.

## Kim neyi görür

- Kendi sildiğini görür ve geri alırsın.
- Şirket ayarlarını değiştirebilen ya da gizliliği yöneten kişiler şirkette silinen her şeyi görür ve hepsini geri alabilir.
- Görüntüleyici koltuğundakiler silemez; onların çöp kutusu olmaz.

## Kalıcı olarak silmek

Şirket ayarlarını değiştirebilen ya da gizliliği yöneten kişiler herhangi bir öğede **Kalıcı olarak sil** diyebilir. Öğe dosyalarıyla birlikte o anda silinir ve kimse geri alamaz. 30 gün bekleyemeyecek bir kişisel veri silme talebinde bunu kullan.

Diğer her şey 30 günü dolunca kendiliğinden gider.

## Geliştiriciler için

Bir şeyi çöp kutusuna taşıyan her `DELETE` cevabında bir `trashId` gelir. Listeleme, geri alma ve kalıcı silme [çöp kutusu başvurusunda](/docs/tr/ref-trash/).
