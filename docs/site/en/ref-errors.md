---
title: Reference: errors
section: reference
order: 39
summary: Every error code, its HTTP status and what it means.
---
# Reference: errors

An error always has the same shape: `{ "error": "<code>", "message": "<a sentence>" }`, sometimes with `fields` naming what was wrong. Decide by `error`, show `message`: the sentence comes in the language of the person behind the key (or of the `x-curahold-locale` header).

| Code | Status | What the person is told |
| --- | --- | --- |
| `bad_assignee` | 400 | Tasks can only be assigned to active people with a full seat in your company. |
| `bad_status` | 400 | That column does not exist on this board. |
| `bad_webhook_url` | 400 | Use a public https address for webhooks. |
| `billing_off` | 400 | Billing is not set up on this installation. |
| `connection_failed` | 400 | The service did not accept the request. Check the connection and try again. |
| `domain_public` | 400 | … is a public email service, so it cannot belong to one company. |
| `help_file_type` | 400 | … can't be attached. Pictures, PDF, text, CSV, JSON, Excel and short videos can. |
| `help_too_many_files` | 400 | A request can carry up to … files. |
| `invalid_token` | 400 | This link or code is not valid any more. Request a new one. |
| `link_loop` | 400 | These tasks would end up waiting for each other. |
| `not_configured` | 400 | This service is not set up on this server yet. |
| `oauth_failed` | 400 | Sign-in with … did not complete. Try again or use an email link. |
| `oauth_not_configured` | 400 | … sign-in is not set up for this workspace. |
| `org_loop` | 400 | That would make a loop: someone cannot report to a person who reports to them. |
| `plan_no_date` | 400 | This playbook is dated from a renewal or a close date, and there is none to start from. |
| `portal_bad_code` | 400 | That code is wrong or has run out. Ask for a new one. |
| `portal_bad_password` | 400 | Wrong email or password. |
| `portal_internal_email` | 400 | That address belongs to someone in your company. The portal is for customers. |
| `portal_method_off` | 400 | This way of signing in is switched off. |
| `portal_no_method` | 400 | Leave at least one way of signing in: email, Google, Microsoft or password. |
| `portal_not_shared` | 400 | Customers can't see this task: share it with them first (it needs a customer and a board open to customers). |
| `portal_off` | 400 | The customer portal is off. Turn it on in Settings → Customer portal. |
| `portal_passkey_failed` | 400 | The passkey didn't work. Try again, or sign in another way. |
| `portal_private_board` | 400 | Private boards can't be opened to customers. |
| `portal_weak_password` | 400 | Choose a password of at least 10 characters that isn't your name or a common one. |
| `required_fields` | 400 | Fill these in before finishing the task: … |
| `support_link_used` | 400 | This entry link has been used or has run out. Ask for a new one. |
| `validation` | 400 | Some fields are not valid: … |
| `device_mismatch` | 401 | This session belongs to another device. Please sign in again. |
| `session_evicted` | 401 | You were signed out because your account was used on another device. |
| `support_ended` | 401 | This support visit has ended: the access was closed or ran out. |
| `unauthenticated` | 401 | Please sign in. |
| `billing_locked` | 402 | Your company has no active plan, so nothing can be changed right now — everything can still be read and exported. An administrator can choose a plan in Settings → Billing. |
| `plan_required` | 402 | This is part of the … plan. An administrator can switch in Settings → Billing. |
| `field_locked` | 403 | Your role can see this field but not change it (…). |
| `forbidden` | 403 | You do not have permission to do that. |
| `join_closed` | 403 | This company only lets people in by invitation. |
| `portal_invite_owner` | 403 | Only an administrator or the customer's owner can invite people to the portal. |
| `preview_read_only` | 403 | You are looking as someone else, so nothing can be changed. Go back to your own view first. |
| `read_only_seat` | 403 | Your seat is read-only. Ask an administrator for a full seat. |
| `read_only_token` | 403 | This key or app can only read. Make a key that can make changes, or reconnect the app and allow changes. |
| `sso_required` | 403 | This company requires single sign-on. Use your organization's SSO to sign in. |
| `support_blocked` | 403 | Support can't open this part, even with permission. |
| `support_edit_admins` | 403 | Only administrators can let support make changes. |
| `support_not_allowed` | 403 | Your company doesn't allow you to let support in. |
| `support_read_only` | 403 | This support visit is read only. |
| `form_off` | 404 | This board does not take requests through a form. |
| `no_account` | 404 | There is no account for … in this workspace. Ask your administrator to invite you. |
| `not_found` | 404 | Not found. |
| `org_not_found` | 404 | There is no workspace at this address. |
| `already_member` | 409 | You already have an account here — sign in instead. |
| `conflict` | 409 | Someone else changed this at the same time. |
| `email_taken` | 409 | Someone in your company already uses this email. |
| `last_admin` | 409 | Your company needs at least one active administrator. |
| `portal_email_taken` | 409 | That address already has portal access. |
| `role_in_use` | 409 | People still have this role. Give them another role first. |
| `slug_taken` | 409 | That address is taken. Try another one. |
| `support_too_many` | 409 | You already have five open support accesses. Close one first. |
| `sync_running` | 409 | A sync is already running for this connection. Try again in a minute. |
| `trash_conflict` | 409 | Something else has taken its place since (the same CRM id or email). Change or remove that first. |
| `trash_parent_first` | 409 | “…” is in the trash too. Put that back first. |
| `trash_parent_gone` | 409 | What this belonged to no longer exists, so it cannot be put back. |
| `type_not_empty` | 409 | There are still … records of this kind. Archive or delete them first. |
| `file_too_large` | 413 | Files can be up to … MB. |
| `import_too_large` | 413 | Import up to … rows at a time. |
| `repeat_mismatch` | 422 | This request was sent with a key that already belongs to a different change. Nothing was changed. |
| `portal_locked` | 429 | Too many wrong tries. Try again in … minutes, or reset your password. |
| `too_many_requests` | 429 | Too many attempts. Wait a few minutes and try again. |
| `server` | 500 | Something went wrong on our side. Please try again. |
| `billing_error` | 502 | The payment provider did not answer as expected. Please try again in a minute. |
| `crm_error` | 502 | The connected service said: … |
