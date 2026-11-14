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
| `/admin/…` | 29 | Şirket ayarları, roller, kişiler ve gizlilik araçları: tarayıcıda bir yönetici. Anahtarlar bunları değiştiremez. |
| `/auth/…` | 5 | Oturum açma ve kapama tarayıcıda yapılır. |
| `/billing/…` | 8 | Plan ve ödeme; ödeme sağlayıcısıyla. |
| `/client-error/…` | 1 | Tarayıcının kendi hatalarını bildirmesi; kişinin karşılaştığı bir arıza kayda geçsin diye. |
| `/connect/…` | 1 | Bir CRM ya da sohbet uygulamasına bağlanmayı başlatma: kişi tarayıcıda onaylar. |
| `/connections/…` | 28 | Bağlantıları ve alan eşlemelerini yönetme: tarayıcıda bir yönetici. |
| `/consent/…` | 2 | Kişinin gizlilik ve çerez tercihleri; tarayıcıdan kaydedilir. |
| `/desk/…` | 12 | Curahold desteğinin kendi yardım talebi kuyruğu ve e-postayla gelen cevapların kapısı; yalnızca Curahold'un kendi anahtarlarıyla açılır. |
| `/help/…` | 7 | Curahold desteğine yardım talepleri ve konuşmaları; ürünün içinden. |
| `/help-files/…` | 1 | Desteğe gönderilen dosyalar. |
| `/hooks/…` | 3 | Sohbet uygulamalarının ve takvimlerin geri çağrıları. |
| `/join/…` | 1 | Davetle şirkete katılma tarayıcıda yapılır. |
| `/logo/…` | 1 | Şirket logosu. |
| `/manifest.webmanifest/…` | 1 | Kurulabilir uygulama bildirimi. |
| `/metrics/…` | 1 | Yalnızca işletmeciye özel platform metrikleri (owner panosu); bir şirketin API'sinin parçası değil. |
| `/oauth/…` | 0 | Uygulamalar ve yapay zekâ asistanları için onay ekranı; "Yapay zekâ bağlayıcısı ve OAuth" sayfasına bak. |
| `/onboarding/…` | 2 | Yeni bir şirketin kendi kurulum kontrol listesi; kayıttan sonra tarayıcıda kullanılır. |
| `/org/…` | 1 | Şirketin herkese açık oturum açma bilgileri. |
| `/platform/…` | 4 | Yalnızca işletmeciye özel owner konsolu (müşteriler, planlar, faturalandırma durumu, genel bakış); bir şirketin API'sinin parçası değil. |
| `/portal/…` | 6 | Müşteri portalına kimlerin girebileceğini yönetme. |
| `/replay/…` | 1 | Tarayıcının destek için oturum kaydı (bildirilen, girdiler maskeli, bir hafta tutulur); sayfa kendi olaylarını buraya gönderir, yalnızca Curahold'un masası okur. |
| `/setup/…` | 5 | Şirketin ilk kurulumu. |
| `/signup/…` | 4 | Yeni şirket açma web sitesinde yapılır. |
| `/support/…` | 9 | Curahold desteğinin kendi masası. |
