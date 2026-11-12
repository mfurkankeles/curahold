---
title: Geliştiriciler için genel bakış
section: developers
order: 1
summary: Curahold'a neyle bağlanılır, kimlik doğrulama ve temel kurallar.
---
# Geliştiriciler için genel bakış

Curahold'u kendi araçlarına bağlamanın dört yolu var. Hepsi aynı kurala uyar: **bir istek her zaman bir kişi adına yapılır** ve o kişinin rolü, müşteri erişimi ve alan kuralları aynen geçerlidir.

| Yol | Ne için | Kimlik |
| --- | --- | --- |
| [REST API](/docs/tr/api-reference/) | Kendi betiklerin, Zapier, Make, raporlar | Kişisel API anahtarı (`chk_…`) |
| [Webhook'lar](/docs/tr/webhooks/) | Bir şey değişince senin sistemine haber | İmzalı mesaj (HMAC-SHA256) |
| [AI bağlayıcısı (MCP)](/docs/tr/mcp-and-oauth/) | Claude, ChatGPT ve diğer asistanlar | OAuth 2.1 |
| [OAuth uygulamaları](/docs/tr/mcp-and-oauth/#kendi-uygulaman-icin-oauth) | Başkalarının kullanacağı uygulamalar | OAuth 2.1 + PKCE |

## Nereden başlamalı

| İstediğin | Oku |
| --- | --- |
| Beş dakikada ilk isteği göndermek | [Hızlı başlangıç](/docs/tr/quickstart/) |
| API'nin nasıl düşündüğünü örneklerle anlamak | [API rehberi](/docs/tr/api-reference/) |
| Bir adrese alan alan bakmak | Başvuru: [müşteriler](/docs/tr/ref-customers/), [kayıtlar](/docs/tr/ref-records/), [görevler ve panolar](/docs/tr/ref-tasks/), [kişiler ve arama](/docs/tr/ref-people/), [sayfalar ve raporlar](/docs/tr/ref-pages/), [otomasyonlar](/docs/tr/ref-automation/), [nesneler](/docs/tr/ref-objects/), [hatalar](/docs/tr/ref-errors/) |
| Kendi sistemini eşit tutmak | [Kendi aracını bağla](/docs/tr/connect-your-own-tool/) |
| Bir şey değişince haber almak | [Webhook'lar](/docs/tr/webhooks/) |
| Bir yapay zekâ asistanının ya da kendi uygulamanın bir kişi adına çalışması | [Yapay zekâ bağlayıcısı ve OAuth](/docs/tr/mcp-and-oauth/) |

Başvuru sayfaları her sürümde ürünün kendi kodundan üretilir; bu yüzden API'nin kabul ettiğiyle her zaman aynıdır.

## Adresler

Her şirketin kendi adresi vardır. Aşağıdaki örneklerde `sirketin` yerine kendi şirket adresini yaz.

```text
API        https://sirketin.curahold.com/api
MCP        https://sirketin.curahold.com/mcp
OAuth      https://sirketin.curahold.com/.well-known/oauth-authorization-server
Belgeler   https://sirketin.curahold.com/docs/
```

## Neler açık, neler kapalı

Açık olanlar: müşteriler, kayıtlar (kişiler, fırsatlar, kendi kayıt türlerin), görevler, yorumlar, panolar, kişiler, ana sayfa verileri ve arama. Webhook'lar bu nesnelerdeki değişiklikleri haber verir.

Kapalı olanlar: şirket ayarları ve roller API anahtarlarıyla değiştirilemez, bir anahtar başka bir anahtar oluşturamaz, OAuth onayı yalnızca tarayıcıda kişinin kendisi tarafından verilir. Ürünün kendi kodu ve veritabanı dışarıya açılmaz; API'nin yaptığı her şey uygulamanın da yapabildiği şeydir.

## Hatalar

Hatalar her zaman aynı biçimde gelir:

```json
{ "error": "read_only_token", "message": "Bu anahtar ya da uygulama yalnızca okuyabilir." }
```

| Durum | Anlamı |
| --- | --- |
| 400 | Gönderdiğin veri geçersiz (`validation`, `bad_webhook_url`) |
| 401 | Anahtar yok, yanlış, süresi dolmuş ya da iptal edilmiş |
| 403 | Bu kişinin ya da anahtarın buna yetkisi yok (`forbidden`, `read_only_token`, `read_only_seat`, `field_locked`) |
| 404 | Yok ya da bu kişi göremiyor |
| 409 | Görev sen okuduktan sonra değişmiş; güncel sürümle yeniden dene |

`message` alanı isteğin diline göre gelir: `x-curahold-locale: tr` ya da `en` başlığını gönder.

## Sınırlar

- Liste uçları en fazla 500 kayıt döndürür; `limit` ve `offset` ile sayfala.
- Bir şirkette en fazla 20 webhook olabilir.
- Arama her türde en fazla 6 sonuç döndürür.
- Sunucuyu yormayan, olay odaklı kullanım beklenir: değişiklikleri sorgulayıp durmak yerine webhook kullan.
