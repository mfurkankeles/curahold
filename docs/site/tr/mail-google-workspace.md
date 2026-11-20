---
title: Google Workspace ile alan adınızda e-posta
section: developers
order: 10
summary: Yöneticiler ve işletmeciler için — bir şirketin kendi e-postasını Google Workspace'te çalıştırmak için DNS kayıtları (MX, SPF, DKIM, DMARC) ve posta kutusu planı.
---
# Google Workspace ile alan adınızda e-posta

> Yöneticiler ve işletmeciler için. Google'ın ekranları ve sınırları değişir; aşağıdaki değerler 19 Kasım 2026'da bilinen Google yönetici yardımına göre yazıldı — ilerlerken Yönetici konsolunda teyit edin.

## 1. Posta kutuları: az koltuk, çok adres

Workspace kullanıcı başına ücretlidir; kullanıcı sayısını az tutun, diğer her şeye **takma ad** ya da **grup** verin:

| Adres | Nedir | Nasıl |
| --- | --- | --- |
| kendi adresiniz | şirket sahibi | kullanıcı (1 koltuk) |
| hello@, billing@, security@, social@ | insanların yazdığı kutular | sahibin takma adları ya da gruplar |
| support@ | ortak destek kutusu | "ortak çalışma gelen kutusu" açık Google Grubu |
| no-reply@ | ürün e-postalarının göndericisi | aktarıcıya giriş yapan kullanıcının takma adı (sonraki rehber) |

Her şeyden önce her kullanıcı için **2 Adımlı Doğrulama**'yı açın.

## 2. DNS kayıtları

Bunları DNS sağlayıcınıza ekleyin (örneğin Cloudflare: DNS → Records). `example.com` yerine kendi alan adınızı yazın.

| Tür | Ad | Değer | Neden |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`, öncelik 1 | Alan adının e-postası Gmail'e gider |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF: Google alan adı adına gönderebilir. Yalnızca bir SPF kaydı olur — varsa birleştirin |
| TXT | `google._domainkey` | Yönetici konsolunun verdiği anahtar | DKIM: her iletiyi imzalar |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC: doğrulamayı geçemeyen postayla ne yapılacağını alıcılara söyler |

**DKIM:** Yönetici konsolu → Uygulamalar → Google Workspace → Gmail → E-postanın kimliğini doğrula → Yeni kayıt oluştur (2048 bit, seçici `google`). TXT kaydını yayımlayın, sonra konsola dönüp **Kimlik doğrulamayı başlat**'a tıklayın.

**Üç adımda DMARC:** `p=none` ile başlayın ve 2–4 hafta raporları okuyun; sonra `p=quarantine`; yalnızca kendi göndericileriniz göründüğünde `p=reject`. Yayımlamadan önce `dmarc@` adresini (takma ad ya da grup) oluşturun.

## 3. Kontrol

Dışarıdaki bir adrese ileti gönderin, açın, **Orijinali göster**'i seçin: SPF, DKIM ve DMARC'nin hepsi **PASS** olmalı. Google'ın Check MX aracı (Toolbox) kayıtları denetler.

## 4. Toplu gönderim kuralları

Gmail ve diğer büyük e-posta sağlayıcıları çok gönderenlerden şunları ister: SPF **ve** DKIM **ve** DMARC, pazarlama e-postalarında tek tıkla abonelikten çıkma ve %0,3'ün çok altında bir şikâyet oranı. Pazarlama e-postasını asla kişisel bir posta kutusundan göndermeyin; pazarlama alıcının iznini gerektirir (bkz. Gizlilik bildirimi).
