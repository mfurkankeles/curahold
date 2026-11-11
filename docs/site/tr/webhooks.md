---
title: Webhook'lar
section: developers
order: 4
summary: Olaylar, mesaj biçimi, imza doğrulama ve yeniden deneme.
---
# Webhook'lar

Webhook ile Tendwell'de bir şey değişince senin adresine saniyeler içinde bir mesaj gelir. Değişiklikleri sorgulayıp durmana gerek kalmaz.

## Ekleme

Ayarlar → Geliştirici → **Yeni webhook**. Bağlantıları yönetme izni gerekir.

- Adres herkese açık bir `https` adresi olmalı. Yerel ve özel ağ adresleri kabul edilmez.
- Hangi olaylarda gönderileceğini seç.
- Eklerken bir **gizli anahtar** (`whsec_…`) gösterilir. Bir kez gösterilir; sakla.

**Test gönder** düğmesi adresine bir `ping` olayı yollar ve dönen yanıtı gösterir.

## Olaylar

| Olay | Ne zaman |
| --- | --- |
| `task.created` | Görev açıldı |
| `task.updated` | Görev değişti (durum, sorumlu, tarih, arşiv…) |
| `account.created` | Müşteri eklendi |
| `account.updated` | Müşteri değişti |
| `record.created` | Kayıt (kişi, fırsat…) eklendi |
| `record.updated` | Kayıt değişti |
| `comment.created` | Göreve yorum yazıldı |
| `activity.created` | Müşterinin zaman çizelgesine not, görüşme, toplantı ya da e-posta eklendi |

Bir nesne bir dakika içinde birkaç kez değişirse tek bir mesaj gider ve mesaj nesnenin gönderildiği andaki hâlini taşır.

## Mesaj

```http
POST /senin-adresin HTTP/1.1
Content-Type: application/json
Tendwell-Event: task.updated
Tendwell-Signature: t=1794394831,v1=5f2b…

{
  "id": "9b0c…",
  "event": "task.updated",
  "occurredAt": "2026-11-11T10:20:31.000Z",
  "company": "sirketin",
  "url": "https://sirketin.tendwell.com",
  "data": { "id": "…", "title": "Yenileme teklifini gönder", "status": "done", "done": true, "dueDate": "2027-01-15" }
}
```

Aynı mesaj birden fazla gelebilir; tekrarları `id` ile ayıkla.

## İmzayı doğrulama

`Tendwell-Signature` başlığındaki `v1`, gizli anahtarla `t + "." + gövde` metninin HMAC-SHA256 özetidir. Gövdeyi ayrıştırmadan, geldiği gibi kullan. Beş dakikadan eski `t` değerlerini reddet.

```js
// Node.js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

```python
# Python
import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    signed = parts["t"].encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

## Yanıt ve yeniden deneme

- 10 saniye içinde `2xx` ile yanıt ver. İşi sonra yap.
- Yanıt gelmezse ya da `2xx` dışı gelirse Tendwell 1, 5, 30, 120 ve 360 dakika sonra yeniden dener; toplam 6 deneme.
- Üst üste 50 kez ulaşamayan webhook duraklatılır. Ayarlar → Geliştirici'den **Sürdür** ile açarsın.
- Yönlendirmeler izlenmez; son adresi doğrudan yaz.
