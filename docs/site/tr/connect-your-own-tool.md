---
title: Kendi aracını bağla
section: developers
order: 8
summary: Bağlantı listesinde olmayan bir sistemi Curahold ile eşit tut.
---
# Kendi aracını bağla

Curahold yaygın CRM'lere, tablolara ve destek araçlarına kendisi bağlanır (Ayarlar → CRM'ler). Geri kalan her şey için, şirket içi sistemler dahil, aynı sonuç küçük bir betik ve API ile alınır. Bu sayfa işe yarayan kalıpları gösterir.

## Veri hangi yöne gidiyor?

| İstediğin | Kullan |
| --- | --- |
| Kendi sisteminden Curahold'a müşteriler | [İçe aktarmayı güncelleyerek ekleme olarak kullan](#musteriler-iceri-kendi-kimliginle) |
| Destek aracından kayıtlar | [`PUT /tickets`](#destek-kayitlari-iceri) |
| Başka yerde kaydedilmiş arama, e-posta ya da toplantılar | [`POST /accounts/{id}/activities`](#etkinlikler-iceri) |
| Başka bir sistemin açtığı görevler | `Idempotency-Key` ile `POST /tasks` |
| Curahold'daki değişikliklerin sistemine gitmesi | [Webhook'lar](#degisiklikler-disari) |
| Hiç kod yazmadan | [Zapier, Make ve tablolar](#kod-yazmadan) |

## Müşteriler içeri, kendi kimliğinle

`POST /accounts/import` satırları ve senin sütun adlarından Curahold alanlarına bir eşlemeyi alır. **Kendi** kimliğinin durduğu sütunu `externalId` olarak göster: Curahold'un daha önce gördüğü bir kimlik o müşteriyi günceller, yeni bir kimlik müşteri ekler. Aynı satırları yeniden göndermek hiçbir şeyi değiştirmez; betik her saat çalışabilir.

```bash
curl -X POST $CURAHOLD/accounts/import \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{
    "rows": [
      { "id": "C-1041", "sirket": "Limanyolu Bankası", "sahip": "ada@sirketin.com", "arr": 126000, "yenileme": "2027-03-01" },
      { "id": "C-1042", "sirket": "Kuzeytarla Gıda", "sahip": "mert@sirketin.com", "arr": 48000, "yenileme": "2027-06-15" }
    ],
    "mapping": {
      "name": "sirket",
      "externalId": "id",
      "owner": "sahip",
      "fields": { "arr": "arr", "renewal_date": "yenileme" }
    }
  }'
```

Cevap neyin eklendiğini, güncellendiğini ve atlandığını sayar; okunamayan satırları (`errors`) ve bulamadığı sahipleri (`unmatchedOwners`) listeler. İstek başına en çok 5.000 satır; daha büyük kümeleri parça parça gönder. Anahtarın sahibinde müşterileri yönetme ve hepsini görme yetkisi olmalı.

`fields` içinde soldaki alan anahtarları, `GET /me` cevabındaki `org.accountFields` listesindekilerdir. Sahipler önce e-postayla, sonra adla eşlenir.

Bir içe aktarma 30 gün boyunca geri alınabilir: cevaptaki `batch` ile `POST /imports/{batch}/undo`.

## Destek kayıtları içeri

Kayıt başına tek çağrı; destek aracının adı ve kaydın oradaki kimliğiyle adreslenir. Yeniden gönderince aynı kayıt güncellenir; yalnızca gönderdiğin değişir.

```bash
curl -X PUT $CURAHOLD/tickets/destek/48213 \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"Büyük dosyalarda dışa aktarma hata veriyor","status":"open","priority":"high","account":{"name":"Limanyolu Bankası"},"openedAt":"2026-11-10"}'
```

Destek aracın bir web adresini çağırabiliyor ama başlık gönderemiyorsa, Ayarlar → Geliştirici sayfasında gelen adresi aç ve aynı gövdeyi oraya gönder; gizli değer adresin parçasıdır.

## Etkinlikler içeri

Başka bir araçta geçen arama, e-posta ya da toplantı müşterinin zaman çizelgesinde durmalı:

```bash
curl -X POST $CURAHOLD/accounts/<müşteri kimliği>/activities \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: arama-2026-11-10-7781" \
  -d '{"kind":"call","body":"Yenileme teklifinin üzerinden geçtik; hukuk incelemesi gelecek hafta.","happenedAt":"2026-11-10T14:30:00Z"}'
```

`Idempotency-Key` olarak kendi tarafından değişmeyen bir şey kullan (aramanın kendi kimliği); böylece tekrar çalışan bir betik aynı şeyi iki kez kaydetmez. Anahtarlar iki gün hatırlanır.

## Değişiklikler dışarı

İlgilendiğin olaylar için bir [webhook](/docs/tr/webhooks/) ekle. Her mesaj o şeyin şu anki halini taşır; çoğu alıcının ikinci bir istek yapması gerekmez. Mesajlar iki kez ve sırasız gelebilir: tekrarları `id` ile ele, daha yeni `occurredAt` kazansın.

## İki yönlü

Aynı şey iki tarafta da değişebiliyorsa:

1. Kendi tarafında bir eş tablosu tut: senin kimliğin ↔ Curahold'un kimliği.
2. Yazmadan önce oku. Görevlerde okuduğun `version` değerini `baseVersion` olarak gönder; `409` gelirse bu arada biri değiştirmiştir ve cevap güncel görevi taşır.
3. Yankı yapma: kendi değişikliğin sana webhook olarak dönünce gönderdiğinle karşılaştır ve orada dur.
4. Her değişikliği bir `Idempotency-Key` ile gönder; kopan bağlantıdan sonra yeniden deneme zararsız olur.

## Kod yazmadan

- **Zapier, Make, n8n ve benzerleri:** genel "HTTP isteği" ve "webhook" adımlarını bir API anahtarıyla kullan. Akışı bir Curahold webhook'u başlatır; `Authorization: Bearer chk_…` başlıklı bir HTTP adımı geri yazar.
- **Tablolar:** Google Sheets ve Excel, Ayarlar → CRM'ler sayfasından doğrudan bağlanır; tabloya dışa aktarabilen her araç bu yolla eşit tutulabilir.
- **CSV:** Curahold'daki her listenin, eşlemesini hatırlayan bir içe aktarması vardır.

## Akılda tutulacaklar

- Anahtar bir kişi olarak çalışır. Entegrasyona kendi kişisini ve işi gören en dar rolü ver; yaptığı değişiklikler geçmişte kolayca tanınır.
- Tarihler `YYYY-AA-GG` biçimindedir ve şirketin kendi gününü anlatır; anlar UTC olarak ISO 8601'dir.
- Her adres ve alan [başvuruda](/docs/tr/ref-customers/), her hata kodu [hatalar](/docs/tr/ref-errors/) sayfasında.
