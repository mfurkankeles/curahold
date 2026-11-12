---
title: Bağlantılar ve CRM
section: help
order: 8
summary: Slack, Teams, Google Chat; Salesforce, HubSpot ve tablolarla eşitleme.
---
# Bağlantılar ve CRM

Curahold ekibin zaten kullandığı araçlarla birlikte çalışır. Bağlantıları Ayarlar → Bağlantılar ve Ayarlar → Veri kaynakları'ndan yönetirsin.

## Sohbet uygulamaları

Slack, Microsoft Teams ve Google Chat bağlandığında bildirimler kişiye özel mesaj olarak gider. Mesajın içinden görevi tamamlayabilir ya da yeniden açabilirsin.

## CRM ve tablolar

Müşterileri, kişileri ve fırsatları Salesforce, HubSpot, Microsoft Dynamics, Pipedrive, Zoho, Google Sheets ve Excel ile eşitle. **Ayarlar → CRM ve tablolar** sayfasını aç ve **Bağla**'ya tıkla.

1. **Giriş yap.** CRM'in kendi giriş sayfasına gidersin ve Curahold'un neyi okuyup yazabileceğini onaylarsın. Curahold'a hiçbir zaman şifre yazılmaz.
2. **Neyin geleceğini seç.** İhtiyacın olan nesneleri işaretle ve her birinin Curahold'da ne olduğunu söyle: müşteriler, kişiler, fırsatlar, kendi kayıt türün ya da bir panodaki görevler.
3. **Alanları eşle.** Curahold her alan için bir eşleşme önerir; istediğini değiştir ve alan başına yalnızca gelsin mi, iki tarafta aynı mı kalsın, onu seç.
4. **Kontrol et ve başlat.** Önizleme, hiçbir şey değişmeden önce kaç kaydın ekleneceğini ve güncelleneceğini gösterir.

Sonrasında eşitleme her saat kendiliğinden çalışır; Curahold'da yapılan değişiklik CRM'e hemen yazılır. Eşitlenemeyenler nedenleriyle listelenir ve yeniden denenebilir. Aynı şey iki tarafta da değiştiyse yeni olan kazanır; istersen her zaman CRM'in ya da Curahold'un kazanmasını seçebilirsin (bağlantının Ayarlar sekmesi).

Bağlamak için bağlantıları yönetme yetkisi gerekir. Kişiler e-postayla eşlenir; böylece müşterinin CRM'deki sahibi Curahold'da da sahibi olur.

## Salesforce

Gelenler: hesaplar, kişiler, fırsatlar, görevler ve kendi özel nesnelerin. Test ortamı kullanacaksan bağlamadan önce **Sandbox** kutusunu işaretle.

Salesforce uygulamaya izin verilmediğini söylerse, önce Salesforce yöneticinin Curahold'a izin vermesi gerekir: Salesforce, bir yöneticinin kurmadığı ya da onaylamadığı uygulamaları engeller. Ondan onay iste, sonra yeniden bağlan. Bağlayan kullanıcının Salesforce'ta API erişimi olmalı (Enterprise ve üstünde dahil, Professional'da ek paket).

## HubSpot

Gelenler: şirketler, kişiler, anlaşmalar, destek kayıtları, görevler ve özel nesneler. HubSpot hangi hesabın bağlanacağını sorar ve Curahold'un neyi okuyup yazabileceğini listeler; kişiler ve anlaşmalar yalnızca HubSpot planında varsa istenir.

## Microsoft Dynamics 365

Gelenler: hesaplar, kişiler, fırsatlar, servis talepleri, görevler ve özel tablolar. Giriş yapmadan önce kurumunun adresini verirsin (`https://sirketin.crm4.dynamics.com` gibi görünür). Microsoft "Yönetici onayı gerekli" derse, bir Microsoft 365 yöneticisinin Curahold'u kurumun için bir kez onaylaması gerekir.

## Pipedrive

Gelenler: kurumlar, kişiler, anlaşmalar ve aktiviteler. Özel alanlar standart alanlar gibi eşlenir.

## Zoho CRM

Gelenler: hesaplar, kişiler, anlaşmalar, servis talepleri, görevler ve özel modüller. Curahold, Zoho veri merkezini (ABD, AB, Hindistan, Avustralya…) kendisi bulur.

## Google Sheets ve Excel

Tablo, veri getirmenin en kolay yoludur ve tabloya dışa aktarabilen her araç için çalışır. Bir Google Sheet'i ya da OneDrive veya SharePoint'teki bir Excel dosyasını sekme sekme bağla; her sekme müşteriler, kişiler ya da kendi kayıt türün olabilir. Satırı tanıtan sütunu seç; böylece değişen satır ikinci bir müşteri eklemek yerine aynı müşteriyi günceller.

## Destek araçları

Zendesk, Freshdesk, Intercom ve Jira Service Management yalnızca adres ve API anahtarıyla bağlanır; talepler doğru müşterinin altına gelir. Salesforce ve Dynamics'teki vakalar da destek talebi olarak eşleştirilebilir. Ayrıntılar: [Destek talepleri](/docs/tr/support-tickets/).

## Kendi araçların

Başka bir sisteme bağlanmak istiyorsan [API anahtarları](/docs/tr/api-keys/), [webhook'lar](/docs/tr/webhooks/) ya da [AI asistanları](/docs/tr/ai-assistants/) sayfalarına bak.
