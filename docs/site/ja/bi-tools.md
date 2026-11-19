---
title: BI ツールをつなぐ
section: help
order: 8.5
summary: Power BI、Excel、Fabric、Tableau、Looker Studio、Qlik、Zoho Analytics などを、分析キーで手順どおりに接続します。
---
# BI ツールをつなぐ

Curahold には、BI ツール向けの読み取り専用の**分析フィード**が 1 つあります。Power BI、Excel、Microsoft Fabric、Tableau、Qlik、Zoho Analytics は **OData フィード**として読み込み、Looker Studio やスクリプトなどのツールは同じデータを **JSON または CSV** で受け取ります。このフィードから Curahold の内容を変更することはできません。

以下のメニュー名は各ツールの英語版の表記です。日本語版では対応する項目を選んでください。

## はじめる前に

1. **設定 → 分析と BI** を開きます。データをエクスポートする権限が必要です（管理者とマネージャーにはあります）。
2. **新しい分析キー** を選びます。名前（例：「Power BI の営業ダッシュボード」）を付け、読めるデータセットと部門、有効期限を選びます。
3. キーはこの場ですぐにコピーしてください。表示されるのは一度だけです。`chb_` で始まります。
4. 同じページから必要なアドレスをコピーします。
   - OData フィード：`https://your-company.curahold.com/api/analytics/odata/`
   - JSON と CSV：`https://your-company.curahold.com/api/analytics/v1/`

ツールにサインイン方法を聞かれたら **Basic** を選び、ユーザー名には任意の文字を、パスワードにはキーを貼り付けます。

キーが読めるのは、Curahold であなたに見えているものと同じ顧客・ボード・項目だけです。あなたのロールで見えない項目は、列としても出てきません。退職したりエクスポート権限を失ったりすると、キーは止まります。**シークレットを置き換え** で同じキーに新しい値を発行でき、**取り消す** ですぐに無効になります。

## データセット

| データセット | 内容 |
| --- | --- |
| `Customers` | 顧客ごとに 1 行。閲覧できる顧客項目はそれぞれ 1 列 |
| `Renewals` | 更新日のある顧客：金額、ヘルス、進行中の更新商談 |
| `HealthHistory` | 各顧客の日ごとのヘルススコア |
| `Opportunities` | パイプライン：金額、フェーズ、状態、完了予定日 |
| `Tickets` | サポートチケット |
| `Contacts` | 顧客側の連絡先 |
| `Records…` | 追加したレコードの種類ごとに 1 つ（契約、リスクなど） |
| `Boards`、`Tasks`、`TaskAssignees` | ボード、そのタスク、タスクと担当者の組み合わせごとに 1 行 |
| `Sprints`、`SprintBurndown` | スプリントと、日ごとの範囲と残作業 |
| `People` | 名前とロール（担当者 ID に名前を付けるため） |

どのデータセットにも `Id` と `ModifiedAt`（その行が最後に変わった日時）があります。多くには `IsDeleted` もあり、アーカイブした行は `IsDeleted = true` のままフィードに残るので、更新時にレポートから外せます。データセットは ID 列で結合します：`Tasks.CustomerId` → `Customers.Id`、`Tasks.BoardId` → `Boards.Id`、`OwnerId` → `People.Id`。

## Power BI

1. Power BI Desktop で **Get data → OData feed** を選びます。
2. OData のアドレスを貼り付けて **OK** を選びます。
3. **Basic** を選び、ユーザー名は任意、パスワードに分析キーを入れて **Connect** を選びます。
4. ナビゲーターで必要なデータセットにチェックを入れ、**Load**（先に列を絞るなら **Transform data**）を選びます。
5. 発行後、セマンティックモデルの **Settings → Data source credentials** で再び **Basic** とキーを入力し、**scheduled refresh** をオンにします。

Power BI サービスで Basic 認証にゲートウェイが必要と表示された場合は、キーを **Web API key** として使います。**Transform data → Advanced editor** でソースを `OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])` と書き、Power BI に聞かれたら **Web API** を選んでキーを貼り付けます。

**大きなデータセット。** 増分更新では、範囲をアドレスに入れると Curahold が送る前に絞り込みます。

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks?$filter=CreatedAt ge " & Start & " and CreatedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

あとはテーブルにいつもどおり増分更新ポリシーを設定し、`ModifiedAt` 列で **Detect data changes** をオンにします。これで行が変わった期間が読み直されます。

## Excel

1. Windows 版 Excel で **Data → Get Data → From Other Sources → From OData Feed** を選びます。
2. OData のアドレスを貼り付けて **OK** を選びます。
3. **Basic** を選び、ユーザー名は任意、パスワードにキーを貼り付けて **Connect** を選びます。
4. ナビゲーターでデータセットを選び、**Load** を選びます。
5. **Data → Refresh All** でいつでも最新のデータを取り込めます。

## Microsoft Fabric

1. ワークスペースで **New item → Dataflow Gen2** を選び、**Get data → OData** を選びます。
2. OData のアドレスを貼り付け、接続の資格情報で **Basic** を選びます（ユーザー名は任意、パスワードはキー）。
3. データセットを選んで必要なら整形し、**data destination**（レイクハウスまたはウェアハウス）を追加します。
4. **Publish** し、データフローに更新スケジュールを設定します。

データパイプラインの **Copy activity** でも、OData コネクタと Basic 認証で同じフィードを読めます。

## Tableau

