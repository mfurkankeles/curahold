-- Product team (Tur 2): what a sprint committed to when it started, and what it
-- delivered when it closed.
--
-- 1. started_on / start_points / start_count: the scope at the moment the sprint
--    was started (the company's own day). The burndown's ideal line starts from
--    it, and anything added later shows as scope change instead of hiding in the
--    starting figure. Written once, the first time the sprint goes active.
-- 2. closed_on / done_points / done_count: what was finished when the sprint was
--    closed, before the unfinished work moved on. Velocity reads this, so moving
--    a task back out of Done afterwards does not rewrite a closed sprint's history.
--
-- Same rows, same row-level security as the sprints table (0035); no new grant.

alter table sprints
  add column started_on   date,
  add column start_points numeric check (start_points >= 0),
  add column start_count  int check (start_count >= 0),
  add column closed_on    date,
  add column done_points  numeric check (done_points >= 0),
  add column done_count   int check (done_count >= 0);
