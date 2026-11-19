---
title: 회계: 다른 프로그램의 파일
section: help
order: 8.29
summary: Logo, Mikro, Tally, SAP Business One 등 모든 프로그램: 고객, 청구서, 입금을 Excel 또는 CSV로 올리세요.
---
# 회계: 다른 프로그램의 파일

공개 API가 없는 프로그램(Logo, Mikro, Tally, SAP Business One 등)은 파일로 연결합니다. 이후 수치는 연결된 프로그램과 똑같이 쓰입니다. 고객 페이지, 고객 연결, 건강 점수입니다.

## 순서

1. **설정 → 데이터 소스 → 회계 프로그램**에서 **파일 올리기**를 선택하세요.
2. **올리기** 탭에서 고객, 청구서, 입금의 **템플릿**을 내려받으세요.
3. 같은 내용을 프로그램에서 내보내 템플릿의 열에 맞추세요(Excel 또는 CSV, 남는 열은 무시).
4. 고객, 청구서, 입금 순서로 올리세요.

## 열

| 파일 | 열 |
| --- | --- |
| 고객 | customer_id, name, tax_id, email, website, currency, balance |
| 청구서 | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| 입금 | payment_id, customer_id, invoice_id, paid_on, amount, currency |

날짜는 YYYY-MM-DD 형식입니다. `status`는 open, paid, void, draft 중 하나이며, 비워 두면 남은 금액이 있는 청구서는 미결로 봅니다.

## 더 최신 수치

언제든 새 파일을 올리세요. 같은 종류의 이전 파일을 대체합니다. 직접 한 연결은 유지됩니다. 파일은 다른 곳으로 보내지지 않습니다.
