---
title: Muhasebe programları
section: help
order: 8.2
summary: Muhasebe programlarına yalnızca okunur bağlantılar: kim ne borçlu, müşteri sayfasında ve sağlık puanında.
---
# Muhasebe programları

Muhasebe programını bağladığında her müşterinin sayfası borcunu gösterir: açık bakiye, vadesi geçen tutar ve ne kadar geciktiği, son ödeme ve faturalar. Geciken ödemeler sağlık puanına katılabilir. Curahold yalnızca okur: programa hiçbir şey yazılmaz.

## Hangi programlar

| Program | Nasıl bağlanır | Sayfa |
| --- | --- | --- |
| Zoho Books | Zoho ile giriş | [Zoho Books](/docs/tr/accounting-zohobooks/) |
| Xero | Xero ile giriş | [Xero](/docs/tr/accounting-xero/) |
| Odoo | Adres, kullanıcı adı ve API anahtarı | [Odoo](/docs/tr/accounting-odoo/) |
| freee | freee ile giriş | [freee](/docs/tr/accounting-freee/) |
| Paraşüt | Şirket numarası, API istemcisi ve bir kullanıcı | [Paraşüt](/docs/tr/accounting-parasut/) |
| QuickBooks Online | Intuit ile giriş | [QuickBooks Online](/docs/tr/accounting-quickbooks/) |
| Diğerleri (Logo, Mikro, Tally, SAP Business One…) | Excel ya da CSV dosyası | [Dosya](/docs/tr/accounting-file/) |

## Müşteri eşleştirme

Muhasebe programındaki her müşteri Curahold'daki bir müşteriyle eşleşir: önce vergi numarasıyla, sonra web adresi ya da e-posta alan adıyla, sonra adıyla (Ltd. Şti., A.Ş. ya da 株式会社 gibi şirket türleri dikkate alınmaz). Tam olarak bir müşteri uyarsa eşleşme yapılır; hiç uymazsa ya da birkaçı uyarsa bağlantının **Eşleştirme** sekmesinde bekler. Orada müşteriyi seçebilir ya da dışarıda bırakabilirsin. Elle yaptığın eşleştirmeler korunur.

## Rakamları kim görür

Tutarlar **Finans rakamlarını görme** izni olan rollere görünür (başlangıçta yöneticiler ve müdürler; Ayarlar → Roller'den değiştirebilirsin). Müşteriyi gören diğer herkes yalnızca sağlık puanının içinde bir ödemenin kaç gün geciktiğini görür — hiçbir tutarı görmez.

**Finans** departmanındaki kişiler de rolleri ne olursa olsun tutarları görür; Ayarlar → Departmanlar'da **Müşteri sayfasında Finans bölümünü kim görür** altında seçilen departmanlar da öyle. Finans kapatılırsa bu da kalkar.

## Sağlık puanında geciken ödemeler

İlk okumayı başlatırken **Geciken ödemeleri sağlık puanına kat** kutusunu işaretleyebilirsin. **Zamanında ödeme** sinyali hiçbir şey gecikmemişse tam puan, ödenmemiş en eski fatura 60 gün geciktiğinde sıfır puan verir; iki sayı da Ayarlar → Sağlık skoru'ndan değişir. Programla eşleşmeyen müşteriler hesaba katılmaz.

## Bağlantı sağlığı

Muhasebe bağlantıları Ayarlar → Bağlantılar'da diğerleriyle birlikte görünür: çalışıyor, sorun var ya da duraklatıldı, ve en son ne zaman çalıştığı.
