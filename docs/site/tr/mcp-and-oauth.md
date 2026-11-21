---
title: AI bağlayıcısı (MCP) ve OAuth
section: developers
order: 6
summary: MCP sunucusu, araçlar, OAuth 2.1 akışı ve kendi uygulamanız için bağlantı.
---
# AI bağlayıcısı (MCP) ve OAuth

Curahold, Model Context Protocol (MCP) destekleyen her asistanın bağlanabildiği bir sunucu sunar: Claude, ChatGPT ve diğerleri. Kullanıcı tarafı için [Claude ve ChatGPT'yi bağlama](/docs/tr/ai-assistants/) sayfasına bakın.

## Sunucu

```text
Adres     https://sirketiniz.curahold.com/mcp
Taşıma    Streamable HTTP (JSON-RPC 2.0, POST)
Kimlik    OAuth 2.1, Bearer erişim anahtarı
```

Kimliksiz bir istek `401` ve şu başlıkla döner; MCP istemcileri buradan izin akışını kendiliğinden başlatır:

```http
WWW-Authenticate: Bearer resource_metadata="https://sirketiniz.curahold.com/.well-known/oauth-protected-resource"
```

## Araçlar

| Araç | Ne yapar | Yazar mı |
| --- | --- | --- |
| `search` | Müşteri, görev, kayıt ve kişi arar; `fetch` için kimlik döndürür | Hayır |
| `fetch` | `account:…`, `task:…` ya da `record:…` kimliğinin tüm ayrıntısı; müşteride zaman çizelgesi ve nedenleriyle sağlık skoru da gelir | Hayır |
| `list_accounts` | Müşteriler ve alanları; ada ya da "benimkiler"e göre | Hayır |
| `list_tasks` | Görevler; varsayılan olarak kişinin kendi işleri, tarih aralığıyla | Hayır |
| `portfolio_summary` | Kişinin ana sayfasındaki kartların verisi; özet ve sunum için | Hayır |
| `create_task` | Görev açar. Pano ve müşteri adla verilebilir, sorumlular e-posta ya da adla | Evet |
| `add_note` | Müşterinin zaman çizelgesine not, görüşme, toplantı ya da e-posta ekler | Evet |
| `update_task` | Sütun değiştirir ya da tamamlar, tarih ve öncelik değiştirir, yorum ekler | Evet |

Yazan araçlar yalnızca kişi izin ekranında **Değişiklik yapmasına da izin ver** dediyse ve kişi tam kullanıcıysa listelenir. Her araç çağrısı uygulamanın kullandığı API'den geçer; rol, müşteri erişimi ve alan kuralları aynen uygulanır.

## OAuth 2.1 akışı

MCP istemcilerinin çoğu bunu kendiliğinden yapar. Kendi istemcinizi yazıyorsanız:

1. **Keşif:** `GET /.well-known/oauth-protected-resource`, ardından `GET /.well-known/oauth-authorization-server`.
2. **Kayıt (RFC 7591):** `POST /oauth/register` ile `client_name` ve `redirect_uris` gönderin. Yönlendirme adresleri `https` ya da yerel (`http://127.0.0.1`, `http://localhost`) olmalı. Yanıtta `client_id` gelir; istemci gizli anahtarı yoktur.
3. **Yetki:** kişiyi `GET /oauth/authorize` adresine gönderin: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256), `code_challenge_method=S256`, `state`, isteğe bağlı `scope=read write`. Uygulamayı alanlarla sınırlamak için alanları scope'a ekleyin: `scope=work:write customers:read` (alanlar [API anahtarlarındaki](/docs/tr/api-keys/) gibidir). Hiçbir uygulama belirteci yönetime, oturum açma ayarlarına ya da faturalamaya ulaşamaz (`403 session_required`).
4. Kişi Curahold'da izin ekranını görür, giriş yapar ve onaylar. Tarayıcı `redirect_uri?code=…&state=…` adresine döner.
5. **Anahtar:** `POST /oauth/token` ile `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`, `code_verifier`.
6. **Yenileme:** erişim anahtarı 1 saat geçerlidir. `grant_type=refresh_token` ile yenileyin; her yenilemede yeni bir yenileme anahtarı gelir ve eskisi geçersiz olur. Yenileme anahtarı 90 gün kullanılmazsa düşer.

```bash
curl -X POST https://sirketiniz.curahold.com/oauth/token \
  -d grant_type=authorization_code -d code=… -d client_id=twc_… \
  -d redirect_uri=https://uygulaman.example/callback -d code_verifier=…
```

## Kendi uygulamanız için OAuth {#own-app}

Aynı akışı başkalarının kullanacağı bir uygulama için de kullanabilirsiniz. Uygulamanız erişim anahtarıyla REST API'yi (`/api/...`) çağırır ve onay veren kişi adına çalışır. Kişi bağlantıyı istediği an Ayarlarınız sayfasından keser; şirketinizin yöneticisi de Ayarlar → Geliştirici'den kesebilir.

## Maliyet

Asistan kişinin kendi Claude ya da ChatGPT planıyla çalışır. Curahold yalnızca veriyi verir; yapay zekâ için ek ücret almaz.
