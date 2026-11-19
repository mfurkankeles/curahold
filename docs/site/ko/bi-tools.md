---
title: BI 도구 연결하기
section: help
order: 8.5
summary: Power BI, Excel, Fabric, Tableau, Looker Studio, Qlik, Zoho Analytics 등을 분석 키로 단계별로 연결합니다.
---
# BI 도구 연결하기

Curahold에는 BI 도구를 위한 읽기 전용 **분석 피드**가 하나 있습니다. Power BI, Excel, Microsoft Fabric, Tableau, Qlik, Zoho Analytics는 이를 **OData 피드**로 읽고, Looker Studio와 스크립트 등 다른 도구는 같은 데이터를 **JSON 또는 CSV**로 받습니다. 이 피드로는 Curahold의 어떤 것도 바꿀 수 없습니다.

아래 메뉴 이름은 각 도구의 영어 화면 기준입니다. 한국어 화면에서는 해당하는 항목을 고르세요.

## 시작하기 전에

1. **설정 → 분석 및 BI**를 엽니다. 데이터 내보내기 권한이 있어야 합니다(관리자와 매니저에게는 있습니다).
2. **새 분석 키**를 선택합니다. 이름(예: "Power BI 영업 대시보드")을 정하고, 읽을 수 있는 데이터 세트와 부서, 만료일을 고릅니다.
3. 키는 지금 바로 복사하세요. 한 번만 표시됩니다. `chb_`로 시작합니다.
4. 같은 페이지에서 필요한 주소를 복사합니다.
   - OData 피드: `https://your-company.curahold.com/api/analytics/odata/`
   - JSON 및 CSV: `https://your-company.curahold.com/api/analytics/v1/`

도구가 로그인 방식을 물으면 **Basic**을 고르고, 사용자 이름에는 아무 값이나, 비밀번호에는 키를 붙여 넣습니다.

키는 Curahold에서 내가 보는 것과 같은 고객, 보드, 필드만 읽습니다. 내 역할로 볼 수 없는 필드는 열로도 나오지 않습니다. 퇴사하거나 내보내기 권한을 잃으면 키가 멈춥니다. **비밀 값 교체**는 같은 키에 새 값을 주고, **폐기**는 즉시 키를 끝냅니다.

## 데이터 세트

| 데이터 세트 | 내용 |
| --- | --- |
| `Customers` | 고객당 한 행, 볼 수 있는 고객 필드는 각각 한 열 |
| `Renewals` | 갱신일이 있는 고객: 금액, 헬스, 진행 중인 갱신 기회 |
| `HealthHistory` | 고객별 일별 헬스 스코어 |
| `Opportunities` | 파이프라인: 금액, 단계, 상태, 마감일 |
| `Tickets` | 지원 티켓 |
| `Contacts` | 고객사의 연락처 |
| `Records…` | 추가한 레코드 유형마다 하나(계약, 리스크 등) |
| `Boards`, `Tasks`, `TaskAssignees` | 보드, 그 작업, 작업과 담당자 조합마다 한 행 |
| `Sprints`, `SprintBurndown` | 스프린트와 일별 범위 및 남은 작업 |
| `People` | 이름과 역할(소유자·담당자 ID에 이름을 붙이기 위해) |

모든 데이터 세트에는 `Id`와 `ModifiedAt`(행이 마지막으로 바뀐 시각)이 있습니다. 대부분에는 `IsDeleted`도 있어, 보관된 행은 `IsDeleted = true`로 피드에 남고 새로 고침할 때 보고서에서 뺄 수 있습니다. 데이터 세트는 ID 열로 연결합니다: `Tasks.CustomerId` → `Customers.Id`, `Tasks.BoardId` → `Boards.Id`, `OwnerId` → `People.Id`.

## Power BI

1. Power BI Desktop에서 **Get data → OData feed**를 선택합니다.
2. OData 주소를 붙여 넣고 **OK**를 누릅니다.
3. **Basic**을 고릅니다. 사용자 이름은 아무 값, 비밀번호는 분석 키입니다. **Connect**를 누릅니다.
4. 탐색 창에서 원하는 데이터 세트를 체크하고 **Load**(열을 먼저 줄이려면 **Transform data**)를 누릅니다.
5. 게시한 뒤 시맨틱 모델의 **Settings → Data source credentials**에서 다시 **Basic**과 키를 입력하고 **scheduled refresh**를 켭니다.

