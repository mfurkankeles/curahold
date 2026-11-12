---
title: API referansı
section: developers
order: 3
summary: Müşteriler, kayıtlar, görevler, yorumlar, arama ve ana sayfa uçları, örneklerle.
---
# API referansı

Tüm uçlar `https://sirketin.curahold.com/api` altındadır, JSON alır ve JSON döndürür. Kimlik için [API anahtarı](/docs/tr/api-keys/) kullan.

## Sen ve şirketin

| Uç | Ne yapar |
| --- | --- |
| `GET /me` | Anahtarın sahibi, rolü, izinleri ve şirketin müşteri alanları |
| `GET /people` | Şirketteki kişiler ve ekipler |
| `GET /search?q=…` | Müşteri, görev, kayıt, pano ve kişi araması |

## Müşteriler

| Uç | Ne yapar |
| --- | --- |
| `GET /accounts` | Liste. `q` (ad), `owner` (`me` ya da kişi kimliği), `limit`, `offset` |
| `GET /accounts/{id}` | Tek müşteri ve görevleri |
| `POST /accounts` | Yeni müşteri: `name`, `ownerId`, `teamId`, `fields` |
| `PATCH /accounts/{id}` | Değiştir: yalnızca gönderdiğin alanlar değişir |

```bash
curl -X POST https://sirketin.curahold.com/api/accounts \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Harborline Bank","fields":{"renewal_date":"2027-03-01","arr":126000,"health":"watch"}}'
```

Alan anahtarlarını (`renewal_date`, `arr` …) `GET /me` yanıtındaki `org.accountFields` listesinde bulursun. Rolünün değiştiremediği bir alanı gönderirsen `403 field_locked` döner.

## Kayıtlar (kişiler, fırsatlar, kendi türlerin)

| Uç | Ne yapar |
| --- | --- |
| `GET /record-types` | Kayıt türleri ve alanları |
| `GET /records` | Liste. `type` (`contact`, `opportunity` ya da tür kimliği), `account`, `q`, `limit`, `offset` |
| `GET /records/{id}` | Tek kayıt |
| `POST /records` | Yeni kayıt: `typeId`, `accountId`, `name`, `fields` |
| `PATCH /records/{id}` | Değiştir |

## Görevler

| Uç | Ne yapar |
| --- | --- |
| `GET /boards` | Görebildiğin panolar ve sütunları |
| `GET /tasks` | Görevler. `assignee=me`, `from` ve `to` (bitiş tarihi, `YYYY-MM-DD`) |
| `GET /boards/{id}/tasks` | Bir panonun görevleri |
| `GET /tasks/{id}` | Görev, alt görevler, yorumlar ve dosyalar |
| `POST /tasks` | Yeni görev |
| `PATCH /tasks/{id}` | Değiştir; `baseVersion` zorunlu |
| `POST /tasks/{id}/comments` | Yorum: `body` |

```bash
curl -X POST https://sirketin.curahold.com/api/tasks \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"boardId":"…","title":"Yenileme teklifini gönder","dueDate":"2027-01-15","priority":"high","accountId":"…"}'
```

Görev alanları: `title`, `description`, `status` (sütun anahtarı), `assigneeIds` (en fazla 10), `accountId`, `dueDate`, `priority` (`low`, `normal`, `high`, `urgent`), `repeat` (`{ "every": 1, "unit": "week", "from": "due" }`).

### Aynı anda değişiklik

`PATCH /tasks/{id}` isteğinde okuduğun görevin `version` değerini `baseVersion` olarak gönder. Görev bu arada değiştiyse `409` ve görevin güncel hâli döner; değişikliğini onun üzerine uygulayıp yeniden gönder.

### Bir değişikliği yalnızca bir kez göndermek

Bağlantı, isteğin ulaştıktan sonra ama yanıtı görmeden önce kopabilir. İşi iki kez yaptırmadan yeniden denemek için her `POST`, `PATCH`, `PUT` ve `DELETE` isteğine bir `Idempotency-Key` başlığı ekle: kendi belirlediğin, 8–200 karakterlik bir metin (UUID olabilir), her değişiklik için farklı.

```bash
curl -X POST https://acme.curahold.com/api/tasks \
  -H "Authorization: Bearer chk_..." \
  -H "Idempotency-Key: 3f1c9a52-7a0e-4f0b-9a57-6f2d1c0b8e11" \
  -H "Content-Type: application/json" \
  -d '{"boardId":"…","title":"Yenileme teklifini gönder"}'
```

Aynı isteği aynı anahtarla yeniden gönderirsen ilk yanıt `Idempotent-Replayed: true` başlığıyla geri gelir; hiçbir şey ikinci kez yapılmaz. Aynı anahtar farklı bir istekte `422` (`repeat_mismatch`) ile reddedilir. Anahtarlar yalnızca sana aittir ve iki gün saklanır.

## Zaman çizelgesi ve sağlık skoru

| Uç | Ne yapar |
| --- | --- |
| `GET /accounts/{id}/timeline` | Müşterinin zaman çizelgesi, yeniden eskiye. `before` (bir önceki yanıtın `next` değeri) ve `limit` |
| `POST /accounts/{id}/activities` | Kayıt ekle: `kind` (`note`, `call`, `meeting`, `email`, iş değerlendirmesi için `review`), `body`, isteğe bağlı `happenedAt`, `contactIds`, `pinned` |
| `PATCH /activities/{id}` | Değiştir (yazan kişi ya da müşterileri yöneten) |
| `DELETE /activities/{id}` | Sil |
| `GET /accounts/{id}/health` | Skor, bandı, her sinyalin puanı ve son 90 günün skorları |

Skorun kendisi müşterinin `health_score` alanındadır.

Müşteride ayrıca `reviewDays` (iş değerlendirmeleri arasındaki gün; `null` şirket ritmini izler, `0` yok demektir; `PATCH /accounts/{id}` ile verilir) ve `lastReviewAt` (türü `review` olan son kayıt) bulunur. Şirketin ritmi ve hedefleri `GET /me` yanıtında `org.rhythm` altındadır.

## Ana sayfa verileri

| Uç | Ne yapar |
| --- | --- |
| `GET /pages` | Görebildiğin sayfalar ve senin ana sayfan (`homeId`) |
| `GET /pages/{id}/data` | Sayfadaki her kartın hesaplanmış verisi |

Raporlar ve sunumlar için en kısa yol budur: kartlar zaten kişinin görme yetkisi içinde hesaplanmıştır.

## Tarihler ve tutarlar

Tarihler `YYYY-MM-DD`, zamanlar ISO 8601 (UTC) biçimindedir. Tutarlar şirketin para biriminde sayı olarak gelir.
