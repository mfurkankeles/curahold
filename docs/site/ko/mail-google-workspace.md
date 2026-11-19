---
title: Google Workspace로 자체 도메인 메일 사용하기
section: developers
order: 10
summary: 관리자와 운영자를 위한 안내 — 회사 메일을 Google Workspace에서 운영하기 위한 DNS 레코드(MX, SPF, DKIM, DMARC)와 메일함 구성.
---
# Google Workspace로 자체 도메인 메일 사용하기

> 관리자와 운영자를 위한 안내입니다. Google의 화면과 한도는 바뀝니다. 아래 값은 2026년 11월 19일 기준 Google 관리자 도움말에 따른 것이니 관리 콘솔에서 확인하며 진행하세요.

## 1. 메일함: 라이선스는 적게, 주소는 많이

Workspace는 사용자당 요금이므로 사용자는 최소로 두고 나머지는 **별칭**이나 **그룹**으로 만듭니다.

| 주소 | 용도 | 방법 |
| --- | --- | --- |
| 본인 주소 | 소유자 | 사용자(라이선스 1개) |
| hello@, billing@, security@, social@ | 외부에서 연락하는 창구 | 소유자의 별칭 또는 그룹 |
| support@ | 공용 지원 메일함 | ‘공동작업 받은편지함’을 켠 Google 그룹 |
| no-reply@ | 제품 메일 발신 주소 | 릴레이에 로그인하는 사용자의 별칭(다음 안내) |

먼저 모든 사용자에게 **2단계 인증**을 켜세요.

## 2. DNS 레코드

DNS 관리 화면(예: Cloudflare의 DNS → Records)에서 추가합니다. `example.com`은 본인 도메인으로 바꿉니다.

| 유형 | 이름 | 값 | 목적 |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`, 우선순위 1 | 도메인 메일을 Gmail로 받음 |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF: Google이 도메인 이름으로 보낼 수 있음. SPF 레코드는 하나만(있으면 합치기) |
| TXT | `google._domainkey` | 관리 콘솔이 주는 키 | DKIM: 모든 메일에 서명 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC: 인증에 실패한 메일 처리 방법을 수신 측에 알림 |

**DKIM:** 관리 콘솔 → 앱 → Google Workspace → Gmail → 이메일 인증 → 새 레코드 생성(2048비트, 선택기 `google`) → TXT 레코드 게시 → 콘솔에서 **인증 시작**.

**DMARC는 3단계로:** `p=none`으로 시작해 2~4주간 보고서를 확인하고, 다음 `p=quarantine`, 자사 발신자만 남으면 `p=reject`로 바꿉니다. 게시 전에 `dmarc@` 주소를 만드세요.

## 3. 확인

외부 주소로 메일을 보내고 **원본 보기**에서 SPF, DKIM, DMARC가 모두 **PASS**인지 확인합니다.

## 4. 대량 발송 규칙

Gmail 등 대형 메일 서비스는 대량 발신자에게 SPF, DKIM, DMARC 모두와 마케팅 메일의 원클릭 수신 거부, 0.3%보다 훨씬 낮은 스팸 신고율을 요구합니다. 마케팅 메일을 개인 메일함에서 보내지 마세요. 마케팅에는 수신자의 동의가 필요합니다(개인정보 처리방침 참조).