1. Tableau Desktop で **Connect → To a Server → OData** を選びます。
2. サーバーには 1 つのデータセットのアドレスを貼り付けます。例：`https://your-company.curahold.com/api/analytics/odata/Customers`
3. **Use username and password** を選び、ユーザー名は任意、パスワードにキーを入れて **Sign In** を選びます。
4. Tableau は OData を**抽出（extract）**として読み込みます。必要なデータセットごとに OData 接続を追加し、ID 列でリレーションを作ります。
5. Tableau Cloud や Server に発行するときは資格情報を埋め込み、抽出の更新スケジュールを設定します。

## Looker Studio

Looker Studio でこのようなフィードを読むにはコネクタが必要です。**Curahold 独自の Looker Studio コネクタは近日公開予定です。** それまでは次の方法を使えます。

1. 新しい Google スプレッドシートの A1 セルに `=IMPORTDATA("https://your-company.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=あなたのキー")` と入力します。
2. Looker Studio で **Create → Data source → Google Sheets** を選び、そのシートを指定します。
3. この用途専用のキーを作り、シートに必要なデータセットだけに絞ってください。シートを編集できる人は数式の中のキーを見られます。共有範囲が広がりすぎたら Curahold でキーを取り消します。

**CRM とスプレッドシート**（設定 → CRM とスプレッドシート）でシートを最新に保ち、そのシートを Looker Studio で使うこともできます。

## Qlik

1. Qlik Sense または Qlik Cloud で **Add data → OData**（または **Create new connection → OData**）を選びます。
2. OData のアドレスを貼り付け、認証は **Basic**（ユーザー名は任意、パスワードはキー）を選びます。
3. データセットを選んで読み込み、アプリの設定で再読み込みのスケジュールを組みます。

Qlik の REST コネクタも JSON のアドレス（`…/api/analytics/v1/Customers.json`）で使えます。Basic 認証と、`next` 項目による「next URL」ページングを設定します。

## Zoho Analytics

1. **Create → New Workspace → Web URL / Feeds**（Web フィードからのインポート）を選びます。
2. 1 つのデータセットのアドレスを貼り付けます：OData（`…/api/analytics/odata/Customers`）または CSV（`…/api/analytics/v1/Customers.csv`）。
3. 認証は **Basic**（ユーザー名は任意、パスワードはキー）を選びます。
4. ページングは **next page URL** を選びます：OData なら `@odata.nextLink`、JSON なら `next` です。
5. インポートを繰り返す間隔を設定します。

## Metabase / Superset

Metabase と Superset は Web フィードではなくデータベースを読みます。直接の接続は、近日公開予定の Curahold の**データウェアハウスへのエクスポート**（BigQuery または Snowflake へ）で可能になります。それまでは、環境がファイルのアップロードに対応していれば `…/api/analytics/v1/<データセット>.csv` から取得した CSV をアップロードしてください。

## その他のツールとスクリプト

JSON と CSV のアドレスでは次のオプションが使えます。

| オプション | 意味 |
| --- | --- |
| `limit` | 1 ページの行数。最大 5000（既定は 1000） |
| `page` または `offset` | ページ番号または行位置でページング |
| `cursor` | 前のページの `next` の値（大きなデータセットで最速） |
| `since` | この日付・日時以降に変わった行だけ。例：`2026-11-01` |
| `fields` | この列だけ。例：`Id,Name,ModifiedAt` |
| `filter`、`orderby` | OData の `$filter`、`$orderby` と同じ式 |
| `count=1` | 総行数も返す |

キーは Basic（パスワード）として、または `Authorization: Bearer chb_…` として送ります。JSON のページは `{ "dataset": "Tasks", "rows": [...], "next": "…" }` の形で、CSV のページは次のアドレスを `Link` ヘッダーで返します。Domo、SAP Analytics Cloud、Quick BI、FineBI なども、同じ方法で JSON または OData のアドレスを読めます。

OData フィードは `$select`、`$filter`（`eq ne gt ge lt le`、`and`、`or`、`not`、`contains`、`startswith`、`endswith`）、`$orderby`、`$top`、`$skip`、`$count`、`/$count` に対応しています。`$expand` には対応していないので、データセットは ID 列で結合してください。

## 更新と上限

- 大きなデータセットは 1,000 行ずつのページで届きます。BI ツールは次ページのリンクを自動でたどります。
- **変更分だけ：** `ModifiedAt` で絞り込む（`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`）か、JSON で `since` を使います。`Prefer: odata.track-changes` ヘッダーを付けると、最後のページに `@odata.deltaLink` も付き、あとから変更分だけを取得できます。
- 各キーは 1 秒あたり約 2 リクエストまで、各会社には 1 日あたりの行数の上限があります。超えると 429 が返り、いつ再試行できるかが示されます。
- すべての読み込みは記録され（誰が、どのキーで、どのデータセットを、何行）、設定の **最近の読み込み** に表示されます。

## うまくいかないとき

- **401／ツールが何度も資格情報を求める：** キーが間違っている、取り消された、期限切れのいずれかです。ユーザー名が必須のツールで空欄にしている場合は、任意の文字を入れてください。
- **403：** キーの所有者にデータをエクスポートする権限がなくなっています。
- **データセットで 404：** キーが別のデータセットや部門に限定されているか、そのデータセットの項目が所有者のロールに公開されていません。
- **メッセージ付きの 400：** フィードが対応していない指定がクエリに含まれています。メッセージにその内容が書かれています。
