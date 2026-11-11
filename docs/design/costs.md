# Running cost per customer (gross margin)

Tendwell is priced per seat; every feature is built so that a seat costs
close to nothing to serve. Rules each change follows:

1. **No extra paid services.** Search runs in the Postgres the product
   already has; files sit in the object store already paid for; no search
   cluster, queue service or analytics vendor.
2. **Work in the browser when it can be.** Excel/CSV exports and file
   imports are made and read in the person's browser; the server only
   serves the rows it would serve the screen anyway.
3. **Event-driven, not polling.** Repeating tasks make their next copy when
   one is done; syncs run hourly plus on change; held notifications go out
   with the hourly run that already exists. No new scheduled jobs.
4. **Small answers.** Lists are capped (search: six per kind; pages: eight
   rows per card); counts are computed in one query.
5. **Chat before email, email before SMS.** Notices go to the chat app the
   company already pays for; email only for kinds that need it; quiet hours
   and the daily summary batch the rest. No SMS.
6. **Short retention for bulky data.** Notifications and sync history are
   kept 90 days, undo records 30 minutes of usefulness.
7. **AI (later) is opt-in, cached and capped** per company, on the smallest
   model that does the job.
8. **AI runs on the customer's own assistant.** The MCP connector hands
   Claude or ChatGPT the data; the person's own plan pays for the model.
   Questions, summaries and presentations cost us one API call each, no
   tokens.
9. **Webhooks only when wanted.** Changes are captured by a trigger only if
   some webhook of that company wants the event, collapsed per minute, sent
   right after the request that caused them; retries ride the hourly run.
   Delivery records are kept 7 days.
10. **Docs and the demo are static files.** The help centre, developer docs
    and the try-it-now demo (the whole product running in the visitor's
    browser) need no server time at all.
11. **Scores only for what changed.** Triggers mark a customer only when
    one of its inputs changes, and only in companies that switched the
    score on; a once-a-day pass handles the passing of time. Summaries go
    out once a week, to chat first.
