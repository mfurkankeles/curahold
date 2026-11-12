---
title: Başvuru: hatalar
section: reference
order: 39
summary: Her hata kodu, HTTP durumu ve ne anlama geldiği.
---
# Başvuru: hatalar

Hata her zaman aynı biçimdedir: `{ "error": "<kod>", "message": "<bir cümle>" }`; bazen neyin yanlış olduğunu söyleyen `fields` ile. Kararı `error` ile ver, `message` değerini göster: cümle, anahtarın arkasındaki kişinin dilinde gelir (ya da `x-curahold-locale` başlığındaki dilde).

| Kod | Durum | Kişiye söylenen |
| --- | --- | --- |
| `bad_assignee` | 400 | Görevler yalnızca şirketindeki, tam koltuğu olan aktif kişilere atanabilir. |
| `bad_status` | 400 | Bu panoda böyle bir sütun yok. |
| `bad_webhook_url` | 400 | Webhook için herkese açık bir https adresi kullan. |
| `billing_off` | 400 | Bu kurulumda abonelik açık değil. |
| `connection_failed` | 400 | Servis isteği kabul etmedi. Bağlantıyı kontrol edip tekrar dene. |
| `domain_public` | 400 | … herkese açık bir e-posta servisi, bir şirkete ait olamaz. |
| `help_file_type` | 400 | … eklenemiyor. Resim, PDF, metin, CSV, JSON, Excel ve kısa videolar eklenebilir. |
| `help_too_many_files` | 400 | Bir talebe en fazla … dosya eklenebilir. |
| `invalid_token` | 400 | Bu bağlantı ya da kod artık geçerli değil. Yenisini iste. |
| `link_loop` | 400 | Bu görevler birbirini beklemiş olur. |
| `not_configured` | 400 | Bu servis bu sunucuda henüz ayarlanmadı. |
| `oauth_failed` | 400 | … ile giriş tamamlanmadı. Tekrar dene ya da e-posta bağlantısı kullan. |
| `oauth_not_configured` | 400 | Bu çalışma alanında … ile giriş kurulu değil. |
| `org_loop` | 400 | Bu bir döngü oluşturur: kişi, kendisine bağlı olan birine bağlanamaz. |
| `plan_no_date` | 400 | Bu playbook yenileme ya da kapanış tarihine göre tarihleniyor; başlanacak bir tarih yok. |
| `portal_bad_code` | 400 | Kod yanlış ya da süresi dolmuş. Yenisini iste. |
| `portal_bad_password` | 400 | E-posta ya da şifre yanlış. |
| `portal_internal_email` | 400 | Bu adres şirketindeki birine ait. Portal müşteriler içindir. |
| `portal_method_off` | 400 | Bu giriş yolu kapalı. |
| `portal_no_method` | 400 | En az bir giriş yolu açık kalmalı: e-posta, Google, Microsoft ya da şifre. |
| `portal_not_shared` | 400 | Müşteri bu görevi göremiyor: önce paylaş (görevin bir müşterisi olmalı ve panosu müşterilere açık olmalı). |
| `portal_off` | 400 | Müşteri portalı kapalı. Ayarlar → Müşteri portalı'ndan aç. |
| `portal_passkey_failed` | 400 | Passkey çalışmadı. Tekrar dene ya da başka bir yolla giriş yap. |
| `portal_private_board` | 400 | Özel panolar müşterilere açılamaz. |
| `portal_weak_password` | 400 | En az 10 karakterli, adını içermeyen ve kolay tahmin edilmeyen bir şifre seç. |
| `required_fields` | 400 | Görevi bitirmeden önce şunları doldur: … |
| `support_link_used` | 400 | Bu giriş bağlantısı kullanılmış ya da süresi dolmuş. Yenisini iste. |
| `validation` | 400 | Bazı alanlar geçersiz: … |
| `device_mismatch` | 401 | Bu oturum başka bir cihaza ait. Lütfen tekrar giriş yap. |
| `session_evicted` | 401 | Hesabın başka bir cihazda kullanıldığı için çıkış yaptın. |
| `support_ended` | 401 | Bu destek oturumu sona erdi: erişim kapatıldı ya da süresi doldu. |
| `unauthenticated` | 401 | Lütfen giriş yap. |
| `billing_locked` | 402 | Şirketinin etkin bir planı yok; şu an bir şey değiştirilemez, ama her şey okunabilir ve dışa aktarılabilir. Bir yönetici Ayarlar → Abonelik’ten plan seçebilir. |
| `plan_required` | 402 | Bu, … planında var. Bir yönetici Ayarlar → Abonelik’ten geçebilir. |
| `field_locked` | 403 | Rolün bu alanı görebilir ama değiştiremez (…). |
| `forbidden` | 403 | Bunu yapma yetkin yok. |
| `join_closed` | 403 | Bu şirkete yalnızca davetle katılınabiliyor. |
| `portal_invite_owner` | 403 | Portala yalnızca yöneticiler ya da müşterinin sorumlusu davet gönderebilir. |
| `preview_read_only` | 403 | Şu an başkasının gözünden bakıyorsun, bu yüzden hiçbir şey değiştirilemez. Önce kendi görünümüne dön. |
| `read_only_seat` | 403 | Koltuğun salt okunur. Tam koltuk için yöneticine başvur. |
| `read_only_token` | 403 | Bu anahtar ya da uygulama yalnızca okuyabilir. Değişiklik yapabilen bir anahtar oluştur ya da uygulamayı yeniden bağlayıp değişikliğe izin ver. |
| `support_blocked` | 403 | Destek, izin olsa da bu bölümü açamaz. |
| `support_edit_admins` | 403 | Desteğin değişiklik yapmasına yalnızca yöneticiler izin verebilir. |
| `support_not_allowed` | 403 | Şirketin desteğe erişim vermene izin vermiyor. |
| `support_read_only` | 403 | Bu destek oturumu yalnızca okuma için. |
| `form_off` | 404 | Bu pano formla talep almıyor. |
| `no_account` | 404 | Bu çalışma alanında … için hesap yok. Yöneticinden seni davet etmesini iste. |
| `not_found` | 404 | Bulunamadı. |
| `org_not_found` | 404 | Bu adreste bir çalışma alanı yok. |
| `already_member` | 409 | Burada zaten hesabın var — giriş yap. |
| `conflict` | 409 | Başka biri aynı anda bunu değiştirdi. |
| `email_taken` | 409 | Şirketinde bu e-postayı kullanan biri zaten var. |
| `last_admin` | 409 | Şirketinde en az bir aktif yönetici kalmalı. |
| `portal_email_taken` | 409 | Bu adresin zaten portal erişimi var. |
| `role_in_use` | 409 | Bu role sahip kişiler var. Önce onlara başka bir rol ver. |
| `slug_taken` | 409 | Bu adres alınmış. Başka bir tane dene. |
| `support_too_many` | 409 | Zaten açık beş destek erişimin var. Önce birini kapat. |
| `sync_running` | 409 | Bu bağlantı için şu anda bir eşitleme çalışıyor. Bir dakika sonra tekrar deneyin. |
| `type_not_empty` | 409 | Bu türde hâlâ … kayıt var. Önce onları arşivleyin veya silin. |
| `file_too_large` | 413 | Dosyalar en fazla … MB olabilir. |
| `import_too_large` | 413 | Tek seferde en fazla … satır içe aktarabilirsin. |
| `repeat_mismatch` | 422 | Bu istek, başka bir değişikliğe ait bir anahtarla gönderildi. Hiçbir şey değişmedi. |
| `portal_locked` | 429 | Çok fazla yanlış deneme oldu. … dakika sonra tekrar dene ya da şifreni yenile. |
| `too_many_requests` | 429 | Çok fazla deneme oldu. Birkaç dakika bekleyip tekrar dene. |
| `server` | 500 | Bizim tarafta bir sorun oldu. Lütfen tekrar dene. |
| `billing_error` | 502 | Ödeme sağlayıcısı beklendiği gibi yanıt vermedi. Bir dakika sonra yeniden dene. |
| `crm_error` | 502 | Bağlı servis şunu söyledi: … |
