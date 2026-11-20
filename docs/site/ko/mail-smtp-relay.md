---
title: Google Workspace(SMTP 릴레이)로 제품 메일 보내기
section: developers
order: 11
summary: 관리자와 운영자를 위한 안내 — Curahold 자체 메일(로그인 링크, 알림, 요약)을 Google Workspace SMTP 릴레이로 보내는 방법, 호스팅형과 자체 호스팅 설정, 한도, 전용 발송 서비스가 필요한 시점.
---
# Google Workspace(SMTP 릴레이)로 제품 메일 보내기

> 관리자와 운영자를 위한 안내입니다. 먼저 DNS 안내를 마치세요. SPF, DKIM, DMARC가 통과해야 릴레이가 제대로 전달합니다.

Curahold는 로그인 링크, 알림, 체험 안내, 요약을 보냅니다. 일반 Gmail 메일함은 애플리케이션 발송용이 아닙니다. Google의 **SMTP 릴레이 서비스**가 그 용도이며, Google Workspace 안에서 해결되어 다른 메일 서비스가 필요 없습니다.

## 1. 릴레이 켜기

관리 콘솔 → 앱 → Google Workspace → Gmail → **라우팅** → **SMTP 릴레이 서비스** → 구성:

- **허용된 발신자:** 내 도메인의 주소만.
- **인증:** **SMTP 인증 필요**를 선택합니다(호스팅형은 고정 주소가 없는 서버에서 실행되므로 허용 목록 대신 로그인으로 인증). 고정 주소의 자체 호스팅이라면 ‘지정한 IP 주소의 메일만 허용’도 선택할 수 있습니다.
- **암호화:** **TLS 암호화 필요**를 선택합니다.
- 저장합니다. 적용까지 최대 1시간이 걸릴 수 있습니다.

## 2. 발송 계정

릴레이에 로그인할 사용자(소유자 계정이면 충분)를 정하고 2단계 인증을 켠 뒤 **앱 비밀번호**를 만듭니다. `no-reply@`를 그 사용자의 별칭으로 추가합니다.

## 3. Curahold 설정

**호스팅형(Cloudflare Workers)** — 시크릿으로 설정(`wrangler secret put …`):

| 설정 | 값 |
| --- | --- |
| `SMTP_RELAY_USER` | 2단계의 사용자, 예: `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | 그 앱 비밀번호 |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay`(위 두 값이 있으면 자동 선택) |
| `SMTP_RELAY_HOST`, `SMTP_RELAY_PORT` | 기본값 `smtp-relay.gmail.com`, `587`을 바꿀 때만 |

코드 경로: `api/src/lib/smtpRelay.ts`(587번 포트 STARTTLS, Workers에서는 25번 포트가 막혀 있음).

**자체 호스팅** — `.env` 파일에:

```
SMTP_URL=smtp://owner%40example.com:APP-PASSWORD@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

앱을 다시 시작합니다.

## 4. 확인

로그아웃하고 로그인 링크를 요청합니다. 메일이 `no-reply@…`에서 오고 SPF, DKIM, DMARC가 **PASS**여야 합니다. 오지 않으면 앱 로그에 실패한 SMTP 단계가 기록됩니다.

## 5. 한도 — 전용 발송 서비스가 필요한 시점

릴레이는 사용자당 **하루 10,000명의 수신자**까지 받습니다(Google 공개 한도, 확인 필요). 다음 중 **하나라도** 해당하면 제품 메일을 전용 발송 서비스로 옮겨야 합니다(소유자가 결정하며 유료).

- 하루 제품 메일이 꾸준히 한도의 **절반**(하루 5,000명)을 넘을 때
- 전달률이 떨어질 때: 반송 **2%** 초과, 스팸 신고 **0.1%** 근접, 스팸함으로 분류
- 메일별 전달 이벤트(webhook)나 메일 종류별로 분리된 발송 평판이 필요할 때
- **마케팅 캠페인**을 계획할 때 — 릴레이로는 절대 보내지 않음

전환은 설정 하나입니다. 호스팅형에는 전용 서비스 드라이버가 이미 있습니다(`EMAIL_PROVIDER=resend`와 `RESEND_API_KEY`). 먼저 수탁자 페이지에 추가하고 관리자에게 30일 전에 알리세요.

## 6. 메일이 나가지 않을 때 {#failures}

일시적인 거부(`421`, `450`, `451` 또는 끊긴 연결)는 새 연결로 한 번 더 시도합니다. 영구적인 거부는 다시 시도하지 않습니다: `535`(앱 비밀번호가 바뀌었거나 취소됨: 새로 만들어 `SMTP_RELAY_PASSWORD`를 바꾸세요), `550 5.4.5`(일일 한도), `550 5.1.1`(존재하지 않는 주소). 이때 사용자는 자기 언어로 “지금은 이메일을 보낼 수 없습니다. 몇 분 뒤에 다시 시도하세요. 계속되면 관리자에게 알리세요.”을(를) 보고, 릴레이의 응답은 보지 않습니다. 응답은 SMTP 단계와 함께 앱의 오류 로그에 남습니다.
