---
title: Hızlı başlangıç
section: developers
order: 2
summary: Sıfırdan ilk görevine ve ilk webhook'una, yaklaşık beş dakikada.
---
# Hızlı başlangıç

Beş adım, yaklaşık beş dakika. Bir Curahold şirketi ve tam kullanıcı olmanız gerekir.

## 1. Anahtar oluşturun

1. **Ayarlarınız** sayfasını açın.
2. **API anahtarları ve bağlı uygulamalar** bölümünde **Yeni API anahtarı**na tıklayın.
3. **Değişiklik yapabilsin** kutusunu işaretleyin ve anahtarı kopyalayın. `chk_` ile başlar ve yalnızca bir kez gösterilir.

```bash
export CURAHOLD=https://sirketiniz.curahold.com/api
export CURAHOLD_KEY=chk_...
```

## 2. Kim olduğunuzu sorun

```bash
curl -s $CURAHOLD/me -H "Authorization: Bearer $CURAHOLD_KEY"
```

Cevap, anahtarın kimin adına çalıştığını ve şirketinizin nasıl kurulduğunu söyler: saat dilimi, para birimi, "müşteri" için kullandığı kelime ve müşteri alanları. Bir anahtarın yaptığı her şey **bu kişi olarak** yapılır: onun gördüğünü görür, onun değiştirebildiğini değiştirir.

## 3. Müşterileri okuyun

```bash
curl -s "$CURAHOLD/accounts?q=liman&limit=5" -H "Authorization: Bearer $CURAHOLD_KEY"
```

Her müşteri kendi alanlarını `fields` içinde taşır; anahtarlar `/me` cevabındaki `org.accountFields` listesinde durur.

## 4. Görev ekleyin

Görev bir panoda, panonun sütunlarından birinde durur. Önce bir pano seçin:

```bash
curl -s $CURAHOLD/boards -H "Authorization: Bearer $CURAHOLD_KEY"
```

Sonra görevi ekleyin. `Idempotency-Key` başlığı yeniden denemeyi güvenli kılar: aynı anahtar yeniden gönderilirse ilk cevap geri gelir, hiçbir şey iki kez yapılmaz.

```bash
curl -s -X POST $CURAHOLD/tasks \
  -H "Authorization: Bearer $CURAHOLD_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"boardId":"<pano kimliği>","title":"Yenileme özetini gönder","accountId":"<müşteri kimliği>","dueDate":"2027-02-20"}'
```

## 5. Değişikliklerden haberdar ol

Tekrar tekrar sormak yerine Curahold size haber versin. **Ayarlar → Geliştirici** sayfasında **Yeni webhook**'a tıklayın, herkese açık bir `https` adresi verin ve istediğiniz olayları seçin (`task.updated`, `account.updated` …). Her mesaj imzalıdır; güvenmeden önce [imzayı doğrulayın](/docs/tr/webhooks/).

## Aynısı JavaScript ile

```js
const api = 'https://sirketiniz.curahold.com/api';
const headers = { Authorization: `Bearer ${process.env.CURAHOLD_KEY}`, 'Content-Type': 'application/json' };

const { boards } = await (await fetch(`${api}/boards`, { headers })).json();
const res = await fetch(`${api}/tasks`, {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ boardId: boards[0].id, title: 'Yenileme özetini gönder' }),
});
if (!res.ok) throw new Error((await res.json()).message);
const { task } = await res.json();
```

## Aynısı Python ile

```python
import os, uuid, requests

api = "https://sirketiniz.curahold.com/api"
headers = {"Authorization": f"Bearer {os.environ['CURAHOLD_KEY']}"}

boards = requests.get(f"{api}/boards", headers=headers).json()["boards"]
res = requests.post(
    f"{api}/tasks",
    headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    json={"boardId": boards[0]["id"], "title": "Yenileme özetini gönder"},
)
res.raise_for_status()
task = res.json()["task"]
```

## Sırada ne var

- [API rehberi](/docs/tr/api-reference/): API'nin arkasındaki fikirler, örneklerle.
- [Başvuru](/docs/tr/ref-customers/): her adres, alan alan.
- [Kendi aracınızı bağlayın](/docs/tr/connect-your-own-tool/): bağlantı listesinde olmayan bir sistemi Curahold ile eşit tutun.
- [Webhook'lar](/docs/tr/webhooks/) ve [hatalar](/docs/tr/ref-errors/).
