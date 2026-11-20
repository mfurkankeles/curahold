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
| `analytics_query` | 400 | Bu sorgu okunamadı: … |
| `backup_not_admin` | 400 | Yalnızca etkin yöneticiler yedek yönetici olabilir. |
| `bad_assignee` | 400 | Görevler yalnızca şirketindeki, tam koltuğu olan aktif kişilere atanabilir. |
| `bad_status` | 400 | Bu panoda böyle bir sütun yok. |
| `bad_webhook_url` | 400 | Webhook için herkese açık bir https adresi kullan. |
| `billing_off` | 400 | Bu kurulumda abonelik açık değil. |
| `connection_failed` | 400 | Servis isteği kabul etmedi. Bağlantıyı kontrol edip tekrar dene. |
| `department_off` | 400 | Bu departman şirketinin planında yok. |
| `domain_public` | 400 | … herkese açık bir e-posta servisi, bir şirkete ait olamaz. |
| `free_mail_note` | 400 | Şirket denemesi için neden kişisel adres kullandığını bir cümleyle yaz. |
| `help_file_type` | 400 | … eklenemiyor. Resim, PDF, metin, CSV, JSON, Excel ve kısa videolar eklenebilir. |
| `help_too_many_files` | 400 | Bir talebe en fazla … dosya eklenebilir. |
| `human_check` | 400 | Bunu bir kişinin gönderdiğini doğrulayamadık. Formdaki doğrulamayı tamamlayıp tekrar dene. |
| `invalid_token` | 400 | Bu bağlantı ya da kod artık geçerli değil. Yenisini iste. |
| `link_loop` | 400 | Bu görevler birbirini beklemiş olur. |
| `not_configured` | 400 | Bu servis bu sunucuda henüz ayarlanmadı. |
| `oauth_failed` | 400 | … ile giriş tamamlanmadı. Tekrar dene ya da e-posta bağlantısı kullan. |
| `oauth_not_configured` | 400 | Bu çalışma alanında … ile giriş kurulu değil. |
| `org_loop` | 400 | Bu bir döngü oluşturur: kişi, kendisine bağlı olan birine bağlanamaz. |
| `passkey_failed` | 400 | Passkey çalışmadı. Tekrar dene ya da başka bir yol kullan. |
| `plan_no_date` | 400 | Bu playbook yenileme ya da kapanış tarihine göre tarihleniyor; başlanacak bir tarih yok. |
| `portal_bad_code` | 400 | Kod yanlış ya da süresi dolmuş. Yenisini iste. |
| `portal_bad_password` | 400 | E-posta ya da şifre yanlış. |
| `portal_file_type` | 400 | … eklenemiyor. Resim, PDF, Word, Excel, PowerPoint, OpenDocument, metin, CSV ve ZIP dosyaları eklenebilir. |
| `portal_internal_email` | 400 | Bu adres şirketindeki birine ait. Portal müşteriler içindir. |
| `portal_method_off` | 400 | Bu giriş yolu kapalı. |
| `portal_no_method` | 400 | En az bir giriş yolu açık kalmalı: e-posta, Google, Microsoft ya da şifre. |
| `portal_not_shared` | 400 | Müşteri bu görevi göremiyor: önce paylaş (görevin bir müşterisi olmalı ve panosu müşterilere açık olmalı). |
| `portal_off` | 400 | Müşteri portalı kapalı. Ayarlar → Müşteri portalı'ndan aç. |
| `portal_passkey_failed` | 400 | Passkey çalışmadı. Tekrar dene ya da başka bir yolla giriş yap. |
| `portal_private_board` | 400 | Özel panolar müşterilere açılamaz. |
| `portal_too_many_files` | 400 | Bir seferde en fazla … dosya eklenebilir. |
| `portal_weak_password` | 400 | En az 10 karakterli, adını içermeyen ve kolay tahmin edilmeyen bir şifre seç. |
| `required_fields` | 400 | Görevi bitirmeden önce şunları doldur: … |
| `second_step_failed` | 400 | Bu kod çalışmadı. Kontrol edip tekrar dene. |
| `support_link_used` | 400 | Bu giriş bağlantısı kullanılmış ya da süresi dolmuş. Yenisini iste. |
| `support_view_only` | 400 | Curahold desteği yalnızca bakabilir, hiçbir şeyi değiştiremez. |
| `validation` | 400 | Bazı alanlar geçersiz: … |
| `device_mismatch` | 401 | Bu oturum başka bir cihaza ait. Lütfen tekrar giriş yap. |
| `session_evicted` | 401 | Hesabın başka bir cihazda kullanıldığı için çıkış yaptın. |
| `support_ended` | 401 | Bu destek oturumu sona erdi: erişim kapatıldı ya da süresi doldu. |
| `unauthenticated` | 401 | Lütfen giriş yap. |
| `billing_locked` | 402 | Şirketinin etkin bir planı yok; şu an bir şey değiştirilemez, ama her şey okunabilir ve dışa aktarılabilir. Bir yönetici Ayarlar → Abonelik’ten plan seçebilir. |
| `plan_required` | 402 | Bu, … planında var. Bir yönetici Ayarlar → Abonelik’ten geçebilir. |
| `board_lead_only` | 403 | Bu departmanda panoyu yalnızca yöneticiler ve departman liderleri açabilir. |
| `consent_required` | 403 | Lütfen önce yapay zekâ asistanı bilgilendirmesini kabul edin ya da belge aramasını kullanmaya devam edin. |
| `field_locked` | 403 | Rolün bu alanı görebilir ama değiştiremez (…). |
| `forbidden` | 403 | Bunu yapma yetkin yok. |
| `join_closed` | 403 | Bu şirkete yalnızca davetle katılınabiliyor. |
| `portal_invite_owner` | 403 | Portala yalnızca yöneticiler ya da müşterinin sorumlusu davet gönderebilir. |
| `preview_read_only` | 403 | Şu an başkasının gözünden bakıyorsun, bu yüzden hiçbir şey değiştirilemez. Önce kendi görünümüne dön. |
| `read_only_seat` | 403 | Koltuğun salt okunur. Tam koltuk için yöneticine başvur. |
| `read_only_token` | 403 | Bu anahtar ya da uygulama yalnızca okuyabilir. Değişiklik yapabilen bir anahtar oluştur ya da uygulamayı yeniden bağlayıp değişikliğe izin ver. |
| `reauth_required` | 403 | Devam etmek için kimliğini onayla. |
| `robot_refused` | 403 | Curahold'a otomatik erişim için yazılı iznimiz gerekir. Bir aracı bağlamak için API'yi bir anahtarla kullan. |
| `sso_required` | 403 | Bu şirket tek oturum açmayı zorunlu kılıyor. Giriş için kurumunuzun SSO'sunu kullanın. |
| `staff_second_step` | 403 | Curahold çalışanları konsolu passkey ya da ikinci adımla açar. Cihazlarım sayfasından bir tane ekle, sonra yeniden giriş yap. |
| `support_blocked` | 403 | Destek, izin olsa da bu bölümü açamaz. |
| `support_edit_admins` | 403 | Desteğin değişiklik yapmasına yalnızca yöneticiler izin verebilir. |
| `support_not_allowed` | 403 | Şirketin desteğe erişim vermene izin vermiyor. |
| `support_read_only` | 403 | Bu destek oturumu yalnızca okuma için. |
| `terms_required` | 403 | Önce hizmet koşullarını ve DPA'yı kabul et — bir yönetici tek tıkla yapabilir. |
| `form_off` | 404 | Bu pano formla talep almıyor. |
| `no_account` | 404 | Bu çalışma alanında … için hesap yok. Yöneticinden seni davet etmesini iste. |
| `not_found` | 404 | Bulunamadı. |
| `org_not_found` | 404 | Bu adreste bir çalışma alanı yok. |
| `already_member` | 409 | Burada zaten hesabın var — giriş yap. |
| `conflict` | 409 | Başka biri aynı anda bunu değiştirdi. |
| `email_taken` | 409 | Şirketinde bu e-postayı kullanan biri zaten var. |
| `handover_confirmed` | 409 | Bu devir zaten onaylandı. |
| `last_admin` | 409 | Şirketinde en az bir aktif yönetici kalmalı. |
| `plan_limit_connectors` | 409 | Planınız en fazla … bağlı araç içeriyor. Birini kaldırın ya da daha büyük bir plan seçin. |
| `plan_limit_seats` | 409 | Planınız en fazla … tam kullanıcı içeriyor ve hepsi kullanımda. Görüntüleyen olarak (ücretsiz) davet edin ya da daha büyük bir plan seçin. |
| `portal_email_taken` | 409 | Bu adresin zaten portal erişimi var. |
| `role_in_use` | 409 | Bu role sahip kişiler var. Önce onlara başka bir rol ver. |
| `seat_cap_reached` | 409 | Deneme … tam koltuk içeriyor ve hepsi kullanımda. İzleyici olarak davet et (ücretsiz) ya da bizden daha fazla koltuk iste. |
| `second_step_required` | 409 | Şirketin ikinci adımı zorunlu tutuyor. Bunu kaldırmadan önce başka bir tane ekle. |
| `second_step_setup_first` | 409 | Önce kendi ikinci adımını kur; böylece dışarıda kalmazsın. |
| `slug_taken` | 409 | Bu adres alınmış. Başka bir tane dene. |
| `sso_no_backup` | 409 | SSO'yu zorunlu kılmadan önce passkey'i ya da doğrulama uygulaması olan en az bir yedek yönetici seç; böylece sağlayıcı çökerse herkes dışarıda kalmaz. |
| `sso_untested` | 409 | Önce bu bilgilerle kimlik sağlayıcın üzerinden girişi dene; sonra SSO zorunlu kılınabilir. |
| `support_too_many` | 409 | Zaten açık beş destek erişimin var. Önce birini kapat. |
| `sync_running` | 409 | Bu bağlantı için şu anda bir eşitleme çalışıyor. Bir dakika sonra tekrar deneyin. |
| `trash_conflict` | 409 | O zamandan beri yerini başka bir şey almış (aynı CRM kimliği ya da e-posta). Önce onu değiştir ya da kaldır. |
| `trash_parent_first` | 409 | “…” de çöp kutusunda. Önce onu geri al. |
| `trash_parent_gone` | 409 | Bunun bağlı olduğu şey artık yok; bu yüzden geri alınamıyor. |
| `type_not_empty` | 409 | Bu türde hâlâ … kayıt var. Önce onları arşivleyin veya silin. |
| `export_too_large` | 413 | Bir dosyaya en fazla … satır sığar. Listeyi bir filtreyle daralt, sonra yeniden dışa aktar. |
| `file_too_large` | 413 | Dosyalar en fazla … MB olabilir. |
| `import_too_large` | 413 | Tek seferde en fazla … satır içe aktarabilirsin. |
| `plan_limit_storage` | 413 | Planınızın dosya alanı (… GB) doldu. Artık gerekmeyen dosyaları silin ya da daha büyük bir plan seçin. |
| `portal_quota` | 413 | Sağlayıcınızın dosya alanı dolu. Dosyayı başka bir yolla gönderin ya da yer açmalarını isteyin. |
| `repeat_mismatch` | 422 | Bu istek, başka bir değişikliğe ait bir anahtarla gönderildi. Hiçbir şey değişmedi. |
| `analytics_budget` | 429 | Bugünkü … satırlık analiz kotası doldu. Daha sonra yeniden dene. |
| `portal_locked` | 429 | Çok fazla yanlış deneme oldu. … dakika sonra tekrar dene ya da şifreni yenile. |
| `too_many_requests` | 429 | Çok fazla deneme oldu. Birkaç dakika bekleyip tekrar dene. |
| `server` | 500 | Bizim tarafta bir sorun oldu. Lütfen tekrar dene. |
| `billing_error` | 502 | Ödeme sağlayıcısı beklendiği gibi yanıt vermedi. Bir dakika sonra yeniden dene. |
| `crm_error` | 502 | Bağlı servis şunu söyledi: … |
| `crm_unreachable` | 502 | Bu adrese ulaşamadık. Adın doğru yazıldığına bak; doğruysa şirket ağı engelliyor olabilir: BT ekibine sor. |
