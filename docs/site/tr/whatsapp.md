---
title: WhatsApp Business
section: help
order: 8.15
summary: Müşterilerinizin WhatsApp mesajları kendi sayfalarında, cevaplar kendi numaranızdan; kendi Meta hesabınızla.
---
# WhatsApp Business

Müşterilerinizin WhatsApp Business numaranıza gönderdiği mesajlar kendi sayfalarında görünür, cevabı oradan verirsiniz. **Kendi** Meta uygulamanızı ve numaranızı kullanırsınız: mesaj ücretini Meta size keser, Curahold ek ücret almaz ve Meta faturanızı hiç görmez.

## Başlamadan önce

Cloud API'de bir WhatsApp Business numarası olan bir Meta işletme hesabı, WhatsApp ürünü eklenmiş bir Meta uygulaması ve kalıcı anahtarı olan bir **sistem kullanıcısı** (izin: `whatsapp_business_messaging`) gerekir. Meta'nın kendi sayfaları adım adım gösterir; yaklaşık 15 dakika sürer.

## Curahold'da {#connect}

1. **Ayarlar → CRM ve tablolar**'ı açın, **Mesajlaşma uygulamaları**'nı bulun ve **WhatsApp Business bağla**'ya tıklayın.
   ![WhatsApp Business kutucuğu, işaretli](img/b19-whatsapp-tile.webp)
2. Aşağıdaki üç değeri yapıştırın ve **Kontrol et ve bağla**'ya tıklayın. Bağlantı sayfası bir **geri arama adresi** ve bir **doğrulama anahtarı** gösterir.
   ![Bağlantı formunun üç alanı, işaretli](img/b19-whatsapp-panel.webp)

- **Telefon numarası kimliği**: Meta for Developers → uygulamanız → **WhatsApp → API Setup**.
- **Erişim anahtarı (sistem kullanıcısı)**: Business settings → **System users** → kullanıcın → **Generate new token**.
- **Uygulama gizli anahtarı**: uygulamanız → **App settings → Basic** → **App secret** → **Show**.

## Meta'da

1. Uygulamanızı açın ve **WhatsApp → Configuration**'a gidin. **Webhook**'un yanında **Edit**'e tıklayın.
2. Geri arama adresini **Callback URL**'e, doğrulama anahtarını **Verify token**'a yapıştırın. **Verify and save**'e tıklayın.
3. **Webhook fields** altında **Manage**'e tıklayın ve **messages**'a abone olun.

## Ne gelir, nasıl cevap verilir

Mesaj, kişisinde gönderenin numarası olan müşteriye not olarak düşer (`0532…` gibi yerel yazımlar da eşleşir). O notta **WhatsApp'tan cevapla**'ya tıklayın. WhatsApp serbest metne yalnızca müşterinin son mesajından sonraki 24 saat içinde izin verir; sonrasında Curahold onaylı bir **şablon** adı ve dili ister.

## Sınırlar ve zamanlama

Mesajlar Meta gönderdikçe gelir. Meta başarısız bir gönderimi 7 güne kadar yeniden dener; her mesaj bir kez saklanır. Meta bir numaranın ne hızla gönderebileceğini sınırlar; "meşgul" cevabı bunu söyler ve hiçbir şey kaybolmaz.

## Bir sorun olursa

Süresi dolmuş ya da iptal edilmiş anahtar cevap verirken görünür: **Yeniden bağla** ile yenisini yapıştırın. Hiçbir kişide olmayan bir numaradan gelen mesaj bağlantıda sayılır, saklanmaz. **Kaldır** geri aramayı hemen durdurur; müşterilerdeki notlar kalır.

## Ayrıca bakın

- [Zaman çizelgesi ve sağlık skoru](/docs/tr/timeline-and-health/)
- [Bağlantılar ve CRM](/docs/tr/connections/)
