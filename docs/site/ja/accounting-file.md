---
title: 会計：その他のソフトからのファイル
section: help
order: 8.29
summary: Logo、Mikro、Tally、SAP Business One などのソフト：顧客、請求書、入金を Excel か CSV でアップロード。
---
# 会計：その他のソフトからのファイル

オープンな API がないソフト（Logo、Mikro、Tally、SAP Business One など）はファイルで連携します。その後の数字は連携したソフトとまったく同じに使えます。顧客ページ、照合、ヘルススコアです。

## 手順

1. **設定 → データソース → 会計ソフト**で**ファイルをアップロード**を選びます。
2. **アップロード**タブで、顧客、請求書、入金の**テンプレート**をダウンロードします。
3. 同じものをお使いのソフトから書き出し、テンプレートの列に合わせます（Excel か CSV。余分な列は無視されます）。
4. 顧客、請求書、入金の順にアップロードします。

## 列

| ファイル | 列 |
| --- | --- |
| 顧客 | customer_id, name, tax_id, email, website, currency, balance |
| 請求書 | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| 入金 | payment_id, customer_id, invoice_id, paid_on, amount, currency |

日付は YYYY-MM-DD 形式です。`status` は open、paid、void、draft のいずれかで、空欄なら未回収額が残る請求書は未回収として扱います。

## 新しい数字にする

新しいファイルはいつでもアップロードできます。同じ種類の前のファイルと置き換わります。手動の照合は残ります。ファイルがほかへ送られることはありません。
