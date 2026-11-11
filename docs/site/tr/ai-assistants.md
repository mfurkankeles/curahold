---
title: Claude ve ChatGPT'yi bağlama
section: help
order: 9
summary: Yapay zekâ asistanınla müşterilerini sorgula, sunum hazırlat, görev açtır.
---
# Claude ve ChatGPT'yi bağlama

Tendwell'i Claude, ChatGPT ya da MCP destekleyen başka bir asistana bağladığında, asistan senin adına Tendwell'e bakabilir ve iş açabilir.

## Neler yapabilirsin

- "Önümüzdeki 60 günde yenilenecek ve riskli görünen müşterilerim hangileri?"
- "Harborline Bank'ın paydaşlarını ve açık işlerini özetle."
- "Portföyümün 5 slaytlık bir özetini hazırla."
- "Velto Mobility için kullanım düşüşünü araştırma görevini yarın bitecek şekilde Zeynep'e aç."
- "Bu görevi tamamlandı yap ve 'Teklif gönderildi' diye yorum ekle."

## Nasıl bağlanır

1. Tendwell'de **Ayarların** sayfasını aç ve **Bağlayıcı adresi**ni kopyala. Adres `https://sirketin.tendwell.com/mcp` biçimindedir.
2. **Claude:** Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle. Adresi yapıştır ve bağlan.
   **ChatGPT:** bağlayıcı ayarlarından bu adresle özel (MCP) bir bağlayıcı ekle. Bazı planlarda önce geliştirici modunu açmak gerekir.
3. Tendwell'in izin ekranı açılır. Giriş yap, asistanın ne yapabileceğine bak ve **İzin ver** de.

## Güvenlik

- Asistan **senin adına** çalışır. Yalnızca senin görebildiğini görür, değiştirebildiğini değiştirir. Rol ve alan kuralların aynen geçerlidir.
- İzin verirken "Değişiklik yapmasına da izin ver" kutusunu kapatırsan asistan yalnızca okur. İzleyici koltuğundaysan asistan zaten yalnızca okur.
- Bağlantıyı istediğin zaman Ayarların → API anahtarları ve bağlı uygulamalar'dan kesersin.
- Asistan kendi Claude ya da ChatGPT planınla çalışır; Tendwell'e ek bir yapay zekâ ücreti yoktur.
