---
title: Curahold’u kendi sunucunda çalıştırmak
section: developers
order: 7
summary: Kendi makinende tek şirket: gerekenler, ayarlar, ilk giriş, HTTPS, yedekler ve güncellemeler.
---
# Curahold’u kendi sunucunda çalıştırmak

Bazı şirketler araçlarını kendi duvarlarının içinde tutar. Curahold orada da çalışır: tek şirket, kendi Postgres veritabanın, ekler kendi diskinde, e-postalar kendi posta sunucundan. Curahold’a hiçbir şey gönderilmez ve abonelik yoktur: her şey açıktır.

## Gerekenler

- Docker kurulu bir Linux makine. Birkaç yüz kişi için iki işlemci, 2 GB bellek ve 20 GB disk fazlasıyla yeter.
- Bir adres, örneğin `curahold.ornek.com`, ve önünde HTTPS sunan bir web sunucusu (Caddy, nginx ya da Traefik).
- Giriş bağlantıları, hatırlatmalar ve özetler için bir posta sunucusu (SMTP).

## Kurulum

1. Curahold paketini Curahold’daki muhatabından al ve makinede aç.
2. `selfhost.env.example` dosyasını `.env` adıyla kopyala ve doldur (ayarlar aşağıda).
3. `docker compose up -d` çalıştır. İlk açılış birkaç dakika sürer: uygulamayı derler, veritabanını hazırlar ve şirketini oluşturur.
4. HTTPS web sunucunda adresini `127.0.0.1:8080` adresine yönlendir. Caddy ile bu kadarı yeter:

```
curahold.ornek.com {
  reverse_proxy 127.0.0.1:8080
}
```

5. Adresini aç ve yöneticinin e-posta adresiyle giriş yap. Bağlantı e-postayla gelir; e-posta ayarlanana kadar `docker compose logs app` çıktısında durur.

Sonrası curahold.com’daki gibi: ekibini davet et, müşterilerini ekle, sohbet uygulamanı bağla.

## Ayarlar

| Ayar | Ne olduğu |
| --- | --- |
| `PUBLIC_URL` | İnsanların açtığı adres, tarayıcıda göründüğü gibi; örneğin `https://curahold.ornek.com` |
| `AUTH_SECRET` | 32 ya da daha fazla rastgele karakter, örneğin `openssl rand -base64 48` çıktısı. Gizli tut: değiştirirsen herkesin oturumu kapanır |
| `DB_PASSWORD` | Veritabanı parolası (harf ve rakam) |
| `COMPANY_NAME`, `ADMIN_EMAIL`, `ADMIN_NAME` | Şirketin ve ilk yöneticisi; ilk açılışta oluşturulur |
| `LOCALE`, `TIMEZONE`, `CURRENCY` | `tr` ya da `en`; örneğin `Europe/Istanbul`; örneğin `TRY` |
| `SMTP_URL`, `EMAIL_FROM` | Posta sunucun, örneğin `smtp://kullanici:parola@mail.ornek.com:587`, ve gönderen, örneğin `Curahold <curahold@ornek.com>` |
| `PORTAL_DOMAIN` | İsteğe bağlı: müşteri portalının kendi adresi, örneğin `portal.ornek.com`. Onu da aynı `127.0.0.1:8080` adresine yönlendir |

Google ve Microsoft ile giriş, sohbet uygulamaları ve CRM’ler curahold.com’dakiyle aynı ayarları kullanır; liste Curahold’daki muhatabında.

## Yedekler

Verin iki yerde durur: veritabanı ve ekler.

```
docker compose exec -T db pg_dump -U curahold curahold > curahold-$(date +%F).sql
docker compose cp app:/data/files ./ekler-$(date +%F)
```

Kopyaları başka bir makinede tut ve arada bir geri yüklemeyi dene.

## Güncelleme

Yeni paketi eskisinin üzerine aç (`.env` dosyan kalsın), sonra `docker compose up -d --build` çalıştır. Veritabanı uygulama açılırken güncellenir; önce yedek al.

## Bilmekte fayda var

- Kendi sunucunda planlar ve ödeme yoktur: her şey açıktır.
- Docker olmadan: Node 22 ve Postgres 16 ya da üstü. `npm ci && npm run build && npm run build:server` ile derle, sonra aynı ayarlar ortamda ve `DATABASE_URL` veritabanını gösterirken `node dist/server/selfhost.mjs` ile başlat. İlk açılışta veritabanı kullanıcısının rol oluşturma yetkisi olmalı.
- İzleme için: adresindeki `/api/health`, uygulama ayaktayken `{"ok":true}` döner.
