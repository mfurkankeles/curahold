---
title: Claude ve ChatGPT'yi bağlama
section: help
order: 9
summary: Yapay zekâ asistanınla müşterilerini sorgula, sunum hazırlat, görev açtır.
---
# Claude ve ChatGPT'yi bağlama

Curahold'u Claude, ChatGPT ya da MCP destekleyen başka bir asistana bağladığınızda, asistan sizin adına Curahold'a bakabilir ve iş açabilir.

## Neler yapabilirsiniz

- "Önümüzdeki 60 günde yenilenecek ve riskli görünen müşterilerim hangileri?"
- "Harborline Bank'ın paydaşlarını ve açık işlerini özetle."
- "Portföyümün 5 slaytlık bir özetini hazırla."
- "Velto Mobility için kullanım düşüşünü araştırma görevini yarın bitecek şekilde Zeynep'e açın."
- "Bu görevi tamamlandı yapın ve 'Teklif gönderildi' diye yorum ekleyin."

## Nasıl bağlanır

1. Curahold'da **Ayarlarınız** sayfasını açın ve **Bağlayıcı adresi**ni kopyalayın. Adres `https://sirketiniz.curahold.com/mcp` biçimindedir.
2. **Claude:** Ayarlar → Bağlayıcılar → Özel bağlayıcı ekleyin. Adresi yapıştırın ve bağlanın.
   **ChatGPT:** bağlayıcı ayarlarından bu adresle özel (MCP) bir bağlayıcı ekleyin. Bazı planlarda önce geliştirici modunu açmak gerekir.
3. Curahold'un izin ekranı açılır. Giriş yapın, asistanın ne yapabileceğine bakın ve **İzin ver**'e tıklayın.

## Güvenlik

- Asistan **sizin adınıza** çalışır. Yalnızca sizin görebildiğinizi görür, değiştirebildiğinizi değiştirir. Rol ve alan kurallarınız aynen geçerlidir.
- İzin verirken "Değişiklik yapmasına da izin ver" kutusunu kapatırsanız asistan yalnızca okur. İzleyici koltuğundaysanız asistan zaten yalnızca okur.
- Bağlantıyı istediğiniz zaman Ayarlarınız → API anahtarları ve bağlı uygulamalar'dan kesebilirsiniz.
- Asistan kendi Claude ya da ChatGPT planınla çalışır; Curahold'a ek bir yapay zekâ ücreti yoktur.
