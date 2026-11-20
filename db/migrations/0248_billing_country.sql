-- The billing country on a company's invoices (Settings › Billing). Curahold is never offered in some
-- countries (NEVER_OFFERED in shared/src/compliance/consentTexts.ts: sanctions), and that has to hold where
-- money is taken too, not only on the trial form: the billing profile refuses such a country, and checkout
-- refuses a company whose billing country or connection is one. Additive; empty for every company today.
alter table orgs add column billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$');
