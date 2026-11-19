---
title: Hizmet düzeyi sözleşmesi
section: legal
order: 7
summary: Curahold'un ücretli planlarda taahhüt ettiği erişilebilirlik, ölçüm yöntemi, hizmet kredileri, destek yanıt süreleri, yedekler ve kurtarma hedefleri.
---
# Hizmet düzeyi sözleşmesi (SLA)

> **Taslak — avukat onayı gerekli.** Sürüm 2026-11-19.draft1. Ücretli planlarda Kullanım koşullarının parçasıdır (denemelerde değil). [Köşeli parantez] içindeki rakamlar öneridir: yalnızca izlememizin kanıtlayabildiği bir rakam taahhüt edilir.

## 1. Erişilebilirlik

- **Hedef:** Hizmet her takvim ayının **%[99,5]**'inde erişilebilir olur.
- **Ölçüm:** giriş sayfası ve API, en az iki bölgeden her dakika dışarıdan denetlenir; iki bölge de başarısız olursa o dakika erişilemez sayılır. Rakamlar durum sayfasında gösterilir [durum sayfası adresi].
- **Sayılmayanlar:** en az 48 saat önceden duyurulan planlı bakım (ayda en fazla [4] saat, mümkünse İstanbul saatiyle 08.00–20.00 dışında); Müşteri'den, ağından ya da bağladığı üçüncü taraf araçlardan kaynaklanan sorunlar; koşullara göre askıya alma; mücbir sebep; beta olarak işaretlenmiş özellikler.

## 2. Hizmet kredileri

| Aylık erişilebilirlik | Kredi (o ayın bedelinin payı) |
| --- | --- |
| %[99,5] altı | %[10] |
| %[99,0] altı | %[25] |
| %[95,0] altı | %[50] |

Kredi, ay bittikten sonra 30 gün içinde bir yönetici tarafından destek üzerinden talep edilir. Krediler sonraki faturadan düşülür, nakden ödenmez ve erişilebilirlik hedefinin tutturulamamasında **tek çaredir**. Herhangi altı ayın üçünde erişilebilirlik %[99,0]'ın altında kalırsa Müşteri sözleşmeyi sona erdirip peşin ödediği bedeli geri alabilir.

## 3. Destek

| Önem | Örnek | İlk yanıt |
| --- | --- | --- |
| 1 — kritik | Hizmet çalışmıyor ya da veri risk altında | [4] iş saati |
| 2 — büyük | Önemli bir özellik çalışmıyor, geçici çözüm yok | [1] iş günü |
| 3 — küçük | Bir özellik çalışmıyor, geçici çözüm var | [2] iş günü |
| 4 — soru | Nasıl yapılır, talepler | [3] iş günü |

Mesai: [İstanbul saatiyle 09.00–18.00, pazartesi–cuma, Türkiye'deki resmî tatiller hariç]. Kanallar: uygulama içi yardım ve [destek e-postası].

## 4. Yedekler ve kurtarma

- En az günlük yedek, 35 gün saklanır.
- **Kurtarma noktası hedefi:** [24] saat. **Kurtarma süresi hedefi:** [8] saat.
- En az üç ayda bir geri yükleme denemesi [barındırma kurulumuyla teyit].

## 5. Değişiklikler

Bu SLA koşulların 19. maddesindeki gibi değişir; bir değişiklik ücretli abonelik dönemi içinde hedefi düşüremez.
