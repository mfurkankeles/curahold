---
title: Başvuru: API'de olmayanlar
section: reference
order: 41
summary: Tarayıcıya ait adresler; hiçbir şey gizli kalmasın diye listelenir.
---
# Başvuru: API'de olmayanlar

Bu adresler vardır ama tarayıcıya ya da başka makinelere aittir. Hiçbir şey gizli kalmasın diye listelenir.

| Adresler | Kaç tane | Neden |
| --- | --- | --- |
| `/admin/…` | 28 | Şirket ayarları, roller, kişiler ve gizlilik araçları: tarayıcıda bir yönetici. Anahtarlar bunları değiştiremez. |
| `/auth/…` | 5 | Oturum açma ve kapama tarayıcıda yapılır. |
| `/billing/…` | 3 | Plan ve ödeme; ödeme sağlayıcısıyla. |
| `/connect/…` | 1 | Bir CRM ya da sohbet uygulamasına bağlanmayı başlatma: kişi tarayıcıda onaylar. |
| `/connections/…` | 23 | Bağlantıları ve alan eşlemelerini yönetme: tarayıcıda bir yönetici. |
| `/desk/…` | 11 | Curahold desteğinin kendi yardım talebi kuyruğu ve e-postayla gelen cevapların kapısı; yalnızca Curahold'un kendi anahtarlarıyla açılır. |
| `/help/…` | 7 | Curahold desteğine yardım talepleri ve konuşmaları; ürünün içinden. |
| `/help-files/…` | 1 | Desteğe gönderilen dosyalar. |
| `/hooks/…` | 3 | Sohbet uygulamalarının ve takvimlerin geri çağrıları. |
| `/join/…` | 1 | Davetle şirkete katılma tarayıcıda yapılır. |
| `/logo/…` | 1 | Şirket logosu. |
| `/manifest.webmanifest/…` | 1 | Kurulabilir uygulama bildirimi. |
| `/oauth/…` | 0 | Uygulamalar ve yapay zekâ asistanları için onay ekranı; "Yapay zekâ bağlayıcısı ve OAuth" sayfasına bak. |
| `/org/…` | 1 | Şirketin herkese açık oturum açma bilgileri. |
| `/portal/…` | 6 | Müşteri portalına kimlerin girebileceğini yönetme. |
| `/setup/…` | 5 | Şirketin ilk kurulumu. |
| `/signup/…` | 4 | Yeni şirket açma web sitesinde yapılır. |
| `/support/…` | 8 | Curahold desteğinin kendi masası. |
