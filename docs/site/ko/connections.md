---
title: 연결과 CRM
section: help
order: 8
summary: Slack, Teams, Google Chat, 그리고 Salesforce, HubSpot, 스프레드시트와의 동기화.
---
# 연결과 CRM

Curahold는 팀이 이미 쓰는 도구와 함께 일합니다. 연결은 설정 → 연결과 설정 → 데이터 소스에서 관리합니다.

## 채팅 앱

Slack, Microsoft Teams, Google Chat을 연결하면 알림이 개인 메시지로 가고, 메시지에서 바로 작업을 완료하거나 다시 열 수 있습니다.

## CRM과 스프레드시트

고객, 연락처, 영업 기회를 Salesforce, HubSpot, Microsoft Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell, Google Sheets, Excel과 동기화합니다. **설정 → CRM과 스프레드시트**를 열고 **연결**을 고르세요.

1. **로그인.** CRM 자체의 로그인 페이지로 이동해 Curahold가 읽고 쓸 수 있는 범위를 승인합니다. Curahold에 비밀번호를 입력하는 일은 없습니다. (Bitrix24, Freshsales, Zendesk Sell은 대신 키를 씁니다. 아래를 보세요.)
2. **가져올 항목 고르기.** 필요한 객체를 체크하고, 각각이 Curahold에서 무엇인지 정합니다: 고객, 연락처, 영업 기회, 직접 만든 레코드 유형, 또는 보드의 작업.
3. **필드 맞추기.** Curahold가 필드마다 짝을 제안합니다. 무엇이든 바꿀 수 있고, 필드마다 가져오기만 할지 양쪽을 같게 유지할지 고릅니다.
4. **확인 및 시작.** 바뀌기 전에 미리보기에서 몇 개가 추가되고 업데이트되는지 보여 줍니다.

그다음부터 동기화는 한 시간마다 저절로 실행되고, Curahold에서 바꾼 내용은 곧바로 CRM에 기록됩니다. 동기화하지 못한 항목은 이유와 함께 목록으로 나오고 다시 시도할 수 있습니다. 같은 항목이 양쪽에서 바뀌었다면 더 최근의 변경이 이깁니다. 대신 항상 CRM 쪽이나 Curahold 쪽이 이기도록 정할 수도 있습니다(연결의 설정 탭).

연결하려면 연결을 관리할 권한이 필요합니다. 사람은 이메일로 맞추므로, CRM에서 각 고객의 담당자가 Curahold에서도 담당자가 됩니다.

## Salesforce

가져오는 것: accounts, contacts, opportunities, tasks, 사용자 지정 객체. 테스트 org를 쓰려면 연결하기 전에 **Sandbox**를 체크하세요.

**처음에는 Salesforce 관리자가 Curahold를 설치합니다.** Salesforce는 org에 설치되지 않은 앱을 막으므로, 첫 로그인 전에 관리자가 설치 페이지(연결을 고르면 링크가 나옵니다)를 열어 승인합니다. 이 패키지는 코드, 필드, 객체를 하나도 추가하지 않으며, org의 사람들이 Curahold를 승인할 수 있게만 합니다. Setup → Installed Packages에서 언제든 제거할 수 있고, 그러면 Curahold의 접근이 즉시 끊깁니다. Salesforce가 앱이 허용되지 않았다고 답하면 이 단계가 아직 끝나지 않은 것입니다. 연결하는 사용자는 Salesforce에서 API 접근 권한이 있어야 합니다(Enterprise 이상에 포함, Professional은 추가 옵션).

## HubSpot

가져오는 것: companies, contacts, deals, tickets, tasks, 사용자 지정 객체. HubSpot은 어떤 계정을 연결할지 묻고 Curahold가 읽고 쓸 수 있는 범위를 보여 줍니다. contacts와 deals는 HubSpot 요금제에 있을 때만 요청합니다.

## Microsoft Dynamics 365

