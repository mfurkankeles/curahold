---
title: Muhasebe: başka bir programdan dosya
section: help
order: 8.29
summary: Logo, Mikro, Tally, SAP Business One ya da herhangi bir program: müşterileri, faturaları ve ödemeleri Excel ya da CSV olarak yükle.
---
# Muhasebe: başka bir programdan dosya

Açık API'si olmayan programlar — Logo, Mikro, Tally, SAP Business One ve diğerleri — dosyayla bağlanır. Rakamlar bağlı bir programınkiyle aynı çalışır: müşteri sayfası, eşleştirme ve sağlık puanı.

## Adımlar

1. **Ayarlar → Veri kaynakları → Muhasebe programları**'nda **Dosya yükle**'yi seç.
2. **Yükleme** sekmesinde müşteriler, faturalar ve ödemeler için **Şablon**'u indir.
3. Aynılarını programından dışa aktar ve şablonun sütunlarına yerleştir (Excel ya da CSV; fazla sütunlar yok sayılır).
4. Önce müşterileri, sonra faturaları, sonra ödemeleri yükle.

## Sütunlar

| Dosya | Sütunlar |
| --- | --- |
| Müşteriler | customer_id, name, tax_id, email, website, currency, balance |
| Faturalar | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| Ödemeler | payment_id, customer_id, invoice_id, paid_on, amount, currency |

Tarihler YYYY-AA-GG biçiminde. `status` open, paid, void ya da draft olabilir (ödendi, açık, iptal… da olur); boş bırakılırsa kalan borcu olan fatura açık sayılır.

## Daha güncel rakamlar

İstediğin zaman yeni bir dosya yükle: aynı türden öncekinin yerini alır. Elle yaptığın eşleştirmeler korunur. Dosya başka hiçbir yere gönderilmez.
