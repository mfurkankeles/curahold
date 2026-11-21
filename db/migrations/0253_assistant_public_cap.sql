-- Curahold — the public chat's own monthly money cap.
--
-- The docs and sales-site chat (no company) shared the installation's monthly
-- cap with every paying company: a busy month of anonymous questions could use
-- it up and stop every customer's assistant too (pricing audit, 20 Nov). Its
-- spend is now counted on its own beside the installation's total, so it stops
-- at ASSISTANT_PUBLIC_MONTHLY_USD (api/src/assistant/cost.ts) while customers
-- keep answering. Additive: one counter on the existing month row; the
-- existing policy and grants (0096) cover it.
alter table assistant_global add column public_cost_micros bigint not null default 0;