Power BI 서비스가 Basic 로그인에 게이트웨이를 요구하면 키를 **Web API key**로 쓰세요. **Transform data → Advanced editor**에서 원본을 `OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])`로 쓰고, Power BI가 물으면 **Web API**를 골라 키를 붙여 넣습니다.

**큰 데이터 세트.** 증분 새로 고침에서는 범위를 주소에 넣으면 Curahold가 보내기 전에 걸러 줍니다.

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks?$filter=ModifiedAt ge " & Start & " and ModifiedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

그다음 테이블에 평소처럼 증분 새로 고침 정책을 설정합니다.

## Excel

1. Windows용 Excel에서 **Data → Get Data → From Other Sources → From OData Feed**를 선택합니다.
2. OData 주소를 붙여 넣고 **OK**를 누릅니다.
3. **Basic**을 고르고 사용자 이름은 아무 값, 비밀번호에 키를 붙여 넣은 뒤 **Connect**를 누릅니다.
4. 탐색 창에서 데이터 세트를 고르고 **Load**를 누릅니다.
5. **Data → Refresh All**로 언제든 최신 데이터를 가져옵니다.

## Microsoft Fabric

1. 작업 영역에서 **New item → Dataflow Gen2**를 고른 뒤 **Get data → OData**를 선택합니다.
2. OData 주소를 붙여 넣습니다. 연결 자격 증명에서 **Basic**을 고르고, 사용자 이름은 아무 값, 비밀번호는 키입니다.
3. 데이터 세트를 고르고 필요하면 다듬은 뒤 **data destination**(레이크하우스 또는 웨어하우스)을 추가합니다.
4. **Publish**하고 데이터 흐름에 새로 고침 일정을 설정합니다.

데이터 파이프라인의 **Copy activity**도 OData 커넥터와 Basic 로그인으로 같은 피드를 읽을 수 있습니다.

## Tableau

1. Tableau Desktop에서 **Connect → To a Server → OData**를 선택합니다.
2. 서버에는 데이터 세트 하나의 주소를 붙여 넣습니다. 예: `https://your-company.curahold.com/api/analytics/odata/Customers`
3. **Use username and password**를 고르고 사용자 이름은 아무 값, 비밀번호는 키로 입력한 뒤 **Sign In**을 누릅니다.
4. Tableau는 OData를 **추출(extract)**로 읽습니다. 필요한 데이터 세트마다 OData 연결을 추가하고 ID 열로 관계를 맺습니다.
5. Tableau Cloud나 Server에 게시할 때 자격 증명을 포함하고 추출 새로 고침 일정을 설정합니다.

## Looker Studio

Looker Studio가 이런 피드를 읽으려면 커넥터가 필요합니다. **Curahold 전용 Looker Studio 커넥터는 곧 제공됩니다.** 그 전까지는 다음 방법을 쓰세요.

1. 새 Google 스프레드시트의 A1 셀에 `=IMPORTDATA("https://your-company.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=내-키")`를 입력합니다.
2. Looker Studio에서 **Create → Data source → Google Sheets**를 고르고 그 시트를 지정합니다.
3. 이 용도로만 쓸 키를 따로 만들고 시트에 필요한 데이터 세트로만 제한하세요. 시트를 편집할 수 있는 사람은 수식 속 키를 볼 수 있습니다. 시트가 너무 널리 공유되면 Curahold에서 키를 폐기하세요.

**CRM과 스프레드시트**(설정 → CRM과 스프레드시트)로 시트를 최신으로 유지하고, 그 시트를 Looker Studio에서 쓸 수도 있습니다.

## Qlik

1. Qlik Sense 또는 Qlik Cloud에서 **Add data → OData**(또는 **Create new connection → OData**)를 선택합니다.
2. OData 주소를 붙여 넣고 인증은 **Basic**(사용자 이름은 아무 값, 비밀번호는 키)을 고릅니다.
3. 데이터 세트를 골라 불러오고, 앱 설정에서 다시 불러오기 일정을 잡습니다.

Qlik의 REST 커넥터도 JSON 주소(`…/api/analytics/v1/Customers.json`)로 쓸 수 있습니다. Basic 로그인과 `next` 필드를 이용한 "next URL" 페이지 나누기를 설정합니다.

