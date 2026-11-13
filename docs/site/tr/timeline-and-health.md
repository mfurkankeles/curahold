---
title: Zaman çizelgesi ve sağlık skoru
section: help
order: 4
summary: Görüşme ve notları kaydetme, müşterinin geçmişi ve nedenini gösteren sağlık skoru.
---
# Zaman çizelgesi ve sağlık skoru

Her müşteri sayfasında bir **zaman çizelgesi** ve, açtıysanız, bir **sağlık skoru** vardır. Zaman çizelgesi müşteriyle ne olduğunu anlatır; skor bunun sonucunu tek bir sayıyla, nedenleriyle birlikte gösterir.

## Zaman çizelgesi

Üstteki kutudan **Not**, **Görüşme**, **Toplantı** ya da **E-posta** seç, ne olduğunu yaz ve ekle. İstersen tarihini değiştir ve görüştüğün kişileri işaretle.

Çizelgede bunlar da kendiliğinden görünür:

- Müşteri için açılan ve tamamlanan görevler
- Bu görevlere yazılan yorumlar
- Eklenen kişiler (paydaşlar)
- Sağlık skorunun bir günde 10 puan ya da daha fazla değiştiği günler

Önemli bir notu **Sabitle** ile en üste taşı. Bir kaydı yazan kişi ya da müşterileri yöneten biri düzenleyebilir ve silebilir. Görmediğin bir panodaki görev ya da senden gizlenen bir alan çizelgede de görünmez.

## Planlı toplantılar

Zaman çizelgesi olan bitendir. **Planlı toplantılar** ise henüz yapılmamış olanlar. Müşteri sayfasında **Yaklaşan toplantılar** altında **Toplantı planla**’yı seç: bir tür seç (toplantı, değerlendirme ya da arama; ya da kayıtlı türlerinden biri), ne zaman başlayacağını ve ne kadar süreceğini belirle, iki taraftan kişileri davet et, gündemi yaz ve tekrarlanıp tekrarlanmayacağını seç. Müşteri sayfasında ve **Takvim**’de görünür, ama henüz çizelgede değildir — yapılana kadar hiçbir şey kaydedilmez.

Her planlı toplantının bir ömrü var:

- Gerçekleştiğinde **Yapıldı** işaretle. Bu, toplantıyı gündem notlarıyla birlikte zaman çizelgesine kaydeder ve ikisini bağlar. Tekrarlıysa bir sonrakini senin için planlar. Aynı anda sonraki adımları kararlaştırabilirsin; her biri bir görev olur.
- Bir nedenle **Ertele**. Kayıtta kalır; aynı saatte yeni bir güne alabilirsin.
- Bir nedenle **İptal et**. İptal olarak kayıtta kalır — hiçbir şey silinmez.

**Kayıtlı türler.** Bir yönetici, sık yaptığın toplantıları adlandırabilir — üç aylık iş değerlendirmesi, aylık durum görüşmesi — ve her birine bir gündem şablonu verebilir. Planlarken bir tür seçince gündem dolar, böylece her değerlendirme aynı sorularla başlar.

## Sağlık skoru

Ayarlar → Sağlık skoru'ndan açılır. Her müşteri için 0 ile 100 arası bir sayıdır ve Curahold'da zaten olan bilgilerden hesaplanır:

| Sinyal | Tam puan | Sıfır puan |
| --- | --- | --- |
| Son temas | Son görüşme, toplantı, e-posta ya da not 14 gün içinde | 45 gün ve daha eski |
| Geciken işler | Geciken görev yok | 3 ya da daha fazla geciken görev |
| Destek yükü | Açık destek talebi yok | 5 açık talep (acil olan iki kez sayılır) |
| Güçlü destekçi | En az bir "Güçlü destekçi" kişi | Hiç yok |
| Karar verici biliniyor | En az bir "Karar verici" kişi | Hiç yok |
| Engelleyici yok | Engelleyici ya da şüpheci yok | Bir engelleyici var |
| Sahibinin değerlendirmesi | Seçim alanının ilk seçeneği (örneğin "İyi") | Son seçeneği (örneğin "Riskli") |
| Bir sayı alanı | Senin belirlediğin değer | Senin belirlediğin değer |

Ağırlıkları, gün sayılarını ve bantları (Sağlıklı, İzlenmeli, Riskli) sen belirlersin. Kaydetmeden önce önizleme, hangi müşterinin kaç puan alacağını gösterir. Bir müşteri için verisi olmayan sinyal hesaba katılmaz; ağırlığı diğerlerine paylaştırılır.

> **Neden?** Müşteri sayfasındaki skorun yanındaki **Neden?** düğmesi her sinyalin aldığı puanı ve son haftaların grafiğini gösterir. Skor bir kara kutu değildir: her puanın nereden geldiği görülür.

Skor sıradan bir müşteri alanı gibi davranır: listelerde sütun olur, filtrelenir, ana sayfa kartlarında, dışa aktarmada, API'de ve webhook'larda yer alır. CRM eşitlemesinde bir alanla eşleştirirsen CRM'e de yazılır. Kimse elle değiştiremez.

Skor, müşteriyle ilgili bir şey değişince birkaç saniye içinde, ayrıca her gün bir kez yeniden hesaplanır. Her günün skoru saklanır; eğilim ve haftalık özet buradan gelir.

## Haftalık özet

Pazartesi sabahı, sabah özetini seçtiğin saatte müşterilerinin özeti gelir: önümüzdeki 30 günde yenilenecekler, skoru düşenler ve en büyük nedeni, 30+ gündür sessiz kalanlar ve haftanın işleri. Ayarların'dan kapatabilirsin.