가져오는 것: accounts, contacts, opportunities, cases, tasks, 사용자 지정 테이블. 로그인 전에 조직 주소를 입력합니다(`https://yourcompany.crm4.dynamics.com`과 같은 형태). Microsoft가 "Need admin approval"을 표시하면 Microsoft 365 관리자가 조직에 대해 Curahold를 한 번 승인해야 합니다.

## Pipedrive

가져오는 것: organizations, people, deals, activities. 사용자 지정 필드도 기본 필드처럼 맞춥니다.

## Zoho CRM

가져오는 것: accounts, contacts, deals, cases, tasks, 사용자 지정 모듈. Curahold가 Zoho 데이터 센터(미국, EU, 인도, 호주 등)를 스스로 찾습니다.

## Bitrix24, Freshsales, Zendesk Sell

이 세 가지는 CRM에서 직접 만든 키로 연결하므로, 로그인 페이지도 승인할 것도 없습니다. Curahold는 키를 붙여 넣는 순간 확인하고, 암호화해 보관하며, 다시는 보여 주지 않습니다. 연결을 삭제하면 키도 사라집니다. 그 뒤는 다른 CRM과 같습니다: 가져올 항목을 고르고, 필드를 맞추고, 변경은 양방향으로 오갑니다.

| CRM | 붙여 넣을 것 | 찾는 곳 | 가져오는 것 |
| --- | --- | --- | --- |
| Bitrix24 | 인바운드 웹훅 주소 | Developer resources → Other → Inbound webhook. CRM 권한과, 담당자를 맞출 수 있도록 Users 권한을 주세요 | companies, contacts, deals |
| Freshsales | 내 주소와 API 키 | 프로필 사진 → Settings → API settings | accounts, contacts, deals |
| Zendesk Sell | 액세스 토큰 | Settings → Integrations → OAuth → Access tokens | companies, people, deals |

알아 두면 좋은 점:

- **키는 만든 사람으로서 동작합니다.** Curahold는 그 사람이 CRM에서 보는 것을 봅니다. 여기로 가져오고 싶은 모든 고객을 볼 수 있는 계정으로 키를 만드세요.
- **Bitrix24의 이메일, 전화, 웹 주소**는 그쪽에서 목록입니다. Curahold는 첫 번째 값을 읽고 새 연락처나 회사를 만들 때 채우지만, 그 뒤에 목록을 다시 쓰지는 않습니다.
- **Freshsales는 "All accounts", "All contacts", "All deals" 보기를 통해 읽습니다.** 그중 하나의 이름이 바뀌었거나 삭제되었다면 그 목록은 읽지 않고, 일부만 가져오는 대신 실행 결과에 그렇다고 알려 줍니다.
- **Zendesk Sell의 거래에는 회사가 필요합니다.** Curahold에서 만든 거래는 그쪽에서 고객의 회사 아래에 만들어집니다.
- 이 커넥터들은 새로 나왔습니다. 기대한 대로 가져와지지 않는 것이 있으면 제품의 도움말에서 알려 주세요.

## Google Sheets와 Excel

스프레드시트는 데이터를 가져오는 가장 간단한 방법이며, 스프레드시트로 내보낼 수 있는 도구라면 무엇이든 됩니다. Google Sheet나 OneDrive·SharePoint의 Excel 파일을 탭별로 연결하세요. 탭마다 고객, 연락처, 직접 만든 레코드 유형이 될 수 있습니다. 행을 식별하는 열을 고르면, 바뀐 행이 고객을 하나 더 만드는 대신 같은 고객을 업데이트합니다.

## 지원 도구

Zendesk, Freshdesk, Intercom, Jira Service Management는 주소와 API 키로 연결하며, 티켓이 알맞은 고객 아래로 들어옵니다. Salesforce와 Dynamics의 cases도 지원 티켓으로 매핑할 수 있습니다. 자세한 내용: [지원 티켓](/docs/ko/support-tickets/).

## 직접 쓰는 도구

다른 시스템을 연결하려면 [API 키](/docs/ko/api-keys/), [웹훅](/docs/ko/webhooks/), [Claude와 ChatGPT 연결하기](/docs/ko/ai-assistants/)를 보세요.