## Zoho Analytics

1. **Create → New Workspace → Web URL / Feeds**(웹 피드에서 가져오기)를 선택합니다.
2. 데이터 세트 하나의 주소를 붙여 넣습니다: OData 주소(`…/api/analytics/odata/Customers`) 또는 CSV 주소(`…/api/analytics/v1/Customers.csv`).
3. 인증은 **Basic**(사용자 이름은 아무 값, 비밀번호는 키)을 고릅니다.
4. 페이지 나누기는 **next page URL**을 고릅니다: OData는 `@odata.nextLink`, JSON은 `next`입니다.
5. 가져오기를 반복할 주기를 정합니다.

## Metabase / Superset

Metabase와 Superset은 웹 피드가 아니라 데이터베이스를 읽습니다. 직접 연결은 곧 제공될 Curahold의 **데이터 웨어하우스 내보내기**(BigQuery 또는 Snowflake로)로 가능해집니다. 그 전까지는 환경에서 파일 업로드를 허용한다면 `…/api/analytics/v1/<데이터-세트>.csv`에서 받은 CSV를 올리세요.

## 기타 도구와 스크립트

JSON 및 CSV 주소는 다음 옵션을 받습니다.

| 옵션 | 의미 |
| --- | --- |
| `limit` | 페이지당 행 수, 최대 5000(기본 1000) |
| `page` 또는 `offset` | 페이지 번호나 행 위치로 나누기 |
| `cursor` | 이전 페이지의 `next` 값(큰 데이터 세트에서 가장 빠름) |
| `since` | 이 날짜나 시각 이후에 바뀐 행만. 예: `2026-11-01` |
| `fields` | 이 열만. 예: `Id,Name,ModifiedAt` |
| `filter`, `orderby` | OData `$filter`, `$orderby`와 같은 식 |
| `count=1` | 전체 행 수도 함께 반환 |

키는 Basic(비밀번호)으로 보내거나 `Authorization: Bearer chb_…`로 보냅니다. JSON 페이지는 `{ "dataset": "Tasks", "rows": [...], "next": "…" }` 모양이고, CSV 페이지는 다음 주소를 `Link` 헤더로 알려 줍니다. Domo, SAP Analytics Cloud, Quick BI, FineBI 같은 도구도 같은 방식으로 JSON 또는 OData 주소를 읽습니다.

OData 피드는 `$select`, `$filter`(`eq ne gt ge lt le`, `and`, `or`, `not`, `contains`, `startswith`, `endswith`), `$orderby`, `$top`, `$skip`, `$count`, `/$count`를 이해합니다. `$expand`는 지원하지 않으니 데이터 세트는 ID 열로 연결하세요.

## 새로 고침과 한도

- 큰 데이터 세트는 1,000행씩 페이지로 옵니다. BI 도구가 다음 페이지 링크를 알아서 따라갑니다.
- **바뀐 것만:** `ModifiedAt`으로 거르거나(`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`) JSON에서 `since`를 씁니다. `Prefer: odata.track-changes` 헤더를 보내면 마지막 페이지에 `@odata.deltaLink`도 붙어, 나중에 바뀐 것만 받을 수 있습니다.
- 키마다 초당 약 두 번 요청할 수 있고, 회사마다 하루 행 한도가 있습니다. 넘으면 피드가 429를 돌려주고 언제 다시 시도할지 알려 줍니다.
- 모든 읽기는 기록되며(누가, 어떤 키로, 어떤 데이터 세트를, 몇 행) 설정의 **최근 읽기**에 표시됩니다.

## 문제가 생기면

- **401 / 도구가 자격 증명을 다시 묻는 경우:** 키가 틀렸거나 폐기되었거나 만료되었습니다. 사용자 이름이 필요한 도구에서 비워 두었다면 아무 값이나 넣으세요.
- **403:** 키 소유자에게 더 이상 데이터 내보내기 권한이 없습니다.
- **데이터 세트에 404:** 키가 다른 데이터 세트나 부서로 제한되어 있거나, 그 데이터 세트의 필드가 소유자 역할에 닫혀 있습니다.
- **메시지가 있는 400:** 쿼리에 피드가 지원하지 않는 항목이 있습니다. 메시지에 그 항목이 나옵니다.
