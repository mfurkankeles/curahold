---
title: API anahtarları
section: developers
order: 2
summary: Kişisel anahtar oluşturma, okuma ya da yazma yetkisi, süre ve iptal.
---
# API anahtarları

API anahtarı, bir kişinin adına çalışan bir paroladır. Herkes kendi anahtarını oluşturur; yönetici başkası adına anahtar üretemez.

## Oluşturma

1. Curahold'da **Ayarlarınız** sayfasını açın.
2. **API anahtarları ve bağlı uygulamalar** bölümünde **Yeni API anahtarı**na tıklayın.
3. Bir ad verin, gerekiyorsa **Değişiklik yapabilsin** kutusunu işaretleyin ve geçerlilik süresini seçin (30, 90, 365 gün ya da süresiz).
4. Anahtar `chk_` ile başlar ve **yalnızca bir kez** gösterilir. Bir parola yöneticisine kaydedin.

## Kullanma

Her istekte `Authorization` başlığıyla gönderin:

```bash
curl https://sirketiniz.curahold.com/api/me \
  -H "Authorization: Bearer chk_..."
```

Anahtarla yapılan istekler, anahtarın sahibinin yaptığı istekler gibi işlenir: aynı müşterileri görür, aynı alanlar ona kapalıdır.

## Okuma ve yazma

- **Yalnızca okur** (varsayılan): `GET` istekleri çalışır; diğerleri `403 read_only_token` döner.
- **Okur ve değiştirir:** görev, müşteri, kayıt açabilir ve güncelleyebilir. İzleyici koltuğundaki kişiler yazma yetkili anahtar oluşturamaz.

Bir anahtar asla şu işleri yapamaz: yeni anahtar oluşturmak, bir uygulamaya OAuth onayı vermek, "Onun gözünden bak" kullanmak.

## Yalnızca oturum açmış kişinin yapabildikleri

Bir anahtara ya da uygulamaya hangi izin verilmiş olursa olsun şu adresler `403 session_required` döner: yönetim (roller,
kişiler, birini kaldırmak ya da verisini dışa aktarmak, şirketi silme, alan adları, etkinlik kaydı, güvenlik ayarları),
tek oturum açma (SSO) ve SCIM, faturalama, API anahtarları, bağlı sohbet uygulamaları ve CRM'ler, kendi
oturum açma güvenliğiniz ve oturumlarınız, destek erişimi. Bunlar için oturum açmış olmanız gerekir; bazıları sizden
kimliğinizi yeniden doğrulamanızı ister. Yönetici izni gerektiren her şey de (şirket, kişiler ve ekipler, etkinlik
kaydı, gizlilik, müşteri ayarları ve içe aktarma, otomasyonlar, bağlantılar), adresi ne olursa olsun, yalnızca oturum
açmış kişiye açıktır. Tek istisna bir webhook'a abone olmaktır (`/api/dev/webhooks`).

## Anahtarı alanlarla sınırlamak

API ile oluşturulan bir anahtar (`POST /api/dev/keys`) `areas` taşıyabilir; her biri okuma ya da yazma içindir: `work`
(panolar, görevler, sayfalar, otomasyonlar), `customers` (müşteriler, kayıtlar, talepler, portal, onboarding), `reports`
(raporlar, arama, dışa aktarma, analiz) `people` (kişi listesi ve kendi profiliniz) ve `webhooks` (otomasyon platformlarının yaptığı gibi giden webhook'lara
abone olmak). Örneğin
`"areas": ["work:write", "customers:read"]`. Bu alanların dışındaki her şey `403 token_scope` döner; `GET /api/me` her
zaman çalışır. Yazma izni için **Değişiklik yapabilir** işaretli olmalıdır. `areas` olmadan anahtar her alana ulaşır.

## İptal ve gözetim

- Anahtarlarınızı Ayarlarınız sayfasından görür, istediğinizi **İptal et** ile hemen kapatabilirsiniz.
- Kişileri yöneten yöneticiler Ayarlar → Geliştirici'de şirketteki tüm anahtarları ve bağlı uygulamaları görür ve iptal edebilir.
- Her anahtarın son kullanıldığı zaman görünür. Oluşturma ve iptal aktivite kaydına yazılır.
- Bir kişi şirketten ayrılıp devre dışı bırakıldığında anahtarları da çalışmaz.

> **Güvenlik:** Anahtarı koda gömmeyin, ortam değişkeninde tutun. Sızdığından şüphelenirseniz iptal edin ve yenisini oluşturun. Curahold anahtarın kendisini saklamaz, yalnızca özetini tutar.
