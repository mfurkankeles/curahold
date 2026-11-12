---
title: Destek talepleri (Zendesk, Freshdesk, özel araçlar)
section: developers
order: 5
summary: Destek araçlarını bağlamak, Salesforce ve Dynamics vakaları, API ile ya da webhook adresiyle talep göndermek.
---
# Destek talepleri

Destek talepleri Curahold'da **Destek talebi** türündeki kayıtlardır ve her biri bir müşteriye bağlıdır. Müşteri sayfasında ve zaman çizelgesinde görünürler. Açık talep sayısı gibi müşteri alanlarını beslerler. Sağlık skorunda **Destek yükü** sinyali olarak sayılırlar.

Talepleri Curahold'a getirmenin üç yolu var:

| Yol | Ne için |
| --- | --- |
| Hazır bağlantı | Zendesk, Freshdesk, Intercom, Jira Service Management |
| CRM vakaları | Salesforce Case ve Dynamics 365 Case (incident) |
| API ya da gelen adres | Diğer her araç: kendi destek sistemin, formların, Zapier ya da Make |

## Hazır bağlantılar

Ayarlar → CRM ve tablolar → **Destek araçları**. Aracın adresini ve aracın içinde oluşturduğun API anahtarını yapıştır. Curahold anahtarı hemen dener ve şifreli saklar. Uygulama kaydı ya da onay süreci gerekmez.

| Araç | Gerekenler | Gelenler |
| --- | --- | --- |
| Zendesk | Adres, temsilci e-postası, API token'ı | Talepler, organizasyonlar |
| Freshdesk | Adres, API anahtarı | Talepler, şirketler |
| Intercom | Bölge, erişim token'ı | Konuşmalar, şirketler |
| Jira Service Management | Atlassian adresi, temsilci e-postası, API token'ı | Hizmet masası talepleri, organizasyonlar |

Bu bağlantılar **yalnızca okur**. Curahold'da yapılan değişiklik destek aracına yazılmaz.

### Müşteri nasıl bulunur

1. Talebin organizasyonu (ya da şirketi) daha önce bir müşteriyle eşleştiyse o müşteri.
2. Organizasyon, Curahold'daki bir müşteriyle **adı** ya da **web adresi** aynı olduğu için eşleşir.
3. Organizasyonu olmayan talep, talep edenin **e-posta alan adı** müşterinin web adresiyle aynıysa ona bağlanır. Gmail ya da Outlook gibi genel e-posta adresleri kullanılmaz.

Varsayılan olarak **yalnızca var olan müşterilere** bağlanılır: eşleşmeyen organizasyon yeni müşteri olarak eklenmez, müşterisi bulunamayan talep alınmaz. Eşleşen bir organizasyonun adı, Curahold'daki müşterinin adını değiştirmez.

Durumlar ve öncelikler Curahold'un kendi değerlerine çevrilir:

| Curahold | Örnekler |
| --- | --- |
| Açık | new, open, Working, Escalated |
| Beklemede | pending, hold, snoozed, Waiting for customer |
| Çözüldü | solved, resolved, Problem Solved, done |
| Kapandı | closed, cancelled, merged |

Öncelikler: Düşük, Normal, Yüksek ve Acil. "Highest", "Critical" ve "P1" gibi değerler Acil olur.

## Salesforce ve Dynamics vakaları

Bağlı bir Salesforce ya da Dynamics 365 eşitlemesinde **Case** nesnesini aç ve **Destek talepleri** olarak eşleştir. Konu, durum, öncelik, kaynak, açılış ve kapanış tarihleri ile müşteri alanları kendiliğinden eşleştirilir.

## API ile göndermek

Yazma yetkili bir [API anahtarıyla](/docs/tr/api-keys/) aynı talebi istediğin kadar gönder. İlk gönderim oluşturur, sonrakiler günceller:

```bash
curl -X PUT https://sirketin.curahold.com/api/tickets/my-helpdesk/4711 \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{
    "subject": "Rapor dışa aktarılamıyor",
    "status": "open",
    "priority": "high",
    "requester": "selin@quillfield.example",
    "openedAt": "2026-11-11T09:30:00Z",
    "url": "https://help.example.com/t/4711",
    "account": { "domain": "quillfield.example" }
  }'
```

Adresteki `my-helpdesk` kaynağın adıdır (küçük harf, rakam, tire). `4711` ise o kaynaktaki talep kimliğidir.

| Alan | Gerekli | Not |
| --- | --- | --- |
| `subject` | Evet | Talebin başlığı |
| `status` | Hayır | Herhangi bir metin; yukarıdaki tabloya göre çevrilir |
| `priority` | Hayır | Herhangi bir metin |
| `openedAt`, `solvedAt` | Hayır | ISO 8601 ya da `YYYY-MM-DD` |
| `requester` | Hayır | Talep edenin e-postası; müşteriyi bulmaya da yarar |
| `channel` | Hayır | E-posta, telefon, sohbet… |
| `url` | Hayır | Talebin aracındaki `https` adresi |
| `account` | Hayır | `{ "id" }`, `{ "domain" }` ya da `{ "name" }` |

Müşteri sırasıyla şunlarla bulunur: `account.id`, `account.domain`, talep edenin e-posta alan adı, `account.name`. Hiçbiri tutmazsa yanıt `400` olur ve talep kaydedilmez.

## Gelen adres (webhook)

Kendi kimlik doğrulamasını ekleyemeyen araçlar için: Ayarlar → Geliştirici → **Diğer araçlardan destek talepleri** → **Adres oluştur**. Adres yalnızca bir kez gösterilir ve bir parola gibi çalışır. Gövdeye `source` ve `externalId` alanlarını ekleyip aynı biçimde gönder:

```bash
curl -X POST "https://sirketin.curahold.com/api/inbound/tickets/<token>" \
  -H "Content-Type: application/json" \
  -d '{ "source": "forms", "externalId": "77", "subject": "Yeni özellik isteği", "account": { "name": "Velto Mobility" } }'
```

| Yanıt | Anlamı |
| --- | --- |
| `201` / `200` | Oluşturuldu / güncellendi |
| `400` | Gövde geçersiz |
| `404` | Adres yanlış ya da kapatılmış |
| `422` | Müşteri bulunamadı |

Adresi yenilemek eskisini hemen geçersiz kılar.

> **İpucu:** Zendesk'in tetikleyicileri ve webhook'ları ya da Freshdesk'in otomasyonları da bu adrese gönderebilir. Aynı araç için bunu ve hazır bağlantıyı birlikte kullanma; talepler iki kez görünür.
