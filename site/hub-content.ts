// The content hub's words (/resources/, /templates/<slug>/, /glossary/<slug>/), in every site
// language: four templates a customer team can copy and nineteen plain definitions, each with one
// line on what Curahold does about it. Written per language, not translated word for word;
// every "In Curahold" line names only what the product does today (checked against the app:
// renewal playbooks 90 days ahead, meetings whose next steps become tasks, the explainable
// health score, the portal, the hand-over card of a won deal, the Cost to serve report, the
// products view, backlog stories linked to customer requests, deal stakeholders with stance,
// review rhythms and onboarding plans).
// The same items exist in every language: a smaller hub in all eleven beats a bigger one in two.
// Pages: scripts/site-hub.ts. Lengths: tests/site-seo.test.ts.
import type { SiteLocale } from './locales';

/** A block of an item's body: a heading, a paragraph, or a list (ordered for steps). */
export type HubBlock = { h: string } | { p: string } | { ol: string[] } | { ul: string[] };

/** One template or glossary term. `slug` is the same in every language. */
export interface HubItem {
  slug: string;
  kind: 'template' | 'term';
  name: string;
  /** Search title and description (lengths as every page's, tests/site-seo.test.ts). */
  seo: [title: string, description: string];
  lead: string;
  body: HubBlock[];
  /** What Curahold does about it, shown under the "In Curahold" heading. Shipped features only. */
  curahold: string;
}

/** The hub in one language: its index page's words, the two group names and the items. */
export interface HubCopy {
  title: string;
  lead: string;
  seo: [title: string, description: string];
  templates: string;
  glossary: string;
  inCurahold: string;
  /** The hub's name and one line about it, for the Resources menu. */
  nav: [name: string, line: string];
  items: HubItem[];
}

const HUB: Record<SiteLocale, HubCopy> = {
  en: {
    "title": "Templates and glossary for customer teams",
    "lead": "Templates you can copy and plain definitions for the work of keeping customers: renewals, business reviews, health and churn.",
    "seo": [
      "Customer success templates and glossary | Curahold",
      "Free templates for renewal playbooks and business reviews, and plain definitions of health score, churn, renewals and customer portals for customer teams."
    ],
    "templates": "Templates",
    "glossary": "Glossary",
    "inCurahold": "In Curahold",
    "nav": [
      "Templates and glossary",
      "Renewal steps, a review agenda and plain definitions."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "Renewal playbook template",
        "seo": [
          "Renewal playbook template: steps from 90 days out | Curahold",
          "A renewal playbook you can copy: what to do 90, 75, 60 and 30 days before a contract renews, who owns each step, and what to check before the call."
        ],
        "lead": "A renewal is won in the three months before the date, not on it. Copy these steps, give each an owner, and count them back from the renewal date.",
        "body": [
          {
            "h": "The steps"
          },
          {
            "ol": [
              "90 days before: review usage, open requests and the health score; write down anything that worries you.",
              "75 days before: book the renewal call with the decision maker and the day-to-day contact.",
              "60 days before: send the renewal quote, with any change in seats or plan.",
              "30 days before: follow up on the quote and settle open questions in writing.",
              "On the renewal date: confirm the signed renewal and log what was agreed."
            ]
          },
          {
            "h": "Before the renewal call"
          },
          {
            "ul": [
              "What did the customer set out to achieve this year, and did they?",
              "Which promises from earlier meetings are still open?",
              "Who decides, and have they been in a meeting with you recently?"
            ]
          }
        ],
        "curahold": "Turn renewals on and a renewal playbook opens its steps as tasks ninety days before each renewal date, each with an owner and a due date counted back from the renewal."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "Business review (QBR) agenda template",
        "seo": [
          "Business review (QBR) agenda template | Curahold",
          "A one-hour business review agenda for customer teams: results against goals, what changed, open promises, next quarter’s plan and clear next steps."
        ],
        "lead": "A quarterly business review should leave the customer with proof of value and both sides with the same next steps. This agenda fits in an hour.",
        "body": [
          {
            "h": "Agenda (60 minutes)"
          },
          {
            "ol": [
              "5 minutes: the goals of the meeting and who is in the room.",
              "15 minutes: results against the goals set last quarter.",
              "10 minutes: what changed on their side: people, priorities, budget.",
              "10 minutes: open requests and promises, and where each one stands.",
              "15 minutes: the plan for next quarter.",
              "5 minutes: next steps, each with an owner and a date."
            ]
          },
          {
            "h": "After the meeting"
          },
          {
            "p": "Send a short summary the same day: what was agreed, the next steps with owners and dates, and the date of the next review."
          }
        ],
        "curahold": "Log the review as a meeting on the customer and write its next steps; when you save, each one becomes a task with an owner and a date, which you can share in the customer’s portal."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "Sales-to-onboarding hand-over checklist",
        "seo": [
          "Sales to onboarding hand-over checklist | Curahold",
          "A hand-over checklist for won deals: who the stakeholders are, what was promised in the sale, open requests, key dates and the first call with the customer."
        ],
        "lead": "Most trouble in a customer’s first months starts at the hand-over: the sales team knew things the onboarding team never hears. Copy this list and fill it in before the deal changes hands.",
        "body": [
          {
            "h": "What the hand-over must carry"
          },
          {
            "ul": [
              "Stakeholders: the decision maker, the day-to-day contact and the champion on their side, with how to reach each.",
              "Promises made during the sale: features, dates, discounts, anything said in writing or on a call.",
              "Open product requests the customer is waiting for, and what they were told about them.",
              "Key dates: the close date, the go-live they expect and the renewal date.",
              "Why they bought: the problem they want solved and how they will judge success."
            ]
          },
          {
            "h": "Before the first call"
          },
          {
            "ol": [
              "The seller and the onboarding owner read the list together, in 15 minutes.",
              "Anything unclear goes back to the seller, not to the customer.",
              "The first call opens by repeating the customer’s goal in their own words."
            ]
          }
        ],
        "curahold": "When a deal is won, Curahold can prepare a hand-over card for the next team with the stakeholders, the promises made, open product requests, and the close and renewal dates. The card waits until its new owner confirms it."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "Customer health score sheet template",
        "seo": [
          "Health score template: signals, points and bands | Curahold",
          "A health score sheet you can copy: six signals a customer team can observe, the points each adds or removes, and the bands that show who needs attention."
        ],
        "lead": "A health score only helps if the team trusts it, and a team trusts a score it can explain. Start with a few signals you can see, give each a weight, and write down why.",
        "body": [
          {
            "h": "Signals and points (start at 50)"
          },
          {
            "ul": [
              "Spoke with the customer in the last 30 days: +15. No contact for 60 days: −20.",
              "A champion on their side who replies: +15. The champion left: −25.",
              "Promised work overdue: −10 for each item, at most −30.",
              "Open blockers or support requests older than two weeks: −10.",
              "Usage steady or growing: +10. Falling for two months: −15.",
              "Renewal less than 90 days away with no call booked: −10."
            ]
          },
          {
            "h": "Bands"
          },
          {
            "ul": [
              "70 and above: healthy; keep the rhythm.",
              "40 to 69: watch; find the reason this week.",
              "Below 40: at risk; the owner calls, and the team lead knows."
            ]
          },
          {
            "p": "Every quarter, check the weights against the customers you actually lost and kept, and change the ones that guessed wrong."
          }
        ],
        "curahold": "Each customer gets a score from 0 to 100 built from rules you set, with its reasons listed and its trend over the last thirty days."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "Customer health score",
        "seo": [
          "What is a customer health score? Definition | Curahold",
          "A customer health score sums up how a customer relationship is going in one number, built from signals such as last contact, overdue work and open issues."
        ],
        "lead": "A customer health score is a single number, often from 0 to 100, that sums up how well a customer relationship is going.",
        "body": [
          {
            "p": "It is built from signals the team can observe: how recently someone spoke with the customer, whether promised work is overdue, whether there is a champion on their side, open blockers and support requests. Each signal adds or takes away points."
          },
          {
            "h": "Why it matters"
          },
          {
            "p": "A portfolio of dozens of customers hides the one going quiet. A score sorts them, so attention goes first where a renewal is at risk."
          },
          {
            "h": "What makes a good score"
          },
          {
            "ul": [
              "It explains itself: anyone can see which signals moved it.",
              "It uses signals the team trusts and can act on.",
              "It is followed over time, not read once."
            ]
          }
        ],
        "curahold": "Each customer gets a score from 0 to 100 built from rules you set, with its reasons listed and its trend over the last thirty days."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "Churn",
        "seo": [
          "What is customer churn? Definition and signals | Curahold",
          "Churn is the share of customers or revenue lost in a period. What counts as churn, how it is measured, and the early signals that come before it."
        ],
        "lead": "Churn is when a customer stops buying: they cancel, or they do not renew. The churn rate is the share of customers, or of revenue, lost in a period.",
        "body": [
          {
            "h": "How it is measured"
          },
          {
            "ul": [
              "Customer churn: customers lost in the period, divided by customers at its start.",
              "Revenue churn: recurring revenue lost to cancellations and downgrades, divided by recurring revenue at the start."
            ]
          },
          {
            "h": "The signals that come first"
          },
          {
            "p": "Churn rarely arrives without warning. Contact goes quiet, promised work slips, the champion leaves, support requests pile up. Watching those signals is how a team acts before the renewal date."
          }
        ],
        "curahold": "Signals like these feed each customer’s health score, so the customers going quiet come forward well before their renewal."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "Contract renewal",
        "seo": [
          "What is a contract renewal? Process and timeline | Curahold",
          "A contract renewal extends a customer agreement for a new term. When to start, what a renewal process looks like, and why it begins months before the date."
        ],
        "lead": "A contract renewal extends a customer’s agreement for another term, often with changes: more seats, a different plan or a new price.",
        "body": [
          {
            "h": "When it starts"
          },
          {
            "p": "For a yearly contract, the work usually starts about ninety days ahead. That leaves time to review the value delivered, meet the decision maker, send a quote and settle questions without a rush."
          },
          {
            "h": "What usually goes wrong"
          },
          {
            "ul": [
              "The date is noticed too late.",
              "The person who signed has left.",
              "Promises made during the year are still open."
            ]
          }
        ],
        "curahold": "A renewal can open its own playbook ninety days ahead, as tasks with owners and dates, together with a renewal opportunity in the pipeline."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "Customer portal",
        "seo": [
          "What is a customer portal? Definition and uses | Curahold",
          "A customer portal is a private place where a customer sees the work shared with them, raises requests and reads replies, instead of chasing email threads."
        ],
        "lead": "A customer portal is a private web page where a customer sees the work shared with them, raises requests and reads the team’s replies.",
        "body": [
          {
            "h": "Why teams use one"
          },
          {
            "p": "It replaces status emails. The customer sees progress whenever they want, and their requests arrive in one place instead of scattered threads."
          },
          {
            "h": "What to share"
          },
          {
            "ul": [
              "Onboarding steps and their dates.",
              "Tasks promised in meetings.",
              "Answers to their requests."
            ]
          }
        ],
        "curahold": "Customers sign in with a link in their email and see only what you share; the requests they raise land on your team’s board."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "Customer onboarding",
        "seo": [
          "What is customer onboarding? Steps and goals | Curahold",
          "Customer onboarding is the work of taking a new customer from signature to first value: the hand-over from sales, setup, training and first visible results."
        ],
        "lead": "Customer onboarding is the time between the signature and the moment a new customer gets the value they bought, and the work a team does to make that time short.",
        "body": [
          {
            "h": "What it usually covers"
          },
          {
            "ul": [
              "The hand-over from sales, with what was promised.",
              "A kickoff call that agrees goals and dates.",
              "Setup, data import and training.",
              "A first result the customer can see and name."
            ]
          },
          {
            "h": "Why it matters"
          },
          {
            "p": "Customers who see value early tend to stay. An onboarding that drags makes the first renewal conversation start from doubt."
          }
        ],
        "curahold": "If you have an onboarding team, a won deal reaches it as one hand-over card with the stakeholders, the promises made, open requests and the key dates, and its tasks can be shared with the customer in their portal."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "Cost to serve",
        "seo": [
          "Cost to serve: what it is and how to measure it | Curahold",
          "Cost to serve is what it takes to look after a customer, in hours or money, set against what they pay. How to measure it and what to do before the renewal."
        ],
        "lead": "Cost to serve is the effort a team spends looking after a customer, set against what that customer pays.",
        "body": [
          {
            "h": "How to measure it"
          },
          {
            "p": "The simplest measure is hours: the time the team logged on a customer over the last twelve months, divided by their yearly contract value. Comparing every customer on the same scale shows who takes the most care for what they pay."
          },
          {
            "h": "What to do with it"
          },
          {
            "ul": [
              "Find the work behind a high number: repeated requests, a missing feature, a training gap.",
              "Fix the cause before the renewal, or price the extra service into it.",
              "Do not judge a customer on this number alone: a demanding customer can also be your best reference."
            ]
          }
        ],
        "curahold": "The Cost to serve report shows, for each customer, the hours spent in the last 12 months for every 1,000 of yearly value, so you can see who costs most to look after."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "Net revenue retention (NRR)",
        "seo": [
          "What is net revenue retention (NRR)? Formula | Curahold",
          "Net revenue retention shows how much recurring revenue a group of customers brings a year later, counting renewals, expansion, downgrades and churn."
        ],
        "lead": "Net revenue retention (NRR) is the recurring revenue a group of customers brings today, as a share of what the same customers brought a year ago.",
        "body": [
          {
            "h": "How it is worked out"
          },
          {
            "p": "Take the recurring revenue of the customers you had at the start of the period. Add what they expanded, subtract downgrades and churn, and divide by where you started. New customers are left out."
          },
          {
            "h": "Why teams watch it"
          },
          {
            "ul": [
              "Above 100% means existing customers grow on their own.",
              "It shows whether renewals and expansion outweigh losses.",
              "It moves slowly, so it rewards steady account work."
            ]
          }
        ],
        "curahold": "Renewal and expansion opportunities sit in the same pipeline as new deals, and the Renewals view lists every customer by renewal month with the amount at stake."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "Annual recurring revenue (ARR)",
        "seo": [
          "What is annual recurring revenue (ARR)? | Curahold",
          "Annual recurring revenue is the yearly value of the subscriptions a company has signed: what counts, what does not, and how teams use it per customer."
        ],
        "lead": "Annual recurring revenue (ARR) is the yearly value of the subscriptions in force: what customers will pay over twelve months if nothing changes.",
        "body": [
          {
            "h": "What counts"
          },
          {
            "ul": [
              "Subscription fees, turned into a yearly amount.",
              "Recurring add-ons and extra seats.",
              "Not one-off fees such as setup or training."
            ]
          },
          {
            "h": "Why it matters per customer"
          },
          {
            "p": "ARR on each customer shows where the revenue sits, so a team can give its largest renewals the attention they need and see how much is at risk when a customer goes quiet."
          }
        ],
        "curahold": "ARR can be a field on each customer, and a report can sum it by owner, health band or renewal month, under each reader's own rights."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "Business review (QBR)",
        "seo": [
          "What is a business review (QBR)? Agenda | Curahold",
          "A business review is a regular meeting where a customer and their supplier look at results, open promises and the plan ahead, usually once a quarter."
        ],
        "lead": "A business review, often quarterly and called a QBR, is a meeting where a customer and their supplier look back at results and agree the plan ahead.",
        "body": [
          {
            "h": "What it covers"
          },
          {
            "ul": [
              "Results against the goals set last time.",
              "What changed on the customer's side.",
              "Open requests and promises, and where each stands.",
              "The plan and owners for the next period."
            ]
          },
          {
            "h": "What makes it useful"
          },
          {
            "p": "It ends with next steps that have owners and dates. A review whose actions are not written down is forgotten by the next one."
          }
        ],
        "curahold": "A business review is a meeting on the customer's timeline, and the next steps written in it become tasks with an owner and a date."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "What does a Customer Success Manager (CSM) do? | Curahold",
          "A Customer Success Manager looks after a set of customers after the sale: onboarding, adoption, business reviews, renewals and spotting risk early."
        ],
        "lead": "A Customer Success Manager (CSM) looks after a set of customers after the sale, so they get the value they bought and stay.",
        "body": [
          {
            "h": "What the role usually covers"
          },
          {
            "ul": [
              "Onboarding new customers, or taking them over from an onboarding team.",
              "Regular check-ins and business reviews.",
              "Watching health and acting on early warnings.",
              "Preparing renewals and spotting room to grow."
            ]
          },
          {
            "h": "Where the time goes"
          },
          {
            "p": "A CSM often looks after dozens of customers. Knowing which of them needs attention this week matters more than covering everyone equally."
          }
        ],
        "curahold": "Each customer has an owner in every department, and each person's list is ordered by who needs them, with the reason and the next step."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "Expansion revenue",
        "seo": [
          "What is expansion revenue? Upsell and cross-sell | Curahold",
          "Expansion revenue is extra recurring revenue from existing customers: more seats, a higher plan or another product. Where it comes from and how to find it."
        ],
        "lead": "Expansion revenue is the extra recurring revenue that comes from customers you already have: more seats, a higher plan or another product.",
        "body": [
          {
            "h": "Where it comes from"
          },
          {
            "ul": [
              "Upsell: more of what they use, or a higher plan.",
              "Cross-sell: a product they do not have yet.",
              "Growth on their side: new teams, sites or countries."
            ]
          },
          {
            "h": "When to raise it"
          },
          {
            "p": "Expansion follows value. It is easiest after a result the customer can name, and hardest when promises from the last request are still open."
          }
        ],
        "curahold": "The Products view shows which customer has which product, so the gaps are visible, and opening a task for one takes a click."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "Time to value",
        "seo": [
          "What is time to value? Definition and tips | Curahold",
          "Time to value is how long a new customer waits between signing and the first result they can name. Why it matters for renewals and how teams shorten it."
        ],
        "lead": "Time to value is how long a new customer waits between signing and the first result they can see and name.",
        "body": [
          {
            "h": "Why it matters"
          },
          {
            "p": "The first renewal conversation starts on the day of the signature. A customer who sees value in weeks talks about growth; one still waiting talks about price."
          },
          {
            "h": "How teams shorten it"
          },
          {
            "ul": [
              "Agree one first result at the kickoff, with a date.",
              "Hand over what sales promised, so nothing is asked twice.",
              "Share the plan with the customer, so both sides see the next step."
            ]
          }
        ],
        "curahold": "Onboarding plans have steps, goals and dates, and the steps you choose can be shared with the customer in their portal."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "Success plan",
        "seo": [
          "What is a customer success plan? Parts | Curahold",
          "A success plan writes down what a customer wants to achieve, how both sides will get there and how progress is measured, so every review has a reference."
        ],
        "lead": "A success plan writes down what a customer wants to achieve, the steps both sides will take, and how progress will be measured.",
        "body": [
          {
            "h": "What it usually holds"
          },
          {
            "ul": [
              "The customer's goals in their own words.",
              "The steps, owners and dates on both sides.",
              "The measures that show progress."
            ]
          },
          {
            "h": "How it is used"
          },
          {
            "p": "It is the reference for every check-in and business review. Updated together, it keeps both sides working towards the same result."
          }
        ],
        "curahold": "An onboarding plan holds goals, steps with owners and dates, and the measures you track, and its customer-facing steps can be shared in the portal."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "Stakeholder map",
        "seo": [
          "What is a stakeholder map? B2B definition | Curahold",
          "A stakeholder map lists the people at a customer who influence a decision, their role and where they stand, so the team knows whom to involve and when."
        ],
        "lead": "A stakeholder map lists the people at a customer who take part in a decision, their role and where each of them stands.",
        "body": [
          {
            "h": "What it records"
          },
          {
            "ul": [
              "Each person's role and influence.",
              "Their stance: supporter, neutral or blocker.",
              "Who has not been met yet."
            ]
          },
          {
            "h": "Why it matters after the sale"
          },
          {
            "p": "Decisions at renewal are rarely made by one person. When the champion leaves, a map shows who else knows the value and who needs to hear it."
          }
        ],
        "curahold": "Each deal keeps its stakeholders with their title and stance, and they travel with the hand-over card to the team that takes the customer over."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "Champion",
        "seo": [
          "What is a champion in B2B customer relationships? | Curahold",
          "A champion is the person at a customer who believes in your product and argues for it internally. Why one matters and what to do when they leave."
        ],
        "lead": "A champion is the person at a customer who believes in what you provide and argues for it inside their company.",
        "body": [
          {
            "h": "Why one matters"
          },
          {
            "p": "A champion gets meetings booked, budgets defended and problems raised early. Customers with an active champion renew more easily."
          },
          {
            "h": "When the champion leaves"
          },
          {
            "ul": [
              "Find out who takes over their part of the work.",
              "Show the value again to the people who remain.",
              "Treat it as a risk until a new champion is in place."
            ]
          }
        ],
        "curahold": "Having a champion can be a signal in the health score, so a customer without one, or whose champion left, comes forward."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "Sales-to-success handover",
        "seo": [
          "Sales to customer success handover checklist | Curahold",
          "A handover from sales to customer success passes on what was promised, who matters and the key dates, so the customer never has to explain it all again."
        ],
        "lead": "A handover from sales to customer success passes on everything the next team needs, so the customer never has to explain it all again.",
        "body": [
          {
            "h": "What to pass on"
          },
          {
            "ul": [
              "The stakeholders and where each one stands.",
              "What was promised during the sale.",
              "Open requests and product questions.",
              "The close date and the renewal date."
            ]
          },
          {
            "h": "What goes wrong"
          },
          {
            "p": "Promises made in a sales call that nobody wrote down. The customer remembers them; the new team does not."
          }
        ],
        "curahold": "A won deal reaches the next team as one hand-over card with the stakeholders, the promises made, open product requests and the key dates."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "Feature request",
        "seo": [
          "How to handle customer feature requests in B2B | Curahold",
          "A feature request is a customer asking for something the product does not do yet. How to record it, link it to the customer and tell them when it ships."
        ],
        "lead": "A feature request is a customer asking for something the product does not do yet, often during a meeting or a support conversation.",
        "body": [
          {
            "h": "How to handle them well"
          },
          {
            "ul": [
              "Record who asked, and why it matters to them.",
              "Link requests for the same thing together.",
              "Weigh them by the customers and value waiting."
            ]
          },
          {
            "h": "Closing the loop"
          },
          {
            "p": "The part most teams miss is telling the customer when the work ships. A request answered with a release note builds more trust than the feature itself."
          }
        ],
        "curahold": "Several customer requests can be linked to one story; the backlog shows the customers waiting, their value and the nearest renewal, and when the work is done the owner gets a ready draft to send."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "Touchpoint",
        "seo": [
          "What is a customer touchpoint? Definition | Curahold",
          "A touchpoint is any moment of contact between a customer and your team: a call, a meeting, a reply. Why their rhythm matters more than their number."
        ],
        "lead": "A touchpoint is any moment of contact between a customer and your team: a call, a meeting, an email or a reply to a request.",
        "body": [
          {
            "h": "Why the rhythm matters"
          },
          {
            "p": "Long silences are an early warning. A customer nobody has spoken to in six weeks is harder to renew than one met every month."
          },
          {
            "h": "What to keep from each one"
          },
          {
            "ul": [
              "When it happened and who took part.",
              "What was decided.",
              "The next step, with an owner and a date."
            ]
          }
        ],
        "curahold": "Meetings, calls and notes are kept on each customer's timeline, the time since the last contact feeds the health score, and each customer can have a review rhythm."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "Meeting follow-up",
        "seo": [
          "Customer meeting follow-up that gets done | Curahold",
          "Meeting follow-up turns what was agreed in a customer meeting into work with owners and dates, so promises are kept and the customer sees them kept."
        ],
        "lead": "Meeting follow-up is turning what was agreed in a customer meeting into work with an owner and a date, before the details fade.",
        "body": [
          {
            "h": "Why it slips"
          },
          {
            "p": "Next steps live in someone's notes. A week later nobody remembers who said they would do what, and the customer notices first."
          },
          {
            "h": "What good follow-up looks like"
          },
          {
            "ul": [
              "Next steps written down before the call ends.",
              "Each one with an owner and a date.",
              "A short note to the customer confirming them."
            ]
          }
        ],
        "curahold": "Next steps written in a meeting's notes become tasks with an owner and a date, linked to the customer, and promises can be shared with the customer in their portal."
      }
    ]
  },
  tr: {
    "title": "Müşteri ekipleri için şablonlar ve sözlük",
    "lead": "Müşteriyi tutma işi için kopyalayabileceğiniz şablonlar ve sade tanımlar: yenilemeler, iş değerlendirmeleri, sağlık skoru ve müşteri kaybı.",
    "seo": [
      "Müşteri başarısı şablonları ve sözlüğü | Curahold",
      "Yenileme playbook’u ve iş değerlendirmesi için ücretsiz şablonlar; sağlık skoru, müşteri kaybı, yenileme ve müşteri portalı için sade tanımlar."
    ],
    "templates": "Şablonlar",
    "glossary": "Sözlük",
    "inCurahold": "Curahold’da",
    "nav": [
      "Şablonlar ve sözlük",
      "Yenileme adımları, değerlendirme gündemi ve sade tanımlar."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "Yenileme playbook’u şablonu",
        "seo": [
          "Yenileme playbook’u şablonu: 90 gün önceden | Curahold",
          "Kopyalayabileceğiniz bir yenileme playbook’u: sözleşme yenilenmeden 90, 75, 60 ve 30 gün önce ne yapılır, sorumlu kim, görüşmeden önce neye bakılır."
        ],
        "lead": "Yenileme, tarihin kendisinde değil, ondan önceki üç ayda kazanılır. Bu adımları kopyalayın, her birine bir sorumlu verin ve yenileme tarihinden geriye doğru sayın.",
        "body": [
          {
            "h": "Adımlar"
          },
          {
            "ol": [
              "90 gün önce: kullanımı, açık talepleri ve sağlık skorunu gözden geçirin; sizi kaygılandıran her şeyi not edin.",
              "75 gün önce: karar vericiyle ve günlük muhatapla yenileme görüşmesini planlayın.",
              "60 gün önce: kullanıcı sayısı ya da plan değişiklikleriyle birlikte yenileme teklifini gönderin.",
              "30 gün önce: teklifin takibini yapın ve açık soruları yazılı olarak netleştirin.",
              "Yenileme tarihinde: imzalanan yenilemeyi teyit edin ve üzerinde anlaşılanları kaydedin."
            ]
          },
          {
            "h": "Yenileme görüşmesinden önce"
          },
          {
            "ul": [
              "Müşteri bu yıl neyi başarmak istedi, başarabildi mi?",
              "Önceki toplantılarda verilen sözlerden hangileri hâlâ açık?",
              "Kararı kim veriyor ve son zamanlarda sizinle bir toplantıda bulundu mu?"
            ]
          }
        ],
        "curahold": "Yenilemeleri açtığınızda, bir yenileme playbook’u adımlarını her yenileme tarihinden doksan gün önce görev olarak açar; her birinin sorumlusu ve yenilemeden geriye sayılan bir tarihi olur."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "İş değerlendirmesi (QBR) gündemi şablonu",
        "seo": [
          "İş değerlendirmesi (QBR) gündemi şablonu | Curahold",
          "Müşteri ekipleri için bir saatlik iş değerlendirmesi gündemi: hedeflere göre sonuçlar, değişenler, açık sözler, gelecek çeyreğin planı ve net sonraki adımlar."
        ],
        "lead": "Çeyreklik bir iş değerlendirmesi, müşteriye sağlanan değerin kanıtını, iki tarafa da aynı sonraki adımları bırakmalıdır. Bu gündem bir saate sığar.",
        "body": [
          {
            "h": "Gündem (60 dakika)"
          },
          {
            "ol": [
              "5 dakika: toplantının hedefleri ve kimlerin katıldığı.",
              "15 dakika: geçen çeyrek belirlenen hedeflere göre sonuçlar.",
              "10 dakika: müşteri tarafında değişenler: kişiler, öncelikler, bütçe.",
              "10 dakika: açık talepler ve sözler, her birinin durumu.",
              "15 dakika: gelecek çeyreğin planı.",
              "5 dakika: her birinin sorumlusu ve tarihi olan sonraki adımlar."
            ]
          },
          {
            "h": "Toplantıdan sonra"
          },
          {
            "p": "Aynı gün kısa bir özet gönderin: üzerinde anlaşılanlar, sorumlu ve tarihleriyle sonraki adımlar ve bir sonraki değerlendirmenin tarihi."
          }
        ],
        "curahold": "Değerlendirmeyi müşteri üzerinde bir toplantı olarak kaydedin ve sonraki adımlarını yazın; kaydettiğinizde her biri sorumlusu ve tarihi olan bir göreve dönüşür, isterseniz müşterinin portalında paylaşılır."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "Satıştan onboarding’e devir kontrol listesi",
        "seo": [
          "Satıştan onboarding’e devir kontrol listesi | Curahold",
          "Kazanılan fırsatlar için devir kontrol listesi: paydaşlar kim, satışta neler söz verildi, açık talepler, kritik tarihler ve müşteriyle ilk görüşme."
        ],
        "lead": "Müşterinin ilk aylarındaki sorunların çoğu devirde başlar: satış ekibinin bildiği bir şey onboarding ekibine hiç ulaşmaz. Bu listeyi kopyalayın ve fırsat el değiştirmeden önce doldurun.",
        "body": [
          {
            "h": "Devirde mutlaka aktarılması gerekenler"
          },
          {
            "ul": [
              "Paydaşlar: karar verici, günlük muhatap ve müşteri tarafındaki destekçi; her birine nasıl ulaşılacağı.",
              "Satış sırasında verilen sözler: özellikler, tarihler, indirimler; yazılı ya da görüşmede söylenen her şey.",
              "Müşterinin beklediği açık ürün talepleri ve bunlar hakkında kendisine ne söylendiği.",
              "Kritik tarihler: kapanış tarihi, beklenen canlıya geçiş ve yenileme tarihi.",
              "Neden satın aldıkları: çözmek istedikleri sorun ve başarıyı neye göre ölçecekleri."
            ]
          },
          {
            "h": "İlk görüşmeden önce"
          },
          {
            "ol": [
              "Satış temsilcisi ve onboarding sorumlusu listeyi birlikte, 15 dakikada okur.",
              "Belirsiz kalan her şey müşteriye değil, satış temsilcisine sorulur.",
              "İlk görüşme, müşterinin hedefini kendi sözcükleriyle tekrar ederek açılır."
            ]
          }
        ],
        "curahold": "Bir fırsat kazanıldığında Curahold sonraki ekip için bir devir kartı hazırlayabilir: paydaşlar, verilen sözler, açık ürün talepleri, kapanış ve yenileme tarihleri. Kart, yeni sorumlusu onaylayana kadar bekler."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "Müşteri sağlık skoru tablosu şablonu",
        "seo": [
          "Sağlık skoru şablonu: sinyaller, puanlar, eşikler | Curahold",
          "Kopyalayabileceğiniz bir sağlık skoru tablosu: ekibin görebildiği altı sinyal, her birinin eklediği ya da düşürdüğü puan ve kime bakılacağını gösteren eşikler."
        ],
        "lead": "Sağlık skoru ancak ekip ona güvenirse işe yarar; ekip de açıklayabildiği skora güvenir. Görebildiğiniz birkaç sinyalle başlayın, her birine bir ağırlık verin ve nedenini yazın.",
        "body": [
          {
            "h": "Sinyaller ve puanlar (50’den başlayın)"
          },
          {
            "ul": [
              "Son 30 günde müşteriyle görüşüldü: +15. 60 gündür temas yok: −20.",
              "Müşteri tarafında yanıt veren bir destekçi var: +15. Destekçi ayrıldı: −25.",
              "Söz verilen iş gecikti: her biri için −10, en fazla −30.",
              "İki haftadan eski açık engel ya da destek talebi: −10.",
              "Kullanım sabit ya da artıyor: +10. İki aydır azalıyor: −15.",
              "Yenilemeye kalan süre 90 günün altında ve görüşme planlanmadı: −10."
            ]
          },
          {
            "h": "Eşikler"
          },
          {
            "ul": [
              "70 ve üzeri: sağlıklı; ritmi koruyun.",
              "40–69: izlenmeli; nedenini bu hafta bulun.",
              "40’ın altı: riskli; sorumlu müşteriyi arar, ekip lideri haberdar olur."
            ]
          },
          {
            "p": "Ağırlıkları her çeyrek, gerçekten kaybettiğiniz ve tuttuğunuz müşterilerle karşılaştırın; yanlış tahmin edenleri değiştirin."
          }
        ],
        "curahold": "Her müşterinin, sizin koyduğunuz kurallardan oluşan 0–100 arası bir skoru olur; nedenleri sıralanır ve son otuz gündeki gidişatı görünür."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "Müşteri sağlık skoru",
        "seo": [
          "Müşteri sağlık skoru nedir? Sade bir tanım | Curahold",
          "Müşteri sağlık skoru, bir müşteri ilişkisinin gidişatını tek bir sayıda özetler; son temas, geciken işler ve açık sorunlar gibi sinyallerden oluşur."
        ],
        "lead": "Müşteri sağlık skoru, bir müşteri ilişkisinin ne kadar iyi gittiğini özetleyen, çoğunlukla 0 ile 100 arasında tek bir sayıdır.",
        "body": [
          {
            "p": "Ekibin gözlemleyebildiği sinyallerden oluşur: müşteriyle en son ne zaman konuşulduğu, söz verilen işlerin gecikip gecikmediği, müşteri tarafında güçlü bir destekçi olup olmadığı, açık engeller ve destek talepleri. Her sinyal puan ekler ya da düşürür."
          },
          {
            "h": "Neden önemli"
          },
          {
            "p": "Onlarca müşteriden oluşan bir portföy, sessizleşen müşteriyi gizler. Skor müşterileri sıralar; ilgi önce yenilemesi riskte olana gider."
          },
          {
            "h": "İyi bir skoru ne belirler"
          },
          {
            "ul": [
              "Kendini açıklar: hangi sinyallerin onu değiştirdiğini herkes görebilir.",
              "Ekibin güvendiği ve üzerine harekete geçebildiği sinyalleri kullanır.",
              "Bir kez okunmaz, zaman içinde izlenir."
            ]
          }
        ],
        "curahold": "Her müşterinin, sizin koyduğunuz kurallardan oluşan 0–100 arası bir skoru olur; nedenleri sıralanır ve son otuz gündeki gidişatı görünür."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "Müşteri kaybı (churn)",
        "seo": [
          "Müşteri kaybı (churn) nedir? Tanım ve sinyaller | Curahold",
          "Churn, bir dönemde kaybedilen müşterilerin ya da gelirin oranıdır. Neyin kayıp sayıldığı, nasıl ölçüldüğü ve ondan önce gelen erken sinyaller."
        ],
        "lead": "Müşteri kaybı (churn), bir müşterinin satın almayı bırakmasıdır: iptal eder ya da yenilemez. Kayıp oranı, bir dönemde kaybedilen müşterilerin ya da gelirin payıdır.",
        "body": [
          {
            "h": "Nasıl ölçülür"
          },
          {
            "ul": [
              "Müşteri kaybı: dönemde kaybedilen müşteriler, dönem başındaki müşteri sayısına bölünür.",
              "Gelir kaybı: iptal ve plan düşürmelerle kaybedilen tekrarlayan gelir, dönem başındaki tekrarlayan gelire bölünür."
            ]
          },
          {
            "h": "Önce gelen sinyaller"
          },
          {
            "p": "Müşteri kaybı nadiren habersiz gelir. Temas seyrekleşir, söz verilen işler gecikir, destekçi ayrılır, destek talepleri birikir. Bu sinyalleri izlemek, ekibin yenileme tarihinden önce harekete geçmesini sağlar."
          }
        ],
        "curahold": "Bu tür sinyaller her müşterinin sağlık skoruna yansır; böylece sessizleşen müşteriler yenilemelerinden çok önce öne çıkar."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "Sözleşme yenileme",
        "seo": [
          "Sözleşme yenileme nedir? Süreç ve zamanlama | Curahold",
          "Sözleşme yenileme, bir müşteri anlaşmasını yeni bir dönem için uzatır. Ne zaman başlanır, süreç neye benzer ve neden tarihten aylar önce başlar."
        ],
        "lead": "Sözleşme yenileme, bir müşterinin anlaşmasını yeni bir dönem için uzatır; çoğu zaman değişikliklerle: daha fazla kullanıcı, farklı bir plan ya da yeni bir fiyat.",
        "body": [
          {
            "h": "Ne zaman başlar"
          },
          {
            "p": "Yıllık bir sözleşmede iş genellikle yaklaşık doksan gün önceden başlar. Bu, sağlanan değeri gözden geçirmeye, karar vericiyle görüşmeye, teklif göndermeye ve soruları acele etmeden netleştirmeye zaman bırakır."
          },
          {
            "h": "Genellikle ne ters gider"
          },
          {
            "ul": [
              "Tarih çok geç fark edilir.",
              "Sözleşmeyi imzalayan kişi ayrılmıştır.",
              "Yıl içinde verilen sözler hâlâ açıktır."
            ]
          }
        ],
        "curahold": "Bir yenileme, kendi playbook’unu doksan gün önceden sorumlusu ve tarihi olan görevler olarak, satış hunisindeki bir yenileme fırsatıyla birlikte açabilir."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "Müşteri portalı",
        "seo": [
          "Müşteri portalı nedir? Tanım ve kullanım alanları | Curahold",
          "Müşteri portalı, müşterinin kendisiyle paylaşılan işi gördüğü, talep açtığı ve yanıtları okuduğu özel bir alandır; dağınık e-posta yazışmalarının yerini alır."
        ],
        "lead": "Müşteri portalı, müşterinin kendisiyle paylaşılan işi gördüğü, talep açtığı ve ekibin yanıtlarını okuduğu özel bir web sayfasıdır.",
        "body": [
          {
            "h": "Ekipler neden kullanır"
          },
          {
            "p": "Durum e-postalarının yerini alır. Müşteri ilerlemeyi istediği zaman görür; talepleri dağınık yazışmalar yerine tek bir yerde toplanır."
          },
          {
            "h": "Neler paylaşılır"
          },
          {
            "ul": [
              "Onboarding adımları ve tarihleri.",
              "Toplantılarda söz verilen görevler.",
              "Taleplerine verilen yanıtlar."
            ]
          }
        ],
        "curahold": "Müşteriler e-postalarındaki bir bağlantıyla girer ve yalnızca paylaştıklarınızı görür; açtıkları talepler ekibinizin panosuna düşer."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "Müşteri onboarding’i",
        "seo": [
          "Müşteri onboarding’i nedir? Adımlar ve hedefler | Curahold",
          "Müşteri onboarding’i, yeni bir müşteriyi imzadan ilk değere taşıma işidir: satıştan devir, kurulum, eğitim ve müşterinin görebildiği ilk sonuçlar."
        ],
        "lead": "Müşteri onboarding’i (müşteri kurulumu), imza ile yeni müşterinin satın aldığı değeri ilk kez gördüğü an arasındaki dönem ve bu dönemi kısaltmak için ekibin yaptığı iştir.",
        "body": [
          {
            "h": "Genellikle neleri kapsar"
          },
          {
            "ul": [
              "Verilen sözlerle birlikte satıştan devir.",
              "Hedeflerin ve tarihlerin netleştiği bir başlangıç toplantısı.",
              "Kurulum, veri aktarımı ve eğitim.",
              "Müşterinin görebildiği ve adını koyabildiği ilk sonuç."
            ]
          },
          {
            "h": "Neden önemli"
          },
          {
            "p": "Değeri erken gören müşteriler kalmaya yatkındır. Uzayan bir onboarding, ilk yenileme görüşmesinin şüpheyle başlamasına yol açar."
          }
        ],
        "curahold": "Bir onboarding ekibiniz varsa kazanılan fırsat ona tek bir devir kartıyla ulaşır: paydaşlar, verilen sözler, açık talepler ve kritik tarihler. Görevleri, müşterinin portalında müşteriyle paylaşılabilir."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "Hizmet maliyeti (cost to serve)",
        "seo": [
          "Hizmet maliyeti nedir, nasıl ölçülür? | Curahold",
          "Hizmet maliyeti, bir müşteriyle ilgilenmenin saat ya da para olarak tuttuğunu müşterinin ödediğiyle karşılaştırır. Nasıl ölçülür, sonuçla ne yapılır?"
        ],
        "lead": "Hizmet maliyeti, bir ekibin bir müşteriyle ilgilenmek için harcadığı emeğin, o müşterinin ödediği tutarla karşılaştırılmasıdır.",
        "body": [
          {
            "h": "Nasıl ölçülür"
          },
          {
            "p": "En basit ölçü saattir: ekibin son on iki ayda bir müşteri için kaydettiği süre, yıllık sözleşme değerine bölünür. Bütün müşterileri aynı ölçekte karşılaştırmak, ödediğine göre en çok emeği kimin aldığını gösterir."
          },
          {
            "h": "Sonuçla ne yapılır"
          },
          {
            "ul": [
              "Yüksek bir sayının arkasındaki işi bulun: tekrarlayan talepler, eksik bir özellik, bir eğitim açığı.",
              "Nedeni yenilemeden önce giderin ya da ek hizmeti yenileme fiyatına yansıtın.",
              "Bir müşteriyi yalnızca bu sayıyla değerlendirmeyin: zahmetli bir müşteri en iyi referansınız da olabilir."
            ]
          }
        ],
        "curahold": "Hizmet maliyeti raporu, her müşteri için son 12 ayda yıllık değerin her 1.000’i için harcanan saati gösterir; bakımı en pahalı olanları görürsünüz."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "Net gelir tutma oranı (NRR)",
        "seo": [
          "Net gelir tutma oranı (NRR) nedir? Formülü | Curahold",
          "Net gelir tutma oranı, bir müşteri grubunun bir yıl sonra ne kadar yinelenen gelir getirdiğini gösterir: yenileme, büyüme, küçülme ve kayıp birlikte."
        ],
        "lead": "Net gelir tutma oranı (NRR), bir müşteri grubunun bugün getirdiği yinelenen gelirin, aynı müşterilerin bir yıl önce getirdiğine oranıdır.",
        "body": [
          {
            "h": "Nasıl hesaplanır"
          },
          {
            "p": "Dönem başındaki müşterilerin yinelenen gelirini alın. Büyüdükleri kadarını ekleyin, küçülmeleri ve kayıpları çıkarın, sonucu başlangıçtaki tutara bölün. Yeni müşteriler hesaba katılmaz."
          },
          {
            "h": "Ekipler neden izler"
          },
          {
            "ul": [
              "%100'ün üstü, mevcut müşterilerin kendiliğinden büyüdüğünü gösterir.",
              "Yenileme ve büyümenin kayıpları aşıp aşmadığını gösterir.",
              "Yavaş değişir; düzenli müşteri çalışmasını ödüllendirir."
            ]
          }
        ],
        "curahold": "Yenileme ve büyüme fırsatları yeni fırsatlarla aynı satış hunisinde durur; Yenilemeler görünümü her müşteriyi yenileme ayına göre, riskteki tutarla birlikte listeler."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "Yıllık yinelenen gelir (ARR)",
        "seo": [
          "Yıllık yinelenen gelir (ARR) nedir? Kısa tanım | Curahold",
          "Yıllık yinelenen gelir, imzalı aboneliklerin yıllık değeridir: neyin sayıldığı, neyin sayılmadığı ve ekiplerin bunu müşteri bazında nasıl kullandığı."
        ],
        "lead": "Yıllık yinelenen gelir (ARR), yürürlükteki aboneliklerin yıllık değeridir: hiçbir şey değişmezse müşterilerin on iki ayda ödeyeceği tutar.",
        "body": [
          {
            "h": "Neler sayılır"
          },
          {
            "ul": [
              "Yıllık tutara çevrilmiş abonelik ücretleri.",
              "Yinelenen ek modüller ve ek kullanıcılar.",
              "Kurulum ya da eğitim gibi tek seferlik ücretler sayılmaz."
            ]
          },
          {
            "h": "Müşteri bazında neden önemli"
          },
          {
            "p": "Her müşterideki ARR gelirin nerede durduğunu gösterir; ekip en büyük yenilemelere gereken ilgiyi verir ve sessizleşen bir müşteride ne kadar tutarın risk altında olduğunu görür."
          }
        ],
        "curahold": "ARR her müşteride bir alan olabilir; bir rapor bunu sahibine, sağlık skoru bandına ya da yenileme ayına göre, her okuyucunun kendi yetkisiyle toplar."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "İş değerlendirmesi (QBR)",
        "seo": [
          "İş değerlendirmesi (QBR) nedir? Amacı ve gündemi | Curahold",
          "İş değerlendirmesi, müşteriyle tedarikçinin sonuçlara, açık sözlere ve önümüzdeki plana birlikte baktığı düzenli toplantıdır; çoğu zaman üç ayda bir yapılır."
        ],
        "lead": "Çoğunlukla üç ayda bir yapılan ve QBR diye anılan iş değerlendirmesi, müşteriyle tedarikçinin sonuçlara bakıp önümüzdeki planı kararlaştırdığı toplantıdır.",
        "body": [
          {
            "h": "Neleri kapsar"
          },
          {
            "ul": [
              "Geçen sefer konan hedeflere göre sonuçlar.",
              "Müşteri tarafında neyin değiştiği.",
              "Açık talepler ve verilen sözler, her birinin durumu.",
              "Gelecek dönemin planı ve sorumluları."
            ]
          },
          {
            "h": "Onu yararlı kılan"
          },
          {
            "p": "Sorumlusu ve tarihi olan sonraki adımlarla biter. Aksiyonları yazılmayan bir değerlendirme, bir sonrakine kadar unutulur."
          }
        ],
        "curahold": "İş değerlendirmesi müşterinin zaman çizelgesinde bir toplantıdır; içine yazılan sonraki adımlar sorumlusu ve tarihi olan görevlere dönüşür."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "Customer Success Manager (CSM) ne yapar? | Curahold",
          "Customer Success Manager satıştan sonra bir grup müşteriyle ilgilenir: onboarding, kullanım, iş değerlendirmeleri, yenilemeler ve riskin erken fark edilmesi."
        ],
        "lead": "Customer Success Manager (CSM), satıştan sonra bir grup müşteriyle ilgilenir; müşteriler satın aldıkları değeri alır ve kalır.",
        "body": [
          {
            "h": "Rol genellikle neleri kapsar"
          },
          {
            "ul": [
              "Yeni müşterilerin onboarding'i ya da onboarding ekibinden devralınması.",
              "Düzenli görüşmeler ve iş değerlendirmeleri.",
              "Sağlık durumunu izlemek ve erken uyarılarda harekete geçmek.",
              "Yenilemeleri hazırlamak, büyüme fırsatlarını görmek."
            ]
          },
          {
            "h": "Zaman nereye gider"
          },
          {
            "p": "Bir CSM çoğu zaman onlarca müşteriye bakar. Bu hafta hangisinin ilgiye ihtiyaç duyduğunu bilmek, herkese eşit zaman ayırmaktan daha önemlidir."
          }
        ],
        "curahold": "Her müşterinin her departmanda bir sahibi olur; her kişinin listesi, nedeni ve sonraki adımıyla birlikte, kimin ona ihtiyaç duyduğuna göre sıralanır."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "Büyüme geliri",
        "seo": [
          "Büyüme geliri nedir? Upsell ve çapraz satış | Curahold",
          "Büyüme geliri, mevcut müşterilerden gelen ek yinelenen gelirdir: daha çok kullanıcı, üst bir plan ya da başka bir ürün. Nereden geldiği ve nasıl bulunduğu."
        ],
        "lead": "Büyüme geliri, zaten sahip olduğunuz müşterilerden gelen ek yinelenen gelirdir: daha çok kullanıcı, üst bir plan ya da başka bir ürün.",
        "body": [
          {
            "h": "Nereden gelir"
          },
          {
            "ul": [
              "Upsell: kullandıklarından daha fazlası ya da üst bir plan.",
              "Çapraz satış: henüz sahip olmadıkları bir ürün.",
              "Onların büyümesi: yeni ekipler, şubeler ya da ülkeler."
            ]
          },
          {
            "h": "Ne zaman açılmalı"
          },
          {
            "p": "Büyüme değerin ardından gelir. Müşterinin adını koyabildiği bir sonuçtan sonra en kolay, son talebe verilen sözler hâlâ açıkken en zordur."
          }
        ],
        "curahold": "Ürünler görünümü hangi müşteride hangi ürünün olduğunu gösterir; boşluklar görünür ve biri için görev açmak tek tık sürer."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "Değere ulaşma süresi",
        "seo": [
          "Değere ulaşma süresi nedir? Nasıl kısalır | Curahold",
          "Değere ulaşma süresi, yeni bir müşterinin imzadan adını koyabileceği ilk sonuca kadar beklediği süredir. Yenileme için neden önemli ve nasıl kısalır."
        ],
        "lead": "Değere ulaşma süresi, yeni bir müşterinin imza ile görüp adını koyabileceği ilk sonuç arasında beklediği süredir.",
        "body": [
          {
            "h": "Neden önemli"
          },
          {
            "p": "İlk yenileme görüşmesi imza günü başlar. Değeri birkaç haftada gören müşteri büyümeyi konuşur; hâlâ bekleyen müşteri fiyatı."
          },
          {
            "h": "Ekipler nasıl kısaltır"
          },
          {
            "ul": [
              "Açılış toplantısında tek bir ilk sonucu tarihiyle kararlaştırın.",
              "Satışın verdiği sözleri devredin; hiçbir şey iki kez sorulmasın.",
              "Planı müşteriyle paylaşın; böylece iki taraf da sonraki adımı görür."
            ]
          }
        ],
        "curahold": "Onboarding planlarının adımları, hedefleri ve tarihleri olur; seçtiğiniz adımlar müşteriyle portalında paylaşılabilir."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "Başarı planı",
        "seo": [
          "Müşteri başarı planı nedir? Bölümleri | Curahold",
          "Başarı planı müşterinin neye ulaşmak istediğini, iki tarafın oraya nasıl gideceğini ve ilerlemenin nasıl ölçüleceğini yazar; her görüşmede referans olur."
        ],
        "lead": "Başarı planı, müşterinin neye ulaşmak istediğini, iki tarafın atacağı adımları ve ilerlemenin nasıl ölçüleceğini yazar.",
        "body": [
          {
            "h": "Genellikle neleri içerir"
          },
          {
            "ul": [
              "Müşterinin kendi sözleriyle hedefleri.",
              "İki taraftaki adımlar, sorumlular ve tarihler.",
              "İlerlemeyi gösteren ölçüler."
            ]
          },
          {
            "h": "Nasıl kullanılır"
          },
          {
            "p": "Her görüşmenin ve iş değerlendirmesinin referansıdır. Birlikte güncellendiğinde iki tarafı aynı sonuca doğru çalıştırır."
          }
        ],
        "curahold": "Bir onboarding planı hedefleri, sorumlusu ve tarihi olan adımları ve izlediğiniz ölçüleri tutar; müşteriye yönelik adımları portalda paylaşılabilir."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "Paydaş haritası",
        "seo": [
          "Paydaş haritası nedir? B2B için kısa tanım | Curahold",
          "Paydaş haritası, müşteride bir karara etki eden kişileri, rollerini ve tutumlarını listeler; ekip kimi ne zaman sürece katacağını bilir."
        ],
        "lead": "Paydaş haritası, müşteride bir karara katılan kişileri, rollerini ve her birinin nerede durduğunu listeler.",
        "body": [
          {
            "h": "Neleri kaydeder"
          },
          {
            "ul": [
              "Her kişinin rolü ve etkisi.",
              "Tutumu: destekçi, tarafsız ya da engelleyici.",
              "Henüz tanışılmamış kişiler."
            ]
          },
          {
            "h": "Satıştan sonra neden önemli"
          },
          {
            "p": "Yenileme kararını nadiren tek kişi verir. Güçlü destekçi ayrıldığında harita, değeri başka kimin bildiğini ve kimin duyması gerektiğini gösterir."
          }
        ],
        "curahold": "Her fırsat paydaşlarını unvan ve tutumlarıyla tutar; bunlar devir kartıyla müşteriyi devralan ekibe geçer."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "Güçlü destekçi (champion)",
        "seo": [
          "B2B ilişkide champion (güçlü destekçi) nedir? | Curahold",
          "Champion, müşteri tarafında ürününüze inanan ve şirket içinde onu savunan kişidir. Neden önemli olduğu ve ayrıldığında ne yapılması gerektiği."
        ],
        "lead": "Güçlü destekçi (champion), müşteride sunduğunuz şeye inanan ve şirketinin içinde onu savunan kişidir.",
        "body": [
          {
            "h": "Neden önemli"
          },
          {
            "p": "Toplantıların ayarlanmasını, bütçenin korunmasını ve sorunların erken dile getirilmesini sağlar. Etkin bir destekçisi olan müşteriler daha kolay yeniler."
          },
          {
            "h": "Destekçi ayrıldığında"
          },
          {
            "ul": [
              "Onun işini kimin devraldığını öğrenin.",
              "Değeri kalanlara yeniden gösterin.",
              "Yeni bir destekçi bulunana kadar bunu risk sayın."
            ]
          }
        ],
        "curahold": "Güçlü bir destekçinin olması sağlık skorunda bir sinyal olabilir; destekçisi olmayan ya da destekçisi ayrılan müşteri öne çıkar."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "Satıştan müşteri başarısına devir",
        "seo": [
          "Satıştan müşteri başarısına devir rehberi | Curahold",
          "Satıştan müşteri başarısına devir verilen sözleri, önemli kişileri ve kilit tarihleri aktarır; müşteri hiçbir şeyi baştan anlatmak zorunda kalmaz."
        ],
        "lead": "Satıştan müşteri başarısına devir, sonraki ekibin ihtiyaç duyduğu her şeyi aktarır; müşteri hiçbir şeyi baştan anlatmak zorunda kalmaz.",
        "body": [
          {
            "h": "Neler aktarılmalı"
          },
          {
            "ul": [
              "Paydaşlar ve her birinin tutumu.",
              "Satış sırasında verilen sözler.",
              "Açık talepler ve ürün soruları.",
              "Kapanış tarihi ve yenileme tarihi."
            ]
          },
          {
            "h": "Ne ters gider"
          },
          {
            "p": "Satış görüşmesinde verilip kimsenin yazmadığı sözler. Müşteri hatırlar; yeni ekip hatırlamaz."
          }
        ],
        "curahold": "Kazanılan bir fırsat sonraki ekibe tek bir devir kartı olarak ulaşır: paydaşlar, verilen sözler, açık ürün talepleri ve kilit tarihler."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "Özellik talebi",
        "seo": [
          "B2B'de müşteri özellik talepleri nasıl yönetilir? | Curahold",
          "Özellik talebi, müşterinin ürünün henüz yapmadığı bir şeyi istemesidir. Nasıl kaydedilir, müşteriye nasıl bağlanır ve hazır olunca nasıl haber verilir."
        ],
        "lead": "Özellik talebi, müşterinin ürünün henüz yapmadığı bir şeyi istemesidir; çoğu zaman bir toplantıda ya da destek görüşmesinde gelir.",
        "body": [
          {
            "h": "İyi yönetmek için"
          },
          {
            "ul": [
              "Kimin istediğini ve onun için neden önemli olduğunu kaydedin.",
              "Aynı şeye dair talepleri birbirine bağlayın.",
              "Bekleyen müşterilere ve değere göre önceliklendirin."
            ]
          },
          {
            "h": "Döngüyü kapatmak"
          },
          {
            "p": "Çoğu ekibin atladığı kısım, iş tamamlandığında müşteriye haber vermektir. Bir sürüm notuyla yanıtlanan talep, özelliğin kendisinden daha çok güven kurar."
          }
        ],
        "curahold": "Birden çok müşteri talebi tek bir story’ye bağlanabilir; Backlog bekleyen müşterileri, değerlerini ve en yakın yenilemeyi gösterir, iş bitince sahibine gönderilmeye hazır bir taslak gelir."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "Temas noktası",
        "seo": [
          "Müşteri temas noktası nedir? Tanım ve örnekler | Curahold",
          "Temas noktası, müşteriyle ekibiniz arasındaki her temas anıdır: bir arama, bir toplantı, bir yanıt. Sayılarından çok ritimlerinin neden önemli olduğu."
        ],
        "lead": "Temas noktası, müşteriyle ekibiniz arasındaki her temas anıdır: bir arama, bir toplantı, bir e-posta ya da bir talebe verilen yanıt.",
        "body": [
          {
            "h": "Ritim neden önemli"
          },
          {
            "p": "Uzun sessizlikler erken bir uyarıdır. Altı haftadır kimsenin konuşmadığı bir müşteriyi yenilemek, her ay görüşülen birini yenilemekten daha zordur."
          },
          {
            "h": "Her birinden ne kalmalı"
          },
          {
            "ul": [
              "Ne zaman olduğu ve kimlerin katıldığı.",
              "Ne kararlaştırıldığı.",
              "Sorumlusu ve tarihi olan sonraki adım."
            ]
          }
        ],
        "curahold": "Toplantılar, aramalar ve notlar her müşterinin zaman çizelgesinde tutulur; son temastan bu yana geçen süre sağlık skoruna katılır ve her müşterinin bir görüşme ritmi olabilir."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "Toplantı takibi",
        "seo": [
          "Müşteri toplantısı takibi: sonraki adımlar | Curahold",
          "Toplantı takibi, müşteri toplantısında kararlaştırılanları sorumlusu ve tarihi olan işe dönüştürür; sözler tutulur ve müşteri bunun tutulduğunu görür."
        ],
        "lead": "Toplantı takibi, müşteri toplantısında kararlaştırılanları ayrıntılar unutulmadan sorumlusu ve tarihi olan işe dönüştürmektir.",
        "body": [
          {
            "h": "Neden kaçar"
          },
          {
            "p": "Sonraki adımlar birinin notlarında kalır. Bir hafta sonra kimin neyi yapacağını kimse hatırlamaz; bunu ilk müşteri fark eder."
          },
          {
            "h": "İyi bir takip nasıl görünür"
          },
          {
            "ul": [
              "Sonraki adımlar görüşme bitmeden yazılır.",
              "Her birinin sorumlusu ve tarihi olur.",
              "Müşteriye bunları teyit eden kısa bir not gider."
            ]
          }
        ],
        "curahold": "Bir toplantının notlarına yazılan sonraki adımlar, müşteriye bağlı, sorumlusu ve tarihi olan görevlere dönüşür; verilen sözler müşteriyle portalında paylaşılabilir."
      }
    ]
  },
  ar: {
    "title": "قوالب ومسرد لفرق العملاء",
    "lead": "قوالب يمكنك نسخها وتعريفات واضحة لعمل الحفاظ على العملاء: التجديدات ومراجعات الأعمال ومؤشر الصحة وفقدان العملاء.",
    "seo": [
      "قوالب ومسرد مصطلحات لفرق نجاح العملاء | Curahold",
      "قوالب مجانية لدليل التجديد ومراجعة الأعمال، وتعريفات واضحة لمؤشر الصحة وفقدان العملاء وتجديد العقود وبوابة العملاء."
    ],
    "templates": "القوالب",
    "glossary": "المسرد",
    "inCurahold": "في Curahold",
    "nav": [
      "القوالب والمسرد",
      "خطوات التجديد وجدول مراجعة الأعمال وتعريفات واضحة."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "قالب دليل التجديد",
        "seo": [
          "قالب دليل التجديد: خطوات قبل الموعد بـ90 يومًا | Curahold",
          "دليل تجديد يمكنك نسخه: ماذا تفعل قبل تجديد العقد بـ90 و75 و60 و30 يومًا، ومن المسؤول عن كل خطوة، وما الذي تراجعه قبل المكالمة."
        ],
        "lead": "يُكسب التجديد في الأشهر الثلاثة التي تسبق موعده، لا في يومه. انسخ هذه الخطوات، وعيّن لكل منها مسؤولًا، واحسبها رجوعًا من تاريخ التجديد.",
        "body": [
          {
            "h": "الخطوات"
          },
          {
            "ol": [
              "قبل 90 يومًا: راجع الاستخدام والطلبات المفتوحة ومؤشر الصحة، ودوّن كل ما يقلقك.",
              "قبل 75 يومًا: حدّد موعد مكالمة التجديد مع صاحب القرار ومع جهة الاتصال اليومية.",
              "قبل 60 يومًا: أرسل عرض التجديد مع أي تغيير في المقاعد أو الخطة.",
              "قبل 30 يومًا: تابع العرض وحسم الأسئلة المفتوحة كتابيًا.",
              "في يوم التجديد: أكّد التجديد الموقّع وسجّل ما تم الاتفاق عليه."
            ]
          },
          {
            "h": "قبل مكالمة التجديد"
          },
          {
            "ul": [
              "ما الذي أراد العميل تحقيقه هذا العام، وهل حققه؟",
              "أي الوعود من الاجتماعات السابقة ما زالت مفتوحة؟",
              "من يتخذ القرار، وهل حضر اجتماعًا معك مؤخرًا؟"
            ]
          }
        ],
        "curahold": "فعّل التجديدات، وسيفتح دليل التجديد خطواته مهامَّ قبل كل تاريخ تجديد بتسعين يومًا، لكل منها مسؤول وتاريخ استحقاق محسوب رجوعًا من التجديد."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "قالب جدول مراجعة الأعمال (QBR)",
        "seo": [
          "قالب جدول أعمال مراجعة الأعمال الفصلية (QBR) | Curahold",
          "جدول أعمال لمراجعة أعمال مدتها ساعة: النتائج مقابل الأهداف، وما تغيّر، والوعود المفتوحة، وخطة الربع القادم، وخطوات تالية واضحة."
        ],
        "lead": "ينبغي أن تترك مراجعة الأعمال الفصلية لدى العميل دليلًا على القيمة، ولدى الطرفين الخطوات التالية نفسها. هذا الجدول يتسع في ساعة واحدة.",
        "body": [
          {
            "h": "جدول الأعمال (60 دقيقة)"
          },
          {
            "ol": [
              "5 دقائق: أهداف الاجتماع ومن يحضره.",
              "15 دقيقة: النتائج مقابل الأهداف التي حُددت في الربع الماضي.",
              "10 دقائق: ما تغيّر لدى العميل: الأشخاص والأولويات والميزانية.",
              "10 دقائق: الطلبات والوعود المفتوحة وحالة كل منها.",
              "15 دقيقة: خطة الربع القادم.",
              "5 دقائق: الخطوات التالية، لكل منها مسؤول وتاريخ."
            ]
          },
          {
            "h": "بعد الاجتماع"
          },
          {
            "p": "أرسل ملخصًا قصيرًا في اليوم نفسه: ما تم الاتفاق عليه، والخطوات التالية بمسؤوليها وتواريخها، وموعد المراجعة القادمة."
          }
        ],
        "curahold": "سجّل المراجعة اجتماعًا على العميل واكتب خطواتها التالية؛ عند الحفظ تصبح كل خطوة مهمة لها مسؤول وتاريخ، ويمكنك مشاركتها في بوابة العميل."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "قائمة تحقق لتسليم العميل من المبيعات إلى فريق التأهيل",
        "seo": [
          "قائمة تحقق التسليم من المبيعات إلى التأهيل | Curahold",
          "قائمة تحقق لتسليم الصفقات الرابحة: من هم أصحاب المصلحة، وما الذي وُعد به أثناء البيع، والطلبات المفتوحة، والتواريخ المهمة، وأول مكالمة مع العميل."
        ],
        "lead": "تبدأ معظم مشكلات الأشهر الأولى مع العميل عند التسليم: يعرف فريق المبيعات أمورًا لا تصل أبدًا إلى فريق التأهيل. انسخ هذه القائمة واملأها قبل أن تنتقل الصفقة إلى الفريق التالي.",
        "body": [
          {
            "h": "ما يجب أن ينتقل مع التسليم"
          },
          {
            "ul": [
              "أصحاب المصلحة: صاحب القرار، وجهة الاتصال اليومية، والمؤيد لدى العميل، وطريقة الوصول إلى كل منهم.",
              "الوعود التي قُطعت أثناء البيع: الميزات والتواريخ والخصومات، وكل ما قيل كتابةً أو في مكالمة.",
              "طلبات المنتج المفتوحة التي ينتظرها العميل، وما قيل له بشأنها.",
              "التواريخ المهمة: تاريخ الإغلاق، وموعد بدء التشغيل الذي يتوقعه، وتاريخ التجديد.",
              "سبب الشراء: المشكلة التي يريد حلها، وكيف سيحكم على النجاح."
            ]
          },
          {
            "h": "قبل المكالمة الأولى"
          },
          {
            "ol": [
              "يقرأ مندوب المبيعات ومسؤول التأهيل القائمة معًا في 15 دقيقة.",
              "أي نقطة غير واضحة تعود إلى مندوب المبيعات، لا إلى العميل.",
              "تبدأ المكالمة الأولى بإعادة هدف العميل بكلماته هو."
            ]
          }
        ],
        "curahold": "عند الفوز بصفقة، يستطيع Curahold تجهيز بطاقة تسليم للفريق التالي تضم أصحاب المصلحة والوعود المقطوعة وطلبات المنتج المفتوحة وتاريخَي الإغلاق والتجديد، وتبقى البطاقة بانتظار أن يؤكدها مسؤولها الجديد."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "قالب جدول مؤشر صحة العميل",
        "seo": [
          "قالب مؤشر صحة العميل: الإشارات والنقاط والحدود | Curahold",
          "جدول لمؤشر الصحة يمكنك نسخه: ست إشارات يستطيع الفريق ملاحظتها، والنقاط التي تضيفها كل إشارة أو تخصمها، والحدود التي تبيّن من يحتاج إلى اهتمام."
        ],
        "lead": "لا يفيد مؤشر الصحة إلا إذا وثق به الفريق، والفريق يثق بمؤشر يستطيع تفسيره. ابدأ بإشارات قليلة تراها بنفسك، وأعطِ كلًّا منها وزنًا، واكتب السبب.",
        "body": [
          {
            "h": "الإشارات والنقاط (ابدأ من 50)"
          },
          {
            "ul": [
              "تواصلت مع العميل خلال آخر 30 يومًا: أضف 15. لا تواصل منذ 60 يومًا: اخصم 20.",
              "لدى العميل مؤيد يرد على الرسائل: أضف 15. غادر المؤيد: اخصم 25.",
              "عمل موعود متأخر: اخصم 10 عن كل بند، بحد أقصى 30.",
              "عوائق أو طلبات دعم مفتوحة منذ أكثر من أسبوعين: اخصم 10.",
              "الاستخدام ثابت أو في ازدياد: أضف 10. في انخفاض منذ شهرين: اخصم 15.",
              "التجديد بعد أقل من 90 يومًا دون مكالمة محددة: اخصم 10."
            ]
          },
          {
            "h": "الحدود"
          },
          {
            "ul": [
              "70 فأكثر: سليم؛ حافظ على الإيقاع.",
              "من 40 إلى 69: يحتاج إلى متابعة؛ اعرف السبب هذا الأسبوع.",
              "أقل من 40: في خطر؛ يتصل المسؤول بالعميل ويُبلَّغ قائد الفريق."
            ]
          },
          {
            "p": "راجع الأوزان كل ربع سنة مقارنةً بالعملاء الذين خسرتهم فعلًا والذين احتفظت بهم، وغيّر ما أخطأ التقدير منها."
          }
        ],
        "curahold": "لكل عميل مؤشر من 0 إلى 100 مبني على قواعد تحددها أنت، مع قائمة بأسبابه واتجاهه خلال آخر ثلاثين يومًا."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "مؤشر صحة العميل",
        "seo": [
          "ما هو مؤشر صحة العميل؟ تعريف واضح ومختصر | Curahold",
          "يلخّص مؤشر صحة العميل حال العلاقة مع العميل في رقم واحد، مبني على إشارات مثل آخر تواصل والأعمال المتأخرة والمشكلات المفتوحة."
        ],
        "lead": "مؤشر صحة العميل رقم واحد، غالبًا من 0 إلى 100، يلخّص مدى جودة العلاقة مع العميل.",
        "body": [
          {
            "p": "يُبنى من إشارات يستطيع الفريق ملاحظتها: متى تحدّث أحد مع العميل آخر مرة، وهل تأخرت أعمال وُعد بها، وهل لدى العميل داعم قوي، والعوائق المفتوحة وطلبات الدعم. كل إشارة تضيف نقاطًا أو تنقصها."
          },
          {
            "h": "لماذا يهم"
          },
          {
            "p": "محفظة من عشرات العملاء تُخفي العميل الذي يبتعد بصمت. المؤشر يرتّبهم، فيذهب الاهتمام أولًا إلى من يكون تجديده في خطر."
          },
          {
            "h": "ما الذي يجعل المؤشر جيدًا"
          },
          {
            "ul": [
              "يشرح نفسه: يرى الجميع الإشارات التي غيّرته.",
              "يعتمد على إشارات يثق بها الفريق ويستطيع التصرف بناءً عليها.",
              "يُتابَع مع الوقت، لا يُقرأ مرة واحدة."
            ]
          }
        ],
        "curahold": "لكل عميل مؤشر من 0 إلى 100 مبني على قواعد تحددها أنت، مع قائمة بأسبابه واتجاهه خلال آخر ثلاثين يومًا."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "فقدان العملاء (Churn)",
        "seo": [
          "فقدان العملاء (Churn): التعريف والإشارات المبكرة | Curahold",
          "فقدان العملاء هو نسبة العملاء أو الإيرادات التي تُفقد خلال فترة. ما الذي يُعد فقدانًا، وكيف يُقاس، وما الإشارات المبكرة التي تسبقه."
        ],
        "lead": "فقدان العملاء هو أن يتوقف العميل عن الشراء: يلغي أو لا يجدّد. ومعدل الفقدان هو نسبة العملاء، أو الإيرادات، المفقودة خلال فترة ما.",
        "body": [
          {
            "h": "كيف يُقاس"
          },
          {
            "ul": [
              "فقدان العملاء: العملاء المفقودون خلال الفترة مقسومين على عدد العملاء في بدايتها.",
              "فقدان الإيرادات: الإيرادات المتكررة المفقودة بالإلغاء أو خفض الخطة مقسومة على الإيرادات المتكررة في البداية."
            ]
          },
          {
            "h": "الإشارات التي تسبقه"
          },
          {
            "p": "نادرًا ما يأتي الفقدان دون إنذار: يقلّ التواصل، وتتأخر الأعمال الموعودة، ويغادر الداعم، وتتراكم طلبات الدعم. متابعة هذه الإشارات تتيح للفريق أن يتحرك قبل موعد التجديد."
          }
        ],
        "curahold": "تدخل مثل هذه الإشارات في مؤشر صحة كل عميل، فيظهر العملاء الذين يبتعدون قبل موعد تجديدهم بوقت طويل."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "تجديد العقد",
        "seo": [
          "ما هو تجديد العقد؟ الخطوات والتوقيت المناسب | Curahold",
          "يمدّد تجديد العقد اتفاقية العميل لفترة جديدة. متى تبدأ، وكيف تبدو عملية التجديد، ولماذا تبدأ قبل الموعد بأشهر."
        ],
        "lead": "يمدّد تجديد العقد اتفاقية العميل لفترة أخرى، وغالبًا مع تغييرات: مقاعد أكثر، أو خطة مختلفة، أو سعر جديد.",
        "body": [
          {
            "h": "متى يبدأ"
          },
          {
            "p": "في العقد السنوي يبدأ العمل عادةً قبل الموعد بنحو تسعين يومًا. يترك ذلك وقتًا لمراجعة القيمة المقدَّمة، ولقاء صاحب القرار، وإرسال العرض، وحسم الأسئلة دون استعجال."
          },
          {
            "h": "ما الذي يسوء عادةً"
          },
          {
            "ul": [
              "يُنتبه إلى الموعد متأخرًا جدًا.",
              "غادر الشخص الذي وقّع العقد.",
              "ما زالت وعود قُطعت خلال العام مفتوحة."
            ]
          }
        ],
        "curahold": "يمكن للتجديد أن يفتح دليله قبل الموعد بتسعين يومًا، مهامَّ لها مسؤولون وتواريخ، مع فرصة تجديد في مسار المبيعات."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "بوابة العملاء",
        "seo": [
          "ما هي بوابة العملاء؟ التعريف والاستخدامات | Curahold",
          "بوابة العملاء مكان خاص يرى فيه العميل العمل الذي تمت مشاركته معه، ويرفع طلباته ويقرأ الردود، بدل ملاحقة سلاسل البريد."
        ],
        "lead": "بوابة العملاء صفحة ويب خاصة يرى فيها العميل العمل الذي تمت مشاركته معه، ويرفع طلباته، ويقرأ ردود الفريق.",
        "body": [
          {
            "h": "لماذا تستخدمها الفرق"
          },
          {
            "p": "تحلّ محل رسائل متابعة الحالة. يرى العميل التقدم متى شاء، وتصل طلباته إلى مكان واحد بدل سلاسل متفرقة."
          },
          {
            "h": "ما الذي تشاركه"
          },
          {
            "ul": [
              "خطوات التأهيل وتواريخها.",
              "المهام التي وُعد بها في الاجتماعات.",
              "الردود على طلباته."
            ]
          }
        ],
        "curahold": "يدخل العملاء برابط في بريدهم ولا يرون إلا ما تشاركه، وتصل الطلبات التي يرفعونها إلى لوحة فريقك."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "تأهيل العملاء",
        "seo": [
          "ما هو تأهيل العملاء؟ الخطوات والأهداف | Curahold",
          "تأهيل العملاء هو العمل الذي ينقل العميل الجديد من التوقيع إلى أول قيمة: التسليم من المبيعات، والإعداد، والتدريب، وأولى النتائج التي يراها بنفسه."
        ],
        "lead": "تأهيل العملاء هو الفترة الممتدة بين التوقيع واللحظة التي يحصل فيها العميل الجديد على القيمة التي اشتراها، والعمل الذي يقوم به الفريق لتقصيرها.",
        "body": [
          {
            "h": "ما الذي يشمله عادةً"
          },
          {
            "ul": [
              "التسليم من المبيعات مع ما وُعد به.",
              "اجتماع انطلاق يُتفق فيه على الأهداف والتواريخ.",
              "الإعداد واستيراد البيانات والتدريب.",
              "نتيجة أولى يراها العميل ويستطيع تسميتها."
            ]
          },
          {
            "h": "لماذا يهم"
          },
          {
            "p": "العملاء الذين يرون القيمة مبكرًا يميلون إلى البقاء، أما التأهيل الذي يطول فيجعل أول حديث عن التجديد يبدأ بالشك."
          }
        ],
        "curahold": "إذا كان لديك فريق تأهيل، تصله الصفقة الرابحة في بطاقة تسليم واحدة تضم أصحاب المصلحة والوعود المقطوعة والطلبات المفتوحة والتواريخ المهمة، ويمكن مشاركة مهامها مع العميل في بوابته."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "تكلفة الخدمة",
        "seo": [
          "ما هي تكلفة الخدمة؟ تعريف لفرق خدمة العملاء | Curahold",
          "تكلفة الخدمة هي ما تتطلبه رعاية عميل ما من ساعات أو مال مقارنةً بما يدفعه. كيف تُقاس، وماذا تفعل بنتيجتها قبل موعد التجديد."
        ],
        "lead": "تكلفة الخدمة هي الجهد الذي يبذله الفريق في رعاية عميل ما، مقارنةً بما يدفعه هذا العميل.",
        "body": [
          {
            "h": "كيف تُقاس"
          },
          {
            "p": "أبسط مقياس هو الساعات: الوقت الذي سجّله الفريق على العميل خلال الاثني عشر شهرًا الماضية، مقسومًا على قيمة عقده السنوية. ومقارنة جميع العملاء بالمقياس نفسه تكشف من يحصل على أكبر قدر من الرعاية مقابل ما يدفعه."
          },
          {
            "h": "ماذا تفعل بالنتيجة"
          },
          {
            "ul": [
              "ابحث عن العمل الذي يقف وراء الرقم المرتفع: طلبات متكررة، أو ميزة ناقصة، أو فجوة في التدريب.",
              "عالج السبب قبل التجديد، أو أدرج الخدمة الإضافية في سعره.",
              "لا تحكم على العميل بهذا الرقم وحده، فالعميل كثير المطالب قد يكون أيضًا أفضل مرجع لك."
            ]
          }
        ],
        "curahold": "يعرض تقرير تكلفة الخدمة لكل عميل الساعات المستغرقة في آخر 12 شهرًا لكل 1,000 من القيمة السنوية، فترى من الأكثر تكلفة في الرعاية."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "صافي الاحتفاظ بالإيرادات (NRR)",
        "seo": [
          "ما صافي الاحتفاظ بالإيرادات (NRR)؟ وكيف يُحسب | Curahold",
          "يوضح صافي الاحتفاظ بالإيرادات كم تجلب مجموعة من العملاء من إيرادات متكررة بعد عام، مع احتساب التجديد والتوسع والتخفيض والفقد."
        ],
        "lead": "صافي الاحتفاظ بالإيرادات (NRR) هو الإيراد المتكرر الذي تجلبه مجموعة من العملاء اليوم، منسوبًا إلى ما جلبه العملاء أنفسهم قبل عام.",
        "body": [
          {
            "h": "كيف يُحسب"
          },
          {
            "p": "خذوا الإيراد المتكرر للعملاء الموجودين في بداية الفترة، وأضيفوا ما توسعوا فيه، واطرحوا التخفيضات والفقد، ثم اقسموا الناتج على نقطة البداية. لا يدخل العملاء الجدد في الحساب."
          },
          {
            "h": "لماذا تتابعه الفرق"
          },
          {
            "ul": [
              "فوق 100% يعني أن العملاء الحاليين ينمون من تلقاء أنفسهم.",
              "يبيّن ما إذا كان التجديد والتوسع يفوقان الخسائر.",
              "يتحرك ببطء، فيكافئ العمل المنتظم مع العملاء."
            ]
          }
        ],
        "curahold": "تقع فرص التجديد والتوسع في مسار المبيعات نفسه مع الصفقات الجديدة، وتعرض شاشة التجديدات كل عميل حسب شهر تجديده مع المبلغ المعرّض للخطر."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "الإيرادات السنوية المتكررة (ARR)",
        "seo": [
          "ما الإيرادات السنوية المتكررة (ARR)؟ تعريف موجز | Curahold",
          "الإيرادات السنوية المتكررة هي القيمة السنوية للاشتراكات الموقّعة: ما الذي يُحتسب وما الذي لا يُحتسب، وكيف تستخدمها الفرق لكل عميل."
        ],
        "lead": "الإيرادات السنوية المتكررة (ARR) هي القيمة السنوية للاشتراكات السارية: ما سيدفعه العملاء خلال اثني عشر شهرًا إن لم يتغير شيء.",
        "body": [
          {
            "h": "ما الذي يُحتسب"
          },
          {
            "ul": [
              "رسوم الاشتراك محوّلة إلى مبلغ سنوي.",
              "الإضافات المتكررة والمقاعد الإضافية.",
              "لا تُحتسب الرسوم لمرة واحدة مثل الإعداد أو التدريب."
            ]
          },
          {
            "h": "لماذا تهم لكل عميل"
          },
          {
            "p": "تُظهر قيمتها لدى كل عميل أين يقع الإيراد، فيمنح الفريق أكبر التجديدات ما تحتاجه من اهتمام، ويرى حجم المبلغ المعرّض للخطر حين يصمت عميل."
          }
        ],
        "curahold": "يمكن أن تكون ARR حقلًا لدى كل عميل، ويجمعها التقرير حسب المسؤول أو نطاق مؤشر الصحة أو شهر التجديد، وفق صلاحيات كل قارئ."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "مراجعة الأعمال (QBR)",
        "seo": [
          "ما مراجعة الأعمال (QBR)؟ الغرض وجدول الأعمال | Curahold",
          "مراجعة الأعمال اجتماع منتظم يراجع فيه العميل والمورّد النتائج والوعود المفتوحة والخطة القادمة، وتُعقد عادةً مرة كل ربع سنة."
        ],
        "lead": "مراجعة الأعمال، وغالبًا ما تكون ربع سنوية وتُعرف باسم QBR، اجتماع يراجع فيه العميل والمورّد النتائج ويتفقان على الخطة القادمة.",
        "body": [
          {
            "h": "ما الذي تغطيه"
          },
          {
            "ul": [
              "النتائج مقارنةً بالأهداف التي حُددت في المرة السابقة.",
              "ما تغيّر لدى العميل.",
              "الطلبات والوعود المفتوحة وحالة كل منها.",
              "خطة الفترة القادمة والمسؤولون عنها."
            ]
          },
          {
            "h": "ما الذي يجعلها مفيدة"
          },
          {
            "p": "أن تنتهي بخطوات تالية لها مسؤولون وتواريخ. المراجعة التي لا تُدوَّن إجراءاتها تُنسى قبل المراجعة التالية."
          }
        ],
        "curahold": "مراجعة الأعمال اجتماع على الخط الزمني للعميل، والخطوات التالية المكتوبة فيه تتحول إلى مهام لها مسؤول وتاريخ."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "ما دور Customer Success Manager (CSM)؟ المهام | Curahold",
          "يتولى Customer Success Manager مجموعة من العملاء بعد البيع: التأهيل والاستخدام ومراجعات الأعمال والتجديدات واكتشاف المخاطر مبكرًا."
        ],
        "lead": "يتولى Customer Success Manager (CSM) مجموعة من العملاء بعد البيع، ليحصلوا على القيمة التي اشتروها ويبقوا.",
        "body": [
          {
            "h": "ما الذي يشمله الدور عادةً"
          },
          {
            "ul": [
              "تأهيل العملاء الجدد، أو استلامهم من فريق التأهيل.",
              "لقاءات متابعة منتظمة ومراجعات أعمال.",
              "مراقبة الصحة والتحرك عند الإنذارات المبكرة.",
              "التحضير للتجديدات ورصد فرص النمو."
            ]
          },
          {
            "h": "أين يذهب الوقت"
          },
          {
            "p": "كثيرًا ما يتولى CSM عشرات العملاء. ومعرفة من منهم يحتاج إلى الاهتمام هذا الأسبوع أهم من توزيع الوقت على الجميع بالتساوي."
          }
        ],
        "curahold": "لكل عميل مسؤول في كل قسم، وقائمة كل شخص مرتبة حسب من يحتاج إليه، مع السبب والخطوة التالية."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "إيرادات التوسع",
        "seo": [
          "ما إيرادات التوسع؟ البيع الإضافي والبيع المتقاطع | Curahold",
          "إيرادات التوسع هي الإيرادات المتكررة الإضافية من العملاء الحاليين: مقاعد أكثر أو خطة أعلى أو منتج آخر. من أين تأتي وكيف تجدها الفرق."
        ],
        "lead": "إيرادات التوسع هي الإيرادات المتكررة الإضافية التي تأتي من عملاء لديكم بالفعل: مقاعد أكثر، أو خطة أعلى، أو منتج آخر.",
        "body": [
          {
            "h": "من أين تأتي"
          },
          {
            "ul": [
              "البيع الإضافي: مزيد مما يستخدمونه أو خطة أعلى.",
              "البيع المتقاطع: منتج لا يملكونه بعد.",
              "نموهم هم: فرق أو فروع أو دول جديدة."
            ]
          },
          {
            "h": "متى يُطرح الأمر"
          },
          {
            "p": "يأتي التوسع بعد القيمة. يكون أسهل بعد نتيجة يستطيع العميل تسميتها، وأصعب حين تبقى وعود الطلب الأخير مفتوحة."
          }
        ],
        "curahold": "تعرض شاشة المنتجات أي عميل لديه أي منتج، فتظهر الفجوات، وفتح مهمة لإحداها يحتاج نقرة واحدة."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "الوقت حتى تحقيق القيمة",
        "seo": [
          "ما الوقت حتى تحقيق القيمة؟ التعريف وطرق تقليصه | Curahold",
          "الوقت حتى تحقيق القيمة هو المدة بين توقيع العميل الجديد وأول نتيجة يستطيع تسميتها. لماذا يهم للتجديد وكيف تقلّصه الفرق."
        ],
        "lead": "الوقت حتى تحقيق القيمة هو المدة التي ينتظرها العميل الجديد بين التوقيع وأول نتيجة يراها ويستطيع تسميتها.",
        "body": [
          {
            "h": "لماذا يهم"
          },
          {
            "p": "يبدأ حديث التجديد الأول يوم التوقيع. العميل الذي يرى القيمة خلال أسابيع يتحدث عن النمو، ومن لا يزال ينتظر يتحدث عن السعر."
          },
          {
            "h": "كيف تقلّصه الفرق"
          },
          {
            "ul": [
              "الاتفاق في اجتماع الانطلاق على نتيجة أولى واحدة بتاريخ محدد.",
              "تسليم ما وعدت به المبيعات حتى لا يُسأل العميل مرتين.",
              "مشاركة الخطة مع العميل ليرى الطرفان الخطوة التالية."
            ]
          }
        ],
        "curahold": "لخطط التأهيل خطوات وأهداف وتواريخ، ويمكن مشاركة الخطوات التي تختارونها مع العميل في بوابته."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "خطة النجاح",
        "seo": [
          "ما خطة نجاح العميل؟ مكوّناتها وطريقة استخدامها | Curahold",
          "تدوّن خطة النجاح ما يريد العميل تحقيقه، وكيف سيصل الطرفان إليه، وكيف يُقاس التقدم، لتكون مرجعًا في كل لقاء ومراجعة."
        ],
        "lead": "تدوّن خطة النجاح ما يريد العميل تحقيقه، والخطوات التي سيتخذها الطرفان، وكيف سيُقاس التقدم.",
        "body": [
          {
            "h": "ما الذي تحتويه عادةً"
          },
          {
            "ul": [
              "أهداف العميل بكلماته هو.",
              "الخطوات والمسؤولون والتواريخ لدى الطرفين.",
              "المقاييس التي تُظهر التقدم."
            ]
          },
          {
            "h": "كيف تُستخدم"
          },
          {
            "p": "هي المرجع في كل لقاء متابعة ومراجعة أعمال. وحين تُحدَّث معًا تُبقي الطرفين يعملان نحو النتيجة نفسها."
          }
        ],
        "curahold": "تحتوي خطة التأهيل على الأهداف، والخطوات بمسؤوليها وتواريخها، والمقاييس التي تتابعونها، ويمكن مشاركة الخطوات الموجّهة للعميل في البوابة."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "خريطة أصحاب المصلحة",
        "seo": [
          "ما خريطة أصحاب المصلحة في المبيعات ونجاح العملاء؟ | Curahold",
          "تسرد خريطة أصحاب المصلحة الأشخاص المؤثرين في قرار لدى العميل وأدوارهم ومواقفهم، ليعرف الفريق من يُشرك ومتى."
        ],
        "lead": "تسرد خريطة أصحاب المصلحة الأشخاص الذين يشاركون في قرار لدى العميل، وأدوارهم، وموقف كل منهم.",
        "body": [
          {
            "h": "ما الذي تسجّله"
          },
          {
            "ul": [
              "دور كل شخص ومدى تأثيره.",
              "موقفه: داعم أو محايد أو معارض.",
              "من لم يُلتقَ به بعد."
            ]
          },
          {
            "h": "لماذا تهم بعد البيع"
          },
          {
            "p": "نادرًا ما يتخذ شخص واحد قرار التجديد. وحين يغادر الداعم الأبرز، تُظهر الخريطة من غيره يعرف القيمة ومن يحتاج إلى سماعها."
          }
        ],
        "curahold": "تحتفظ كل صفقة بأصحاب المصلحة مع مسمياتهم ومواقفهم، وينتقلون مع بطاقة التسليم إلى الفريق الذي يتسلّم العميل."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "الداعم الأبرز (Champion)",
        "seo": [
          "من هو الداعم الأبرز (Champion) لدى العميل؟ | Curahold",
          "الداعم الأبرز هو الشخص لدى العميل الذي يؤمن بمنتجكم ويدافع عنه داخل شركته. لماذا يهم وجوده، وماذا تفعلون حين يغادر."
        ],
        "lead": "الداعم الأبرز هو الشخص لدى العميل الذي يؤمن بما تقدّمونه ويدافع عنه داخل شركته.",
        "body": [
          {
            "h": "لماذا يهم"
          },
          {
            "p": "يحجز الاجتماعات، ويدافع عن الميزانية، ويطرح المشكلات مبكرًا. والعملاء الذين لديهم داعم نشط يجدّدون بسهولة أكبر."
          },
          {
            "h": "حين يغادر الداعم"
          },
          {
            "ul": [
              "اعرفوا من يتولى الجزء الذي كان يقوم به.",
              "أظهروا القيمة من جديد لمن بقي.",
              "تعاملوا مع الأمر كخطر إلى أن يظهر داعم جديد."
            ]
          }
        ],
        "curahold": "يمكن أن يكون وجود داعم أبرز إشارة في مؤشر الصحة، فيتقدّم العميل الذي لا داعم له أو غادره داعمه."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "التسليم من المبيعات إلى نجاح العملاء",
        "seo": [
          "التسليم من المبيعات إلى نجاح العملاء: ماذا يُنقل | Curahold",
          "ينقل التسليم من المبيعات إلى نجاح العملاء ما وُعد به ومن يهم من الأشخاص والتواريخ الأساسية، فلا يضطر العميل إلى إعادة الشرح."
        ],
        "lead": "ينقل التسليم من المبيعات إلى نجاح العملاء كل ما يحتاجه الفريق التالي، فلا يضطر العميل إلى شرح كل شيء من جديد.",
        "body": [
          {
            "h": "ما الذي يُنقل"
          },
          {
            "ul": [
              "أصحاب المصلحة وموقف كل منهم.",
              "ما وُعد به خلال البيع.",
              "الطلبات المفتوحة وأسئلة المنتج.",
              "تاريخ الإغلاق وتاريخ التجديد."
            ]
          },
          {
            "h": "ما الذي يسوء"
          },
          {
            "p": "وعود قُطعت في مكالمة بيع ولم يدوّنها أحد. العميل يتذكرها، والفريق الجديد لا يعرفها."
          }
        ],
        "curahold": "تصل الصفقة الرابحة إلى الفريق التالي في بطاقة تسليم واحدة تضم أصحاب المصلحة والوعود المقطوعة وطلبات المنتج المفتوحة والتواريخ الأساسية."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "طلب ميزة",
        "seo": [
          "كيف تُدار طلبات الميزات من العملاء في B2B؟ | Curahold",
          "طلب الميزة هو أن يطلب العميل شيئًا لا يقوم به المنتج بعد. كيف يُسجَّل، ويُربط بالعميل، ويُبلَّغ العميل حين يصبح جاهزًا."
        ],
        "lead": "طلب الميزة هو أن يطلب العميل شيئًا لا يقوم به المنتج بعد، وغالبًا ما يأتي في اجتماع أو محادثة دعم.",
        "body": [
          {
            "h": "كيف تُدار جيدًا"
          },
          {
            "ul": [
              "سجّلوا من طلبها ولماذا تهمه.",
              "اربطوا الطلبات المتعلقة بالأمر نفسه معًا.",
              "رتّبوها حسب العملاء المنتظرين والقيمة."
            ]
          },
          {
            "h": "إغلاق الحلقة"
          },
          {
            "p": "الجزء الذي تغفله معظم الفرق هو إبلاغ العميل حين يكتمل العمل. والطلب الذي يُجاب بملاحظة إصدار يبني ثقة أكثر من الميزة نفسها."
          }
        ],
        "curahold": "يمكن ربط عدة طلبات من العملاء بقصة واحدة، وتعرض قائمة الأعمال المتراكمة العملاء المنتظرين وقيمتهم وأقرب تجديد، وحين يكتمل العمل تصل إلى المسؤول مسودة جاهزة للإرسال."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "نقطة التواصل",
        "seo": [
          "ما نقطة التواصل مع العميل؟ التعريف وأمثلة | Curahold",
          "نقطة التواصل هي أي لحظة تواصل بين العميل وفريقكم: مكالمة أو اجتماع أو رد. لماذا يهم إيقاعها أكثر من عددها."
        ],
        "lead": "نقطة التواصل هي أي لحظة تواصل بين العميل وفريقكم: مكالمة، أو اجتماع، أو بريد، أو رد على طلب.",
        "body": [
          {
            "h": "لماذا يهم الإيقاع"
          },
          {
            "p": "فترات الصمت الطويلة إنذار مبكر. فالعميل الذي لم يتحدث إليه أحد منذ ستة أسابيع أصعب تجديدًا من عميل يُلتقى به كل شهر."
          },
          {
            "h": "ما الذي يُحفظ من كل نقطة"
          },
          {
            "ul": [
              "متى حدثت ومن شارك فيها.",
              "ما الذي تقرّر.",
              "الخطوة التالية بمسؤولها وتاريخها."
            ]
          }
        ],
        "curahold": "تُحفظ الاجتماعات والمكالمات والملاحظات على الخط الزمني لكل عميل، وتدخل المدة منذ آخر تواصل في مؤشر الصحة، ويمكن أن يكون لكل عميل إيقاع مراجعة."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "متابعة الاجتماع",
        "seo": [
          "متابعة اجتماعات العملاء: خطوات تالية تُنفَّذ | Curahold",
          "تحوّل متابعة الاجتماع ما اتُّفق عليه مع العميل إلى عمل له مسؤول وتاريخ، فتُحفظ الوعود ويرى العميل أنها محفوظة."
        ],
        "lead": "متابعة الاجتماع هي تحويل ما اتُّفق عليه في اجتماع العميل إلى عمل له مسؤول وتاريخ، قبل أن تتلاشى التفاصيل.",
        "body": [
          {
            "h": "لماذا تفلت"
          },
          {
            "p": "تبقى الخطوات التالية في ملاحظات شخص ما. وبعد أسبوع لا يتذكر أحد من قال إنه سيفعل ماذا، والعميل أول من يلاحظ."
          },
          {
            "h": "كيف تبدو المتابعة الجيدة"
          },
          {
            "ul": [
              "تُكتب الخطوات التالية قبل انتهاء المكالمة.",
              "لكل منها مسؤول وتاريخ.",
              "ملاحظة قصيرة إلى العميل تؤكدها."
            ]
          }
        ],
        "curahold": "تتحول الخطوات التالية المكتوبة في ملاحظات الاجتماع إلى مهام لها مسؤول وتاريخ ومرتبطة بالعميل، ويمكن مشاركة الوعود مع العميل في بوابته."
      }
    ]
  },
  he: {
    "title": "תבניות ומילון לצוותי לקוחות",
    "lead": "תבניות שאפשר להעתיק והגדרות פשוטות לעבודה של שימור לקוחות: חידושים, סקירות עסקיות, ציון בריאות ונטישה.",
    "seo": [
      "תבניות ומילון מונחים להצלחת לקוחות | Curahold",
      "תבניות חינמיות לפלייבוק חידוש ולסקירה עסקית, והגדרות פשוטות לציון בריאות, נטישה, חידוש חוזה ופורטל לקוחות."
    ],
    "templates": "תבניות",
    "glossary": "מילון",
    "inCurahold": "ב-Curahold",
    "nav": [
      "תבניות ומילון",
      "שלבי חידוש, סדר יום לסקירה והגדרות פשוטות."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "תבנית פלייבוק לחידוש",
        "seo": [
          "תבנית פלייבוק לחידוש: שלבים מתשעים יום לפני | Curahold",
          "פלייבוק חידוש שאפשר להעתיק: מה עושים 90, 75, 60 ו-30 יום לפני שחוזה מתחדש, מי אחראי לכל שלב ומה בודקים לפני השיחה."
        ],
        "lead": "חידוש נוצח בשלושת החודשים שלפני התאריך, לא בתאריך עצמו. העתיקו את השלבים, תנו לכל אחד אחראי וספרו אותם אחורה מתאריך החידוש.",
        "body": [
          {
            "h": "השלבים"
          },
          {
            "ol": [
              "90 יום לפני: בדקו שימוש, בקשות פתוחות וציון בריאות, ורשמו כל מה שמדאיג אתכם.",
              "75 יום לפני: קבעו שיחת חידוש עם מקבל ההחלטות ועם איש הקשר היומיומי.",
              "60 יום לפני: שלחו הצעת חידוש, עם כל שינוי במושבים או בתוכנית.",
              "30 יום לפני: עקבו אחרי ההצעה וסגרו שאלות פתוחות בכתב.",
              "ביום החידוש: אשרו את החידוש החתום ותעדו את מה שסוכם."
            ]
          },
          {
            "h": "לפני שיחת החידוש"
          },
          {
            "ul": [
              "מה הלקוח רצה להשיג השנה, והאם השיג?",
              "אילו הבטחות מפגישות קודמות עדיין פתוחות?",
              "מי מחליט, והאם השתתף לאחרונה בפגישה איתכם?"
            ]
          }
        ],
        "curahold": "הפעילו חידושים, ופלייבוק חידוש יפתח את השלבים שלו כמשימות תשעים יום לפני כל תאריך חידוש, לכל אחת אחראי ותאריך יעד שנספר אחורה מהחידוש."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "תבנית סדר יום לסקירה עסקית (QBR)",
        "seo": [
          "תבנית סדר יום לסקירה עסקית רבעונית (QBR) | Curahold",
          "סדר יום של שעה לסקירה עסקית: תוצאות מול יעדים, מה השתנה, הבטחות פתוחות, התוכנית לרבעון הבא וצעדים הבאים ברורים."
        ],
        "lead": "סקירה עסקית רבעונית צריכה להשאיר אצל הלקוח הוכחה לערך, ואצל שני הצדדים את אותם צעדים הבאים. סדר היום הזה נכנס בשעה אחת.",
        "body": [
          {
            "h": "סדר יום (60 דקות)"
          },
          {
            "ol": [
              "5 דקות: מטרות הפגישה ומי משתתף.",
              "15 דקות: תוצאות מול היעדים שנקבעו ברבעון הקודם.",
              "10 דקות: מה השתנה אצל הלקוח: אנשים, סדרי עדיפויות, תקציב.",
              "10 דקות: בקשות והבטחות פתוחות, ואיפה כל אחת עומדת.",
              "15 דקות: התוכנית לרבעון הבא.",
              "5 דקות: צעדים הבאים, לכל אחד אחראי ותאריך."
            ]
          },
          {
            "h": "אחרי הפגישה"
          },
          {
            "p": "שלחו סיכום קצר באותו יום: מה סוכם, הצעדים הבאים עם אחראים ותאריכים, ומועד הסקירה הבאה."
          }
        ],
        "curahold": "תעדו את הסקירה כפגישה על הלקוח וכתבו את הצעדים הבאים; בשמירה כל צעד הופך למשימה עם אחראי ותאריך, שאפשר לשתף בפורטל של הלקוח."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "צ׳קליסט מסירה ממכירות לצוות הקליטה",
        "seo": [
          "צ׳קליסט מסירת לקוח ממכירות לצוות הקליטה | Curahold",
          "צ׳קליסט מסירה לעסקאות שנסגרו: מי בעלי העניין, מה הובטח במכירה, אילו בקשות עדיין פתוחות, תאריכים חשובים והשיחה הראשונה עם הלקוח."
        ],
        "lead": "רוב הבעיות בחודשים הראשונים של לקוח מתחילות במסירה: אנשי המכירות יודעים דברים שצוות הקליטה לא שומע עליהם לעולם. העתיקו את הרשימה ומלאו אותה לפני שהעסקה עוברת ידיים.",
        "body": [
          {
            "h": "מה המסירה חייבת לכלול"
          },
          {
            "ul": [
              "בעלי העניין: מקבל ההחלטות, איש הקשר היומיומי והתומך הפנימי אצל הלקוח, ואיך משיגים כל אחד מהם.",
              "הבטחות שניתנו במכירה: יכולות, תאריכים, הנחות, כל מה שנאמר בכתב או בשיחה.",
              "בקשות מוצר פתוחות שהלקוח מחכה להן, ומה נאמר לו עליהן.",
              "תאריכים חשובים: תאריך הסגירה, מועד העלייה לאוויר שהלקוח מצפה לו ותאריך החידוש.",
              "למה הם קנו: הבעיה שהם רוצים לפתור ואיך ימדדו הצלחה."
            ]
          },
          {
            "h": "לפני השיחה הראשונה"
          },
          {
            "ol": [
              "איש המכירות ואחראי הקליטה קוראים את הרשימה יחד, ב־15 דקות.",
              "כל דבר לא ברור חוזר לאיש המכירות, לא ללקוח.",
              "השיחה הראשונה נפתחת בחזרה על המטרה של הלקוח במילים שלו."
            ]
          }
        ],
        "curahold": "כשעסקה נסגרת, Curahold יכולה להכין כרטיס מסירה לצוות הבא עם בעלי העניין, ההבטחות שניתנו, בקשות המוצר הפתוחות ותאריכי הסגירה והחידוש. הכרטיס ממתין עד שהאחראי החדש מאשר אותו."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "תבנית טבלת ציון בריאות ללקוח",
        "seo": [
          "תבנית ציון בריאות ללקוח: אותות, נקודות וספים | Curahold",
          "טבלת ציון בריאות להעתקה: שישה אותות שהצוות יכול לראות, כמה נקודות כל אחד מוסיף או מוריד, והספים שמראים לאילו לקוחות צריך לשים לב."
        ],
        "lead": "ציון בריאות עוזר רק אם הצוות סומך עליו, וצוות סומך על ציון שהוא יכול להסביר. התחילו בכמה אותות שאתם רואים, תנו לכל אחד משקל וכתבו למה.",
        "body": [
          {
            "h": "אותות ונקודות (מתחילים מ־50)"
          },
          {
            "ul": [
              "שיחה עם הלקוח ב־30 הימים האחרונים: להוסיף 15. אין קשר 60 יום: להוריד 20.",
              "יש אצל הלקוח תומך פנימי שעונה: להוסיף 15. התומך עזב: להוריד 25.",
              "עבודה שהובטחה ומתעכבת: להוריד 10 על כל פריט, עד 30.",
              "חסמים או פניות תמיכה שפתוחים יותר משבועיים: להוריד 10.",
              "שימוש יציב או עולה: להוסיף 10. יורד חודשיים ברציפות: להוריד 15.",
              "החידוש בעוד פחות מ־90 יום ולא נקבעה שיחה: להוריד 10."
            ]
          },
          {
            "h": "ספים"
          },
          {
            "ul": [
              "70 ומעלה: בריא; שומרים על הקצב.",
              "40 עד 69: במעקב; מוצאים את הסיבה השבוע.",
              "מתחת ל־40: בסיכון; האחראי מתקשר, וראש הצוות מעודכן."
            ]
          },
          {
            "p": "בדקו את המשקלים כל רבעון מול הלקוחות שבאמת איבדתם ושמרתם, ושנו את אלה שטעו."
          }
        ],
        "curahold": "לכל לקוח יש ציון בין 0 ל-100 שנבנה מכללים שאתם קובעים, עם רשימת הסיבות והמגמה בשלושים הימים האחרונים."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "ציון בריאות לקוח",
        "seo": [
          "מה זה ציון בריאות לקוח? הגדרה פשוטה וברורה | Curahold",
          "ציון בריאות לקוח מסכם במספר אחד איך הולך הקשר עם הלקוח, על סמך אותות כמו קשר אחרון, עבודה באיחור ובעיות פתוחות."
        ],
        "lead": "ציון בריאות לקוח הוא מספר אחד, לרוב בין 0 ל-100, שמסכם עד כמה הקשר עם הלקוח טוב.",
        "body": [
          {
            "p": "הוא נבנה מאותות שהצוות יכול לראות: מתי דיברו עם הלקוח בפעם האחרונה, אם עבודה שהובטחה מאחרת, אם יש אצלו תומך חזק, חסמים פתוחים ופניות תמיכה. כל אות מוסיף או מוריד נקודות."
          },
          {
            "h": "למה זה חשוב"
          },
          {
            "p": "תיק של עשרות לקוחות מסתיר את הלקוח שמשתתק. הציון ממיין אותם, כך שתשומת הלב הולכת קודם למקום שבו החידוש בסיכון."
          },
          {
            "h": "מה עושה ציון טוב"
          },
          {
            "ul": [
              "הוא מסביר את עצמו: כולם רואים אילו אותות הזיזו אותו.",
              "הוא נשען על אותות שהצוות סומך עליהם ויכול לפעול לפיהם.",
              "עוקבים אחריו לאורך זמן, לא קוראים אותו פעם אחת."
            ]
          }
        ],
        "curahold": "לכל לקוח יש ציון בין 0 ל-100 שנבנה מכללים שאתם קובעים, עם רשימת הסיבות והמגמה בשלושים הימים האחרונים."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "נטישת לקוחות (Churn)",
        "seo": [
          "נטישת לקוחות (Churn): הגדרה ואותות מוקדמים | Curahold",
          "נטישה היא שיעור הלקוחות או ההכנסות שאובדים בתקופה. מה נחשב נטישה, איך מודדים אותה, ואילו אותות מוקדמים מגיעים לפניה."
        ],
        "lead": "נטישה היא מצב שבו לקוח מפסיק לקנות: מבטל או לא מחדש. שיעור הנטישה הוא החלק של הלקוחות, או של ההכנסות, שאבד בתקופה מסוימת.",
        "body": [
          {
            "h": "איך מודדים"
          },
          {
            "ul": [
              "נטישת לקוחות: הלקוחות שאבדו בתקופה, חלקי מספר הלקוחות בתחילתה.",
              "נטישת הכנסות: הכנסה חוזרת שאבדה בביטולים ובהורדות תוכנית, חלקי ההכנסה החוזרת בתחילת התקופה."
            ]
          },
          {
            "h": "האותות שמגיעים קודם"
          },
          {
            "p": "נטישה כמעט אף פעם לא מגיעה בלי אזהרה. הקשר נחלש, עבודה שהובטחה מתעכבת, התומך עוזב, פניות תמיכה מצטברות. מעקב אחרי האותות האלה מאפשר לצוות לפעול לפני תאריך החידוש."
          }
        ],
        "curahold": "אותות כאלה נכנסים לציון הבריאות של כל לקוח, כך שהלקוחות שמשתתקים עולים לראש הרשימה הרבה לפני החידוש שלהם."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "חידוש חוזה",
        "seo": [
          "מה זה חידוש חוזה? תהליך ולוח זמנים | Curahold",
          "חידוש חוזה מאריך את ההסכם עם הלקוח לתקופה נוספת. מתי מתחילים, איך נראה תהליך חידוש, ולמה הוא מתחיל חודשים לפני התאריך."
        ],
        "lead": "חידוש חוזה מאריך את ההסכם עם הלקוח לתקופה נוספת, לרוב עם שינויים: יותר מושבים, תוכנית אחרת או מחיר חדש.",
        "body": [
          {
            "h": "מתי מתחילים"
          },
          {
            "p": "בחוזה שנתי העבודה מתחילה בדרך כלל כתשעים יום מראש. זה משאיר זמן לבחון את הערך שניתן, לפגוש את מקבל ההחלטות, לשלוח הצעה ולסגור שאלות בלי לחץ."
          },
          {
            "h": "מה בדרך כלל משתבש"
          },
          {
            "ul": [
              "שמים לב לתאריך מאוחר מדי.",
              "מי שחתם כבר עזב.",
              "הבטחות שניתנו במהלך השנה עדיין פתוחות."
            ]
          }
        ],
        "curahold": "חידוש יכול לפתוח את הפלייבוק שלו תשעים יום מראש, כמשימות עם אחראים ותאריכים, יחד עם הזדמנות חידוש בצינור המכירות."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "פורטל לקוחות",
        "seo": [
          "מה זה פורטל לקוחות? הגדרה ושימושים נפוצים | Curahold",
          "פורטל לקוחות הוא מקום פרטי שבו הלקוח רואה את העבודה ששותפה איתו, פותח בקשות וקורא תשובות, במקום לרדוף אחרי שרשורי מייל."
        ],
        "lead": "פורטל לקוחות הוא דף אינטרנט פרטי שבו הלקוח רואה את העבודה ששותפה איתו, פותח בקשות וקורא את תשובות הצוות.",
        "body": [
          {
            "h": "למה צוותים משתמשים בו"
          },
          {
            "p": "הוא מחליף את מיילי הסטטוס. הלקוח רואה את ההתקדמות מתי שירצה, והבקשות שלו מגיעות למקום אחד במקום לשרשורים מפוזרים."
          },
          {
            "h": "מה משתפים"
          },
          {
            "ul": [
              "שלבי הקליטה והתאריכים שלהם.",
              "משימות שהובטחו בפגישות.",
              "תשובות לבקשות שלו."
            ]
          }
        ],
        "curahold": "הלקוחות נכנסים בקישור מהמייל ורואים רק מה שאתם משתפים; הבקשות שהם פותחים מגיעות ללוח של הצוות שלכם."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "קליטת לקוחות",
        "seo": [
          "מהי קליטת לקוחות (Onboarding)? שלבים ומטרות | Curahold",
          "קליטת לקוחות היא העבודה שמביאה לקוח חדש מהחתימה אל הערך הראשון: המסירה מהמכירות, ההקמה, ההדרכה והתוצאות הראשונות שהוא רואה בעצמו."
        ],
        "lead": "קליטת לקוחות היא התקופה שבין החתימה לרגע שבו לקוח חדש מקבל את הערך שקנה, והעבודה שהצוות עושה כדי לקצר אותה.",
        "body": [
          {
            "h": "מה זה כולל בדרך כלל"
          },
          {
            "ul": [
              "המסירה מהמכירות, עם מה שהובטח.",
              "פגישת פתיחה שמסכמת מטרות ותאריכים.",
              "הקמה, ייבוא נתונים והדרכה.",
              "תוצאה ראשונה שהלקוח רואה ויכול לקרוא לה בשם."
            ]
          },
          {
            "h": "למה זה חשוב"
          },
          {
            "p": "לקוחות שרואים ערך מוקדם נוטים להישאר. קליטה שנמשכת יותר מדי גורמת לשיחת החידוש הראשונה להתחיל מספק."
          }
        ],
        "curahold": "אם יש לכם צוות קליטה, עסקה שנסגרה מגיעה אליו ככרטיס מסירה אחד עם בעלי העניין, ההבטחות שניתנו, הבקשות הפתוחות והתאריכים החשובים, ואפשר לשתף את המשימות שלה עם הלקוח בפורטל שלו."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "עלות שירות",
        "seo": [
          "מהי עלות שירות? הגדרה לצוותים שמטפלים בלקוחות | Curahold",
          "עלות שירות היא מה שנדרש כדי לטפל בלקוח, בשעות או בכסף, מול מה שהוא משלם. איך מודדים אותה ומה עושים עם התוצאה לפני החידוש."
        ],
        "lead": "עלות שירות היא המאמץ שהצוות משקיע בטיפול בלקוח, מול מה שהלקוח הזה משלם.",
        "body": [
          {
            "h": "איך מודדים"
          },
          {
            "p": "המדד הפשוט ביותר הוא שעות: הזמן שהצוות רשם על הלקוח ב־12 החודשים האחרונים, חלקי ערך החוזה השנתי שלו. השוואה של כל הלקוחות באותו קנה מידה מראה מי מקבל הכי הרבה טיפול ביחס למה שהוא משלם."
          },
          {
            "h": "מה עושים עם זה"
          },
          {
            "ul": [
              "מצאו את העבודה שמאחורי מספר גבוה: בקשות חוזרות, יכולת חסרה, פער בהדרכה.",
              "טפלו בסיבה לפני החידוש, או תמחרו את השירות הנוסף לתוכו.",
              "אל תשפטו לקוח לפי המספר הזה בלבד: לקוח תובעני יכול להיות גם הממליץ הטוב ביותר שלכם."
            ]
          }
        ],
        "curahold": "דוח עלות השירות מציג לכל לקוח את השעות שהושקעו ב־12 החודשים האחרונים לכל 1,000 של ערך שנתי, כך שרואים על מי הכי יקר לשמור."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "שימור הכנסות נטו (NRR)",
        "seo": [
          "מהו שימור הכנסות נטו (NRR)? הגדרה ונוסחה | Curahold",
          "שימור הכנסות נטו מראה כמה הכנסה חוזרת קבוצת לקוחות מביאה כעבור שנה, כולל חידושים, הרחבות, הקטנות ונטישה."
        ],
        "lead": "שימור הכנסות נטו (NRR) הוא ההכנסה החוזרת שקבוצת לקוחות מביאה היום, כאחוז ממה שאותם לקוחות הביאו לפני שנה.",
        "body": [
          {
            "h": "איך מחשבים"
          },
          {
            "p": "קחו את ההכנסה החוזרת של הלקוחות שהיו לכם בתחילת התקופה. הוסיפו את ההרחבות, הורידו הקטנות ונטישה, וחלקו בנקודת ההתחלה. לקוחות חדשים לא נכללים."
          },
          {
            "h": "למה צוותים עוקבים אחריו"
          },
          {
            "ul": [
              "מעל 100% אומר שהלקוחות הקיימים גדלים בעצמם.",
              "הוא מראה אם חידושים והרחבות גוברים על ההפסדים.",
              "הוא משתנה לאט, ולכן מתגמל עבודה עקבית מול לקוחות."
            ]
          }
        ],
        "curahold": "הזדמנויות חידוש והרחבה נמצאות באותו צינור מכירות עם עסקאות חדשות, ותצוגת החידושים מציגה כל לקוח לפי חודש החידוש עם הסכום שבסיכון."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "הכנסה שנתית חוזרת (ARR)",
        "seo": [
          "מהי הכנסה שנתית חוזרת (ARR)? הגדרה קצרה | Curahold",
          "הכנסה שנתית חוזרת היא הערך השנתי של המינויים שנחתמו: מה נספר, מה לא, ואיך צוותים משתמשים בה ברמת הלקוח."
        ],
        "lead": "הכנסה שנתית חוזרת (ARR) היא הערך השנתי של המינויים בתוקף: מה שהלקוחות ישלמו בשנים עשר חודשים אם שום דבר לא ישתנה.",
        "body": [
          {
            "h": "מה נספר"
          },
          {
            "ul": [
              "דמי מינוי, מומרים לסכום שנתי.",
              "תוספות חוזרות ומושבים נוספים.",
              "לא תשלומים חד-פעמיים כמו הקמה או הדרכה."
            ]
          },
          {
            "h": "למה זה חשוב ברמת הלקוח"
          },
          {
            "p": "ARR אצל כל לקוח מראה איפה נמצאת ההכנסה, כך שהצוות נותן לחידושים הגדולים את תשומת הלב הדרושה ורואה כמה בסיכון כשלקוח משתתק."
          }
        ],
        "curahold": "ARR יכול להיות שדה אצל כל לקוח, ודוח יכול לסכם אותו לפי אחראי, טווח ציון בריאות או חודש חידוש, לפי ההרשאות של כל קורא."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "סקירה עסקית (QBR)",
        "seo": [
          "מהי סקירה עסקית (QBR)? מטרה וסדר יום | Curahold",
          "סקירה עסקית היא פגישה קבועה שבה הלקוח והספק בוחנים תוצאות, הבטחות פתוחות ואת התוכנית הבאה, בדרך כלל פעם ברבעון."
        ],
        "lead": "סקירה עסקית, לרוב רבעונית ומכונה QBR, היא פגישה שבה הלקוח והספק בוחנים תוצאות ומסכימים על התוכנית הבאה.",
        "body": [
          {
            "h": "מה היא כוללת"
          },
          {
            "ul": [
              "תוצאות מול היעדים שנקבעו בפעם הקודמת.",
              "מה השתנה אצל הלקוח.",
              "בקשות והבטחות פתוחות ומצב כל אחת.",
              "התוכנית והאחראים לתקופה הבאה."
            ]
          },
          {
            "h": "מה הופך אותה למועילה"
          },
          {
            "p": "היא מסתיימת בצעדים הבאים עם אחראים ותאריכים. סקירה שהפעולות שלה לא נכתבו נשכחת עד הבאה."
          }
        ],
        "curahold": "סקירה עסקית היא פגישה בציר הזמן של הלקוח, והצעדים הבאים שנכתבים בה הופכים למשימות עם אחראי ותאריך."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "מה עושה Customer Success Manager (CSM)? התפקיד | Curahold",
          "Customer Success Manager מלווה קבוצת לקוחות אחרי המכירה: קליטה, אימוץ, סקירות עסקיות, חידושים וזיהוי סיכונים מוקדם."
        ],
        "lead": "Customer Success Manager (CSM) מלווה קבוצת לקוחות אחרי המכירה, כדי שיקבלו את הערך שקנו וימשיכו.",
        "body": [
          {
            "h": "מה התפקיד כולל בדרך כלל"
          },
          {
            "ul": [
              "קליטת לקוחות חדשים, או קבלתם מצוות הקליטה.",
              "שיחות קבועות וסקירות עסקיות.",
              "מעקב אחר בריאות הלקוח ותגובה לאזהרות מוקדמות.",
              "הכנת חידושים וזיהוי מקום לצמיחה."
            ]
          },
          {
            "h": "לאן הולך הזמן"
          },
          {
            "p": "CSM מלווה לעיתים עשרות לקוחות. לדעת מי מהם צריך תשומת לב השבוע חשוב יותר מלחלק זמן שווה לכולם."
          }
        ],
        "curahold": "לכל לקוח יש אחראי בכל מחלקה, והרשימה של כל אדם מסודרת לפי מי שצריך אותו, עם הסיבה והצעד הבא."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "הכנסות מהרחבה",
        "seo": [
          "מהן הכנסות מהרחבה? אפסייל ומכירה צולבת | Curahold",
          "הכנסות מהרחבה הן הכנסה חוזרת נוספת מלקוחות קיימים: עוד מושבים, תוכנית גבוהה יותר או מוצר נוסף. מאיפה הן מגיעות ואיך מוצאים אותן."
        ],
        "lead": "הכנסות מהרחבה הן הכנסה חוזרת נוספת מלקוחות שכבר יש לכם: עוד מושבים, תוכנית גבוהה יותר או מוצר נוסף.",
        "body": [
          {
            "h": "מאיפה הן מגיעות"
          },
          {
            "ul": [
              "אפסייל: יותר ממה שהם משתמשים בו, או תוכנית גבוהה יותר.",
              "מכירה צולבת: מוצר שעדיין אין להם.",
              "צמיחה אצלם: צוותים, סניפים או מדינות חדשים."
            ]
          },
          {
            "h": "מתי להעלות את זה"
          },
          {
            "p": "הרחבה באה אחרי ערך. הכי קל אחרי תוצאה שהלקוח יכול לנקוב בשמה, והכי קשה כשהבטחות מהבקשה האחרונה עדיין פתוחות."
          }
        ],
        "curahold": "תצוגת המוצרים מראה לאיזה לקוח יש איזה מוצר, כך שהפערים גלויים, ופתיחת משימה לאחד מהם לוקחת לחיצה."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "זמן לערך",
        "seo": [
          "מהו זמן לערך (Time to value)? הגדרה ודרכי קיצור | Curahold",
          "זמן לערך הוא הזמן שלקוח חדש מחכה בין החתימה לתוצאה הראשונה שהוא יכול לנקוב בשמה. למה זה חשוב לחידוש ואיך מקצרים אותו."
        ],
        "lead": "זמן לערך הוא הזמן שלקוח חדש מחכה בין החתימה לתוצאה הראשונה שהוא רואה ויכול לנקוב בשמה.",
        "body": [
          {
            "h": "למה זה חשוב"
          },
          {
            "p": "שיחת החידוש הראשונה מתחילה ביום החתימה. לקוח שרואה ערך בתוך שבועות מדבר על צמיחה; לקוח שעדיין מחכה מדבר על מחיר."
          },
          {
            "h": "איך צוותים מקצרים אותו"
          },
          {
            "ul": [
              "סכמו בפגישת הפתיחה על תוצאה ראשונה אחת עם תאריך.",
              "העבירו את מה שהמכירות הבטיחו, כדי ששום דבר לא יישאל פעמיים.",
              "שתפו את התוכנית עם הלקוח, כך ששני הצדדים רואים את הצעד הבא."
            ]
          }
        ],
        "curahold": "לתוכניות קליטה יש צעדים, יעדים ותאריכים, ואת הצעדים שתבחרו אפשר לשתף עם הלקוח בפורטל שלו."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "תוכנית הצלחה",
        "seo": [
          "מהי תוכנית הצלחה ללקוח? חלקים ושימוש | Curahold",
          "תוכנית הצלחה כותבת מה הלקוח רוצה להשיג, איך שני הצדדים יגיעו לשם ואיך מודדים התקדמות, כדי שלכל סקירה תהיה נקודת ייחוס."
        ],
        "lead": "תוכנית הצלחה כותבת מה הלקוח רוצה להשיג, אילו צעדים יעשו שני הצדדים ואיך תימדד ההתקדמות.",
        "body": [
          {
            "h": "מה היא כוללת בדרך כלל"
          },
          {
            "ul": [
              "היעדים של הלקוח במילים שלו.",
              "הצעדים, האחראים והתאריכים בשני הצדדים.",
              "המדדים שמראים התקדמות."
            ]
          },
          {
            "h": "איך משתמשים בה"
          },
          {
            "p": "היא נקודת הייחוס לכל שיחה ולכל סקירה עסקית. כשמעדכנים אותה יחד, שני הצדדים עובדים לעבר אותה תוצאה."
          }
        ],
        "curahold": "תוכנית קליטה מחזיקה יעדים, צעדים עם אחראים ותאריכים והמדדים שאתם עוקבים אחריהם, ואת הצעדים שמיועדים ללקוח אפשר לשתף בפורטל."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "מפת בעלי עניין",
        "seo": [
          "מהי מפת בעלי עניין במכירות ובהצלחת לקוחות? | Curahold",
          "מפת בעלי עניין מפרטת את האנשים אצל הלקוח שמשפיעים על החלטה, את תפקידם ואת עמדתם, כדי שהצוות יידע את מי לשתף ומתי."
        ],
        "lead": "מפת בעלי עניין מפרטת את האנשים אצל הלקוח שלוקחים חלק בהחלטה, את תפקידם ואת העמדה של כל אחד.",
        "body": [
          {
            "h": "מה היא מתעדת"
          },
          {
            "ul": [
              "התפקיד וההשפעה של כל אדם.",
              "העמדה: תומך, ניטרלי או חוסם.",
              "מי עוד לא פגשתם."
            ]
          },
          {
            "h": "למה היא חשובה אחרי המכירה"
          },
          {
            "p": "החלטת חידוש כמעט אף פעם לא מתקבלת בידי אדם אחד. כשהאלוף עוזב, המפה מראה מי עוד מכיר את הערך ומי צריך לשמוע עליו."
          }
        ],
        "curahold": "כל עסקה שומרת את בעלי העניין עם התפקיד והעמדה שלהם, והם עוברים עם כרטיס המסירה לצוות שמקבל את הלקוח."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "אלוף (Champion)",
        "seo": [
          "מיהו אלוף (Champion) אצל לקוח ב-B2B? | Curahold",
          "אלוף הוא האדם אצל הלקוח שמאמין במוצר שלכם ומקדם אותו בתוך החברה. למה הוא חשוב, ומה עושים כשהוא עוזב את החברה."
        ],
        "lead": "אלוף (Champion) הוא האדם אצל הלקוח שמאמין במה שאתם מספקים ומקדם אותו בתוך החברה שלו.",
        "body": [
          {
            "h": "למה הוא חשוב"
          },
          {
            "p": "הוא דואג שפגישות ייקבעו, שתקציבים יישמרו ושבעיות יעלו מוקדם. לקוחות עם אלוף פעיל מחדשים ביתר קלות."
          },
          {
            "h": "כשהאלוף עוזב"
          },
          {
            "ul": [
              "ביררו מי לוקח את החלק שלו בעבודה.",
              "הציגו את הערך מחדש למי שנשאר.",
              "התייחסו לזה כסיכון עד שיש אלוף חדש."
            ]
          }
        ],
        "curahold": "קיומו של אלוף יכול להיות אות בציון הבריאות, כך שלקוח בלי אלוף, או שהאלוף שלו עזב, עולה לראש הרשימה."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "מסירה ממכירות להצלחת לקוחות",
        "seo": [
          "מסירה ממכירות להצלחת לקוחות: מה להעביר | Curahold",
          "מסירה ממכירות להצלחת לקוחות מעבירה את מה שהובטח, את האנשים החשובים ואת התאריכים המרכזיים, כך שהלקוח לא צריך להסביר הכול שוב."
        ],
        "lead": "מסירה ממכירות להצלחת לקוחות מעבירה את כל מה שהצוות הבא צריך, כך שהלקוח אף פעם לא צריך להסביר הכול מחדש.",
        "body": [
          {
            "h": "מה להעביר"
          },
          {
            "ul": [
              "בעלי העניין והעמדה של כל אחד.",
              "מה הובטח במהלך המכירה.",
              "בקשות פתוחות ושאלות על המוצר.",
              "תאריך הסגירה ותאריך החידוש."
            ]
          },
          {
            "h": "מה משתבש"
          },
          {
            "p": "הבטחות שניתנו בשיחת מכירה ואף אחד לא כתב. הלקוח זוכר אותן; הצוות החדש לא."
          }
        ],
        "curahold": "עסקה שנסגרה מגיעה לצוות הבא ככרטיס מסירה אחד עם בעלי העניין, ההבטחות שניתנו, בקשות המוצר הפתוחות והתאריכים המרכזיים."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "בקשת פיצ'ר",
        "seo": [
          "איך מטפלים בבקשות פיצ'רים של לקוחות ב-B2B | Curahold",
          "בקשת פיצ'ר היא לקוח שמבקש משהו שהמוצר עוד לא עושה. איך מתעדים אותה, מקשרים ללקוח ומעדכנים אותו כשהיא מוכנה."
        ],
        "lead": "בקשת פיצ'ר היא לקוח שמבקש משהו שהמוצר עדיין לא עושה, לרוב במהלך פגישה או שיחת תמיכה.",
        "body": [
          {
            "h": "איך לטפל בהן נכון"
          },
          {
            "ul": [
              "תעדו מי ביקש ולמה זה חשוב לו.",
              "קשרו יחד בקשות על אותו דבר.",
              "תעדפו לפי הלקוחות שמחכים והערך."
            ]
          },
          {
            "h": "לסגור את המעגל"
          },
          {
            "p": "החלק שרוב הצוותים מפספסים הוא לעדכן את הלקוח כשהעבודה מוכנה. בקשה שנענית בהערת גרסה בונה יותר אמון מהפיצ'ר עצמו."
          }
        ],
        "curahold": "אפשר לקשר כמה בקשות של לקוחות לסטורי אחד; הבקלוג מראה את הלקוחות שמחכים, את הערך שלהם ואת החידוש הקרוב, וכשהעבודה מסתיימת האחראי מקבל טיוטה מוכנה לשליחה."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "נקודת מגע",
        "seo": [
          "מהי נקודת מגע עם לקוח? הגדרה ודוגמאות | Curahold",
          "נקודת מגע היא כל רגע של קשר בין הלקוח לצוות שלכם: שיחה, פגישה, תשובה. למה הקצב שלהן חשוב יותר מהמספר."
        ],
        "lead": "נקודת מגע היא כל רגע של קשר בין הלקוח לצוות שלכם: שיחה, פגישה, אימייל או תשובה לבקשה.",
        "body": [
          {
            "h": "למה הקצב חשוב"
          },
          {
            "p": "שתיקות ארוכות הן אזהרה מוקדמת. לקוח שאיש לא דיבר איתו שישה שבועות קשה יותר לחדש מלקוח שנפגשים איתו כל חודש."
          },
          {
            "h": "מה לשמור מכל אחת"
          },
          {
            "ul": [
              "מתי זה קרה ומי השתתף.",
              "מה הוחלט.",
              "הצעד הבא, עם אחראי ותאריך."
            ]
          }
        ],
        "curahold": "פגישות, שיחות והערות נשמרות בציר הזמן של כל לקוח, הזמן מאז הקשר האחרון נכנס לציון הבריאות, ולכל לקוח יכול להיות קצב סקירה."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "מעקב אחרי פגישה",
        "seo": [
          "מעקב אחרי פגישת לקוח: צעדים הבאים שמתבצעים | Curahold",
          "מעקב אחרי פגישה הופך את מה שסוכם עם הלקוח לעבודה עם אחראי ותאריך, כך שההבטחות נשמרות והלקוח רואה שהן נשמרות."
        ],
        "lead": "מעקב אחרי פגישה הוא להפוך את מה שסוכם בפגישה עם הלקוח לעבודה עם אחראי ותאריך, לפני שהפרטים מיטשטשים.",
        "body": [
          {
            "h": "למה זה מתפספס"
          },
          {
            "p": "הצעדים הבאים נשארים בהערות של מישהו. אחרי שבוע אף אחד לא זוכר מי אמר שיעשה מה, והלקוח שם לב ראשון."
          },
          {
            "h": "איך נראה מעקב טוב"
          },
          {
            "ul": [
              "הצעדים הבאים נכתבים לפני שהשיחה נגמרת.",
              "לכל אחד יש אחראי ותאריך.",
              "הודעה קצרה ללקוח שמאשרת אותם."
            ]
          }
        ],
        "curahold": "צעדים הבאים שנכתבים בהערות של פגישה הופכים למשימות עם אחראי ותאריך, מקושרות ללקוח, ואת ההבטחות אפשר לשתף עם הלקוח בפורטל שלו."
      }
    ]
  },
  fa: {
    "title": "قالب‌ها و واژه‌نامه برای تیم‌های مشتری",
    "lead": "قالب‌هایی که می‌توانید کپی کنید و تعریف‌های روشن برای کارِ نگه داشتن مشتری: تمدیدها، بازبینی‌های تجاری، امتیاز سلامت و ریزش مشتری.",
    "seo": [
      "قالب‌ها و واژه‌نامهٔ تیم‌های موفقیت مشتری | Curahold",
      "قالب‌های رایگان برای برنامهٔ تمدید و بازبینی تجاری، و تعریف‌های روشن امتیاز سلامت، ریزش مشتری، تمدید قرارداد و پورتال مشتری."
    ],
    "templates": "قالب‌ها",
    "glossary": "واژه‌نامه",
    "inCurahold": "در Curahold",
    "nav": [
      "قالب‌ها و واژه‌نامه",
      "گام‌های تمدید، دستور جلسهٔ بازبینی و تعریف‌های روشن."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "قالب برنامهٔ تمدید",
        "seo": [
          "قالب برنامهٔ تمدید: گام‌ها از نود روز پیش | Curahold",
          "برنامهٔ تمدیدی که می‌توانید کپی کنید: ۹۰، ۷۵، ۶۰ و ۳۰ روز پیش از تمدید قرارداد چه کنید، مسئول هر گام کیست و پیش از تماس چه چیزی را بررسی کنید."
        ],
        "lead": "تمدید در سه ماهِ پیش از تاریخش به دست می‌آید، نه در خود آن روز. این گام‌ها را کپی کنید، برای هرکدام مسئولی بگذارید و از تاریخ تمدید به عقب بشمارید.",
        "body": [
          {
            "h": "گام‌ها"
          },
          {
            "ol": [
              "۹۰ روز پیش: استفاده، درخواست‌های باز و امتیاز سلامت را بررسی کنید و هر نگرانی را یادداشت کنید.",
              "۷۵ روز پیش: تماس تمدید را با تصمیم‌گیرنده و مخاطب روزمره هماهنگ کنید.",
              "۶۰ روز پیش: پیشنهاد تمدید را همراه با هر تغییری در صندلی‌ها یا طرح بفرستید.",
              "۳۰ روز پیش: پیشنهاد را پیگیری کنید و پرسش‌های باز را به‌صورت مکتوب روشن کنید.",
              "در روز تمدید: تمدید امضاشده را تأیید کنید و توافق‌ها را ثبت کنید."
            ]
          },
          {
            "h": "پیش از تماس تمدید"
          },
          {
            "ul": [
              "مشتری امسال می‌خواست به چه برسد، و رسید؟",
              "کدام قول‌های جلسه‌های قبلی هنوز باز است؟",
              "چه کسی تصمیم می‌گیرد و آیا اخیراً در جلسه‌ای با شما بوده است؟"
            ]
          }
        ],
        "curahold": "تمدیدها را روشن کنید تا برنامهٔ تمدید، گام‌هایش را نود روز پیش از هر تاریخ تمدید به‌صورت وظیفه باز کند؛ هرکدام با یک مسئول و موعدی که از تمدید به عقب شمرده می‌شود."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "قالب دستور جلسهٔ بازبینی تجاری (QBR)",
        "seo": [
          "قالب دستور جلسهٔ بازبینی تجاری فصلی (QBR) | Curahold",
          "دستور جلسهٔ یک‌ساعته برای بازبینی تجاری: نتایج در برابر اهداف، تغییرات، قول‌های باز، برنامهٔ فصل بعد و گام‌های بعدی روشن."
        ],
        "lead": "بازبینی تجاری فصلی باید برای مشتری نشانه‌ای از ارزش و برای هر دو طرف گام‌های بعدی یکسانی بگذارد. این دستور جلسه در یک ساعت جا می‌شود.",
        "body": [
          {
            "h": "دستور جلسه (۶۰ دقیقه)"
          },
          {
            "ol": [
              "۵ دقیقه: اهداف جلسه و حاضران.",
              "۱۵ دقیقه: نتایج در برابر اهدافی که فصل گذشته تعیین شد.",
              "۱۰ دقیقه: آنچه در طرف مشتری تغییر کرده است: افراد، اولویت‌ها، بودجه.",
              "۱۰ دقیقه: درخواست‌ها و قول‌های باز و وضعیت هرکدام.",
              "۱۵ دقیقه: برنامهٔ فصل بعد.",
              "۵ دقیقه: گام‌های بعدی، هرکدام با مسئول و تاریخ."
            ]
          },
          {
            "h": "پس از جلسه"
          },
          {
            "p": "همان روز خلاصه‌ای کوتاه بفرستید: توافق‌ها، گام‌های بعدی با مسئول و تاریخ، و تاریخ بازبینی بعدی."
          }
        ],
        "curahold": "بازبینی را به‌عنوان جلسه روی پروندهٔ مشتری ثبت کنید و گام‌های بعدی را بنویسید؛ با ذخیره، هر گام وظیفه‌ای با مسئول و تاریخ می‌شود که می‌توانید در پورتال مشتری به اشتراک بگذارید."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "چک‌لیست تحویل مشتری از فروش به تیم راه‌اندازی",
        "seo": [
          "چک‌لیست تحویل مشتری از فروش به تیم راه‌اندازی | Curahold",
          "چک‌لیست تحویل برای معامله‌های برنده‌شده: ذی‌نفعان چه کسانی‌اند، در فروش چه قول‌هایی داده شد، درخواست‌های باز، تاریخ‌های مهم و نخستین تماس با مشتری."
        ],
        "lead": "بیشتر دردسرهای ماه‌های اول مشتری از تحویل شروع می‌شود: تیم فروش چیزهایی می‌داند که هرگز به تیم راه‌اندازی نمی‌رسد. این فهرست را کپی کنید و پیش از آنکه معامله دست‌به‌دست شود، پُرش کنید.",
        "body": [
          {
            "h": "آنچه تحویل باید همراه داشته باشد"
          },
          {
            "ul": [
              "ذی‌نفعان: تصمیم‌گیرنده، رابط روزمره و حامی داخلی در سمت مشتری، و راه تماس با هر یک.",
              "قول‌هایی که هنگام فروش داده شد: قابلیت‌ها، تاریخ‌ها، تخفیف‌ها؛ هر چه کتبی یا در تماس گفته شد.",
              "درخواست‌های باز محصول که مشتری منتظرشان است، و آنچه درباره‌شان به او گفته شد.",
              "تاریخ‌های مهم: تاریخ بستن معامله، زمان شروع به کاری که انتظار دارد و تاریخ تمدید.",
              "چرا خریدند: مشکلی که می‌خواهند حل شود و اینکه موفقیت را با چه می‌سنجند."
            ]
          },
          {
            "h": "پیش از نخستین تماس"
          },
          {
            "ol": [
              "فروشنده و مسئول راه‌اندازی فهرست را با هم، در ۱۵ دقیقه، می‌خوانند.",
              "هر نکتهٔ مبهم به فروشنده برمی‌گردد، نه به مشتری.",
              "نخستین تماس با تکرار هدف مشتری به زبان خود او آغاز می‌شود."
            ]
          }
        ],
        "curahold": "وقتی معامله‌ای برنده می‌شود، Curahold می‌تواند برای تیم بعدی کارت تحویل آماده کند که ذی‌نفعان، قول‌های داده‌شده، درخواست‌های باز محصول و تاریخ‌های بستن و تمدید را در خود دارد. کارت منتظر می‌ماند تا مسئول تازه‌اش آن را تأیید کند."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "قالب جدول امتیاز سلامت مشتری",
        "seo": [
          "قالب امتیاز سلامت: نشانه‌ها، امتیازها و آستانه‌ها | Curahold",
          "جدول امتیاز سلامتی که می‌توانید کپی کنید: شش نشانه که تیم می‌بیند، امتیازی که هر کدام می‌افزاید یا می‌کاهد و آستانه‌هایی که نشان می‌دهند به چه کسی باید رسید."
        ],
        "lead": "امتیاز سلامت فقط وقتی به کار می‌آید که تیم به آن اعتماد کند، و تیم به امتیازی اعتماد می‌کند که بتواند توضیحش دهد. با چند نشانه که خودتان می‌بینید شروع کنید، به هر کدام وزنی بدهید و دلیلش را بنویسید.",
        "body": [
          {
            "h": "نشانه‌ها و امتیازها (از ۵۰ شروع کنید)"
          },
          {
            "ul": [
              "در ۳۰ روز گذشته با مشتری صحبت شده: ۱۵ امتیاز اضافه کنید. ۶۰ روز بی‌تماس: ۲۰ کم کنید.",
              "حامی داخلی‌ای در سمت مشتری که پاسخ می‌دهد: ۱۵ اضافه کنید. حامی رفته است: ۲۵ کم کنید.",
              "کار قول‌داده‌شده عقب افتاده: برای هر مورد ۱۰ کم کنید، حداکثر ۳۰.",
              "مانع یا درخواست پشتیبانیِ بازِ قدیمی‌تر از دو هفته: ۱۰ کم کنید.",
              "استفاده ثابت یا رو به افزایش: ۱۰ اضافه کنید. دو ماه رو به کاهش: ۱۵ کم کنید.",
              "کمتر از ۹۰ روز تا تمدید و هیچ تماسی برنامه‌ریزی نشده: ۱۰ کم کنید."
            ]
          },
          {
            "h": "آستانه‌ها"
          },
          {
            "ul": [
              "۷۰ و بالاتر: سالم؛ ریتم را حفظ کنید.",
              "۴۰ تا ۶۹: زیر نظر؛ همین هفته دلیلش را پیدا کنید.",
              "زیر ۴۰: در خطر؛ مسئول تماس می‌گیرد و سرپرست تیم در جریان قرار می‌گیرد."
            ]
          },
          {
            "p": "وزن‌ها را هر فصل با مشتریانی که واقعاً از دست داده‌اید یا نگه داشته‌اید مقایسه کنید و آن‌هایی را که اشتباه پیش‌بینی کرده‌اند تغییر دهید."
          }
        ],
        "curahold": "هر مشتری امتیازی از ۰ تا ۱۰۰ دارد که از قواعد شما ساخته می‌شود، با فهرست دلایل و روند سی روز گذشته."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "امتیاز سلامت مشتری",
        "seo": [
          "امتیاز سلامت مشتری چیست؟ تعریفی ساده و روشن | Curahold",
          "امتیاز سلامت مشتری وضعیت رابطه با مشتری را در یک عدد خلاصه می‌کند؛ بر پایهٔ نشانه‌هایی مثل آخرین تماس، کارهای عقب‌افتاده و مشکلات باز."
        ],
        "lead": "امتیاز سلامت مشتری یک عدد است، معمولاً از ۰ تا ۱۰۰، که خلاصه می‌کند رابطه با مشتری چقدر خوب پیش می‌رود.",
        "body": [
          {
            "p": "این امتیاز از نشانه‌هایی ساخته می‌شود که تیم می‌تواند ببیند: آخرین بار کِی با مشتری صحبت شده، آیا کار قول‌داده‌شده عقب افتاده، آیا در طرف مشتری حامی قوی هست، مانع‌های باز و درخواست‌های پشتیبانی. هر نشانه امتیازی می‌افزاید یا می‌کاهد."
          },
          {
            "h": "چرا مهم است"
          },
          {
            "p": "سبدی از ده‌ها مشتری، مشتری‌ای را که بی‌صدا دور می‌شود پنهان می‌کند. امتیاز آن‌ها را مرتب می‌کند تا توجه اول به جایی برود که تمدید در خطر است."
          },
          {
            "h": "امتیاز خوب چه ویژگی‌ای دارد"
          },
          {
            "ul": [
              "خودش را توضیح می‌دهد: همه می‌بینند کدام نشانه‌ها آن را تغییر داده‌اند.",
              "بر نشانه‌هایی تکیه دارد که تیم به آن‌ها اعتماد دارد و می‌تواند بر پایه‌شان کاری کند.",
              "در طول زمان دنبال می‌شود، نه این‌که یک بار خوانده شود."
            ]
          }
        ],
        "curahold": "هر مشتری امتیازی از ۰ تا ۱۰۰ دارد که از قواعد شما ساخته می‌شود، با فهرست دلایل و روند سی روز گذشته."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "ریزش مشتری (Churn)",
        "seo": [
          "ریزش مشتری (Churn): تعریف و نشانه‌های زودهنگام | Curahold",
          "ریزش، سهم مشتریان یا درآمدی است که در یک دوره از دست می‌رود. چه چیزی ریزش حساب می‌شود، چطور اندازه‌گیری می‌شود و چه نشانه‌هایی پیش از آن می‌آید."
        ],
        "lead": "ریزش یعنی مشتری خرید را متوقف کند: لغو کند یا تمدید نکند. نرخ ریزش سهم مشتریان، یا درآمدی است که در یک دوره از دست رفته است.",
        "body": [
          {
            "h": "چطور اندازه‌گیری می‌شود"
          },
          {
            "ul": [
              "ریزش مشتری: مشتریان ازدست‌رفته در دوره، تقسیم بر تعداد مشتریان در آغاز آن.",
              "ریزش درآمد: درآمد تکرارشونده‌ای که با لغو یا کاهش طرح از دست رفته، تقسیم بر درآمد تکرارشونده در آغاز دوره."
            ]
          },
          {
            "h": "نشانه‌هایی که زودتر می‌آیند"
          },
          {
            "p": "ریزش به‌ندرت بی‌خبر می‌آید. تماس‌ها کم می‌شود، کار قول‌داده‌شده عقب می‌افتد، حامی می‌رود، درخواست‌های پشتیبانی انباشته می‌شود. دنبال کردن این نشانه‌ها به تیم امکان می‌دهد پیش از تاریخ تمدید دست به کار شود."
          }
        ],
        "curahold": "چنین نشانه‌هایی در امتیاز سلامت هر مشتری اثر می‌گذارند، تا مشتریانی که بی‌صدا دور می‌شوند خیلی پیش از تمدیدشان دیده شوند."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "تمدید قرارداد",
        "seo": [
          "تمدید قرارداد چیست؟ روند و زمان‌بندی مناسب | Curahold",
          "تمدید قرارداد، توافق با مشتری را برای دورهٔ تازه‌ای ادامه می‌دهد. کِی شروع کنیم، روند تمدید چه شکلی است و چرا ماه‌ها پیش از تاریخ آغاز می‌شود."
        ],
        "lead": "تمدید قرارداد، توافق مشتری را برای دورهٔ دیگری ادامه می‌دهد؛ اغلب با تغییر: صندلی‌های بیشتر، طرحی دیگر یا قیمتی تازه.",
        "body": [
          {
            "h": "کِی شروع می‌شود"
          },
          {
            "p": "در قرارداد سالانه، کار معمولاً حدود نود روز زودتر شروع می‌شود. این فرصت می‌دهد ارزش ارائه‌شده بررسی شود، با تصمیم‌گیرنده دیدار شود، پیشنهاد فرستاده شود و پرسش‌ها بدون عجله روشن شوند."
          },
          {
            "h": "معمولاً چه چیزی خراب می‌شود"
          },
          {
            "ul": [
              "تاریخ خیلی دیر دیده می‌شود.",
              "کسی که قرارداد را امضا کرده رفته است.",
              "قول‌هایی که در طول سال داده شده هنوز باز است."
            ]
          }
        ],
        "curahold": "یک تمدید می‌تواند برنامهٔ خودش را نود روز زودتر به‌صورت وظیفه‌هایی با مسئول و تاریخ باز کند، همراه با فرصت تمدیدی در قیف فروش."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "پورتال مشتری",
        "seo": [
          "پورتال مشتری چیست؟ تعریف و کاربردهای رایج | Curahold",
          "پورتال مشتری فضایی خصوصی است که مشتری در آن کار به‌اشتراک‌گذاشته را می‌بیند، درخواست ثبت می‌کند و پاسخ‌ها را می‌خواند، به‌جای دنبال کردن ایمیل‌ها."
        ],
        "lead": "پورتال مشتری صفحه‌ای خصوصی است که مشتری در آن کارِ به‌اشتراک‌گذاشته با خودش را می‌بیند، درخواست ثبت می‌کند و پاسخ‌های تیم را می‌خواند.",
        "body": [
          {
            "h": "چرا تیم‌ها از آن استفاده می‌کنند"
          },
          {
            "p": "جای ایمیل‌های گزارش وضعیت را می‌گیرد. مشتری هر وقت بخواهد پیشرفت را می‌بیند و درخواست‌هایش به‌جای رشته‌های پراکنده در یک‌جا جمع می‌شود."
          },
          {
            "h": "چه چیزی به اشتراک بگذاریم"
          },
          {
            "ul": [
              "گام‌های راه‌اندازی و تاریخ‌هایشان.",
              "وظایفی که در جلسه‌ها قول داده شده.",
              "پاسخ به درخواست‌هایش."
            ]
          }
        ],
        "curahold": "مشتریان با پیوندی در ایمیل‌شان وارد می‌شوند و فقط آنچه را شما به اشتراک می‌گذارید می‌بینند؛ درخواست‌هایشان به برد تیم شما می‌رسد."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "راه‌اندازی مشتری",
        "seo": [
          "راه‌اندازی مشتری چیست؟ مراحل و اهداف آن | Curahold",
          "راه‌اندازی مشتری کاری است که مشتری تازه را از امضا به نخستین ارزش می‌رساند: تحویل از فروش، پیکربندی، آموزش و نخستین نتیجه‌هایی که خودش می‌بیند."
        ],
        "lead": "راه‌اندازی مشتری دورهٔ میان امضای قرارداد و لحظه‌ای است که مشتری تازه ارزشی را که خریده به دست می‌آورد، و کاری که تیم برای کوتاه کردن این دوره انجام می‌دهد.",
        "body": [
          {
            "h": "معمولاً چه چیزهایی را در بر می‌گیرد"
          },
          {
            "ul": [
              "تحویل از فروش، همراه با قول‌های داده‌شده.",
              "جلسهٔ آغاز که اهداف و تاریخ‌ها در آن توافق می‌شود.",
              "پیکربندی، ورود داده‌ها و آموزش.",
              "نخستین نتیجه‌ای که مشتری می‌بیند و می‌تواند نامش را بگوید."
            ]
          },
          {
            "h": "چرا مهم است"
          },
          {
            "p": "مشتریانی که زود ارزش را می‌بینند معمولاً می‌مانند. راه‌اندازی‌ای که طول بکشد، نخستین گفت‌وگوی تمدید را با تردید آغاز می‌کند."
          }
        ],
        "curahold": "اگر تیم راه‌اندازی دارید، معاملهٔ برنده‌شده با یک کارت تحویل به آن می‌رسد که ذی‌نفعان، قول‌های داده‌شده، درخواست‌های باز و تاریخ‌های مهم را در خود دارد، و وظیفه‌هایش را می‌توان در پورتال مشتری با او به اشتراک گذاشت."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "هزینهٔ خدمت‌رسانی",
        "seo": [
          "هزینهٔ خدمت‌رسانی چیست؟ تعریفی برای تیم‌های مشتری | Curahold",
          "هزینهٔ خدمت‌رسانی یعنی رسیدگی به یک مشتری چقدر ساعت یا پول می‌برد، در برابر آنچه می‌پردازد. چطور سنجیده می‌شود و پیش از تمدید با نتیجه‌اش چه کنیم."
        ],
        "lead": "هزینهٔ خدمت‌رسانی تلاشی است که تیم صرف رسیدگی به یک مشتری می‌کند، در برابر مبلغی که همان مشتری می‌پردازد.",
        "body": [
          {
            "h": "چطور سنجیده می‌شود"
          },
          {
            "p": "ساده‌ترین سنجه ساعت است: زمانی که تیم در ۱۲ ماه گذشته برای مشتری ثبت کرده، تقسیم بر ارزش سالانهٔ قراردادش. مقایسهٔ همهٔ مشتریان با یک مقیاس نشان می‌دهد چه کسی در برابر آنچه می‌پردازد بیشترین رسیدگی را می‌گیرد."
          },
          {
            "h": "با نتیجه چه کنیم"
          },
          {
            "ul": [
              "کار پشت عدد بالا را پیدا کنید: درخواست‌های تکراری، قابلیتی که نیست، کمبودی در آموزش.",
              "علت را پیش از تمدید برطرف کنید، یا خدمت اضافه را در قیمت تمدید بگنجانید.",
              "مشتری را فقط با این عدد نسنجید: مشتری پرتوقع می‌تواند بهترین معرف شما هم باشد."
            ]
          }
        ],
        "curahold": "گزارش هزینهٔ خدمت‌رسانی برای هر مشتری ساعت‌های صرف‌شده در ۱۲ ماه گذشته به‌ازای هر ۱٬۰۰۰ از ارزش سالانه را نشان می‌دهد تا ببینید نگهداری چه کسی گران‌تر است."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "نرخ حفظ خالص درآمد (NRR)",
        "seo": [
          "نرخ حفظ خالص درآمد (NRR) چیست؟ تعریف و فرمول | Curahold",
          "نرخ حفظ خالص درآمد نشان می‌دهد گروهی از مشتریان یک سال بعد چقدر درآمد تکرارشونده می‌آورند، با احتساب تمدید، گسترش، کاهش و ریزش."
        ],
        "lead": "نرخ حفظ خالص درآمد (NRR) درآمد تکرارشونده‌ای است که گروهی از مشتریان امروز می‌آورند، به‌صورت درصدی از آنچه همان مشتریان یک سال پیش می‌آوردند.",
        "body": [
          {
            "h": "چگونه حساب می‌شود"
          },
          {
            "p": "درآمد تکرارشوندهٔ مشتریانی را که در آغاز دوره داشتید بردارید. گسترش‌ها را اضافه و کاهش‌ها و ریزش را کم کنید، سپس بر نقطهٔ شروع تقسیم کنید. مشتریان تازه حساب نمی‌شوند."
          },
          {
            "h": "چرا تیم‌ها دنبالش می‌کنند"
          },
          {
            "ul": [
              "بالای ۱۰۰٪ یعنی مشتریان فعلی خودبه‌خود رشد می‌کنند.",
              "نشان می‌دهد تمدید و گسترش از زیان‌ها بیشتر است یا نه.",
              "آهسته تغییر می‌کند و کار پیوسته با مشتری را پاداش می‌دهد."
            ]
          }
        ],
        "curahold": "فرصت‌های تمدید و گسترش در همان قیف فروشِ معامله‌های تازه قرار دارند و نمای تمدیدها هر مشتری را بر پایهٔ ماه تمدید، همراه با مبلغ در خطر، فهرست می‌کند."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "درآمد تکرارشوندهٔ سالانه (ARR)",
        "seo": [
          "درآمد تکرارشوندهٔ سالانه (ARR) چیست؟ تعریف کوتاه | Curahold",
          "درآمد تکرارشوندهٔ سالانه ارزش سالانهٔ اشتراک‌های امضاشده است: چه چیزی حساب می‌شود، چه چیزی نه، و تیم‌ها چطور آن را برای هر مشتری به کار می‌برند."
        ],
        "lead": "درآمد تکرارشوندهٔ سالانه (ARR) ارزش سالانهٔ اشتراک‌های جاری است: مبلغی که مشتریان، اگر چیزی تغییر نکند، در دوازده ماه می‌پردازند.",
        "body": [
          {
            "h": "چه چیزی حساب می‌شود"
          },
          {
            "ul": [
              "هزینهٔ اشتراک، تبدیل‌شده به مبلغ سالانه.",
              "افزونه‌های تکرارشونده و صندلی‌های اضافه.",
              "نه هزینه‌های یک‌باره مثل راه‌اندازی یا آموزش."
            ]
          },
          {
            "h": "چرا برای هر مشتری مهم است"
          },
          {
            "p": "ARR هر مشتری نشان می‌دهد درآمد کجاست؛ تیم به بزرگ‌ترین تمدیدها توجه لازم را می‌دهد و می‌بیند وقتی مشتری‌ای ساکت می‌شود چه مبلغی در خطر است."
          }
        ],
        "curahold": "ARR می‌تواند فیلدی روی هر مشتری باشد و یک گزارش آن را بر پایهٔ مسئول، بازهٔ امتیاز سلامت یا ماه تمدید، با دسترسی خود هر خواننده، جمع می‌زند."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "بازبینی کسب‌وکار (QBR)",
        "seo": [
          "بازبینی کسب‌وکار (QBR) چیست؟ هدف و دستور جلسه | Curahold",
          "بازبینی کسب‌وکار جلسه‌ای منظم است که در آن مشتری و تأمین‌کننده نتایج، قول‌های باز و برنامهٔ پیش رو را مرور می‌کنند؛ معمولاً هر فصل یک بار."
        ],
        "lead": "بازبینی کسب‌وکار، که اغلب فصلی است و QBR نامیده می‌شود، جلسه‌ای است که در آن مشتری و تأمین‌کننده نتایج را مرور و برنامهٔ بعدی را توافق می‌کنند.",
        "body": [
          {
            "h": "چه چیزهایی را پوشش می‌دهد"
          },
          {
            "ul": [
              "نتایج در برابر هدف‌های دفعهٔ قبل.",
              "آنچه در سمت مشتری تغییر کرده است.",
              "درخواست‌ها و قول‌های باز و وضعیت هرکدام.",
              "برنامه و مسئولان دورهٔ بعد."
            ]
          },
          {
            "h": "چه چیزی آن را مفید می‌کند"
          },
          {
            "p": "با گام‌های بعدیِ دارای مسئول و تاریخ تمام می‌شود. بازبینی‌ای که اقدام‌هایش نوشته نشود، تا بازبینی بعدی فراموش می‌شود."
          }
        ],
        "curahold": "بازبینی کسب‌وکار جلسه‌ای روی خط زمانی مشتری است و گام‌های بعدیِ نوشته‌شده در آن به وظیفه‌هایی با مسئول و تاریخ تبدیل می‌شوند."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "Customer Success Manager (CSM) چه کاری می‌کند؟ | Curahold",
          "Customer Success Manager پس از فروش از گروهی از مشتریان مراقبت می‌کند: راه‌اندازی، استفاده، بازبینی‌ها، تمدیدها و تشخیص زودهنگام ریسک."
        ],
        "lead": "Customer Success Manager (CSM) پس از فروش از گروهی از مشتریان مراقبت می‌کند تا ارزشی را که خریده‌اند به دست آورند و بمانند.",
        "body": [
          {
            "h": "این نقش معمولاً شامل چیست"
          },
          {
            "ul": [
              "راه‌اندازی مشتریان تازه یا تحویل گرفتنشان از تیم راه‌اندازی.",
              "گفت‌وگوهای منظم و بازبینی‌های کسب‌وکار.",
              "پایش سلامت و اقدام در برابر هشدارهای زودهنگام.",
              "آماده‌سازی تمدیدها و دیدن فرصت رشد."
            ]
          },
          {
            "h": "زمان کجا صرف می‌شود"
          },
          {
            "p": "یک CSM اغلب از ده‌ها مشتری مراقبت می‌کند. دانستن اینکه این هفته کدام‌یک به توجه نیاز دارد، از تقسیم برابر زمان میان همه مهم‌تر است."
          }
        ],
        "curahold": "هر مشتری در هر دپارتمان یک مسئول دارد و فهرست هر فرد بر پایهٔ اینکه چه کسی به او نیاز دارد، با دلیل و گام بعدی، مرتب می‌شود."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "درآمد گسترش",
        "seo": [
          "درآمد گسترش چیست؟ فروش بیشتر و فروش متقابل | Curahold",
          "درآمد گسترش درآمد تکرارشوندهٔ اضافه از مشتریان فعلی است: صندلی بیشتر، طرح بالاتر یا محصولی دیگر. از کجا می‌آید و تیم‌ها چطور پیدایش می‌کنند."
        ],
        "lead": "درآمد گسترش درآمد تکرارشوندهٔ اضافه‌ای است که از مشتریان فعلی‌تان می‌آید: صندلی بیشتر، طرح بالاتر یا محصولی دیگر.",
        "body": [
          {
            "h": "از کجا می‌آید"
          },
          {
            "ul": [
              "فروش بیشتر: بیشتر از آنچه استفاده می‌کنند، یا طرح بالاتر.",
              "فروش متقابل: محصولی که هنوز ندارند.",
              "رشد خودشان: تیم‌ها، شعبه‌ها یا کشورهای تازه."
            ]
          },
          {
            "h": "چه زمانی مطرحش کنیم"
          },
          {
            "p": "گسترش پس از ارزش می‌آید. پس از نتیجه‌ای که مشتری بتواند نامش را ببرد آسان‌تر است و وقتی قول‌های درخواست قبلی هنوز باز است، سخت‌تر."
          }
        ],
        "curahold": "نمای محصولات نشان می‌دهد کدام مشتری کدام محصول را دارد، پس جاهای خالی پیداست و باز کردن وظیفه برای هرکدام یک کلیک است."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "زمان رسیدن به ارزش",
        "seo": [
          "زمان رسیدن به ارزش چیست؟ تعریف و راه کوتاه‌کردن | Curahold",
          "زمان رسیدن به ارزش مدتی است که مشتری تازه از امضا تا نخستین نتیجه‌ای که بتواند نامش را ببرد منتظر می‌ماند. چرا برای تمدید مهم است و چطور کوتاهش کنیم."
        ],
        "lead": "زمان رسیدن به ارزش مدتی است که مشتری تازه میان امضا و نخستین نتیجه‌ای که می‌بیند و می‌تواند نامش را ببرد منتظر می‌ماند.",
        "body": [
          {
            "h": "چرا مهم است"
          },
          {
            "p": "نخستین گفت‌وگوی تمدید از روز امضا آغاز می‌شود. مشتری‌ای که در چند هفته ارزش را می‌بیند از رشد حرف می‌زند؛ آنکه هنوز منتظر است از قیمت."
          },
          {
            "h": "تیم‌ها چطور کوتاهش می‌کنند"
          },
          {
            "ul": [
              "در جلسهٔ آغاز روی یک نتیجهٔ نخست با تاریخ توافق کنید.",
              "قول‌های فروش را تحویل دهید تا چیزی دوبار پرسیده نشود.",
              "برنامه را با مشتری به اشتراک بگذارید تا هر دو طرف گام بعدی را ببینند."
            ]
          }
        ],
        "curahold": "برنامه‌های راه‌اندازی گام، هدف و تاریخ دارند و گام‌هایی را که انتخاب می‌کنید می‌توان در پورتال مشتری با او به اشتراک گذاشت."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "برنامهٔ موفقیت",
        "seo": [
          "برنامهٔ موفقیت مشتری چیست؟ بخش‌ها و کاربرد | Curahold",
          "برنامهٔ موفقیت می‌نویسد مشتری به چه می‌خواهد برسد، دو طرف چطور به آن می‌رسند و پیشرفت چگونه سنجیده می‌شود؛ مرجعی برای هر بازبینی."
        ],
        "lead": "برنامهٔ موفقیت می‌نویسد مشتری به چه می‌خواهد برسد، دو طرف چه گام‌هایی برمی‌دارند و پیشرفت چگونه سنجیده می‌شود.",
        "body": [
          {
            "h": "معمولاً چه چیزهایی دارد"
          },
          {
            "ul": [
              "هدف‌های مشتری با زبان خودش.",
              "گام‌ها، مسئولان و تاریخ‌ها در هر دو طرف.",
              "سنجه‌هایی که پیشرفت را نشان می‌دهند."
            ]
          },
          {
            "h": "چگونه به کار می‌رود"
          },
          {
            "p": "مرجع هر گفت‌وگو و بازبینی کسب‌وکار است. وقتی با هم به‌روز شود، هر دو طرف به سوی همان نتیجه کار می‌کنند."
          }
        ],
        "curahold": "یک برنامهٔ راه‌اندازی هدف‌ها، گام‌ها با مسئول و تاریخ و سنجه‌هایی را که دنبال می‌کنید نگه می‌دارد و گام‌های مربوط به مشتری را می‌توان در پورتال به اشتراک گذاشت."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "نقشهٔ ذی‌نفعان",
        "seo": [
          "نقشهٔ ذی‌نفعان در فروش و موفقیت مشتری چیست؟ | Curahold",
          "نقشهٔ ذی‌نفعان افرادی را که در سمت مشتری بر تصمیم اثر دارند، نقششان و موضعشان را فهرست می‌کند تا تیم بداند چه کسی را و چه زمانی درگیر کند."
        ],
        "lead": "نقشهٔ ذی‌نفعان افرادی را که در سمت مشتری در یک تصمیم نقش دارند، جایگاهشان و موضع هرکدام را فهرست می‌کند.",
        "body": [
          {
            "h": "چه چیزی را ثبت می‌کند"
          },
          {
            "ul": [
              "نقش و اثرگذاری هر فرد.",
              "موضعش: حامی، بی‌طرف یا مانع.",
              "کسانی که هنوز با آنها دیدار نشده است."
            ]
          },
          {
            "h": "چرا پس از فروش مهم است"
          },
          {
            "p": "تصمیم تمدید به‌ندرت را یک نفر می‌گیرد. وقتی حامی اصلی می‌رود، نقشه نشان می‌دهد چه کس دیگری ارزش را می‌شناسد و چه کسی باید آن را بشنود."
          }
        ],
        "curahold": "هر معامله ذی‌نفعانش را با عنوان و موضعشان نگه می‌دارد و آنها همراه کارت تحویل به تیمی می‌روند که مشتری را تحویل می‌گیرد."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "حامی اصلی (Champion)",
        "seo": [
          "حامی اصلی (Champion) در رابطه با مشتری کیست؟ | Curahold",
          "حامی اصلی کسی در سمت مشتری است که به محصول شما باور دارد و در شرکتش از آن دفاع می‌کند. چرا مهم است و وقتی می‌رود چه باید کرد."
        ],
        "lead": "حامی اصلی (Champion) کسی در سمت مشتری است که به آنچه ارائه می‌دهید باور دارد و درون شرکتش از آن دفاع می‌کند.",
        "body": [
          {
            "h": "چرا مهم است"
          },
          {
            "p": "جلسه‌ها را هماهنگ می‌کند، از بودجه دفاع می‌کند و مشکلات را زود مطرح می‌کند. مشتریانی که حامی فعال دارند آسان‌تر تمدید می‌کنند."
          },
          {
            "h": "وقتی حامی می‌رود"
          },
          {
            "ul": [
              "بفهمید چه کسی بخش کار او را برعهده می‌گیرد.",
              "ارزش را دوباره به کسانی که مانده‌اند نشان دهید.",
              "تا پیدا شدن حامی تازه آن را ریسک بدانید."
            ]
          }
        ],
        "curahold": "داشتن حامی اصلی می‌تواند نشانه‌ای در امتیاز سلامت باشد، پس مشتری‌ای که حامی ندارد یا حامی‌اش رفته، جلو می‌آید."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "تحویل از فروش به موفقیت مشتری",
        "seo": [
          "تحویل از فروش به موفقیت مشتری: چه چیزی منتقل شود | Curahold",
          "تحویل از فروش به موفقیت مشتری قول‌ها، افراد مهم و تاریخ‌های کلیدی را منتقل می‌کند تا مشتری مجبور نشود همه‌چیز را دوباره توضیح دهد."
        ],
        "lead": "تحویل از فروش به موفقیت مشتری هر آنچه تیم بعدی لازم دارد را منتقل می‌کند تا مشتری هرگز مجبور نشود همه‌چیز را از نو توضیح دهد.",
        "body": [
          {
            "h": "چه چیزی منتقل شود"
          },
          {
            "ul": [
              "ذی‌نفعان و موضع هرکدام.",
              "آنچه در فروش قول داده شد.",
              "درخواست‌های باز و پرسش‌های محصول.",
              "تاریخ بستن معامله و تاریخ تمدید."
            ]
          },
          {
            "h": "چه چیزی خراب می‌شود"
          },
          {
            "p": "قول‌هایی که در تماس فروش داده شد و کسی ننوشت. مشتری آنها را به یاد دارد؛ تیم تازه نه."
          }
        ],
        "curahold": "معاملهٔ برنده‌شده به‌صورت یک کارت تحویل به تیم بعدی می‌رسد: ذی‌نفعان، قول‌های داده‌شده، درخواست‌های باز محصول و تاریخ‌های کلیدی."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "درخواست قابلیت",
        "seo": [
          "درخواست قابلیت از سوی مشتری را چطور مدیریت کنیم؟ | Curahold",
          "درخواست قابلیت یعنی مشتری چیزی بخواهد که محصول هنوز انجام نمی‌دهد. چطور ثبتش کنیم، به مشتری پیوندش دهیم و وقتی آماده شد خبر دهیم."
        ],
        "lead": "درخواست قابلیت یعنی مشتری چیزی بخواهد که محصول هنوز انجام نمی‌دهد؛ اغلب در یک جلسه یا گفت‌وگوی پشتیبانی.",
        "body": [
          {
            "h": "چطور خوب مدیریتش کنیم"
          },
          {
            "ul": [
              "ثبت کنید چه کسی خواست و چرا برایش مهم است.",
              "درخواست‌های مربوط به یک چیز را به هم پیوند دهید.",
              "بر پایهٔ مشتریان منتظر و ارزش اولویت بدهید."
            ]
          },
          {
            "h": "بستن چرخه"
          },
          {
            "p": "بخشی که بیشتر تیم‌ها جا می‌اندازند، خبر دادن به مشتری هنگام آماده شدن کار است. درخواستی که با یادداشت انتشار پاسخ داده شود، بیش از خود قابلیت اعتماد می‌سازد."
          }
        ],
        "curahold": "چند درخواست مشتری را می‌توان به یک استوری پیوند داد؛ بک‌لاگ مشتریان منتظر، ارزششان و نزدیک‌ترین تمدید را نشان می‌دهد و وقتی کار تمام شد، پیش‌نویسی آماده برای ارسال به مسئول می‌رسد."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "نقطهٔ تماس",
        "seo": [
          "نقطهٔ تماس با مشتری چیست؟ تعریف و نمونه‌ها | Curahold",
          "نقطهٔ تماس هر لحظهٔ ارتباط میان مشتری و تیم شماست: تماس، جلسه، پاسخ. چرا آهنگ آنها از تعدادشان مهم‌تر است."
        ],
        "lead": "نقطهٔ تماس هر لحظهٔ ارتباط میان مشتری و تیم شماست: یک تماس، جلسه، ایمیل یا پاسخ به درخواست.",
        "body": [
          {
            "h": "چرا آهنگ مهم است"
          },
          {
            "p": "سکوت‌های طولانی هشداری زودهنگام‌اند. تمدید مشتری‌ای که شش هفته کسی با او حرف نزده، سخت‌تر از مشتری‌ای است که هر ماه دیده می‌شود."
          },
          {
            "h": "از هرکدام چه باید بماند"
          },
          {
            "ul": [
              "کی رخ داد و چه کسانی بودند.",
              "چه تصمیمی گرفته شد.",
              "گام بعدی، با مسئول و تاریخ."
            ]
          }
        ],
        "curahold": "جلسه‌ها، تماس‌ها و یادداشت‌ها روی خط زمانی هر مشتری می‌مانند، فاصله از آخرین تماس در امتیاز سلامت حساب می‌شود و هر مشتری می‌تواند آهنگ بازبینی داشته باشد."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "پیگیری جلسه",
        "seo": [
          "پیگیری جلسهٔ مشتری: گام‌های بعدی که انجام شوند | Curahold",
          "پیگیری جلسه آنچه را با مشتری توافق شد به کاری با مسئول و تاریخ تبدیل می‌کند تا قول‌ها نگه داشته شوند و مشتری هم این را ببیند."
        ],
        "lead": "پیگیری جلسه یعنی تبدیل آنچه در جلسه با مشتری توافق شد به کاری با مسئول و تاریخ، پیش از آنکه جزئیات از یاد بروند.",
        "body": [
          {
            "h": "چرا جا می‌ماند"
          },
          {
            "p": "گام‌های بعدی در یادداشت‌های یک نفر می‌مانند. یک هفته بعد کسی به یاد ندارد چه کسی گفت چه کاری می‌کند و نخستین کسی که می‌فهمد مشتری است."
          },
          {
            "h": "پیگیری خوب چه شکلی است"
          },
          {
            "ul": [
              "گام‌های بعدی پیش از پایان تماس نوشته می‌شوند.",
              "هرکدام مسئول و تاریخ دارد.",
              "یادداشتی کوتاه برای مشتری که آنها را تأیید می‌کند."
            ]
          }
        ],
        "curahold": "گام‌های بعدیِ نوشته‌شده در یادداشت‌های جلسه به وظیفه‌هایی با مسئول و تاریخ، پیوندخورده به مشتری، تبدیل می‌شوند و قول‌ها را می‌توان در پورتال با مشتری به اشتراک گذاشت."
      }
    ]
  },
  "zh-Hans": {
    "title": "面向客户团队的模板与术语表",
    "lead": "可直接复制的模板和通俗易懂的术语解释，覆盖留住客户的日常工作：续约、业务回顾、健康评分和客户流失。",
    "seo": [
      "面向客户成功团队的模板与术语表 | Curahold",
      "这里汇集了可直接复制的续约手册和业务回顾免费模板，以及健康评分、客户流失、合同续约和客户门户的通俗解释，帮助客户团队把留住客户的日常工作做扎实。"
    ],
    "templates": "模板",
    "glossary": "术语表",
    "inCurahold": "在 Curahold 中",
    "nav": [
      "模板与术语表",
      "续约步骤、回顾议程和术语解释。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "续约手册模板",
        "seo": [
          "续约手册模板：从到期前 90 天开始 | Curahold",
          "一份可直接复制的续约手册：合同到期前 90、75、60 和 30 天分别要做什么，每一步由谁负责，续约沟通之前还需要确认哪些关键事项，附可直接使用的检查清单。"
        ],
        "lead": "续约不是在到期当天赢下的，而是在到期前的三个月里。复制这些步骤，为每一步指定负责人，并从续约日期倒推时间。",
        "body": [
          {
            "h": "步骤"
          },
          {
            "ol": [
              "到期前 90 天：查看使用情况、未处理的需求和健康评分，记下所有让你担心的地方。",
              "到期前 75 天：与决策人和日常对接人约好续约沟通。",
              "到期前 60 天：发送续约报价，包含席位或方案的变化。",
              "到期前 30 天：跟进报价，并以书面形式确认尚未解决的问题。",
              "续约当天：确认已签署的续约，并记录双方的约定。"
            ]
          },
          {
            "h": "续约沟通之前"
          },
          {
            "ul": [
              "客户今年想达成什么目标，达成了吗？",
              "之前会议中的承诺，哪些还没有完成？",
              "谁来做决定，他最近和你开过会吗？"
            ]
          }
        ],
        "curahold": "开启续约后，续约手册会在每个续约日期前 90 天把各个步骤创建为任务，每项任务都有负责人和从续约日期倒推的截止日期。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "业务回顾（QBR）议程模板",
        "seo": [
          "业务回顾（QBR）会议议程模板 | Curahold",
          "一小时业务回顾的会议议程模板：对照目标的结果、客户方发生的变化、尚未兑现的承诺、下季度计划，以及明确的后续步骤、负责人和完成日期，适合每季度使用。"
        ],
        "lead": "季度业务回顾应当让客户看到价值的证据，也让双方带着同样的后续步骤离开。这份议程可以在一小时内完成。",
        "body": [
          {
            "h": "议程（60 分钟）"
          },
          {
            "ol": [
              "5 分钟：会议目标和参会人。",
              "15 分钟：对照上季度目标的结果。",
              "10 分钟：客户方的变化：人员、优先事项、预算。",
              "10 分钟：未完成的需求和承诺，以及各自的进展。",
              "15 分钟：下季度计划。",
              "5 分钟：后续步骤，每一步都有负责人和日期。"
            ]
          },
          {
            "h": "会议结束后"
          },
          {
            "p": "当天发送一份简短总结：达成的共识、带负责人和日期的后续步骤，以及下次回顾的时间。"
          }
        ],
        "curahold": "把回顾记录为客户的一次会议并写下后续步骤，保存后每一步都会变成有负责人和日期的任务，还可以在客户门户中共享。"
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "从销售到上线团队的客户交接清单",
        "seo": [
          "从销售到上线团队的客户交接清单模板 | Curahold",
          "赢单后的客户交接清单：关键人有哪些、销售过程中承诺了什么、还有哪些未完成的需求、重要日期，以及与客户的第一次会议应该怎么开始，让上线团队从第一天就接得住。"
        ],
        "lead": "客户头几个月的问题，大多始于交接：销售知道的情况，上线团队往往从未听说。复制这份清单，在商机交出之前把它填好。",
        "body": [
          {
            "h": "交接时必须带上的内容"
          },
          {
            "ul": [
              "关键人：决策人、日常对接人和客户内部的支持者，以及联系每个人的方式。",
              "销售过程中的承诺：功能、日期、折扣，书面或电话里说过的一切。",
              "客户正在等待的未完成产品需求，以及就此告诉过客户的内容。",
              "重要日期：成交日期、客户期待的上线日期和续约日期。",
              "购买原因：想解决的问题，以及客户如何判断成功。"
            ]
          },
          {
            "h": "第一次会议之前"
          },
          {
            "ol": [
              "销售和上线负责人花 15 分钟一起过一遍清单。",
              "任何不清楚的地方，回头问销售，而不是问客户。",
              "第一次会议先用客户自己的话复述客户的目标。"
            ]
          }
        ],
        "curahold": "赢单后，Curahold 可以为下一个团队准备一张交接卡，汇总关键人、已做出的承诺、未完成的产品需求，以及成交日期和续约日期；交接卡会一直等待新负责人确认。"
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "客户健康评分表模板",
        "seo": [
          "客户健康评分表模板：信号、分值与分档 | Curahold",
          "一份可直接复制的健康评分表：团队能观察到的六个信号、每个信号加减多少分，以及帮你判断哪些客户需要关注的分档标准，附季度复盘方法，让每一分都有据可依。"
        ],
        "lead": "健康评分只有在团队信任它时才有用，而团队只信任自己解释得清的分数。从几个看得见的信号开始，给每个信号定一个权重，并写下理由。",
        "body": [
          {
            "h": "信号与分值（从 50 分起算）"
          },
          {
            "ul": [
              "最近 30 天内与客户沟通过：+15。60 天没有联系：−20。",
              "客户方有会回复的支持者：+15。支持者已离职：−25。",
              "承诺的工作逾期：每项 −10，最多 −30。",
              "超过两周未解决的障碍或支持请求：−10。",
              "使用量稳定或上升：+10。连续两个月下降：−15。",
              "距续约不到 90 天且尚未约会议：−10。"
            ]
          },
          {
            "h": "分档"
          },
          {
            "ul": [
              "70 分及以上：健康，保持节奏。",
              "40–69 分：需关注，本周内找出原因。",
              "40 分以下：有风险，负责人主动联系客户，并告知团队负责人。"
            ]
          },
          {
            "p": "每个季度拿真实流失和留存的客户对照检查权重，把判断错的项改掉。"
          }
        ],
        "curahold": "每个客户都有一个按您设定的规则计算的 0 到 100 分评分，并列出原因和最近 30 天的变化趋势。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "客户健康评分",
        "seo": [
          "什么是客户健康评分？通俗易懂的定义 | Curahold",
          "客户健康评分用一个数字概括客户关系的状况，依据最近一次联系、逾期的工作和未解决的问题等信号计算得出，帮助团队优先关注续约有风险的客户，并说明每次变化的原因。"
        ],
        "lead": "客户健康评分是一个数字，通常在 0 到 100 之间，用来概括与客户的关系进展得好不好。",
        "body": [
          {
            "p": "它由团队能观察到的信号构成：最近一次和客户沟通是什么时候，承诺的工作是否逾期，客户方是否有强有力的支持者，还有未解决的阻碍和客服请求。每个信号都会加分或减分。"
          },
          {
            "h": "为什么重要"
          },
          {
            "p": "几十个客户放在一起，悄悄疏远的那一个很容易被淹没。按评分排序后，注意力会先落在续约有风险的客户身上。"
          },
          {
            "h": "好的评分具备什么"
          },
          {
            "ul": [
              "能解释自己：谁都能看到是哪些信号让它变化。",
              "使用团队信任、能据此采取行动的信号。",
              "长期跟踪，而不是只看一次。"
            ]
          }
        ],
        "curahold": "每个客户都有一个按您设定的规则计算的 0 到 100 分评分，并列出原因和最近 30 天的变化趋势。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "客户流失（Churn）",
        "seo": [
          "什么是客户流失（Churn）？定义与早期信号 | Curahold",
          "客户流失是指一段时间内失去的客户或收入所占的比例。本文说明什么算流失、如何计算流失率，以及流失发生之前通常会出现的几种早期信号，以及如何应对。"
        ],
        "lead": "客户流失是指客户不再购买：取消订阅或不再续约。流失率是指一段时间内失去的客户或收入所占的比例。",
        "body": [
          {
            "h": "如何计算"
          },
          {
            "ul": [
              "客户流失率：期间内流失的客户数，除以期初的客户数。",
              "收入流失率：因取消和降级而损失的经常性收入，除以期初的经常性收入。"
            ]
          },
          {
            "h": "先出现的信号"
          },
          {
            "p": "流失很少毫无预兆。联系变少，承诺的工作拖延，支持者离开，客服请求越积越多。持续关注这些信号，团队才能在续约日期之前采取行动。"
          }
        ],
        "curahold": "这类信号会计入每个客户的健康评分，让逐渐疏远的客户在续约之前很早就排到前面。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "合同续约",
        "seo": [
          "什么是合同续约？流程与时间安排 | Curahold",
          "合同续约是把与客户的协议延长到新的周期。本文介绍何时开始准备、续约流程通常怎么走，以及为什么最好在到期前几个月就开始推进续约工作，避免临时抱佛脚。"
        ],
        "lead": "合同续约是把客户的协议延长到下一个周期，往往伴随变化：更多席位、不同的方案或新的价格。",
        "body": [
          {
            "h": "什么时候开始"
          },
          {
            "p": "对于年度合同，通常在到期前约 90 天开始准备。这样才有时间回顾已交付的价值、与决策人会面、发送报价，并从容地解答问题。"
          },
          {
            "h": "常见的问题"
          },
          {
            "ul": [
              "发现到期日期太晚。",
              "签合同的人已经离开。",
              "一年中做出的承诺还没有完成。"
            ]
          }
        ],
        "curahold": "每次续约都可以在到期前 90 天自动启动续约手册，生成有负责人和日期的任务，同时在销售管道中创建续约商机。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "客户门户",
        "seo": [
          "什么是客户门户？定义与常见用途 | Curahold",
          "客户门户是客户查看共享工作、提交需求、阅读回复的专属空间，不必再在零散的邮件往来中来回查找，团队也能把所有请求集中到一个地方统一处理，回复更及时。"
        ],
        "lead": "客户门户是一个专属网页，客户可以在这里查看与自己共享的工作、提交需求，并阅读团队的回复。",
        "body": [
          {
            "h": "团队为什么使用"
          },
          {
            "p": "它取代了进度汇报邮件。客户随时可以查看进展，需求也集中到一个地方，而不是散落在各个邮件里。"
          },
          {
            "h": "共享哪些内容"
          },
          {
            "ul": [
              "上线步骤和日期。",
              "会议上承诺的任务。",
              "对客户需求的答复。"
            ]
          }
        ],
        "curahold": "客户通过邮件中的链接登录，只能看到您共享的内容；他们提交的需求会进入您团队的看板。"
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "客户上线",
        "seo": [
          "什么是客户上线（Onboarding）？流程与目标 | Curahold",
          "客户上线是把新客户从签约带到首次获得价值的工作，包括销售交接、配置、培训，以及客户能亲眼看到的第一批成果。本文说明它通常包含哪些环节、为什么重要，以及如何缩短它。"
        ],
        "lead": "客户上线是指从签约到新客户第一次获得所购买价值之间的这段时间，以及团队为缩短这段时间所做的工作。",
        "body": [
          {
            "h": "通常包括"
          },
          {
            "ul": [
              "销售交接，附带已做出的承诺。",
              "确定目标和日期的启动会。",
              "配置、数据导入和培训。",
              "客户能亲眼看到、说得出来的第一个成果。"
            ]
          },
          {
            "h": "为什么重要"
          },
          {
            "p": "早早看到价值的客户更愿意留下；拖得太久的上线，会让第一次续约沟通从怀疑开始。"
          }
        ],
        "curahold": "如果你有上线团队，赢单的商机会以一张交接卡送到他们手中，包含关键人、已做出的承诺、未完成的需求和重要日期；其中的任务可以在客户门户里与客户共享。"
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "服务成本",
        "seo": [
          "什么是服务成本？客户团队的衡量方法 | Curahold",
          "服务成本是照顾一个客户所花的时间或金钱，与该客户付费的对比。本文说明如何衡量服务成本，以及在续约之前如何利用这个结果采取行动，避免只看数字就下结论。"
        ],
        "lead": "服务成本是团队照顾一个客户所投入的精力，与这个客户所付费用之间的对比。",
        "body": [
          {
            "h": "如何衡量"
          },
          {
            "p": "最简单的衡量单位是小时：团队过去 12 个月在某个客户上记录的时间，除以该客户的年度合同金额。用同一把尺子比较所有客户，就能看出谁相对付费占用了最多的照顾。"
          },
          {
            "h": "结果怎么用"
          },
          {
            "ul": [
              "找出数字偏高背后的工作：反复出现的请求、缺少的功能、培训上的空白。",
              "在续约前解决根源，或把额外服务计入续约价格。",
              "不要只凭这个数字评价客户：要求多的客户，也可能是你最好的推荐人。"
            ]
          }
        ],
        "curahold": "服务成本报表按客户列出近 12 个月每 1,000 年度价值花费的小时，让你看出谁的服务成本最高。"
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "净收入留存率（NRR）",
        "seo": [
          "什么是净收入留存率（NRR）？定义与公式 | Curahold",
          "净收入留存率显示一组现有客户一年后带来多少经常性收入，计入续约、增购、降级和流失，不含新客户。本文说明它的计算方法、为什么高于 100% 很重要，以及团队如何提升它。"
        ],
        "lead": "净收入留存率（NRR）是一组客户今天带来的经常性收入，占同一批客户一年前收入的比例。",
        "body": [
          {
            "h": "如何计算"
          },
          {
            "p": "取期初已有客户的经常性收入，加上他们的增购，减去降级和流失，再除以期初数值。新客户不计入。"
          },
          {
            "h": "团队为什么关注它"
          },
          {
            "ul": [
              "高于 100% 说明现有客户自己在增长。",
              "它能看出续约和增购是否超过损失。",
              "它变化缓慢，奖励的是持续的客户工作。"
            ]
          }
        ],
        "curahold": "续约和增购商机与新商机位于同一个销售管道中，续约视图按续约月份列出每个客户及其面临风险的金额。"
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "年度经常性收入（ARR）",
        "seo": [
          "什么是年度经常性收入（ARR）？简明定义 | Curahold",
          "年度经常性收入是已签订阅的年度价值。本文说明哪些收入计入、哪些不计入，以及团队如何按客户查看 ARR，把精力放在最大的续约上，并看清客户沉默时有多少收入面临风险。"
        ],
        "lead": "年度经常性收入（ARR）是有效订阅的年度价值：如果一切不变，客户在十二个月内将支付的金额。",
        "body": [
          {
            "h": "哪些计入"
          },
          {
            "ul": [
              "订阅费，折算为年度金额。",
              "经常性的附加功能和额外席位。",
              "不含设置、培训等一次性费用。"
            ]
          },
          {
            "h": "为什么要按客户看"
          },
          {
            "p": "每个客户的 ARR 显示收入在哪里，团队可以给最大的续约应有的关注，并在客户沉默时看到有多少收入面临风险。"
          }
        ],
        "curahold": "ARR 可以是每个客户的一个字段，报表可按负责人、健康评分区间或续约月份汇总，并遵循每位读者自己的权限。"
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "业务回顾（QBR）",
        "seo": [
          "什么是业务回顾（QBR）？目的与议程 | Curahold",
          "业务回顾是客户与供应商定期回顾成果、未兑现的承诺和下一阶段计划的会议，通常每季度一次。本文介绍它应涵盖的内容，以及为什么好的回顾要以有负责人和日期的下一步结束。"
        ],
        "lead": "业务回顾通常按季度进行，也称 QBR，是客户与供应商回顾成果并商定下一阶段计划的会议。",
        "body": [
          {
            "h": "涵盖哪些内容"
          },
          {
            "ul": [
              "对照上次设定目标的成果。",
              "客户方发生了什么变化。",
              "未完成的请求和承诺及其进展。",
              "下一阶段的计划和负责人。"
            ]
          },
          {
            "h": "怎样才有用"
          },
          {
            "p": "以有负责人和日期的下一步结束。行动没有写下来的回顾，到下一次之前就会被忘记。"
          }
        ],
        "curahold": "业务回顾是客户时间线上的一次会议，会上写下的下一步会变成有负责人和日期的任务。"
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager（CSM）",
        "seo": [
          "Customer Success Manager 做什么？ | Curahold",
          "Customer Success Manager 在成交后负责一组客户：上线、使用、定期沟通、业务回顾、续约，以及及早发现风险，让客户获得所买的价值并留下来。本文介绍这个角色的职责和时间分配。"
        ],
        "lead": "Customer Success Manager（CSM）在成交后负责一组客户，让他们获得所购买的价值并留下来。",
        "body": [
          {
            "h": "这个角色通常包括"
          },
          {
            "ul": [
              "带新客户上线，或从上线团队接手。",
              "定期沟通和业务回顾。",
              "关注健康状况，对早期预警采取行动。",
              "准备续约，发现增长空间。"
            ]
          },
          {
            "h": "时间花在哪里"
          },
          {
            "p": "一位 CSM 往往负责几十个客户。知道本周哪一个最需要关注，比平均分配时间更重要。"
          }
        ],
        "curahold": "每个客户在每个部门都有一位负责人，每个人的列表按谁最需要他排序，并附上原因和下一步。"
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "增购收入",
        "seo": [
          "什么是增购收入？追加销售与交叉销售 | Curahold",
          "增购收入是来自现有客户的额外经常性收入：更多席位、更高套餐或另一款产品。本文说明它来自追加销售、交叉销售还是客户自身的增长，以及在什么时候提出最合适。"
        ],
        "lead": "增购收入是来自现有客户的额外经常性收入：更多席位、更高的套餐或另一款产品。",
        "body": [
          {
            "h": "从哪里来"
          },
          {
            "ul": [
              "追加销售：更多已在用的，或更高的套餐。",
              "交叉销售：他们还没有的产品。",
              "客户自身的增长：新团队、新站点或新国家。"
            ]
          },
          {
            "h": "何时提出"
          },
          {
            "p": "增购跟随价值而来。在客户能说出的成果之后最容易，在上次请求的承诺仍未兑现时最难。"
          }
        ],
        "curahold": "产品视图显示哪个客户拥有哪款产品，空白一目了然，为其中一项创建任务只需一次点击。"
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "价值实现时间",
        "seo": [
          "什么是价值实现时间（TTV）？如何缩短 | Curahold",
          "价值实现时间是新客户从签约到获得第一个可说出的成果所等待的时间。本文说明它为什么直接影响第一次续约，以及团队如何通过启动会、交接和共享计划来缩短它。"
        ],
        "lead": "价值实现时间是新客户从签约到看到并能说出第一个成果之间所等待的时间。",
        "body": [
          {
            "h": "为什么重要"
          },
          {
            "p": "第一次续约对话从签约当天就开始了。几周内看到价值的客户谈增长，仍在等待的客户谈价格。"
          },
          {
            "h": "团队如何缩短它"
          },
          {
            "ul": [
              "在启动会上商定一个有日期的首个成果。",
              "交接销售做出的承诺，避免重复询问。",
              "与客户共享计划，让双方都看到下一步。"
            ]
          }
        ],
        "curahold": "上线计划包含步骤、目标和日期，你选择的步骤可以在客户门户中与客户共享。"
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "成功计划",
        "seo": [
          "什么是客户成功计划？组成与用法 | Curahold",
          "成功计划写下客户想要达成的目标、双方要采取的步骤、负责人和日期，以及衡量进展的指标。本文说明它通常包含哪些部分，以及如何在每次沟通和业务回顾中使用它。"
        ],
        "lead": "成功计划写下客户想要达成什么、双方将采取哪些步骤，以及如何衡量进展。",
        "body": [
          {
            "h": "通常包含"
          },
          {
            "ul": [
              "客户用自己的话表述的目标。",
              "双方的步骤、负责人和日期。",
              "体现进展的衡量指标。"
            ]
          },
          {
            "h": "如何使用"
          },
          {
            "p": "它是每次沟通和业务回顾的参照。双方一起更新，就能朝着同一个结果努力。"
          }
        ],
        "curahold": "上线计划记录目标、有负责人和日期的步骤以及你跟踪的指标，面向客户的步骤可以在门户中共享。"
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "干系人地图",
        "seo": [
          "什么是干系人地图？B2B 中的用法 | Curahold",
          "干系人地图列出客户方影响决策的人、他们的角色、影响力和立场，以及还没见过的人。本文说明它记录什么，以及为什么在成交之后、尤其是续约之前也同样重要。"
        ],
        "lead": "干系人地图列出客户方参与决策的人、他们的角色以及各自的立场。",
        "body": [
          {
            "h": "记录什么"
          },
          {
            "ul": [
              "每个人的角色和影响力。",
              "立场：支持、中立或反对。",
              "尚未见过面的人。"
            ]
          },
          {
            "h": "为什么在成交后也重要"
          },
          {
            "p": "续约决定很少由一个人做出。当内部支持者离开时，地图能显示还有谁了解价值、谁需要听到它。"
          }
        ],
        "curahold": "每个商机都保存干系人及其职务和立场，并随交接卡片一起转给接手客户的团队。"
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "内部支持者（Champion）",
        "seo": [
          "什么是客户方的内部支持者（Champion）？ | Curahold",
          "内部支持者是客户方相信你的产品、并在公司内部为它争取的人。本文说明为什么有活跃支持者的客户更容易续约，以及当支持者离职时团队应该采取哪些步骤。"
        ],
        "lead": "内部支持者（Champion）是客户方相信你所提供的东西，并在其公司内部为它争取的人。",
        "body": [
          {
            "h": "为什么重要"
          },
          {
            "p": "他推动会议安排、维护预算并及早提出问题。有活跃内部支持者的客户更容易续约。"
          },
          {
            "h": "支持者离开时"
          },
          {
            "ul": [
              "弄清由谁接手他的那部分工作。",
              "向留下的人重新展示价值。",
              "在找到新的支持者之前把它当作风险。"
            ]
          }
        ],
        "curahold": "是否有内部支持者可以作为健康评分中的一个信号，没有支持者或支持者已离开的客户会排到前面。"
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "从销售到客户成功的交接",
        "seo": [
          "销售到客户成功的交接：要传递什么 | Curahold",
          "从销售到客户成功的交接要传递干系人、销售中做出的承诺、未完成的请求和关键日期，让客户不必把一切重新解释一遍。本文列出要传递的内容和最常见的问题。"
        ],
        "lead": "从销售到客户成功的交接，把下一个团队需要的一切传递过去，让客户永远不必把一切重新解释一遍。",
        "body": [
          {
            "h": "要传递什么"
          },
          {
            "ul": [
              "干系人以及各自的立场。",
              "销售过程中做出的承诺。",
              "未完成的请求和产品问题。",
              "成交日期和续约日期。"
            ]
          },
          {
            "h": "常见问题"
          },
          {
            "p": "销售通话中做出却没人记下的承诺。客户记得，新团队却不知道。"
          }
        ],
        "curahold": "赢单的商机以一张交接卡片送达下一个团队，包含干系人、做出的承诺、未完成的产品请求和关键日期。"
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "功能请求",
        "seo": [
          "如何处理 B2B 客户的功能请求？ | Curahold",
          "功能请求是客户要求产品目前还做不到的事。本文说明如何记录是谁提出的、为什么重要，如何把同类请求关联起来并排优先级，以及如何在完成时告诉客户、形成闭环。"
        ],
        "lead": "功能请求是客户要求产品目前还做不到的事，常常出现在会议或支持对话中。",
        "body": [
          {
            "h": "如何处理好"
          },
          {
            "ul": [
              "记录是谁提出的，以及为什么对他重要。",
              "把关于同一件事的请求关联起来。",
              "按等待的客户和价值排优先级。"
            ]
          },
          {
            "h": "形成闭环"
          },
          {
            "p": "大多数团队忽略的是在工作完成时告诉客户。用一条发布说明回应的请求，比功能本身更能建立信任。"
          }
        ],
        "curahold": "多个客户请求可以关联到同一个用户故事；待办事项显示等待的客户、其价值和最近的续约，工作完成时负责人会收到一份可直接发送的草稿。"
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "客户接触点",
        "seo": [
          "什么是客户接触点？定义与示例 | Curahold",
          "客户接触点是客户与团队之间的每一次接触：电话、会议、邮件或对请求的回复。本文说明为什么接触的节奏比次数更重要，以及每次接触之后应该留下哪些信息。"
        ],
        "lead": "客户接触点是客户与你的团队之间的每一次接触：一次通话、一次会议、一封邮件或对请求的回复。",
        "body": [
          {
            "h": "为什么节奏重要"
          },
          {
            "p": "长时间的沉默是早期预警。六周没人联系过的客户，比每月见面的客户更难续约。"
          },
          {
            "h": "每次要留下什么"
          },
          {
            "ul": [
              "发生时间和参与者。",
              "做出的决定。",
              "有负责人和日期的下一步。"
            ]
          }
        ],
        "curahold": "会议、通话和备注保存在每个客户的时间线上，距上次联系的时间计入健康评分，每个客户都可以设置回顾节奏。"
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "会议跟进",
        "seo": [
          "客户会议跟进：真正落实的下一步 | Curahold",
          "会议跟进是把与客户商定的事项变成有负责人和日期的工作，让承诺得到兑现，客户也看得到。本文说明下一步为什么容易被遗漏，以及好的跟进具体是什么样子。"
        ],
        "lead": "会议跟进是在细节淡忘之前，把客户会议上商定的事项变成有负责人和日期的工作。",
        "body": [
          {
            "h": "为什么会遗漏"
          },
          {
            "p": "下一步留在某个人的笔记里。一周后没人记得谁说过要做什么，而客户最先察觉。"
          },
          {
            "h": "好的跟进是什么样"
          },
          {
            "ul": [
              "通话结束前写下下一步。",
              "每一项都有负责人和日期。",
              "给客户发一条简短的确认。"
            ]
          }
        ],
        "curahold": "写在会议备注中的下一步会变成关联到客户、有负责人和日期的任务，承诺也可以在客户门户中与客户共享。"
      }
    ]
  },
  "zh-Hant": {
    "title": "為客戶團隊準備的範本與詞彙表",
    "lead": "可以直接複製的範本與淺顯易懂的詞彙解說，涵蓋留住客戶的日常工作：續約、業務檢討、健康評分與客戶流失。",
    "seo": [
      "為客戶成功團隊準備的範本與詞彙表 | Curahold",
      "這裡匯集了可以直接複製的續約手冊與業務檢討免費範本，以及健康評分、客戶流失、合約續約與客戶入口網站的淺顯說明，幫助客戶團隊把留住客戶的工作做紮實。"
    ],
    "templates": "範本",
    "glossary": "詞彙表",
    "inCurahold": "在 Curahold 中",
    "nav": [
      "範本與詞彙表",
      "續約步驟、檢討議程與詞彙解說。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "續約手冊範本",
        "seo": [
          "續約手冊範本：從到期前 90 天開始 | Curahold",
          "一份可以直接複製的續約手冊：合約到期前 90、75、60 和 30 天各要做什麼、每一步由誰負責，以及續約會談之前還需要確認哪些關鍵事項，附可直接使用的檢查清單。"
        ],
        "lead": "續約不是在到期當天贏得的，而是在到期前的三個月。複製這些步驟，為每一步指定負責人，並從續約日期往回推算時間。",
        "body": [
          {
            "h": "步驟"
          },
          {
            "ol": [
              "到期前 90 天：檢視使用狀況、尚未處理的需求與健康評分，記下所有讓你擔心的地方。",
              "到期前 75 天：與決策者和日常窗口約好續約會談。",
              "到期前 60 天：寄出續約報價，包含席次或方案的變更。",
              "到期前 30 天：追蹤報價，並以書面方式釐清尚未解決的問題。",
              "續約當天：確認已簽署的續約，並記錄雙方的約定。"
            ]
          },
          {
            "h": "續約會談之前"
          },
          {
            "ul": [
              "客戶今年想達成什麼目標，達成了嗎？",
              "先前會議中的承諾，哪些還沒完成？",
              "誰做決定，他最近和你開過會嗎？"
            ]
          }
        ],
        "curahold": "開啟續約後，續約手冊會在每個續約日期前 90 天把各步驟建立成任務，每項任務都有負責人和從續約日期往回推算的期限。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "業務檢討（QBR）議程範本",
        "seo": [
          "業務檢討（QBR）會議議程範本 | Curahold",
          "一小時業務檢討的會議議程範本：對照目標的成果、客戶端發生的變化、尚未兌現的承諾、下一季的計畫，以及明確的後續步驟、負責人與完成日期，適合每季使用。"
        ],
        "lead": "季度業務檢討應該讓客戶看到價值的證據，也讓雙方帶著同樣的後續步驟離開。這份議程一小時內就能完成。",
        "body": [
          {
            "h": "議程（60 分鐘）"
          },
          {
            "ol": [
              "5 分鐘：會議目標與與會者。",
              "15 分鐘：對照上一季目標的成果。",
              "10 分鐘：客戶端的變化：人員、優先事項、預算。",
              "10 分鐘：尚未完成的需求與承諾，以及各自的進度。",
              "15 分鐘：下一季的計畫。",
              "5 分鐘：後續步驟，每一步都有負責人和日期。"
            ]
          },
          {
            "h": "會議結束後"
          },
          {
            "p": "當天寄出簡短摘要：達成的共識、附負責人和日期的後續步驟，以及下次檢討的時間。"
          }
        ],
        "curahold": "把檢討記錄為客戶的一場會議並寫下後續步驟，儲存後每一步都會變成有負責人和日期的任務，也可以在客戶入口網站中分享。"
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "從業務到導入團隊的客戶交接清單",
        "seo": [
          "從業務到導入團隊的客戶交接清單範本 | Curahold",
          "贏單後的客戶交接清單：關鍵人有哪些、銷售過程中承諾了什麼、還有哪些未完成的需求、重要日期，以及與客戶的第一次會議該怎麼開始，讓導入團隊從第一天就接得住。"
        ],
        "lead": "客戶頭幾個月的問題，多半從交接開始：業務知道的事，導入團隊往往從沒聽說。複製這份清單，在交易交出去之前把它填好。",
        "body": [
          {
            "h": "交接時一定要帶上的內容"
          },
          {
            "ul": [
              "關鍵人：決策者、日常窗口和客戶內部的支持者，以及聯絡每個人的方式。",
              "銷售過程中的承諾：功能、日期、折扣，書面或電話中說過的一切。",
              "客戶正在等待的未完成產品需求，以及對此告訴過客戶的內容。",
              "重要日期：成交日期、客戶期待的正式啟用日期和續約日期。",
              "購買原因：想解決的問題，以及客戶如何判斷成功。"
            ]
          },
          {
            "h": "第一次會議之前"
          },
          {
            "ol": [
              "業務和導入負責人花 15 分鐘一起看過清單。",
              "任何不清楚的地方，回頭問業務，而不是問客戶。",
              "第一次會議先用客戶自己的話重述客戶的目標。"
            ]
          }
        ],
        "curahold": "贏單後，Curahold 可以為下一個團隊準備一張交接卡，彙整關鍵人、已做出的承諾、未完成的產品需求，以及成交日期和續約日期；交接卡會等待新負責人確認。"
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "客戶健康評分表範本",
        "seo": [
          "客戶健康評分表範本：訊號、分數與分級 | Curahold",
          "一份可以直接複製的健康評分表：團隊看得到的六個訊號、每個訊號加減多少分，以及幫你判斷哪些客戶需要關注的分級標準，附每季檢討方法，讓每一分都有憑有據。"
        ],
        "lead": "健康評分只有在團隊信任時才有用，而團隊只信任自己說得清楚的分數。從幾個看得到的訊號開始，替每個訊號訂一個權重，並寫下理由。",
        "body": [
          {
            "h": "訊號與分數（從 50 分起算）"
          },
          {
            "ul": [
              "最近 30 天內和客戶談過：+15。60 天沒有聯絡：−20。",
              "客戶方有會回覆的支持者：+15。支持者離職：−25。",
              "承諾的工作逾期：每項 −10，最多 −30。",
              "超過兩週未解決的障礙或支援請求：−10。",
              "使用量持平或上升：+10。連續兩個月下降：−15。",
              "距離續約不到 90 天且還沒約會議：−10。"
            ]
          },
          {
            "h": "分級"
          },
          {
            "ul": [
              "70 分以上：健康，維持節奏。",
              "40–69 分：需留意，這週內找出原因。",
              "40 分以下：有風險，負責人主動聯絡客戶，並讓團隊主管知道。"
            ]
          },
          {
            "p": "每季拿實際流失和留下的客戶對照檢查權重，把判斷錯的項目改掉。"
          }
        ],
        "curahold": "每位客戶都有依您設定的規則計算的 0 到 100 分評分，並列出原因與最近 30 天的變化趨勢。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "客戶健康評分",
        "seo": [
          "什麼是客戶健康評分？淺顯易懂的定義 | Curahold",
          "客戶健康評分用一個數字概括客戶關係的狀況，依據最近一次聯繫、逾期的工作與尚未解決的問題等訊號計算，幫助團隊優先關注續約有風險的客戶，並說明每次變化的原因。"
        ],
        "lead": "客戶健康評分是一個數字，通常介於 0 到 100，用來概括與客戶的關係進展得好不好。",
        "body": [
          {
            "p": "它由團隊能觀察到的訊號構成：最近一次和客戶聯繫是什麼時候、承諾的工作是否逾期、客戶端是否有有力的支持者，還有尚未解決的阻礙與客服請求。每個訊號都會加分或扣分。"
          },
          {
            "h": "為什麼重要"
          },
          {
            "p": "幾十個客戶放在一起，悄悄疏遠的那一個很容易被淹沒。依評分排序後，注意力會先落在續約有風險的客戶身上。"
          },
          {
            "h": "好的評分具備什麼"
          },
          {
            "ul": [
              "能說明自己：誰都能看到是哪些訊號讓它改變。",
              "使用團隊信任、能據此採取行動的訊號。",
              "長期追蹤，而不是只看一次。"
            ]
          }
        ],
        "curahold": "每位客戶都有依您設定的規則計算的 0 到 100 分評分，並列出原因與最近 30 天的變化趨勢。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "客戶流失（Churn）",
        "seo": [
          "什麼是客戶流失（Churn）？定義與早期訊號 | Curahold",
          "客戶流失是指一段期間內失去的客戶或營收所占的比例。本文說明什麼算流失、如何計算流失率，以及流失發生之前通常會出現的幾種早期訊號，以及如何因應。"
        ],
        "lead": "客戶流失是指客戶不再購買：取消訂閱或不再續約。流失率是一段期間內失去的客戶或營收所占的比例。",
        "body": [
          {
            "h": "如何計算"
          },
          {
            "ul": [
              "客戶流失率：期間內流失的客戶數，除以期初的客戶數。",
              "營收流失率：因取消與降級而損失的經常性營收，除以期初的經常性營收。"
            ]
          },
          {
            "h": "先出現的訊號"
          },
          {
            "p": "流失很少毫無預警。聯繫變少、承諾的工作延宕、支持者離開、客服請求越積越多。持續留意這些訊號，團隊才能在續約日期之前採取行動。"
          }
        ],
        "curahold": "這類訊號會計入每位客戶的健康評分，讓逐漸疏遠的客戶在續約之前很早就排到前面。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "合約續約",
        "seo": [
          "什麼是合約續約？流程與時程安排 | Curahold",
          "合約續約是把與客戶的協議延長到新的期間。本文介紹何時開始準備、續約流程通常怎麼進行，以及為什麼最好在到期前幾個月就開始推動續約工作，避免臨時抱佛腳。"
        ],
        "lead": "合約續約是把客戶的協議延長到下一個期間，常伴隨變更：更多席次、不同的方案或新的價格。",
        "body": [
          {
            "h": "什麼時候開始"
          },
          {
            "p": "年約通常在到期前約 90 天開始準備。這樣才有時間檢視已交付的價值、與決策者見面、寄出報價，並從容地回答問題。"
          },
          {
            "h": "常見的問題"
          },
          {
            "ul": [
              "太晚才發現到期日。",
              "簽約的人已經離開。",
              "一年中做出的承諾還沒有完成。"
            ]
          }
        ],
        "curahold": "每次續約都可以在到期前 90 天自動啟動續約手冊，產生有負責人和日期的任務，同時在銷售漏斗中建立續約交易。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "客戶入口網站",
        "seo": [
          "什麼是客戶入口網站？定義與常見用途 | Curahold",
          "客戶入口網站是客戶查看分享的工作、提出需求、閱讀回覆的專屬空間，不必再在零散的郵件往來中來回翻找，團隊也能把所有請求集中在同一處處理，回覆更即時。"
        ],
        "lead": "客戶入口網站是一個專屬網頁，客戶可以在這裡查看與自己分享的工作、提出需求，並閱讀團隊的回覆。",
        "body": [
          {
            "h": "團隊為什麼使用"
          },
          {
            "p": "它取代了進度回報郵件。客戶隨時都能查看進展，需求也集中到同一個地方，而不是散落在各封郵件裡。"
          },
          {
            "h": "分享哪些內容"
          },
          {
            "ul": [
              "導入步驟與日期。",
              "會議上承諾的任務。",
              "對客戶需求的回覆。"
            ]
          }
        ],
        "curahold": "客戶透過電子郵件中的連結登入，只會看到您分享的內容；他們提出的需求會進入您團隊的看板。"
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "客戶導入",
        "seo": [
          "什麼是客戶導入（Onboarding）？流程與目標 | Curahold",
          "客戶導入是把新客戶從簽約帶到第一次獲得價值的工作，包括業務交接、設定、教育訓練，以及客戶能親眼看到的第一批成果。本文說明它包含什麼、為何重要。"
        ],
        "lead": "客戶導入是指從簽約到新客戶第一次獲得所購買價值之間的這段時間，以及團隊為了縮短這段時間所做的工作。",
        "body": [
          {
            "h": "通常包含"
          },
          {
            "ul": [
              "業務交接，附上已做出的承諾。",
              "確認目標與日期的啟動會議。",
              "設定、資料匯入與教育訓練。",
              "客戶能親眼看到、說得出來的第一個成果。"
            ]
          },
          {
            "h": "為什麼重要"
          },
          {
            "p": "早點看到價值的客戶比較願意留下；拖太久的導入，會讓第一次續約討論從懷疑開始。"
          }
        ],
        "curahold": "如果你有導入團隊，贏單的交易會以一張交接卡送到他們手上，包含關鍵人、已做出的承諾、未完成的需求和重要日期；其中的任務可以在客戶入口網站與客戶共享。"
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "服務成本",
        "seo": [
          "什麼是服務成本？客戶團隊的衡量方法 | Curahold",
          "服務成本是照顧一個客戶所花的時間或金錢，和該客戶付費的對比。本文說明如何衡量服務成本，以及在續約之前如何運用這個結果採取行動，避免只看數字就下結論。"
        ],
        "lead": "服務成本是團隊照顧一個客戶所投入的心力，和這個客戶所付費用之間的對比。",
        "body": [
          {
            "h": "如何衡量"
          },
          {
            "p": "最簡單的單位是小時：團隊過去 12 個月在某個客戶上記錄的時間，除以該客戶的年度合約金額。用同一把尺比較所有客戶，就能看出誰相對於付費占用了最多照顧。"
          },
          {
            "h": "結果怎麼用"
          },
          {
            "ul": [
              "找出數字偏高背後的工作：重複出現的請求、缺少的功能、教育訓練的缺口。",
              "在續約前解決根本原因，或把額外服務反映在續約價格中。",
              "不要只憑這個數字評價客戶：要求多的客戶，也可能是你最好的推薦人。"
            ]
          }
        ],
        "curahold": "服務成本報表依客戶列出近 12 個月每 1,000 年度價值花費的小時，讓你看出誰的服務成本最高。"
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "淨收入留存率（NRR）",
        "seo": [
          "什麼是淨收入留存率（NRR）？定義與公式 | Curahold",
          "淨收入留存率顯示一組現有客戶一年後帶來多少經常性收入，計入續約、加購、降級和流失，不含新客戶。本文說明計算方法、為什麼高於 100% 很重要，以及團隊如何提升它。"
        ],
        "lead": "淨收入留存率（NRR）是一組客戶今天帶來的經常性收入，佔同一批客戶一年前收入的比例。",
        "body": [
          {
            "h": "如何計算"
          },
          {
            "p": "取期初已有客戶的經常性收入，加上他們的加購，減去降級和流失，再除以期初數值。新客戶不計入。"
          },
          {
            "h": "團隊為什麼關注它"
          },
          {
            "ul": [
              "高於 100% 表示現有客戶自己在成長。",
              "它能看出續約和加購是否超過損失。",
              "它變化緩慢，獎勵的是持續的客戶經營。"
            ]
          }
        ],
        "curahold": "續約和加購交易與新交易位於同一個銷售漏斗中，續約檢視依續約月份列出每個客戶及其面臨風險的金額。"
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "年度經常性收入（ARR）",
        "seo": [
          "什麼是年度經常性收入（ARR）？簡明定義 | Curahold",
          "年度經常性收入是已簽訂閱的年度價值。本文說明哪些收入計入、哪些不計入，以及團隊如何依客戶查看 ARR，把心力放在最大的續約上，並看清客戶沉默時有多少收入面臨風險。"
        ],
        "lead": "年度經常性收入（ARR）是有效訂閱的年度價值：如果一切不變，客戶在十二個月內將支付的金額。",
        "body": [
          {
            "h": "哪些計入"
          },
          {
            "ul": [
              "訂閱費，換算為年度金額。",
              "經常性的附加功能和額外席次。",
              "不含設定、教育訓練等一次性費用。"
            ]
          },
          {
            "h": "為什麼要依客戶看"
          },
          {
            "p": "每個客戶的 ARR 顯示收入在哪裡，團隊可以給最大的續約應有的關注，並在客戶沉默時看到有多少收入面臨風險。"
          }
        ],
        "curahold": "ARR 可以是每個客戶的一個欄位，報表可依負責人、健康評分區間或續約月份加總，並遵循每位讀者自己的權限。"
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "業務檢視（QBR）",
        "seo": [
          "什麼是業務檢視（QBR）？目的與議程 | Curahold",
          "業務檢視是客戶與供應商定期檢視成果、尚未兌現的承諾和下一階段計畫的會議，通常每季一次。本文介紹它應涵蓋的內容，以及為什麼好的檢視要以有負責人和日期的下一步結束。"
        ],
        "lead": "業務檢視通常每季進行，也稱 QBR，是客戶與供應商檢視成果並議定下一階段計畫的會議。",
        "body": [
          {
            "h": "涵蓋哪些內容"
          },
          {
            "ul": [
              "對照上次設定目標的成果。",
              "客戶端發生了哪些變化。",
              "尚未完成的請求和承諾及其進度。",
              "下一階段的計畫和負責人。"
            ]
          },
          {
            "h": "怎樣才有用"
          },
          {
            "p": "以有負責人和日期的下一步結束。行動沒有寫下來的檢視，到下一次之前就會被忘記。"
          }
        ],
        "curahold": "業務檢視是客戶時間軸上的一場會議，會中寫下的下一步會變成有負責人和日期的任務。"
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager（CSM）",
        "seo": [
          "Customer Success Manager 做什麼？ | Curahold",
          "Customer Success Manager 在成交後負責一組客戶：導入、使用、定期溝通、業務檢視、續約，以及及早發現風險，讓客戶獲得所買的價值並留下來。本文介紹這個角色的職責和時間分配。"
        ],
        "lead": "Customer Success Manager（CSM）在成交後負責一組客戶，讓他們獲得所購買的價值並留下來。",
        "body": [
          {
            "h": "這個角色通常包括"
          },
          {
            "ul": [
              "帶新客戶完成導入，或從導入團隊接手。",
              "定期溝通和業務檢視。",
              "關注健康狀況，對早期警訊採取行動。",
              "準備續約，找出成長空間。"
            ]
          },
          {
            "h": "時間花在哪裡"
          },
          {
            "p": "一位 CSM 往往負責幾十個客戶。知道本週哪一個最需要關注，比平均分配時間更重要。"
          }
        ],
        "curahold": "每個客戶在每個部門都有一位負責人，每個人的清單依誰最需要他排序，並附上原因和下一步。"
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "加購收入",
        "seo": [
          "什麼是加購收入？追加銷售與交叉銷售 | Curahold",
          "加購收入是來自現有客戶的額外經常性收入：更多席次、更高方案或另一項產品。本文說明它來自追加銷售、交叉銷售還是客戶自身的成長，以及在什麼時候提出最合適。"
        ],
        "lead": "加購收入是來自現有客戶的額外經常性收入：更多席次、更高的方案或另一項產品。",
        "body": [
          {
            "h": "從哪裡來"
          },
          {
            "ul": [
              "追加銷售：更多已在用的，或更高的方案。",
              "交叉銷售：他們還沒有的產品。",
              "客戶自身的成長：新團隊、新據點或新國家。"
            ]
          },
          {
            "h": "何時提出"
          },
          {
            "p": "加購跟隨價值而來。在客戶說得出的成果之後最容易，在上次請求的承諾仍未兌現時最難。"
          }
        ],
        "curahold": "產品檢視顯示哪個客戶擁有哪項產品，空白一目了然，為其中一項建立任務只需點一下。"
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "價值實現時間",
        "seo": [
          "什麼是價值實現時間（TTV）？如何縮短 | Curahold",
          "價值實現時間是新客戶從簽約到獲得第一個說得出的成果所等待的時間。本文說明它為什麼直接影響第一次續約，以及團隊如何透過啟動會議、交接和共享計畫來縮短它。"
        ],
        "lead": "價值實現時間是新客戶從簽約到看到並說得出第一個成果之間所等待的時間。",
        "body": [
          {
            "h": "為什麼重要"
          },
          {
            "p": "第一次續約對話從簽約當天就開始了。幾週內看到價值的客戶談成長，仍在等待的客戶談價格。"
          },
          {
            "h": "團隊如何縮短它"
          },
          {
            "ul": [
              "在啟動會議上議定一個有日期的首個成果。",
              "交接業務做出的承諾，避免重複詢問。",
              "與客戶共享計畫，讓雙方都看到下一步。"
            ]
          }
        ],
        "curahold": "導入計畫包含步驟、目標和日期，你選擇的步驟可以在客戶入口網站中與客戶共享。"
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "成功計畫",
        "seo": [
          "什麼是客戶成功計畫？組成與用法 | Curahold",
          "成功計畫寫下客戶想達成的目標、雙方要採取的步驟、負責人和日期，以及衡量進展的指標。本文說明它通常包含哪些部分，以及如何在每次溝通和業務檢視中使用它。"
        ],
        "lead": "成功計畫寫下客戶想達成什麼、雙方將採取哪些步驟，以及如何衡量進展。",
        "body": [
          {
            "h": "通常包含"
          },
          {
            "ul": [
              "客戶用自己的話描述的目標。",
              "雙方的步驟、負責人和日期。",
              "呈現進展的衡量指標。"
            ]
          },
          {
            "h": "如何使用"
          },
          {
            "p": "它是每次溝通和業務檢視的參照。雙方一起更新，就能朝同一個結果努力。"
          }
        ],
        "curahold": "導入計畫記錄目標、有負責人和日期的步驟以及你追蹤的指標，面向客戶的步驟可以在入口網站中共享。"
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "關係人地圖",
        "seo": [
          "什麼是關係人地圖？B2B 中的用法 | Curahold",
          "關係人地圖列出客戶端影響決策的人、他們的角色、影響力和立場，以及還沒見過的人。本文說明它記錄什麼，以及為什麼在成交之後、尤其是續約之前也同樣重要。"
        ],
        "lead": "關係人地圖列出客戶端參與決策的人、他們的角色以及各自的立場。",
        "body": [
          {
            "h": "記錄什麼"
          },
          {
            "ul": [
              "每個人的角色和影響力。",
              "立場：支持、中立或反對。",
              "尚未見過面的人。"
            ]
          },
          {
            "h": "為什麼成交後也重要"
          },
          {
            "p": "續約決定很少由一個人做出。當內部支持者離開時，地圖能顯示還有誰了解價值、誰需要聽到它。"
          }
        ],
        "curahold": "每筆交易都保存關係人及其職稱和立場，並隨交接卡片一起轉給接手客戶的團隊。"
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "內部支持者（Champion）",
        "seo": [
          "什麼是客戶端的內部支持者（Champion）？ | Curahold",
          "內部支持者是客戶端相信你的產品、並在公司內部為它爭取的人。本文說明為什麼有活躍支持者的客戶更容易續約，以及當支持者離職時團隊應該採取哪些步驟。"
        ],
        "lead": "內部支持者（Champion）是客戶端相信你所提供的東西，並在其公司內部為它爭取的人。",
        "body": [
          {
            "h": "為什麼重要"
          },
          {
            "p": "他推動會議安排、守住預算並及早提出問題。有活躍內部支持者的客戶更容易續約。"
          },
          {
            "h": "支持者離開時"
          },
          {
            "ul": [
              "弄清楚由誰接手他的那部分工作。",
              "向留下的人重新展示價值。",
              "在找到新的支持者之前把它當作風險。"
            ]
          }
        ],
        "curahold": "是否有內部支持者可以作為健康評分中的一個訊號，沒有支持者或支持者已離開的客戶會排到前面。"
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "從業務到客戶成功的交接",
        "seo": [
          "業務到客戶成功的交接：要傳遞什麼 | Curahold",
          "從業務到客戶成功的交接要傳遞關係人、銷售中做出的承諾、尚未完成的請求和關鍵日期，讓客戶不必把一切重新解釋一遍。本文列出要傳遞的內容和最常見的問題。"
        ],
        "lead": "從業務到客戶成功的交接，把下一個團隊需要的一切傳遞過去，讓客戶永遠不必把一切重新解釋一遍。",
        "body": [
          {
            "h": "要傳遞什麼"
          },
          {
            "ul": [
              "關係人以及各自的立場。",
              "銷售過程中做出的承諾。",
              "尚未完成的請求和產品問題。",
              "成交日期和續約日期。"
            ]
          },
          {
            "h": "常見問題"
          },
          {
            "p": "銷售通話中做出卻沒人記下的承諾。客戶記得，新團隊卻不知道。"
          }
        ],
        "curahold": "贏得的交易以一張交接卡片送達下一個團隊，包含關係人、做出的承諾、尚未完成的產品請求和關鍵日期。"
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "功能需求",
        "seo": [
          "如何處理 B2B 客戶的功能需求？ | Curahold",
          "功能需求是客戶要求產品目前還做不到的事。本文說明如何記錄是誰提出的、為什麼重要，如何把同類需求連結起來並排定優先順序，以及如何在完成時告訴客戶、形成閉環。"
        ],
        "lead": "功能需求是客戶要求產品目前還做不到的事，常常出現在會議或支援對話中。",
        "body": [
          {
            "h": "如何處理得好"
          },
          {
            "ul": [
              "記錄是誰提出的，以及為什麼對他重要。",
              "把同一件事的需求連結起來。",
              "依等待的客戶和價值排定優先順序。"
            ]
          },
          {
            "h": "形成閉環"
          },
          {
            "p": "大多數團隊忽略的是在工作完成時告訴客戶。用一則版本說明回應的需求，比功能本身更能建立信任。"
          }
        ],
        "curahold": "多個客戶需求可以連結到同一個使用者故事；待辦事項顯示等待的客戶、其價值和最近的續約，工作完成時負責人會收到一份可直接寄出的草稿。"
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "客戶接觸點",
        "seo": [
          "什麼是客戶接觸點？定義與範例 | Curahold",
          "客戶接觸點是客戶與團隊之間的每一次接觸：電話、會議、電子郵件或對請求的回覆。本文說明為什麼接觸的節奏比次數更重要，以及每次接觸之後應該留下哪些資訊。"
        ],
        "lead": "客戶接觸點是客戶與你的團隊之間的每一次接觸：一通電話、一場會議、一封電子郵件或對請求的回覆。",
        "body": [
          {
            "h": "為什麼節奏重要"
          },
          {
            "p": "長時間的沉默是早期警訊。六週沒人聯絡過的客戶，比每月見面的客戶更難續約。"
          },
          {
            "h": "每次要留下什麼"
          },
          {
            "ul": [
              "發生時間和參與者。",
              "做出的決定。",
              "有負責人和日期的下一步。"
            ]
          }
        ],
        "curahold": "會議、通話和備註保存在每個客戶的時間軸上，距上次聯絡的時間計入健康評分，每個客戶都可以設定檢視節奏。"
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "會議追蹤",
        "seo": [
          "客戶會議追蹤：真正落實的下一步 | Curahold",
          "會議追蹤是把與客戶議定的事項變成有負責人和日期的工作，讓承諾得到兌現，客戶也看得到。本文說明下一步為什麼容易被遺漏，以及好的追蹤具體是什麼樣子。"
        ],
        "lead": "會議追蹤是在細節淡忘之前，把客戶會議上議定的事項變成有負責人和日期的工作。",
        "body": [
          {
            "h": "為什麼會遺漏"
          },
          {
            "p": "下一步留在某個人的筆記裡。一週後沒人記得誰說過要做什麼，而客戶最先察覺。"
          },
          {
            "h": "好的追蹤是什麼樣"
          },
          {
            "ul": [
              "通話結束前寫下下一步。",
              "每一項都有負責人和日期。",
              "給客戶一則簡短的確認。"
            ]
          }
        ],
        "curahold": "寫在會議備註中的下一步會變成連結到客戶、有負責人和日期的任務，承諾也可以在客戶入口網站中與客戶共享。"
      }
    ]
  },
  ja: {
    "title": "カスタマーチームのための​テンプレートと​用語集",
    "lead": "顧客を守る仕事に使える、コピーできるテンプレートとわかりやすい用語解説。更新、ビジネスレビュー、ヘルススコア、解約を取り上げます。",
    "seo": [
      "カスタマーサクセスのテンプレートと用語集 | Curahold",
      "更新プレイブックとビジネスレビューのすぐに使える無料テンプレート、そしてヘルススコア、解約、契約更新、顧客ポータルのわかりやすい解説をまとめました。"
    ],
    "templates": "テンプレート",
    "glossary": "用語集",
    "inCurahold": "Curahold では",
    "nav": [
      "テンプレートと用語集",
      "更新の手順、レビューの議題、用語の解説。"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "更新プレイブックのテンプレート",
        "seo": [
          "更新プレイブックのテンプレート：90日前からの手順 | Curahold",
          "そのまま使える更新プレイブック。契約更新の90日前、75日前、60日前、30日前にやること、各ステップの担当、更新の打ち合わせ前に確認することをまとめました。"
        ],
        "lead": "更新は当日ではなく、その前の3か月で決まります。この手順をコピーし、ステップごとに担当者を決め、更新日から逆算して日付を入れてください。",
        "body": [
          {
            "h": "手順"
          },
          {
            "ol": [
              "90日前：利用状況、未対応の依頼、ヘルススコアを確認し、気になる点を書き出します。",
              "75日前：意思決定者と日々の窓口担当者との更新の打ち合わせを設定します。",
              "60日前：シート数やプランの変更を含めた更新の見積もりを送ります。",
              "30日前：見積もりをフォローし、残っている質問を書面で解決します。",
              "更新日：署名済みの更新を確認し、合意内容を記録します。"
            ]
          },
          {
            "h": "更新の打ち合わせの前に"
          },
          {
            "ul": [
              "顧客は今年何を達成したかったのか、そして達成できたか。",
              "以前の会議での約束のうち、まだ終わっていないものはどれか。",
              "誰が決めるのか、その人と最近会議をしたか。"
            ]
          }
        ],
        "curahold": "更新をオンにすると、更新プレイブックが各更新日の90日前にステップをタスクとして作成します。各タスクには担当者と、更新日から逆算した期日が付きます。"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "ビジネスレビュー（QBR）の議題テンプレート",
        "seo": [
          "ビジネスレビュー（QBR）の議題テンプレート | Curahold",
          "1時間で行うビジネスレビューの議題です。目標に対する結果、変化したこと、未完了の約束、次の四半期の計画、明確な次のステップまでを網羅します。"
        ],
        "lead": "四半期ごとのビジネスレビューは、顧客には価値の証拠を、双方には同じ次のステップを残すものです。この議題は1時間に収まります。",
        "body": [
          {
            "h": "議題（60分）"
          },
          {
            "ol": [
              "5分：会議の目的と参加者の確認。",
              "15分：前四半期に設定した目標に対する結果。",
              "10分：顧客側で変わったこと（人、優先順位、予算）。",
              "10分：未対応の依頼と約束、それぞれの状況。",
              "15分：次の四半期の計画。",
              "5分：担当者と期日を決めた次のステップ。"
            ]
          },
          {
            "h": "会議のあとで"
          },
          {
            "p": "当日中に短いまとめを送ります。合意したこと、担当者と期日つきの次のステップ、次回レビューの日程です。"
          }
        ],
        "curahold": "レビューを顧客の会議として記録し、次のステップを書いて保存すると、それぞれが担当者と期日つきのタスクになります。顧客のポータルで共有することもできます。"
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "営業からオンボーディングへの引き継ぎチェックリスト",
        "seo": [
          "営業からオンボーディングへの引き継ぎチェックリスト | Curahold",
          "受注した商談の引き継ぎチェックリストです。関係者は誰か、営業中に何を約束したか、未対応の要望、重要な日付、顧客との最初の打ち合わせまでを整理します。"
        ],
        "lead": "契約直後の数か月に起きるトラブルの多くは、引き継ぎから始まります。営業が知っていることが、オンボーディング担当に届かないのです。このリストをコピーし、商談を引き継ぐ前に埋めてください。",
        "body": [
          {
            "h": "引き継ぎで必ず渡すこと"
          },
          {
            "ul": [
              "関係者：意思決定者、日々の窓口、顧客側の推進役と、それぞれへの連絡方法。",
              "営業中にした約束：機能、日付、値引きなど、書面でも口頭でも伝えたことすべて。",
              "顧客が待っている未対応の製品要望と、それについて伝えた内容。",
              "重要な日付：成約日、顧客が期待する稼働開始日、契約の更新日。",
              "購入の理由：解決したい課題と、成功をどう判断するか。"
            ]
          },
          {
            "h": "最初の打ち合わせの前に"
          },
          {
            "ol": [
              "営業担当とオンボーディング担当が、15分でリストを一緒に読みます。",
              "不明な点は、顧客ではなく営業担当に確認します。",
              "最初の打ち合わせは、顧客の目標を顧客自身の言葉で確認するところから始めます。"
            ]
          }
        ],
        "curahold": "商談を受注すると、Curahold は次のチームに向けて引き継ぎカードを用意できます。関係者、約束した内容、未対応の製品要望、成約日と更新日がまとまっており、新しい担当者が確認するまで待機します。"
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "ヘルススコア表テンプレート",
        "seo": [
          "ヘルススコア表テンプレート：シグナルと配点 | Curahold",
          "そのまま使えるヘルススコア表です。チームが確認できる6つのシグナル、それぞれの加点と減点、注意が必要な顧客を見分けるしきい値をまとめました。"
        ],
        "lead": "ヘルススコアは、チームが信頼してはじめて役に立ちます。そしてチームが信頼するのは、説明できるスコアです。目に見える少数のシグナルから始め、それぞれに重みを付け、その理由を書き残しましょう。",
        "body": [
          {
            "h": "シグナルと配点（50点から開始）"
          },
          {
            "ul": [
              "直近30日以内に顧客と話した：+15。60日間連絡なし：−20。",
              "返信をくれる推進役が顧客側にいる：+15。推進役が退職した：−25。",
              "約束した作業が遅れている：1件につき−10、最大−30。",
              "2週間以上未解決の障害やサポート依頼がある：−10。",
              "利用が横ばいまたは増加：+10。2か月連続で減少：−15。",
              "更新まで90日を切り、打ち合わせが未設定：−10。"
            ]
          },
          {
            "h": "しきい値"
          },
          {
            "ul": [
              "70点以上：良好。今のリズムを保ちます。",
              "40〜69点：要注意。今週中に原因を探ります。",
              "40点未満：リスクあり。担当者が連絡し、チームリーダーにも共有します。"
            ]
          },
          {
            "p": "四半期ごとに、実際に失った顧客と継続した顧客を見比べて重みを見直し、予測が外れた項目を修正しましょう。"
          }
        ],
        "curahold": "すべての顧客に、自社で決めたルールから算出する0〜100のスコアが付き、その理由と過去30日の推移を確認できます。"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "顧客ヘルススコア",
        "seo": [
          "顧客ヘルススコアとは？わかりやすい解説 | Curahold",
          "顧客ヘルススコアは、顧客との関係の状態を一つの数字にまとめたものです。最後の接点、遅れている作業、未解決の課題などのシグナルから算出します。"
        ],
        "lead": "顧客ヘルススコアとは、顧客との関係がどれだけうまくいっているかを表す一つの数字で、多くの場合0〜100で示します。",
        "body": [
          {
            "p": "チームが把握できるシグナルから算出します。最後に顧客と話したのはいつか、約束した作業が遅れていないか、顧客側に強い推進者がいるか、未解決の障害やサポート依頼があるか。シグナルごとに点数が加算・減算されます。"
          },
          {
            "h": "なぜ重要か"
          },
          {
            "p": "数十社の顧客を抱えると、反応が薄れていく一社が埋もれてしまいます。スコアで並べれば、更新が危うい顧客に真っ先に目が向きます。"
          },
          {
            "h": "よいスコアの条件"
          },
          {
            "ul": [
              "理由がわかる：どのシグナルで変わったのか誰でも確認できる。",
              "チームが信頼でき、行動につなげられるシグナルを使う。",
              "一度見て終わりではなく、時間を追って見る。"
            ]
          }
        ],
        "curahold": "すべての顧客に、自社で決めたルールから算出する0〜100のスコアが付き、その理由と過去30日の推移を確認できます。"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "解約（チャーン）",
        "seo": [
          "解約（チャーン）とは？定義と早期のサイン | Curahold",
          "チャーンとは、一定期間に失った顧客や売上の割合です。何を解約と数えるか、どう測るか、その前に現れる早期のサインについて、わかりやすく解説します。"
        ],
        "lead": "チャーンとは、顧客が購入をやめること、つまり解約や更新しないことです。チャーン率は、一定期間に失った顧客や売上の割合を指します。",
        "body": [
          {
            "h": "測り方"
          },
          {
            "ul": [
              "顧客チャーン：期間中に失った顧客数を、期首の顧客数で割ったもの。",
              "売上チャーン：解約やダウングレードで失った継続売上を、期首の継続売上で割ったもの。"
            ]
          },
          {
            "h": "先に現れるサイン"
          },
          {
            "p": "解約が前触れなく起きることはほとんどありません。連絡が途絶えがちになる、約束した作業が遅れる、推進者が異動する、サポート依頼が積み上がる。こうしたサインを追えば、更新日より前に手を打てます。"
          }
        ],
        "curahold": "こうしたシグナルは各顧客のヘルススコアに反映されるため、反応が薄れている顧客が更新のずっと前に上位に表示されます。"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "契約更新",
        "seo": [
          "契約更新とは？進め方とスケジュール | Curahold",
          "契約更新は、顧客との契約を新しい期間へ延長することです。いつ始めるか、更新プロセスの流れ、そしてなぜ期日の数か月前から始めるのかを解説します。"
        ],
        "lead": "契約更新とは、顧客との契約を次の期間へ延長することです。シートの追加、プランの変更、新しい価格など、変更を伴うこともよくあります。",
        "body": [
          {
            "h": "いつ始めるか"
          },
          {
            "p": "年間契約の場合、準備はおよそ90日前に始めるのが一般的です。提供した価値の振り返り、意思決定者との面談、見積もりの送付、質問への回答を、慌てずに進められます。"
          },
          {
            "h": "よくある失敗"
          },
          {
            "ul": [
              "期日に気づくのが遅すぎる。",
              "契約に署名した人がすでに異動・退職している。",
              "年間を通じた約束がまだ終わっていない。"
            ]
          }
        ],
        "curahold": "更新ごとに、90日前から担当者と期日つきのタスクとしてプレイブックを開始し、パイプラインには更新の商談も作成できます。"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "顧客ポータル",
        "seo": [
          "顧客ポータルとは？定義と使い方 | Curahold",
          "顧客ポータルは、顧客が共有された作業を確認し、依頼を出し、返信を読める専用の場所です。メールのやり取りを何度も追いかける必要は、もうありません。"
        ],
        "lead": "顧客ポータルとは、顧客が自分と共有された作業を確認し、依頼を出し、チームからの返信を読める専用のウェブページです。",
        "body": [
          {
            "h": "チームが使う理由"
          },
          {
            "p": "状況報告のメールが不要になります。顧客は好きなときに進み具合を確認でき、依頼はばらばらのメールではなく一か所に集まります。"
          },
          {
            "h": "共有するもの"
          },
          {
            "ul": [
              "オンボーディングの手順と日程。",
              "会議で約束したタスク。",
              "依頼への回答。"
            ]
          }
        ],
        "curahold": "顧客はメールのリンクからログインし、共有した内容だけを確認できます。顧客が出した依頼はチームのボードに届きます。"
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "カスタマーオンボーディング",
        "seo": [
          "カスタマーオンボーディングとは？流れと目的 | Curahold",
          "カスタマーオンボーディングとは、新しい顧客を契約から最初の価値まで導く取り組みです。営業からの引き継ぎ、設定、トレーニング、最初の成果までを解説します。"
        ],
        "lead": "カスタマーオンボーディングとは、契約してから新しい顧客が購入した価値を初めて実感するまでの期間と、その期間を短くするためにチームが行う仕事のことです。",
        "body": [
          {
            "h": "主な内容"
          },
          {
            "ul": [
              "約束した内容を含む、営業からの引き継ぎ。",
              "目標と日程を合意するキックオフ。",
              "設定、データ移行、トレーニング。",
              "顧客が自分で確認し、言葉にできる最初の成果。"
            ]
          },
          {
            "h": "なぜ重要か"
          },
          {
            "p": "早い段階で価値を実感した顧客は継続しやすい傾向があります。オンボーディングが長引くと、最初の更新の話し合いが不信から始まってしまいます。"
          }
        ],
        "curahold": "オンボーディングチームがある場合、受注した商談は、関係者、約束した内容、未対応の要望、重要な日付をまとめた1枚の引き継ぎカードとして届きます。そのタスクは顧客ポータルで顧客と共有できます。"
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "サービス提供コスト",
        "seo": [
          "サービス提供コストとは？測り方と活かし方 | Curahold",
          "サービス提供コストとは、顧客対応にかかる時間や費用を、その顧客の支払額と比べたものです。測り方と、更新の前に結果をどう活かすかを解説します。"
        ],
        "lead": "サービス提供コストとは、チームが顧客のために費やす労力を、その顧客が支払う金額と比べたものです。",
        "body": [
          {
            "h": "測り方"
          },
          {
            "p": "最もシンプルな指標は時間です。直近12か月にチームがその顧客に記録した時間を、年間契約額で割ります。すべての顧客を同じ尺度で比べると、支払額に対して最も手がかかっている顧客がわかります。"
          },
          {
            "h": "結果の活かし方"
          },
          {
            "ul": [
              "数字が高い原因となっている作業を探します。繰り返される依頼、足りない機能、トレーニング不足などです。",
              "更新までに原因を解消するか、追加の対応を更新価格に反映します。",
              "この数字だけで顧客を評価しないでください。要求の多い顧客が、最高の推薦者になることもあります。"
            ]
          }
        ],
        "curahold": "サービス提供コストのレポートは、顧客ごとに直近12か月で年間価値1,000あたりに費やした時間を示すので、手のかかる顧客がひと目でわかります。"
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "売上継続率（NRR）",
        "seo": [
          "売上継続率（NRR）とは？定義と計算式 | Curahold",
          "売上継続率は、既存顧客のグループが1年後にどれだけの継続収益をもたらしているかを示す指標です。更新、拡大、ダウングレード、解約を含めた計算方法と、100%を超える意味を解説します。"
        ],
        "lead": "売上継続率（NRR）は、ある顧客グループが今もたらしている継続収益を、同じ顧客の1年前の継続収益と比べた割合です。",
        "body": [
          {
            "h": "計算方法"
          },
          {
            "p": "期首にいた顧客の継続収益から始め、拡大分を足し、ダウングレードと解約を引いて、期首の値で割ります。新規顧客は含めません。"
          },
          {
            "h": "チームが注目する理由"
          },
          {
            "ul": [
              "100%を超えれば、既存顧客だけで成長していることになります。",
              "更新と拡大が損失を上回っているかが分かります。",
              "ゆっくり動く指標なので、地道な顧客対応が報われます。"
            ]
          }
        ],
        "curahold": "更新と拡大の商談は新規の商談と同じパイプラインにあり、更新ビューでは更新月ごとに全顧客と影響を受ける金額を一覧できます。"
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "年間経常収益（ARR）",
        "seo": [
          "年間経常収益（ARR）とは？簡潔な定義 | Curahold",
          "年間経常収益は、契約中のサブスクリプションの年間価値です。何を含め何を含めないか、そして顧客ごとのARRを見て大きな更新に注力し、リスクのある金額を把握する方法を解説します。"
        ],
        "lead": "年間経常収益（ARR）は、有効なサブスクリプションの年間価値です。何も変わらなければ、顧客が12か月で支払う金額にあたります。",
        "body": [
          {
            "h": "含めるもの"
          },
          {
            "ul": [
              "年額に換算したサブスクリプション料金。",
              "継続的なアドオンと追加シート。",
              "初期設定やトレーニングなどの一時費用は含めません。"
            ]
          },
          {
            "h": "顧客ごとに見る理由"
          },
          {
            "p": "顧客ごとのARRを見れば収益の所在が分かり、大きな更新に必要な手をかけられます。連絡が途絶えた顧客で、どれだけの金額がリスクにあるかも見えます。"
          }
        ],
        "curahold": "ARRは各顧客の項目として持て、レポートで担当者別、ヘルススコアの帯別、更新月別に集計できます。集計は見る人自身の権限の範囲で行われます。"
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "ビジネスレビュー（QBR）",
        "seo": [
          "ビジネスレビュー（QBR）とは？目的と議題 | Curahold",
          "ビジネスレビューは、顧客とベンダーが成果、未完了の約束、次の計画を定期的に確認する会議で、多くは四半期ごとに行います。扱う内容と、担当者と期日つきの次のステップで締める理由を解説します。"
        ],
        "lead": "ビジネスレビューは、多くの場合四半期ごとに行う QBR とも呼ばれる会議で、顧客とベンダーが成果を振り返り、次の計画に合意します。",
        "body": [
          {
            "h": "扱う内容"
          },
          {
            "ul": [
              "前回決めた目標に対する成果。",
              "顧客側で変わったこと。",
              "未完了の依頼と約束、それぞれの状況。",
              "次の期間の計画と担当者。"
            ]
          },
          {
            "h": "役に立つ会議にするには"
          },
          {
            "p": "担当者と期日のある次のステップで締めくくります。アクションを書き留めないレビューは、次のレビューまでに忘れられます。"
          }
        ],
        "curahold": "ビジネスレビューは顧客のタイムライン上の会議として記録され、そこに書いた次のステップは担当者と期日つきのタスクになります。"
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager（CSM）",
        "seo": [
          "CSMの仕事とは？役割と時間の使い方 | Curahold",
          "Customer Success Managerは、契約後に担当顧客を支える役割です。オンボーディング、活用支援、ビジネスレビュー、更新、リスクの早期発見まで、仕事の中身と時間の使い方を解説します。"
        ],
        "lead": "Customer Success Manager（CSM）は契約後に担当顧客を支え、購入した価値を得て使い続けてもらう役割です。",
        "body": [
          {
            "h": "主な仕事"
          },
          {
            "ul": [
              "新規顧客のオンボーディング、またはオンボーディングチームからの引き継ぎ。",
              "定期的な打ち合わせとビジネスレビュー。",
              "ヘルスの確認と、早期の警告への対応。",
              "更新の準備と拡大の機会の発見。"
            ]
          },
          {
            "h": "時間の使い方"
          },
          {
            "p": "CSMは数十社を担当することも少なくありません。全社に均等に時間を割くより、今週どの顧客に手が必要かを知ることが大切です。"
          }
        ],
        "curahold": "各顧客には部門ごとに担当者がいて、各自のリストは理由と次のステップつきで、手が必要な順に並びます。"
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "拡大収益",
        "seo": [
          "拡大収益とは？アップセルとクロスセル | Curahold",
          "拡大収益は、既存顧客からの追加の継続収益です。シートの追加、上位プラン、別製品など、アップセル、クロスセル、顧客自身の成長という3つの源泉と、提案に適したタイミングを解説します。"
        ],
        "lead": "拡大収益は、既存顧客からの追加の継続収益です。シートの追加、上位プランへの変更、別の製品などから生まれます。",
        "body": [
          {
            "h": "生まれるところ"
          },
          {
            "ul": [
              "アップセル：今使っているものの追加や上位プラン。",
              "クロスセル：まだ使っていない製品。",
              "顧客自身の成長：新しいチーム、拠点、国。"
            ]
          },
          {
            "h": "提案のタイミング"
          },
          {
            "p": "拡大は価値のあとに来ます。顧客が名前を挙げられる成果のあとが最も提案しやすく、前回の依頼の約束が残っているときが最も難しくなります。"
          }
        ],
        "curahold": "製品ビューでどの顧客がどの製品を使っているかが分かるので、空白が見え、そのためのタスクもワンクリックで作れます。"
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "価値実現までの時間",
        "seo": [
          "価値実現までの時間（TTV）とは？短縮のコツ | Curahold",
          "価値実現までの時間は、新規顧客が契約から最初の成果を実感するまでの期間です。最初の更新に直結する理由と、キックオフ、引き継ぎ、計画の共有で短くする方法を解説します。"
        ],
        "lead": "価値実現までの時間は、新規顧客が契約してから、目に見えて名前を挙げられる最初の成果を得るまでの期間です。",
        "body": [
          {
            "h": "なぜ重要か"
          },
          {
            "p": "最初の更新の話は契約の日から始まっています。数週間で価値を感じた顧客は成長の話をし、まだ待っている顧客は価格の話をします。"
          },
          {
            "h": "短くする方法"
          },
          {
            "ul": [
              "キックオフで、期日つきの最初の成果をひとつ決める。",
              "営業の約束を引き継ぎ、同じ質問を二度しない。",
              "計画を顧客と共有し、双方が次のステップを見られるようにする。"
            ]
          }
        ],
        "curahold": "オンボーディング計画にはステップ、目標、期日があり、選んだステップは顧客のポータルで共有できます。"
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "サクセスプラン",
        "seo": [
          "カスタマーサクセスプランとは？構成と使い方 | Curahold",
          "サクセスプランは、顧客が達成したいこと、双方の取り組み、担当者と期日、進捗の測り方をまとめたものです。主な構成要素と、毎回の打ち合わせやレビューでの使い方を解説します。"
        ],
        "lead": "サクセスプランは、顧客が達成したいこと、双方が取るステップ、進捗の測り方を書き留めたものです。",
        "body": [
          {
            "h": "主な内容"
          },
          {
            "ul": [
              "顧客自身の言葉で書いた目標。",
              "双方のステップ、担当者、期日。",
              "進捗を示す指標。"
            ]
          },
          {
            "h": "使い方"
          },
          {
            "p": "すべての打ち合わせとビジネスレビューの基準になります。一緒に更新していけば、双方が同じ成果に向かって動けます。"
          }
        ],
        "curahold": "オンボーディング計画で目標、担当者と期日つきのステップ、追う指標を管理でき、顧客向けのステップはポータルで共有できます。"
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "ステークホルダーマップ",
        "seo": [
          "ステークホルダーマップとは？B2Bでの使い方 | Curahold",
          "ステークホルダーマップは、顧客側で意思決定に関わる人、その役割と影響力、立場、まだ会っていない人をまとめたものです。何を記録するかと、契約後や更新前にも重要な理由を解説します。"
        ],
        "lead": "ステークホルダーマップは、顧客側で意思決定に関わる人、その役割、それぞれの立場をまとめたものです。",
        "body": [
          {
            "h": "記録すること"
          },
          {
            "ul": [
              "各人の役割と影響力。",
              "立場：推進派、中立、反対派。",
              "まだ会っていない人。"
            ]
          },
          {
            "h": "契約後も重要な理由"
          },
          {
            "p": "更新の判断を一人で下すことはまれです。推進役が去ったとき、マップを見れば、価値を知る人と価値を伝えるべき人が分かります。"
          }
        ],
        "curahold": "各商談がステークホルダーを役職と立場つきで保持し、引き継ぎカードとともに顧客を受け持つチームへ渡ります。"
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "チャンピオン",
        "seo": [
          "顧客側のチャンピオンとは？B2Bでの役割 | Curahold",
          "チャンピオンは、顧客側で自社製品を信頼し、社内で後押ししてくれる人です。活発なチャンピオンがいる顧客が更新しやすい理由と、その人が異動や退職したときに取るべき手順を解説します。"
        ],
        "lead": "チャンピオンは、顧客側で提供するものを信頼し、社内で後押ししてくれる人です。",
        "body": [
          {
            "h": "なぜ重要か"
          },
          {
            "p": "会議を設定し、予算を守り、問題を早めに知らせてくれます。活発なチャンピオンがいる顧客は更新しやすくなります。"
          },
          {
            "h": "チャンピオンが去ったとき"
          },
          {
            "ul": [
              "その人の仕事を誰が引き継ぐかを確認する。",
              "残った人に改めて価値を示す。",
              "新しいチャンピオンが見つかるまでリスクとして扱う。"
            ]
          }
        ],
        "curahold": "チャンピオンの有無をヘルススコアのシグナルにでき、チャンピオンがいない顧客や去った顧客が上位に表示されます。"
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "営業からカスタマーサクセスへの引き継ぎ",
        "seo": [
          "営業からカスタマーサクセスへの引き継ぎ | Curahold",
          "営業からカスタマーサクセスへの引き継ぎでは、ステークホルダー、商談中の約束、未完了の依頼、主要な日付を渡し、顧客が同じ説明を繰り返さずに済むようにします。渡す内容とよくある失敗を解説します。"
        ],
        "lead": "営業からカスタマーサクセスへの引き継ぎは、次のチームに必要なことをすべて渡し、顧客が一から説明し直さずに済むようにするものです。",
        "body": [
          {
            "h": "渡すこと"
          },
          {
            "ul": [
              "ステークホルダーとそれぞれの立場。",
              "商談中に約束したこと。",
              "未完了の依頼と製品に関する質問。",
              "成約日と更新日。"
            ]
          },
          {
            "h": "よくある失敗"
          },
          {
            "p": "商談の電話で約束したのに誰も書き留めなかったこと。顧客は覚えていますが、新しいチームは知りません。"
          }
        ],
        "curahold": "受注した商談は、ステークホルダー、約束、未完了の製品要望、主要な日付をまとめた1枚の引き継ぎカードとして次のチームに届きます。"
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "機能要望",
        "seo": [
          "B2Bの機能要望をどう扱うか | Curahold",
          "機能要望は、製品がまだできないことを顧客が求めることです。誰がなぜ求めたかの記録、同じ要望の関連づけと優先順位づけ、完成したときに顧客へ伝えて輪を閉じる方法を解説します。"
        ],
        "lead": "機能要望は、製品がまだできないことを顧客が求めるもので、会議やサポートのやり取りの中で出てくることが多くあります。",
        "body": [
          {
            "h": "うまく扱うには"
          },
          {
            "ul": [
              "誰が求めたか、なぜ重要かを記録する。",
              "同じ内容の要望を関連づける。",
              "待っている顧客と価値で優先順位をつける。"
            ]
          },
          {
            "h": "輪を閉じる"
          },
          {
            "p": "多くのチームが見落とすのは、完成したときに顧客へ伝えることです。リリースノートで応えた要望は、機能そのもの以上に信頼を生みます。"
          }
        ],
        "curahold": "複数の顧客要望を1つのストーリーに関連づけられ、バックログには待っている顧客、その価値、直近の更新が表示されます。作業が終わると担当者に送信用の下書きが届きます。"
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "タッチポイント",
        "seo": [
          "顧客とのタッチポイントとは？定義と例 | Curahold",
          "タッチポイントは、顧客とチームのあいだのあらゆる接点です。電話、会議、メール、依頼への返信など、回数より頻度のリズムが大切な理由と、毎回残しておくべき情報を解説します。"
        ],
        "lead": "タッチポイントは、顧客とチームのあいだのあらゆる接点です。電話、会議、メール、依頼への返信などが含まれます。",
        "body": [
          {
            "h": "リズムが大切な理由"
          },
          {
            "p": "長い沈黙は早期の警告です。6週間誰も話していない顧客は、毎月会っている顧客より更新が難しくなります。"
          },
          {
            "h": "毎回残すこと"
          },
          {
            "ul": [
              "いつ、誰が参加したか。",
              "何が決まったか。",
              "担当者と期日つきの次のステップ。"
            ]
          }
        ],
        "curahold": "会議、電話、メモは各顧客のタイムラインに残り、最後の接点からの日数はヘルススコアに反映されます。顧客ごとにレビューの頻度も設定できます。"
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "会議のフォローアップ",
        "seo": [
          "顧客との会議のフォローアップ | Curahold",
          "会議のフォローアップは、顧客と合意したことを担当者と期日つきの仕事に変え、約束を守り、顧客にもそれが見えるようにすることです。次のステップが漏れる理由と、よいフォローアップの形を解説します。"
        ],
        "lead": "会議のフォローアップは、顧客との会議で合意したことを、細部を忘れないうちに担当者と期日つきの仕事に変えることです。",
        "body": [
          {
            "h": "漏れてしまう理由"
          },
          {
            "p": "次のステップが誰かのメモに残ったままになります。1週間後には誰が何をすると言ったか誰も覚えておらず、最初に気づくのは顧客です。"
          },
          {
            "h": "よいフォローアップとは"
          },
          {
            "ul": [
              "通話が終わる前に次のステップを書く。",
              "それぞれに担当者と期日をつける。",
              "顧客に確認の短いメモを送る。"
            ]
          }
        ],
        "curahold": "会議のメモに書いた次のステップは、顧客に紐づいた担当者と期日つきのタスクになり、約束は顧客のポータルで共有できます。"
      }
    ]
  },
  ko: {
    "title": "고객 팀을 위한 템플릿과 용어집",
    "lead": "고객을 지키는 일에 바로 쓸 수 있는 템플릿과 쉬운 용어 풀이입니다. 갱신, 비즈니스 리뷰, 헬스 스코어, 이탈을 다룹니다.",
    "seo": [
      "고객 성공 템플릿과 용어집 | Curahold",
      "갱신 플레이북과 비즈니스 리뷰 무료 템플릿, 그리고 헬스 스코어, 고객 이탈, 계약 갱신, 고객 포털을 쉽게 풀어 쓴 설명을 모았습니다."
    ],
    "templates": "템플릿",
    "glossary": "용어집",
    "inCurahold": "Curahold에서는",
    "nav": [
      "템플릿과 용어집",
      "갱신 단계, 리뷰 안건, 쉬운 용어 풀이."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "갱신 플레이북 템플릿",
        "seo": [
          "갱신 플레이북 템플릿: 90일 전부터의 단계 | Curahold",
          "그대로 쓸 수 있는 갱신 플레이북입니다. 계약 갱신 90일, 75일, 60일, 30일 전에 할 일, 단계별 담당자, 갱신 미팅 전에 확인할 점을 담았습니다."
        ],
        "lead": "갱신은 당일이 아니라 그 전 석 달 동안 결정됩니다. 아래 단계를 복사해 단계마다 담당자를 정하고, 갱신일부터 거꾸로 날짜를 계산하세요.",
        "body": [
          {
            "h": "단계"
          },
          {
            "ol": [
              "90일 전: 사용 현황, 열린 요청, 헬스 스코어를 확인하고 걱정되는 점을 적어 둡니다.",
              "75일 전: 의사 결정자와 실무 담당자와의 갱신 미팅을 잡습니다.",
              "60일 전: 좌석 수나 플랜 변경을 반영한 갱신 견적을 보냅니다.",
              "30일 전: 견적을 후속 확인하고 남은 질문을 서면으로 정리합니다.",
              "갱신일: 서명된 갱신을 확인하고 합의 내용을 기록합니다."
            ]
          },
          {
            "h": "갱신 미팅 전에"
          },
          {
            "ul": [
              "고객은 올해 무엇을 이루고 싶었고, 이루었나요?",
              "이전 미팅에서 한 약속 중 아직 남은 것은 무엇인가요?",
              "누가 결정하며, 최근 함께 미팅을 했나요?"
            ]
          }
        ],
        "curahold": "갱신을 켜면 갱신 플레이북이 갱신일 90일 전에 단계를 작업으로 만듭니다. 각 작업에는 담당자와 갱신일에서 거꾸로 계산한 기한이 붙습니다."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "비즈니스 리뷰(QBR) 안건 템플릿",
        "seo": [
          "비즈니스 리뷰(QBR) 안건 템플릿 | Curahold",
          "한 시간짜리 비즈니스 리뷰 안건입니다. 목표 대비 결과, 달라진 점, 남은 약속, 다음 분기 계획, 그리고 분명한 다음 단계까지 다룹니다."
        ],
        "lead": "분기 비즈니스 리뷰는 고객에게는 가치의 증거를, 양쪽에는 같은 다음 단계를 남겨야 합니다. 이 안건은 한 시간이면 충분합니다.",
        "body": [
          {
            "h": "안건(60분)"
          },
          {
            "ol": [
              "5분: 미팅의 목표와 참석자 확인.",
              "15분: 지난 분기에 정한 목표 대비 결과.",
              "10분: 고객 쪽에서 달라진 점(사람, 우선순위, 예산).",
              "10분: 열린 요청과 약속, 각각의 진행 상황.",
              "15분: 다음 분기 계획.",
              "5분: 담당자와 기한을 정한 다음 단계."
            ]
          },
          {
            "h": "미팅이 끝난 뒤"
          },
          {
            "p": "당일에 짧은 요약을 보내세요. 합의한 내용, 담당자와 기한이 있는 다음 단계, 다음 리뷰 날짜를 담으면 됩니다."
          }
        ],
        "curahold": "리뷰를 고객의 미팅으로 기록하고 다음 단계를 적어 저장하면, 각 단계가 담당자와 기한이 있는 작업이 됩니다. 고객 포털에서 공유할 수도 있습니다."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "영업에서 온보딩으로 넘기는 인계 체크리스트",
        "seo": [
          "영업에서 온보딩으로의 인계 체크리스트 | Curahold",
          "수주한 거래의 인계 체크리스트입니다. 이해관계자는 누구인지, 영업 중 무엇을 약속했는지, 열린 요청, 주요 날짜, 고객과의 첫 미팅까지 정리합니다."
        ],
        "lead": "고객의 첫 몇 달에 생기는 문제는 대부분 인계에서 시작됩니다. 영업이 아는 내용이 온보딩 팀에는 끝내 전달되지 않기 때문입니다. 이 목록을 복사해 거래가 넘어가기 전에 채우세요.",
        "body": [
          {
            "h": "인계 때 반드시 넘겨야 할 것"
          },
          {
            "ul": [
              "이해관계자: 의사결정자, 일상 담당자, 고객 측 지지자, 그리고 각자에게 연락하는 방법.",
              "영업 중 한 약속: 기능, 날짜, 할인 등 서면이나 통화로 말한 모든 것.",
              "고객이 기다리는 열린 제품 요청과 그에 대해 안내한 내용.",
              "주요 날짜: 계약 체결일, 고객이 기대하는 가동 시작일, 갱신일.",
              "구매 이유: 해결하려는 문제와 성공을 판단하는 기준."
            ]
          },
          {
            "h": "첫 미팅 전에"
          },
          {
            "ol": [
              "영업 담당자와 온보딩 담당자가 15분 동안 목록을 함께 읽습니다.",
              "불분명한 점은 고객이 아니라 영업 담당자에게 확인합니다.",
              "첫 미팅은 고객의 목표를 고객의 말 그대로 다시 확인하며 시작합니다."
            ]
          }
        ],
        "curahold": "거래를 수주하면 Curahold가 다음 팀을 위한 인계 카드를 준비할 수 있습니다. 이해관계자, 약속한 내용, 열린 제품 요청, 체결일과 갱신일이 담기며, 새 담당자가 확인할 때까지 기다립니다."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "고객 헬스 스코어 표 템플릿",
        "seo": [
          "헬스 스코어 템플릿: 신호, 점수, 기준선 | Curahold",
          "그대로 복사해 쓰는 헬스 스코어 표입니다. 팀이 확인할 수 있는 신호 여섯 가지, 신호별 가점과 감점, 관심이 필요한 고객을 가르는 기준선을 담았습니다."
        ],
        "lead": "헬스 스코어는 팀이 믿을 때만 쓸모가 있고, 팀은 설명할 수 있는 점수를 믿습니다. 눈에 보이는 몇 가지 신호로 시작해 각각에 가중치를 주고, 그 이유를 적어 두세요.",
        "body": [
          {
            "h": "신호와 점수 (50점에서 시작)"
          },
          {
            "ul": [
              "최근 30일 안에 고객과 대화함: +15. 60일 동안 연락 없음: −20.",
              "답장하는 지지자가 고객 측에 있음: +15. 지지자가 떠남: −25.",
              "약속한 작업이 지연됨: 건당 −10, 최대 −30.",
              "2주 넘게 열려 있는 장애나 지원 요청: −10.",
              "사용량이 유지되거나 늘어남: +10. 두 달째 감소: −15.",
              "갱신까지 90일이 안 남았는데 미팅이 잡히지 않음: −10."
            ]
          },
          {
            "h": "기준선"
          },
          {
            "ul": [
              "70점 이상: 양호. 지금의 리듬을 유지합니다.",
              "40~69점: 주의. 이번 주 안에 원인을 찾습니다.",
              "40점 미만: 위험. 담당자가 연락하고 팀장에게도 알립니다."
            ]
          },
          {
            "p": "분기마다 실제로 잃은 고객, 지킨 고객과 비교해 가중치를 점검하고, 예측이 틀린 항목은 고치세요."
          }
        ],
        "curahold": "모든 고객에게 직접 정한 규칙으로 계산한 0~100점의 점수가 붙고, 그 이유와 최근 30일의 추이를 확인할 수 있습니다."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "고객 헬스 스코어",
        "seo": [
          "고객 헬스 스코어란? 쉽게 풀어 쓴 정의 | Curahold",
          "고객 헬스 스코어는 고객 관계가 어떤 상태인지 숫자 하나로 요약합니다. 마지막 접점, 지연된 작업, 해결되지 않은 문제 같은 신호로 계산합니다."
        ],
        "lead": "고객 헬스 스코어는 고객과의 관계가 얼마나 잘 가고 있는지를 보여 주는 숫자 하나로, 보통 0~100점으로 나타냅니다.",
        "body": [
          {
            "p": "팀이 확인할 수 있는 신호로 계산합니다. 고객과 마지막으로 이야기한 때, 약속한 작업의 지연 여부, 고객 쪽 핵심 지지자의 유무, 열린 장애 요소와 지원 요청 등입니다. 신호마다 점수가 더해지거나 빠집니다."
          },
          {
            "h": "왜 중요한가"
          },
          {
            "p": "고객이 수십 곳이면 조용히 멀어지는 한 곳이 묻히기 쉽습니다. 점수로 정렬하면 갱신이 위험한 고객에게 먼저 눈이 갑니다."
          },
          {
            "h": "좋은 점수의 조건"
          },
          {
            "ul": [
              "스스로 설명한다: 어떤 신호 때문에 바뀌었는지 누구나 볼 수 있다.",
              "팀이 믿고 행동으로 옮길 수 있는 신호를 쓴다.",
              "한 번 보고 끝나지 않고 시간에 따라 추이를 본다."
            ]
          }
        ],
        "curahold": "모든 고객에게 직접 정한 규칙으로 계산한 0~100점의 점수가 붙고, 그 이유와 최근 30일의 추이를 확인할 수 있습니다."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "고객 이탈(Churn)",
        "seo": [
          "고객 이탈(Churn)이란? 정의와 초기 신호 | Curahold",
          "이탈은 일정 기간에 잃은 고객이나 매출의 비율입니다. 무엇을 이탈로 보는지, 어떻게 측정하는지, 그 전에 나타나는 초기 신호를 설명합니다."
        ],
        "lead": "이탈은 고객이 구매를 멈추는 것, 즉 해지하거나 갱신하지 않는 것입니다. 이탈률은 일정 기간에 잃은 고객이나 매출의 비율입니다.",
        "body": [
          {
            "h": "측정 방법"
          },
          {
            "ul": [
              "고객 이탈: 기간 중 잃은 고객 수를 기간 초 고객 수로 나눈 값.",
              "매출 이탈: 해지와 다운그레이드로 잃은 반복 매출을 기간 초 반복 매출로 나눈 값."
            ]
          },
          {
            "h": "먼저 나타나는 신호"
          },
          {
            "p": "이탈은 예고 없이 오는 일이 드뭅니다. 연락이 뜸해지고, 약속한 작업이 밀리고, 지지자가 떠나고, 지원 요청이 쌓입니다. 이런 신호를 지켜보면 갱신일 전에 손을 쓸 수 있습니다."
          }
        ],
        "curahold": "이런 신호는 고객마다 헬스 스코어에 반영되어, 멀어지는 고객이 갱신 훨씬 전에 위로 올라옵니다."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "계약 갱신",
        "seo": [
          "계약 갱신이란? 진행 과정과 일정 | Curahold",
          "계약 갱신은 고객과의 계약을 새 기간으로 연장하는 일입니다. 언제 시작하는지, 갱신 과정은 어떻게 흘러가는지, 왜 몇 달 전부터 준비하는지 설명합니다."
        ],
        "lead": "계약 갱신은 고객과의 계약을 다음 기간으로 연장하는 일입니다. 좌석 추가, 플랜 변경, 새 가격 등 변경이 함께 따르는 경우가 많습니다.",
        "body": [
          {
            "h": "언제 시작하나"
          },
          {
            "p": "연간 계약이라면 보통 약 90일 전부터 준비를 시작합니다. 그래야 제공한 가치를 돌아보고, 의사 결정자를 만나고, 견적을 보내고, 질문을 서두르지 않고 정리할 수 있습니다."
          },
          {
            "h": "흔히 생기는 문제"
          },
          {
            "ul": [
              "갱신일을 너무 늦게 알아차린다.",
              "계약에 서명한 사람이 이미 떠났다.",
              "한 해 동안 한 약속이 아직 남아 있다."
            ]
          }
        ],
        "curahold": "갱신마다 90일 전에 담당자와 기한이 있는 작업으로 플레이북을 시작하고, 파이프라인에 갱신 거래도 함께 만들 수 있습니다."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "고객 포털",
        "seo": [
          "고객 포털이란? 정의와 활용 방법 | Curahold",
          "고객 포털은 고객이 공유된 작업을 보고, 요청을 남기고, 답변을 읽는 전용 공간입니다. 흩어진 이메일 스레드를 쫓아다닐 필요가 없어집니다."
        ],
        "lead": "고객 포털은 고객이 자신과 공유된 작업을 보고, 요청을 남기고, 팀의 답변을 읽을 수 있는 전용 웹페이지입니다.",
        "body": [
          {
            "h": "팀이 쓰는 이유"
          },
          {
            "p": "상황 보고 이메일을 대신합니다. 고객은 원할 때 진행 상황을 보고, 요청은 흩어진 스레드가 아닌 한곳에 모입니다."
          },
          {
            "h": "무엇을 공유하나"
          },
          {
            "ul": [
              "온보딩 단계와 일정.",
              "미팅에서 약속한 작업.",
              "요청에 대한 답변."
            ]
          }
        ],
        "curahold": "고객은 이메일 링크로 로그인해 공유한 내용만 봅니다. 고객이 남긴 요청은 팀의 보드로 들어옵니다."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "고객 온보딩",
        "seo": [
          "고객 온보딩이란? 단계와 목표 | Curahold",
          "고객 온보딩은 새 고객을 계약에서 첫 가치까지 이끄는 일입니다. 영업 인계, 설정, 교육, 그리고 고객이 직접 확인하는 첫 성과까지 설명합니다."
        ],
        "lead": "고객 온보딩은 계약 후 새 고객이 구매한 가치를 처음 체감하기까지의 기간이자, 그 기간을 줄이기 위해 팀이 하는 일입니다.",
        "body": [
          {
            "h": "보통 포함하는 것"
          },
          {
            "ul": [
              "약속한 내용을 담은 영업의 인계.",
              "목표와 일정을 합의하는 킥오프 미팅.",
              "설정, 데이터 가져오기, 교육.",
              "고객이 직접 보고 말할 수 있는 첫 성과."
            ]
          },
          {
            "h": "왜 중요한가"
          },
          {
            "p": "가치를 일찍 체감한 고객은 계속 남는 경향이 있습니다. 온보딩이 길어지면 첫 갱신 논의가 의심에서 시작됩니다."
          }
        ],
        "curahold": "온보딩 팀이 있다면 수주한 거래는 이해관계자, 약속한 내용, 열린 요청, 주요 날짜를 담은 인계 카드 한 장으로 전달됩니다. 그 작업은 고객 포털에서 고객과 공유할 수 있습니다."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "서비스 비용",
        "seo": [
          "서비스 비용이란? 측정 방법과 활용법 | Curahold",
          "서비스 비용은 고객을 관리하는 데 드는 시간이나 돈을 그 고객이 내는 금액과 비교한 값입니다. 측정 방법과 갱신 전에 결과를 활용하는 법을 정리했습니다."
        ],
        "lead": "서비스 비용은 팀이 한 고객을 관리하는 데 들이는 노력을, 그 고객이 내는 금액과 비교한 것입니다.",
        "body": [
          {
            "h": "측정 방법"
          },
          {
            "p": "가장 간단한 기준은 시간입니다. 최근 12개월 동안 팀이 그 고객에게 기록한 시간을 연간 계약 금액으로 나눕니다. 모든 고객을 같은 기준으로 비교하면, 내는 금액에 비해 가장 손이 많이 가는 고객이 보입니다."
          },
          {
            "h": "결과 활용법"
          },
          {
            "ul": [
              "높은 숫자 뒤에 있는 일을 찾으세요. 반복되는 요청, 빠진 기능, 교육 공백 같은 것입니다.",
              "갱신 전에 원인을 해결하거나, 추가 서비스를 갱신 가격에 반영하세요.",
              "이 숫자만으로 고객을 판단하지 마세요. 요구가 많은 고객이 가장 좋은 추천 고객이 되기도 합니다."
            ]
          }
        ],
        "curahold": "서비스 비용 보고서는 고객별로 최근 12개월 동안 연간 가치 1,000당 들인 시간을 보여 주므로, 관리 비용이 가장 큰 고객을 알 수 있습니다."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "순매출 유지율(NRR)",
        "seo": [
          "순매출 유지율(NRR)이란? 정의와 계산법 | Curahold",
          "순매출 유지율은 기존 고객 그룹이 1년 뒤 얼마나 많은 반복 매출을 가져오는지 보여 줍니다. 갱신, 확장, 다운그레이드, 이탈을 반영한 계산법과 100%를 넘는 의미를 설명합니다."
        ],
        "lead": "순매출 유지율(NRR)은 한 고객 그룹이 지금 가져오는 반복 매출을, 같은 고객들이 1년 전에 가져온 매출과 비교한 비율입니다.",
        "body": [
          {
            "h": "계산 방법"
          },
          {
            "p": "기간 초에 있던 고객의 반복 매출에서 시작해 확장분을 더하고 다운그레이드와 이탈을 뺀 뒤, 시작 값으로 나눕니다. 신규 고객은 포함하지 않습니다."
          },
          {
            "h": "팀이 주목하는 이유"
          },
          {
            "ul": [
              "100%를 넘으면 기존 고객만으로 성장하고 있다는 뜻입니다.",
              "갱신과 확장이 손실보다 큰지 알 수 있습니다.",
              "천천히 움직이는 지표라 꾸준한 고객 관리가 보상받습니다."
            ]
          }
        ],
        "curahold": "갱신과 확장 거래는 신규 거래와 같은 파이프라인에 있고, 갱신 화면은 갱신 월별로 모든 고객과 위험에 놓인 금액을 보여 줍니다."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "연간 반복 매출(ARR)",
        "seo": [
          "연간 반복 매출(ARR)이란? 간단한 정의 | Curahold",
          "연간 반복 매출은 계약된 구독의 연간 가치입니다. 무엇을 포함하고 무엇을 빼는지, 그리고 고객별 ARR을 보며 큰 갱신에 집중하고 위험한 금액을 파악하는 방법을 설명합니다."
        ],
        "lead": "연간 반복 매출(ARR)은 유효한 구독의 연간 가치입니다. 아무것도 바뀌지 않는다면 고객이 12개월 동안 낼 금액입니다.",
        "body": [
          {
            "h": "포함하는 것"
          },
          {
            "ul": [
              "연 단위로 환산한 구독료.",
              "반복되는 부가 기능과 추가 좌석.",
              "설정이나 교육 같은 일회성 비용은 포함하지 않습니다."
            ]
          },
          {
            "h": "고객별로 봐야 하는 이유"
          },
          {
            "p": "고객별 ARR을 보면 매출이 어디에 있는지 알 수 있어, 가장 큰 갱신에 필요한 관심을 기울이고 연락이 끊긴 고객에게 얼마가 걸려 있는지 볼 수 있습니다."
          }
        ],
        "curahold": "ARR을 각 고객의 필드로 두고, 보고서에서 담당자, 헬스 스코어 구간, 갱신 월별로 합산할 수 있습니다. 합산은 보는 사람의 권한 범위에서 이뤄집니다."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "비즈니스 리뷰(QBR)",
        "seo": [
          "비즈니스 리뷰(QBR)란? 목적과 안건 | Curahold",
          "비즈니스 리뷰는 고객과 공급사가 성과, 남은 약속, 다음 계획을 정기적으로 점검하는 회의입니다. 다룰 내용과 담당자와 기한이 있는 다음 단계로 마무리해야 하는 이유를 설명합니다."
        ],
        "lead": "비즈니스 리뷰는 보통 분기마다 열려 QBR이라고도 하며, 고객과 공급사가 성과를 돌아보고 다음 계획에 합의하는 회의입니다.",
        "body": [
          {
            "h": "다루는 내용"
          },
          {
            "ul": [
              "지난번에 정한 목표 대비 성과.",
              "고객 쪽에서 달라진 점.",
              "남은 요청과 약속, 각각의 진행 상황.",
              "다음 기간의 계획과 담당자."
            ]
          },
          {
            "h": "쓸모 있는 리뷰로 만들려면"
          },
          {
            "p": "담당자와 기한이 있는 다음 단계로 마무리하세요. 할 일을 적어 두지 않은 리뷰는 다음 리뷰 전에 잊힙니다."
          }
        ],
        "curahold": "비즈니스 리뷰는 고객 타임라인의 회의로 남고, 거기에 적은 다음 단계는 담당자와 기한이 있는 작업이 됩니다."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager(CSM)",
        "seo": [
          "CSM은 무슨 일을 하나요? 역할과 시간 배분 | Curahold",
          "Customer Success Manager는 계약 뒤 담당 고객의 온보딩, 활용, 리뷰, 갱신, 위험 조기 발견을 책임집니다. 이 역할이 하는 일과 시간 배분을 설명합니다."
        ],
        "lead": "Customer Success Manager(CSM)는 계약 뒤 담당 고객을 맡아, 고객이 산 가치를 얻고 계속 쓰도록 돕는 역할입니다.",
        "body": [
          {
            "h": "주요 업무"
          },
          {
            "ul": [
              "신규 고객 온보딩, 또는 온보딩 팀으로부터 인계.",
              "정기 미팅과 비즈니스 리뷰.",
              "헬스 상태를 살피고 초기 경고에 대응.",
              "갱신 준비와 확장 기회 발견."
            ]
          },
          {
            "h": "시간은 어디에 쓰나"
          },
          {
            "p": "CSM은 수십 개 고객을 맡는 경우가 많습니다. 모두에게 똑같이 시간을 나누기보다 이번 주 어느 고객에게 손이 필요한지 아는 것이 더 중요합니다."
          }
        ],
        "curahold": "각 고객은 부서마다 담당자가 있고, 각자의 목록은 이유와 다음 단계와 함께 도움이 필요한 순서로 정렬됩니다."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "확장 매출",
        "seo": [
          "확장 매출이란? 업셀과 크로스셀 | Curahold",
          "확장 매출은 기존 고객에게서 나오는 추가 반복 매출입니다. 업셀, 크로스셀, 고객 자체의 성장이라는 세 가지 출처와 제안하기 좋은 시점을 설명합니다."
        ],
        "lead": "확장 매출은 이미 있는 고객에게서 나오는 추가 반복 매출입니다. 좌석 추가, 상위 요금제, 다른 제품 등에서 생깁니다.",
        "body": [
          {
            "h": "어디서 오나"
          },
          {
            "ul": [
              "업셀: 이미 쓰는 것을 더 많이, 또는 상위 요금제.",
              "크로스셀: 아직 쓰지 않는 제품.",
              "고객의 성장: 새 팀, 지점, 국가."
            ]
          },
          {
            "h": "언제 제안하나"
          },
          {
            "p": "확장은 가치 뒤에 옵니다. 고객이 이름을 댈 수 있는 성과 뒤가 가장 쉽고, 지난 요청에 대한 약속이 아직 남아 있을 때가 가장 어렵습니다."
          }
        ],
        "curahold": "제품 화면에서 어느 고객이 어떤 제품을 쓰는지 보여 주므로 빈자리가 드러나고, 그중 하나에 대한 작업도 클릭 한 번으로 만들 수 있습니다."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "가치 실현 시간",
        "seo": [
          "가치 실현 시간(TTV)이란? 줄이는 방법 | Curahold",
          "가치 실현 시간은 신규 고객이 계약부터 첫 성과까지 기다리는 시간입니다. 첫 갱신에 영향을 주는 이유와 킥오프, 인계, 계획 공유로 줄이는 방법을 설명합니다."
        ],
        "lead": "가치 실현 시간은 신규 고객이 계약한 뒤, 눈으로 보고 이름을 댈 수 있는 첫 성과를 얻기까지 걸리는 시간입니다.",
        "body": [
          {
            "h": "왜 중요한가"
          },
          {
            "p": "첫 갱신 대화는 계약하는 날 시작됩니다. 몇 주 만에 가치를 본 고객은 성장을 이야기하고, 아직 기다리는 고객은 가격을 이야기합니다."
          },
          {
            "h": "줄이는 방법"
          },
          {
            "ul": [
              "킥오프에서 기한이 있는 첫 성과 하나에 합의하세요.",
              "영업이 한 약속을 인계해 같은 질문을 두 번 하지 않게 하세요.",
              "계획을 고객과 공유해 양쪽 모두 다음 단계를 보게 하세요."
            ]
          }
        ],
        "curahold": "온보딩 계획에는 단계, 목표, 기한이 있고, 고른 단계는 고객 포털에서 고객과 공유할 수 있습니다."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "성공 계획",
        "seo": [
          "고객 성공 계획이란? 구성과 활용법 | Curahold",
          "성공 계획은 고객이 이루고 싶은 목표, 양쪽이 밟을 단계와 담당자와 기한, 진행을 재는 지표를 적어 둔 것입니다. 보통 담는 내용과 매번의 미팅과 리뷰에서 쓰는 방법을 설명합니다."
        ],
        "lead": "성공 계획은 고객이 이루고 싶은 것, 양쪽이 밟을 단계, 진행을 어떻게 잴지를 적어 둔 것입니다.",
        "body": [
          {
            "h": "보통 담는 내용"
          },
          {
            "ul": [
              "고객 자신의 말로 쓴 목표.",
              "양쪽의 단계, 담당자, 기한.",
              "진행을 보여 주는 지표."
            ]
          },
          {
            "h": "활용법"
          },
          {
            "p": "모든 미팅과 비즈니스 리뷰의 기준이 됩니다. 함께 업데이트하면 양쪽이 같은 결과를 향해 일하게 됩니다."
          }
        ],
        "curahold": "온보딩 계획에 목표, 담당자와 기한이 있는 단계, 추적하는 지표를 담을 수 있고, 고객용 단계는 포털에서 공유할 수 있습니다."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "이해관계자 지도",
        "seo": [
          "이해관계자 지도란? B2B에서의 활용 | Curahold",
          "이해관계자 지도는 고객 쪽에서 의사결정에 영향을 주는 사람과 그 역할, 입장을 정리한 것입니다. 무엇을 기록하는지와 계약 뒤에도 중요한 이유를 설명합니다."
        ],
        "lead": "이해관계자 지도는 고객 쪽에서 의사결정에 참여하는 사람, 그 역할, 각자의 입장을 정리한 것입니다.",
        "body": [
          {
            "h": "기록하는 것"
          },
          {
            "ul": [
              "각 사람의 역할과 영향력.",
              "입장: 지지, 중립, 반대.",
              "아직 만나지 않은 사람."
            ]
          },
          {
            "h": "계약 뒤에도 중요한 이유"
          },
          {
            "p": "갱신 결정을 한 사람이 내리는 경우는 드뭅니다. 챔피언이 떠나면 지도를 보고 누가 가치를 알고 누구에게 알려야 하는지 찾을 수 있습니다."
          }
        ],
        "curahold": "각 거래는 이해관계자를 직함과 입장과 함께 보관하고, 인계 카드와 함께 고객을 넘겨받는 팀으로 전달됩니다."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "챔피언",
        "seo": [
          "고객 쪽 챔피언이란? B2B에서의 역할 | Curahold",
          "챔피언은 고객 쪽에서 우리 제품을 믿고 회사 안에서 밀어 주는 사람입니다. 활발한 챔피언이 있는 고객이 더 쉽게 갱신하는 이유와 챔피언이 떠났을 때 밟아야 할 단계를 설명합니다."
        ],
        "lead": "챔피언은 고객 쪽에서 우리가 제공하는 것을 믿고 회사 안에서 밀어 주는 사람입니다.",
        "body": [
          {
            "h": "왜 중요한가"
          },
          {
            "p": "회의를 잡고, 예산을 지키고, 문제를 일찍 알려 줍니다. 활발한 챔피언이 있는 고객은 더 쉽게 갱신합니다."
          },
          {
            "h": "챔피언이 떠나면"
          },
          {
            "ul": [
              "그 사람의 업무를 누가 이어받는지 확인하세요.",
              "남은 사람들에게 가치를 다시 보여 주세요.",
              "새 챔피언이 생길 때까지 위험으로 다루세요."
            ]
          }
        ],
        "curahold": "챔피언 유무를 헬스 스코어의 신호로 쓸 수 있어, 챔피언이 없거나 떠난 고객이 위로 올라옵니다."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "영업에서 고객 성공으로의 인계",
        "seo": [
          "영업에서 고객 성공으로의 인계 체크리스트 | Curahold",
          "영업에서 고객 성공으로의 인계는 이해관계자, 영업 중 한 약속, 남은 요청, 주요 날짜를 넘겨 고객이 같은 설명을 반복하지 않게 합니다. 넘길 내용과 가장 흔한 실수를 설명합니다."
        ],
        "lead": "영업에서 고객 성공으로의 인계는 다음 팀에 필요한 모든 것을 넘겨, 고객이 처음부터 다시 설명하지 않게 하는 일입니다.",
        "body": [
          {
            "h": "넘길 것"
          },
          {
            "ul": [
              "이해관계자와 각자의 입장.",
              "영업 중에 한 약속.",
              "남은 요청과 제품 관련 질문.",
              "계약 체결일과 갱신일."
            ]
          },
          {
            "h": "흔한 실수"
          },
          {
            "p": "영업 통화에서 약속했지만 아무도 적지 않은 것들입니다. 고객은 기억하지만 새 팀은 모릅니다."
          }
        ],
        "curahold": "성사된 거래는 이해관계자, 약속, 남은 제품 요청, 주요 날짜를 담은 인계 카드 한 장으로 다음 팀에 전달됩니다."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "기능 요청",
        "seo": [
          "B2B 고객의 기능 요청 다루는 법 | Curahold",
          "기능 요청은 제품이 아직 못 하는 것을 고객이 요청하는 것입니다. 누가 왜 요청했는지 기록하고, 묶어서 우선순위를 정하고, 완성되면 알리는 방법을 설명합니다."
        ],
        "lead": "기능 요청은 제품이 아직 못 하는 것을 고객이 요청하는 것으로, 회의나 지원 대화 중에 나오는 경우가 많습니다.",
        "body": [
          {
            "h": "잘 다루려면"
          },
          {
            "ul": [
              "누가 요청했고 왜 중요한지 기록하세요.",
              "같은 내용의 요청을 서로 연결하세요.",
              "기다리는 고객과 가치로 우선순위를 정하세요."
            ]
          },
          {
            "h": "고리 닫기"
          },
          {
            "p": "대부분의 팀이 놓치는 것은 작업이 끝났을 때 고객에게 알리는 일입니다. 릴리스 노트로 답한 요청은 기능 자체보다 더 큰 신뢰를 쌓습니다."
          }
        ],
        "curahold": "여러 고객 요청을 하나의 스토리에 연결할 수 있고, 백로그는 기다리는 고객과 그 가치, 가장 가까운 갱신을 보여 줍니다. 작업이 끝나면 담당자에게 보낼 준비가 된 초안이 도착합니다."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "터치포인트",
        "seo": [
          "고객 터치포인트란? 정의와 예시 | Curahold",
          "터치포인트는 고객과 팀 사이의 모든 접점입니다. 전화, 회의, 이메일, 요청에 대한 답변까지, 횟수보다 리듬이 중요한 이유와 매번 남겨야 할 정보를 설명합니다."
        ],
        "lead": "터치포인트는 고객과 팀 사이의 모든 접점입니다. 전화, 회의, 이메일, 요청에 대한 답변이 모두 해당합니다.",
        "body": [
          {
            "h": "리듬이 중요한 이유"
          },
          {
            "p": "긴 침묵은 초기 경고입니다. 6주 동안 아무도 연락하지 않은 고객은 매달 만나는 고객보다 갱신이 어렵습니다."
          },
          {
            "h": "매번 남길 것"
          },
          {
            "ul": [
              "언제, 누가 참여했는지.",
              "무엇을 결정했는지.",
              "담당자와 기한이 있는 다음 단계."
            ]
          }
        ],
        "curahold": "회의, 통화, 메모는 각 고객의 타임라인에 남고, 마지막 연락 이후 지난 시간은 헬스 스코어에 반영되며, 고객마다 리뷰 주기를 정할 수 있습니다."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "회의 후속 조치",
        "seo": [
          "고객 회의 후속 조치: 실행되는 다음 단계 | Curahold",
          "회의 후속 조치는 고객과 합의한 내용을 담당자와 기한이 있는 일로 바꾸는 것입니다. 다음 단계가 빠지는 이유와 좋은 후속 조치의 모습을 설명합니다."
        ],
        "lead": "회의 후속 조치는 고객 회의에서 합의한 내용을, 세부 사항이 흐려지기 전에 담당자와 기한이 있는 일로 바꾸는 것입니다.",
        "body": [
          {
            "h": "빠지는 이유"
          },
          {
            "p": "다음 단계가 누군가의 메모에만 남습니다. 일주일 뒤에는 누가 무엇을 하겠다고 했는지 아무도 기억하지 못하고, 고객이 가장 먼저 알아챕니다."
          },
          {
            "h": "좋은 후속 조치란"
          },
          {
            "ul": [
              "통화가 끝나기 전에 다음 단계를 적습니다.",
              "각각 담당자와 기한을 정합니다.",
              "고객에게 이를 확인하는 짧은 메모를 보냅니다."
            ]
          }
        ],
        "curahold": "회의 메모에 적은 다음 단계는 고객과 연결된, 담당자와 기한이 있는 작업이 되고, 약속은 고객 포털에서 공유할 수 있습니다."
      }
    ]
  },
  hi: {
    "title": "ग्राहक टीमों के लिए टेम्पलेट और शब्दावली",
    "lead": "कॉपी करने लायक टेम्पलेट और ग्राहकों को बनाए रखने के काम की सरल परिभाषाएं: रिन्यूअल, बिज़नेस रिव्यू, हेल्थ और चर्न।",
    "seo": [
      "कस्टमर सक्सेस टेम्पलेट और शब्दावली | Curahold",
      "रिन्यूअल प्लेबुक और बिज़नेस रिव्यू के मुफ़्त टेम्पलेट, और ग्राहक टीमों के लिए हेल्थ स्कोर, चर्न, रिन्यूअल और कस्टमर पोर्टल की सरल परिभाषाएं।"
    ],
    "templates": "टेम्पलेट",
    "glossary": "शब्दावली",
    "inCurahold": "Curahold में",
    "nav": [
      "टेम्पलेट और शब्दावली",
      "रिन्यूअल के स्टेप, रिव्यू का एजेंडा और सरल परिभाषाएं।"
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "रिन्यूअल प्लेबुक टेम्पलेट",
        "seo": [
          "रिन्यूअल प्लेबुक टेम्पलेट: 90 दिन पहले से स्टेप | Curahold",
          "कॉपी करने लायक रिन्यूअल प्लेबुक: कॉन्ट्रैक्ट रिन्यू होने से 90, 75, 60 और 30 दिन पहले क्या करें, हर स्टेप का ओनर कौन है, और कॉल से पहले क्या जांचें।"
        ],
        "lead": "रिन्यूअल तारीख वाले दिन नहीं, उससे पहले के तीन महीनों में जीता जाता है। इन स्टेप को कॉपी करें, हर एक को एक ओनर दें, और रिन्यूअल की तारीख से पीछे की ओर गिनें।",
        "body": [
          {
            "h": "स्टेप"
          },
          {
            "ol": [
              "90 दिन पहले: इस्तेमाल, खुले अनुरोध और हेल्थ स्कोर की समीक्षा करें; जो भी बात चिंता की लगे, उसे लिख लें।",
              "75 दिन पहले: निर्णय लेने वाले व्यक्ति और रोज़ के संपर्क के साथ रिन्यूअल कॉल बुक करें।",
              "60 दिन पहले: सीटों या प्लान में किसी भी बदलाव के साथ रिन्यूअल कोटेशन भेजें।",
              "30 दिन पहले: कोटेशन पर फ़ॉलो-अप करें और खुले सवाल लिखित में सुलझाएं।",
              "रिन्यूअल की तारीख पर: साइन हुए रिन्यूअल की पुष्टि करें और जो तय हुआ उसे दर्ज करें।"
            ]
          },
          {
            "h": "रिन्यूअल कॉल से पहले"
          },
          {
            "ul": [
              "इस साल ग्राहक क्या हासिल करना चाहता था, और क्या वह हासिल हुआ?",
              "पिछली मीटिंग के कौन-से वादे अभी भी खुले हैं?",
              "फ़ैसला कौन लेता है, और क्या वे हाल में आपके साथ किसी मीटिंग में रहे हैं?"
            ]
          }
        ],
        "curahold": "रिन्यूअल चालू करें, और हर रिन्यूअल की तारीख से नब्बे दिन पहले एक रिन्यूअल प्लेबुक अपने स्टेप टास्क के रूप में खोल देती है, हर एक के साथ एक ओनर और रिन्यूअल से पीछे गिनी गई ड्यू डेट।"
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "बिज़नेस रिव्यू (QBR) एजेंडा टेम्पलेट",
        "seo": [
          "बिज़नेस रिव्यू (QBR) एजेंडा टेम्पलेट | Curahold",
          "ग्राहक टीमों के लिए एक घंटे का बिज़नेस रिव्यू एजेंडा: लक्ष्यों के मुकाबले नतीजे, क्या बदला, खुले वादे, अगली तिमाही की योजना और साफ़ अगले स्टेप।"
        ],
        "lead": "तिमाही बिज़नेस रिव्यू के बाद ग्राहक के पास मिली वैल्यू का सबूत होना चाहिए और दोनों तरफ़ एक जैसे अगले स्टेप। यह एजेंडा एक घंटे में पूरा होता है।",
        "body": [
          {
            "h": "एजेंडा (60 मिनट)"
          },
          {
            "ol": [
              "5 मिनट: मीटिंग के लक्ष्य और कौन-कौन शामिल है।",
              "15 मिनट: पिछली तिमाही में तय लक्ष्यों के मुकाबले नतीजे।",
              "10 मिनट: उनकी तरफ़ क्या बदला: लोग, प्राथमिकताएं, बजट।",
              "10 मिनट: खुले अनुरोध और वादे, और हर एक की स्थिति।",
              "15 मिनट: अगली तिमाही की योजना।",
              "5 मिनट: अगले स्टेप, हर एक के साथ एक ओनर और एक तारीख।"
            ]
          },
          {
            "h": "मीटिंग के बाद"
          },
          {
            "p": "उसी दिन एक छोटा सारांश भेजें: क्या तय हुआ, ओनर और तारीखों के साथ अगले स्टेप, और अगले रिव्यू की तारीख।"
          }
        ],
        "curahold": "रिव्यू को ग्राहक पर एक मीटिंग के रूप में दर्ज करें और उसके अगले स्टेप लिखें; सेव करते ही हर स्टेप एक ओनर और तारीख वाला टास्क बन जाता है, जिसे आप ग्राहक के पोर्टल में शेयर कर सकते हैं।"
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "सेल्स से ऑनबोर्डिंग हैंडओवर चेकलिस्ट",
        "seo": [
          "सेल्स से ऑनबोर्डिंग हैंडओवर चेकलिस्ट | Curahold",
          "जीती गई डील के लिए हैंडओवर चेकलिस्ट: स्टेकहोल्डर कौन हैं, सेल के दौरान क्या वादा हुआ, खुले अनुरोध, अहम तारीखें और ग्राहक के साथ पहली कॉल।"
        ],
        "lead": "किसी ग्राहक के शुरुआती महीनों की ज़्यादातर परेशानी हैंडओवर से शुरू होती है: सेल्स टीम को जो बातें पता थीं, वे ऑनबोर्डिंग टीम तक कभी नहीं पहुंचतीं। इस सूची को कॉपी करें और डील के हाथ बदलने से पहले भर लें।",
        "body": [
          {
            "h": "हैंडओवर में क्या होना ज़रूरी है"
          },
          {
            "ul": [
              "स्टेकहोल्डर: उनकी तरफ़ निर्णय लेने वाला, रोज़ का संपर्क और चैंपियन, और हर एक से संपर्क का तरीका।",
              "सेल के दौरान किए गए वादे: फ़ीचर, तारीखें, छूट, लिखित में या कॉल पर कही गई कोई भी बात।",
              "खुले प्रोडक्ट अनुरोध जिनका ग्राहक इंतज़ार कर रहा है, और उनके बारे में उसे क्या बताया गया।",
              "अहम तारीखें: क्लोज़ की तारीख, गो-लाइव जिसकी उन्हें उम्मीद है, और रिन्यूअल की तारीख।",
              "उन्होंने क्यों ख़रीदा: वह समस्या जिसका हल वे चाहते हैं, और वे सफलता को कैसे आंकेंगे।"
            ]
          },
          {
            "h": "पहली कॉल से पहले"
          },
          {
            "ol": [
              "सेलर और ऑनबोर्डिंग ओनर 15 मिनट में सूची साथ बैठकर पढ़ते हैं।",
              "जो भी बात साफ़ न हो, वह ग्राहक के पास नहीं, सेलर के पास वापस जाती है।",
              "पहली कॉल ग्राहक के लक्ष्य को उन्हीं के शब्दों में दोहराकर शुरू होती है।"
            ]
          }
        ],
        "curahold": "डील जीतने पर Curahold अगली टीम के लिए एक हैंडओवर कार्ड तैयार कर सकता है, जिसमें स्टेकहोल्डर, किए गए वादे, खुले प्रोडक्ट अनुरोध, और क्लोज़ व रिन्यूअल की तारीखें होती हैं। कार्ड तब तक इंतज़ार करता है जब तक उसका नया ओनर उसकी पुष्टि नहीं करता।"
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "कस्टमर हेल्थ स्कोर शीट टेम्पलेट",
        "seo": [
          "हेल्थ स्कोर टेम्पलेट: संकेत, पॉइंट और बैंड | Curahold",
          "कॉपी करने लायक हेल्थ स्कोर शीट: छह संकेत जिन्हें ग्राहक टीम देख सकती है, हर एक कितने पॉइंट जोड़ता या घटाता है, और बैंड जो बताते हैं किसे ध्यान चाहिए।"
        ],
        "lead": "हेल्थ स्कोर तभी काम आता है जब टीम उस पर भरोसा करे, और टीम उसी स्कोर पर भरोसा करती है जिसे वह समझा सके। कुछ ऐसे संकेतों से शुरू करें जो आप देख सकते हैं, हर एक को वज़न दें, और वजह लिख लें।",
        "body": [
          {
            "h": "संकेत और पॉइंट (50 से शुरू करें)"
          },
          {
            "ul": [
              "पिछले 30 दिनों में ग्राहक से बात हुई: +15। 60 दिनों से कोई संपर्क नहीं: −20।",
              "उनकी तरफ़ एक चैंपियन जो जवाब देता है: +15। चैंपियन चला गया: −25।",
              "वादा किया गया काम देर से: हर आइटम के लिए −10, ज़्यादा से ज़्यादा −30।",
              "दो हफ़्ते से पुराने खुले ब्लॉकर या सपोर्ट अनुरोध: −10।",
              "इस्तेमाल स्थिर या बढ़ता हुआ: +10। दो महीनों से घटता हुआ: −15।",
              "रिन्यूअल 90 दिन से कम दूर और कोई कॉल बुक नहीं: −10।"
            ]
          },
          {
            "h": "बैंड"
          },
          {
            "ul": [
              "70 और उससे ऊपर: हेल्दी; यही लय बनाए रखें।",
              "40 से 69: नज़र रखें; इसी हफ़्ते वजह ढूंढें।",
              "40 से नीचे: जोखिम में; ओनर कॉल करता है, और टीम लीड को जानकारी रहती है।"
            ]
          },
          {
            "p": "हर तिमाही वज़न को उन ग्राहकों से मिलाकर देखें जिन्हें आपने सच में खोया और बनाए रखा, और जिनका अंदाज़ा ग़लत निकला उन्हें बदलें।"
          }
        ],
        "curahold": "हर ग्राहक को आपके तय नियमों से बना 0 से 100 तक का स्कोर मिलता है, उसकी वजहों की सूची और पिछले तीस दिनों के रुझान के साथ।"
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "कस्टमर हेल्थ स्कोर",
        "seo": [
          "कस्टमर हेल्थ स्कोर क्या है? परिभाषा | Curahold",
          "कस्टमर हेल्थ स्कोर एक संख्या में बताता है कि ग्राहक के साथ रिश्ता कैसा चल रहा है, आख़िरी संपर्क, देर से चल रहे काम और खुली समस्याओं जैसे संकेतों से।"
        ],
        "lead": "कस्टमर हेल्थ स्कोर एक अकेली संख्या है, अक्सर 0 से 100 तक, जो बताती है कि किसी ग्राहक के साथ रिश्ता कितना अच्छा चल रहा है।",
        "body": [
          {
            "p": "यह उन संकेतों से बनता है जिन्हें टीम देख सकती है: किसी ने ग्राहक से आख़िरी बार कब बात की, क्या वादा किया गया काम देर से चल रहा है, क्या उनकी तरफ़ कोई चैंपियन है, खुले ब्लॉकर और सपोर्ट अनुरोध। हर संकेत पॉइंट जोड़ता या घटाता है।"
          },
          {
            "h": "यह क्यों अहम है"
          },
          {
            "p": "दर्जनों ग्राहकों के पोर्टफ़ोलियो में वह एक ग्राहक छिप जाता है जो चुप होता जा रहा है। स्कोर उन्हें क्रम में रखता है, ताकि ध्यान पहले वहां जाए जहां रिन्यूअल जोखिम में है।"
          },
          {
            "h": "अच्छा स्कोर कैसा होता है"
          },
          {
            "ul": [
              "वह ख़ुद को समझाता है: कोई भी देख सकता है कि किन संकेतों ने उसे बदला।",
              "वह ऐसे संकेत इस्तेमाल करता है जिन पर टीम भरोसा करती है और जिन पर काम कर सकती है।",
              "उसे एक बार पढ़कर छोड़ा नहीं जाता, समय के साथ देखा जाता है।"
            ]
          }
        ],
        "curahold": "हर ग्राहक को आपके तय नियमों से बना 0 से 100 तक का स्कोर मिलता है, उसकी वजहों की सूची और पिछले तीस दिनों के रुझान के साथ।"
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "चर्न",
        "seo": [
          "कस्टमर चर्न क्या है? परिभाषा और संकेत | Curahold",
          "चर्न किसी अवधि में खोए गए ग्राहकों या राजस्व का हिस्सा है। किसे चर्न गिना जाता है, इसे कैसे मापा जाता है, और इससे पहले आने वाले शुरुआती संकेत।"
        ],
        "lead": "चर्न तब होता है जब कोई ग्राहक ख़रीदना बंद कर देता है: वह रद्द कर देता है, या रिन्यू नहीं करता। चर्न रेट किसी अवधि में खोए गए ग्राहकों, या राजस्व, का हिस्सा है।",
        "body": [
          {
            "h": "इसे कैसे मापा जाता है"
          },
          {
            "ul": [
              "कस्टमर चर्न: अवधि में खोए गए ग्राहक, भाग अवधि की शुरुआत में ग्राहक।",
              "रेवेन्यू चर्न: रद्द होने और डाउनग्रेड से खोया गया रेकरिंग राजस्व, भाग शुरुआत में रेकरिंग राजस्व।"
            ]
          },
          {
            "h": "पहले आने वाले संकेत"
          },
          {
            "p": "चर्न शायद ही कभी बिना चेतावनी के आता है। संपर्क कम हो जाता है, वादा किया गया काम खिसकता है, चैंपियन चला जाता है, सपोर्ट अनुरोध बढ़ते जाते हैं। इन संकेतों पर नज़र रखकर ही टीम रिन्यूअल की तारीख से पहले कदम उठाती है।"
          }
        ],
        "curahold": "ऐसे संकेत हर ग्राहक के हेल्थ स्कोर में जुड़ते हैं, ताकि चुप होते ग्राहक रिन्यूअल से काफ़ी पहले सामने आ जाएं।"
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "कॉन्ट्रैक्ट रिन्यूअल",
        "seo": [
          "कॉन्ट्रैक्ट रिन्यूअल क्या है? प्रक्रिया और समय | Curahold",
          "कॉन्ट्रैक्ट रिन्यूअल ग्राहक के एग्रीमेंट को नई अवधि के लिए बढ़ाता है। कब शुरू करें, रिन्यूअल प्रक्रिया कैसी दिखती है, और यह महीनों पहले क्यों शुरू होती है।"
        ],
        "lead": "कॉन्ट्रैक्ट रिन्यूअल ग्राहक के एग्रीमेंट को एक और अवधि के लिए बढ़ाता है, अक्सर बदलावों के साथ: ज़्यादा सीटें, अलग प्लान या नई कीमत।",
        "body": [
          {
            "h": "यह कब शुरू होता है"
          },
          {
            "p": "सालाना कॉन्ट्रैक्ट के लिए काम आमतौर पर करीब नब्बे दिन पहले शुरू होता है। इससे दी गई वैल्यू की समीक्षा करने, निर्णय लेने वाले से मिलने, कोटेशन भेजने और बिना जल्दबाज़ी के सवाल सुलझाने का समय मिलता है।"
          },
          {
            "h": "आमतौर पर क्या ग़लत होता है"
          },
          {
            "ul": [
              "तारीख पर बहुत देर से ध्यान जाता है।",
              "जिस व्यक्ति ने साइन किया था, वह जा चुका है।",
              "साल भर में किए गए वादे अभी भी खुले हैं।"
            ]
          }
        ],
        "curahold": "रिन्यूअल नब्बे दिन पहले अपनी प्लेबुक ख़ुद खोल सकता है, ओनर और तारीखों वाले टास्क के रूप में, और साथ में पाइपलाइन में एक रिन्यूअल अवसर।"
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "कस्टमर पोर्टल",
        "seo": [
          "कस्टमर पोर्टल क्या है? परिभाषा और उपयोग | Curahold",
          "कस्टमर पोर्टल एक निजी जगह है जहां ग्राहक अपने साथ शेयर किया गया काम देखता है, अनुरोध भेजता है और जवाब पढ़ता है, ईमेल थ्रेड के पीछे भागे बिना।"
        ],
        "lead": "कस्टमर पोर्टल एक निजी वेब पेज है जहां ग्राहक अपने साथ शेयर किया गया काम देखता है, अनुरोध भेजता है और टीम के जवाब पढ़ता है।",
        "body": [
          {
            "h": "टीमें इसे क्यों इस्तेमाल करती हैं"
          },
          {
            "p": "यह स्टेटस ईमेल की जगह लेता है। ग्राहक जब चाहे प्रगति देख लेता है, और उसके अनुरोध बिखरे थ्रेड के बजाय एक ही जगह पहुंचते हैं।"
          },
          {
            "h": "क्या शेयर करें"
          },
          {
            "ul": [
              "ऑनबोर्डिंग के स्टेप और उनकी तारीखें।",
              "मीटिंग में वादा किए गए टास्क।",
              "उनके अनुरोधों के जवाब।"
            ]
          }
        ],
        "curahold": "ग्राहक अपने ईमेल के लिंक से साइन इन करते हैं और सिर्फ़ वही देखते हैं जो आप शेयर करते हैं; उनके भेजे अनुरोध आपकी टीम के बोर्ड पर आते हैं।"
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "कस्टमर ऑनबोर्डिंग",
        "seo": [
          "कस्टमर ऑनबोर्डिंग क्या है? स्टेप और लक्ष्य | Curahold",
          "कस्टमर ऑनबोर्डिंग नए ग्राहक को साइन से पहली वैल्यू तक ले जाने का काम है: सेल्स से हैंडओवर, सेटअप, ट्रेनिंग और पहले दिखने वाले नतीजे।"
        ],
        "lead": "कस्टमर ऑनबोर्डिंग साइन होने और उस पल के बीच का समय है जब नए ग्राहक को वह वैल्यू मिलती है जिसके लिए उसने ख़रीदा, और वह काम जो टीम इस समय को छोटा करने के लिए करती है।",
        "body": [
          {
            "h": "इसमें आमतौर पर क्या आता है"
          },
          {
            "ul": [
              "सेल्स से हैंडओवर, किए गए वादों के साथ।",
              "एक किकऑफ़ कॉल जिसमें लक्ष्य और तारीखें तय होती हैं।",
              "सेटअप, डेटा इंपोर्ट और ट्रेनिंग।",
              "एक पहला नतीजा जिसे ग्राहक देख सके और नाम दे सके।"
            ]
          },
          {
            "h": "यह क्यों अहम है"
          },
          {
            "p": "जिन ग्राहकों को जल्दी वैल्यू दिखती है, वे आमतौर पर बने रहते हैं। लंबा खिंचता ऑनबोर्डिंग पहली रिन्यूअल बातचीत को शक से शुरू करवाता है।"
          }
        ],
        "curahold": "अगर आपकी ऑनबोर्डिंग टीम है, तो जीती गई डील उस तक एक हैंडओवर कार्ड के रूप में पहुंचती है, जिसमें स्टेकहोल्डर, किए गए वादे, खुले अनुरोध और अहम तारीखें होती हैं, और उसके टास्क ग्राहक के पोर्टल में उसके साथ शेयर किए जा सकते हैं।"
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "सेवा देने की लागत",
        "seo": [
          "सेवा देने की लागत: यह क्या है और कैसे मापें | Curahold",
          "सेवा देने की लागत वह मेहनत है, घंटों या पैसों में, जो किसी ग्राहक की देखभाल में लगती है, उसके भुगतान के मुकाबले। इसे कैसे मापें और रिन्यूअल से पहले क्या करें।"
        ],
        "lead": "सेवा देने की लागत वह मेहनत है जो टीम किसी ग्राहक की देखभाल में लगाती है, उस ग्राहक के भुगतान के मुकाबले।",
        "body": [
          {
            "h": "इसे कैसे मापें"
          },
          {
            "p": "सबसे आसान पैमाना घंटे हैं: पिछले बारह महीनों में टीम ने किसी ग्राहक पर जितना समय दर्ज किया, भाग उसकी सालाना कॉन्ट्रैक्ट वैल्यू। हर ग्राहक की एक ही पैमाने पर तुलना करने से पता चलता है कि कौन अपने भुगतान के मुकाबले सबसे ज़्यादा देखभाल लेता है।"
          },
          {
            "h": "इसका क्या करें"
          },
          {
            "ul": [
              "ऊंची संख्या के पीछे का काम ढूंढें: बार-बार आने वाले अनुरोध, कोई कमी वाला फ़ीचर, ट्रेनिंग की कमी।",
              "रिन्यूअल से पहले वजह ठीक करें, या अतिरिक्त सेवा की कीमत उसमें जोड़ें।",
              "किसी ग्राहक को सिर्फ़ इस संख्या से न आंकें: ज़्यादा मांग करने वाला ग्राहक आपका सबसे अच्छा रेफ़रेंस भी हो सकता है।"
            ]
          }
        ],
        "curahold": "सेवा देने की लागत रिपोर्ट हर ग्राहक के लिए दिखाती है कि हर 1,000 की सालाना वैल्यू पर पिछले 12 महीनों में कितने घंटे लगे, ताकि आप देख सकें कि किसकी देखभाल सबसे महंगी है।"
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "नेट रेवेन्यू रिटेंशन (NRR)",
        "seo": [
          "नेट रेवेन्यू रिटेंशन (NRR) क्या है? फ़ॉर्मूला | Curahold",
          "नेट रेवेन्यू रिटेंशन बताता है कि ग्राहकों का एक समूह एक साल बाद कितना रेकरिंग रेवेन्यू लाता है, जिसमें रिन्यूअल, एक्सपैंशन, डाउनग्रेड और चर्न शामिल हैं।"
        ],
        "lead": "नेट रेवेन्यू रिटेंशन (NRR) वह रेकरिंग रेवेन्यू है जो ग्राहकों का एक समूह आज लाता है, उसी समूह के एक साल पहले के रेवेन्यू के प्रतिशत के रूप में।",
        "body": [
          {
            "h": "इसकी गणना कैसे होती है"
          },
          {
            "p": "अवधि की शुरुआत में मौजूद ग्राहकों का रेकरिंग रेवेन्यू लें। उनका एक्सपैंशन जोड़ें, डाउनग्रेड और चर्न घटाएं, और शुरुआती आंकड़े से भाग दें। नए ग्राहक इसमें शामिल नहीं होते।"
          },
          {
            "h": "टीमें इस पर नज़र क्यों रखती हैं"
          },
          {
            "ul": [
              "100% से ऊपर का मतलब है कि मौजूदा ग्राहक अपने आप बढ़ रहे हैं।",
              "इससे पता चलता है कि रिन्यूअल और एक्सपैंशन नुकसान से ज़्यादा हैं या नहीं।",
              "यह धीरे बदलता है, इसलिए लगातार ग्राहक के साथ काम का फल देता है।"
            ]
          }
        ],
        "curahold": "रिन्यूअल और एक्सपैंशन के मौके नई डील्स के साथ उसी पाइपलाइन में रहते हैं, और रिन्यूअल व्यू हर ग्राहक को रिन्यूअल महीने के हिसाब से जोखिम वाली रकम के साथ दिखाता है।"
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "एनुअल रेकरिंग रेवेन्यू (ARR)",
        "seo": [
          "एनुअल रेकरिंग रेवेन्यू (ARR) क्या है? | Curahold",
          "एनुअल रेकरिंग रेवेन्यू साइन किए गए सब्सक्रिप्शन का सालाना मूल्य है: क्या गिना जाता है, क्या नहीं, और टीमें इसे हर ग्राहक के लिए कैसे इस्तेमाल करती हैं।"
        ],
        "lead": "एनुअल रेकरिंग रेवेन्यू (ARR) चालू सब्सक्रिप्शन का सालाना मूल्य है: अगर कुछ न बदले तो ग्राहक बारह महीनों में जितना भुगतान करेंगे।",
        "body": [
          {
            "h": "क्या गिना जाता है"
          },
          {
            "ul": [
              "सब्सक्रिप्शन फ़ीस, सालाना रकम में बदली हुई।",
              "रेकरिंग ऐड-ऑन और अतिरिक्त सीटें।",
              "सेटअप या ट्रेनिंग जैसी एक बार की फ़ीस नहीं।"
            ]
          },
          {
            "h": "हर ग्राहक के लिए यह क्यों मायने रखता है"
          },
          {
            "p": "हर ग्राहक का ARR बताता है कि रेवेन्यू कहां है, ताकि टीम सबसे बड़े रिन्यूअल पर ज़रूरी ध्यान दे सके और देख सके कि किसी ग्राहक के चुप होने पर कितनी रकम जोखिम में है।"
          }
        ],
        "curahold": "ARR हर ग्राहक पर एक फ़ील्ड हो सकता है, और रिपोर्ट इसे ओनर, हेल्थ स्कोर बैंड या रिन्यूअल महीने के हिसाब से जोड़ सकती है, हर पढ़ने वाले की अपनी अनुमति के अनुसार।"
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "बिज़नेस रिव्यू (QBR)",
        "seo": [
          "बिज़नेस रिव्यू (QBR) क्या है? उद्देश्य और एजेंडा | Curahold",
          "बिज़नेस रिव्यू एक नियमित मीटिंग है जिसमें ग्राहक और सप्लायर नतीजे, खुले वादे और आगे की योजना देखते हैं, आमतौर पर हर तिमाही में एक बार।"
        ],
        "lead": "बिज़नेस रिव्यू, जो अक्सर हर तिमाही होता है और QBR कहलाता है, वह मीटिंग है जिसमें ग्राहक और सप्लायर नतीजों को देखते हैं और आगे की योजना तय करते हैं।",
        "body": [
          {
            "h": "इसमें क्या शामिल होता है"
          },
          {
            "ul": [
              "पिछली बार तय लक्ष्यों के मुकाबले नतीजे।",
              "ग्राहक की तरफ़ क्या बदला।",
              "खुले अनुरोध और वादे, और हर एक की स्थिति।",
              "अगली अवधि की योजना और ओनर।"
            ]
          },
          {
            "h": "इसे उपयोगी क्या बनाता है"
          },
          {
            "p": "यह ओनर और तारीख वाले अगले स्टेप्स के साथ खत्म होता है। जिस रिव्यू के काम लिखे नहीं जाते, वह अगले रिव्यू तक भुला दिया जाता है।"
          }
        ],
        "curahold": "बिज़नेस रिव्यू ग्राहक की टाइमलाइन पर एक मीटिंग है, और उसमें लिखे अगले स्टेप्स ओनर और तारीख वाले टास्क बन जाते हैं।"
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "Customer Success Manager (CSM) क्या करता है? | Curahold",
          "Customer Success Manager बिक्री के बाद ग्राहकों के एक समूह की देखभाल करता है: ऑनबोर्डिंग, इस्तेमाल, बिज़नेस रिव्यू, रिन्यूअल और जोखिम को जल्दी पहचानना।"
        ],
        "lead": "Customer Success Manager (CSM) बिक्री के बाद ग्राहकों के एक समूह की देखभाल करता है, ताकि उन्हें खरीदी गई वैल्यू मिले और वे बने रहें।",
        "body": [
          {
            "h": "इस भूमिका में आमतौर पर क्या आता है"
          },
          {
            "ul": [
              "नए ग्राहकों की ऑनबोर्डिंग, या ऑनबोर्डिंग टीम से उन्हें लेना।",
              "नियमित बातचीत और बिज़नेस रिव्यू।",
              "हेल्थ पर नज़र रखना और शुरुआती चेतावनियों पर काम करना।",
              "रिन्यूअल की तैयारी और बढ़त के मौके पहचानना।"
            ]
          },
          {
            "h": "समय कहां जाता है"
          },
          {
            "p": "एक CSM अक्सर दर्जनों ग्राहकों को देखता है। सबको बराबर समय देने से ज़्यादा ज़रूरी यह जानना है कि इस हफ़्ते किसे ध्यान चाहिए।"
          }
        ],
        "curahold": "हर ग्राहक का हर विभाग में एक ओनर होता है, और हर व्यक्ति की सूची इस हिसाब से लगती है कि किसे उसकी ज़रूरत है, कारण और अगले स्टेप के साथ।"
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "एक्सपैंशन रेवेन्यू",
        "seo": [
          "एक्सपैंशन रेवेन्यू क्या है? अपसेल और क्रॉस-सेल | Curahold",
          "एक्सपैंशन रेवेन्यू मौजूदा ग्राहकों से आने वाला अतिरिक्त रेकरिंग रेवेन्यू है: ज़्यादा सीटें, ऊंचा प्लान या कोई और प्रोडक्ट। यह कहां से आता है।"
        ],
        "lead": "एक्सपैंशन रेवेन्यू उन ग्राहकों से आने वाला अतिरिक्त रेकरिंग रेवेन्यू है जो आपके पास पहले से हैं: ज़्यादा सीटें, ऊंचा प्लान या कोई और प्रोडक्ट।",
        "body": [
          {
            "h": "यह कहां से आता है"
          },
          {
            "ul": [
              "अपसेल: जो इस्तेमाल करते हैं उसका ज़्यादा हिस्सा, या ऊंचा प्लान।",
              "क्रॉस-सेल: ऐसा प्रोडक्ट जो उनके पास अभी नहीं है।",
              "उनकी अपनी बढ़त: नई टीमें, साइटें या देश।"
            ]
          },
          {
            "h": "कब बात करें"
          },
          {
            "p": "एक्सपैंशन वैल्यू के बाद आता है। जब ग्राहक किसी नतीजे का नाम ले सके तब यह सबसे आसान है, और जब पिछले अनुरोध के वादे अभी खुले हों तब सबसे मुश्किल।"
          }
        ],
        "curahold": "प्रोडक्ट्स व्यू दिखाता है कि किस ग्राहक के पास कौन-सा प्रोडक्ट है, ताकि खाली जगहें दिखें, और उनमें से किसी के लिए टास्क खोलना एक क्लिक का काम है।"
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "टाइम टू वैल्यू",
        "seo": [
          "टाइम टू वैल्यू क्या है और इसे कैसे कम करें | Curahold",
          "टाइम टू वैल्यू वह समय है जो नया ग्राहक साइन करने से पहले नतीजे तक इंतज़ार करता है। रिन्यूअल के लिए यह क्यों मायने रखता है और टीमें इसे कैसे कम करती हैं।"
        ],
        "lead": "टाइम टू वैल्यू वह समय है जो नया ग्राहक साइन करने और पहला ऐसा नतीजा देखने के बीच इंतज़ार करता है जिसका वह नाम ले सके।",
        "body": [
          {
            "h": "यह क्यों मायने रखता है"
          },
          {
            "p": "पहली रिन्यूअल बातचीत साइन करने के दिन ही शुरू हो जाती है। जो ग्राहक कुछ हफ़्तों में वैल्यू देखता है वह बढ़त की बात करता है; जो अब भी इंतज़ार में है वह कीमत की।"
          },
          {
            "h": "टीमें इसे कैसे कम करती हैं"
          },
          {
            "ul": [
              "किकऑफ़ में तारीख के साथ एक पहला नतीजा तय करें।",
              "सेल्स के वादे आगे सौंपें, ताकि कुछ भी दोबारा न पूछना पड़े।",
              "योजना ग्राहक के साथ शेयर करें, ताकि दोनों तरफ़ अगला स्टेप दिखे।"
            ]
          }
        ],
        "curahold": "ऑनबोर्डिंग प्लान में स्टेप्स, लक्ष्य और तारीखें होती हैं, और आप जो स्टेप्स चुनें उन्हें ग्राहक के पोर्टल में उनके साथ शेयर किया जा सकता है।"
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "सक्सेस प्लान",
        "seo": [
          "कस्टमर सक्सेस प्लान क्या है? हिस्से और इस्तेमाल | Curahold",
          "सक्सेस प्लान लिखता है कि ग्राहक क्या हासिल करना चाहता है, दोनों पक्ष वहां कैसे पहुंचेंगे और प्रगति कैसे मापी जाएगी, ताकि हर रिव्यू का एक आधार हो।"
        ],
        "lead": "सक्सेस प्लान लिखता है कि ग्राहक क्या हासिल करना चाहता है, दोनों पक्ष कौन-से स्टेप्स लेंगे और प्रगति कैसे मापी जाएगी।",
        "body": [
          {
            "h": "इसमें आमतौर पर क्या होता है"
          },
          {
            "ul": [
              "ग्राहक के अपने शब्दों में उसके लक्ष्य।",
              "दोनों तरफ़ के स्टेप्स, ओनर और तारीखें।",
              "प्रगति दिखाने वाले पैमाने।"
            ]
          },
          {
            "h": "इसका इस्तेमाल कैसे होता है"
          },
          {
            "p": "यह हर बातचीत और बिज़नेस रिव्यू का आधार है। साथ मिलकर अपडेट करने पर दोनों पक्ष एक ही नतीजे की ओर काम करते हैं।"
          }
        ],
        "curahold": "एक ऑनबोर्डिंग प्लान में लक्ष्य, ओनर और तारीख वाले स्टेप्स और आपके मापे जाने वाले पैमाने रहते हैं, और ग्राहक से जुड़े स्टेप्स पोर्टल में शेयर किए जा सकते हैं।"
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "स्टेकहोल्डर मैप",
        "seo": [
          "स्टेकहोल्डर मैप क्या है? B2B सेल्स और सक्सेस में | Curahold",
          "स्टेकहोल्डर मैप ग्राहक की तरफ़ फ़ैसले पर असर डालने वाले लोगों, उनकी भूमिका और उनके रुख की सूची है, ताकि टीम जाने कि किसे और कब शामिल करना है।"
        ],
        "lead": "स्टेकहोल्डर मैप ग्राहक की तरफ़ किसी फ़ैसले में हिस्सा लेने वाले लोगों, उनकी भूमिका और हर एक के रुख की सूची है।",
        "body": [
          {
            "h": "यह क्या दर्ज करता है"
          },
          {
            "ul": [
              "हर व्यक्ति की भूमिका और असर।",
              "उसका रुख: समर्थक, तटस्थ या विरोधी।",
              "जिनसे अभी तक मुलाकात नहीं हुई।"
            ]
          },
          {
            "h": "बिक्री के बाद यह क्यों ज़रूरी है"
          },
          {
            "p": "रिन्यूअल का फ़ैसला शायद ही कभी एक व्यक्ति लेता है। जब चैंपियन चला जाए, तो मैप दिखाता है कि वैल्यू और कौन जानता है और किसे इसके बारे में सुनना चाहिए।"
          }
        ],
        "curahold": "हर डील अपने स्टेकहोल्डर्स को उनके पद और रुख के साथ रखती है, और वे हैंडओवर कार्ड के साथ उस टीम तक जाते हैं जो ग्राहक को संभालती है।"
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "चैंपियन",
        "seo": [
          "B2B ग्राहक रिश्ते में चैंपियन कौन होता है? | Curahold",
          "चैंपियन ग्राहक की तरफ़ वह व्यक्ति है जो आपके प्रोडक्ट पर भरोसा करता है और कंपनी के अंदर उसकी वकालत करता है। यह क्यों ज़रूरी है और उसके जाने पर क्या करें।"
        ],
        "lead": "चैंपियन ग्राहक की तरफ़ वह व्यक्ति है जो आपकी पेशकश पर भरोसा करता है और अपनी कंपनी के अंदर उसकी वकालत करता है।",
        "body": [
          {
            "h": "यह क्यों ज़रूरी है"
          },
          {
            "p": "चैंपियन मीटिंग्स तय करवाता है, बजट बचाता है और समस्याएं जल्दी उठाता है। सक्रिय चैंपियन वाले ग्राहक आसानी से रिन्यू करते हैं।"
          },
          {
            "h": "जब चैंपियन चला जाए"
          },
          {
            "ul": [
              "पता करें कि उसका काम कौन संभाल रहा है।",
              "बचे हुए लोगों को वैल्यू फिर से दिखाएं।",
              "नया चैंपियन मिलने तक इसे जोखिम मानें।"
            ]
          }
        ],
        "curahold": "चैंपियन का होना हेल्थ स्कोर में एक सिग्नल हो सकता है, ताकि बिना चैंपियन वाला या जिसका चैंपियन चला गया हो, वह ग्राहक सबसे ऊपर आए।"
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "सेल्स से सक्सेस को हैंडओवर",
        "seo": [
          "सेल्स से कस्टमर सक्सेस को हैंडओवर: क्या सौंपें | Curahold",
          "सेल्स से कस्टमर सक्सेस को हैंडओवर किए गए वादे, अहम लोग और ज़रूरी तारीखें आगे सौंपता है, ताकि ग्राहक को सब कुछ दोबारा न समझाना पड़े।"
        ],
        "lead": "सेल्स से कस्टमर सक्सेस को हैंडओवर अगली टीम की ज़रूरत की हर चीज़ आगे सौंपता है, ताकि ग्राहक को कभी सब कुछ दोबारा न समझाना पड़े।",
        "body": [
          {
            "h": "क्या सौंपें"
          },
          {
            "ul": [
              "स्टेकहोल्डर्स और हर एक का रुख।",
              "बिक्री के दौरान किए गए वादे।",
              "खुले अनुरोध और प्रोडक्ट से जुड़े सवाल।",
              "क्लोज़ की तारीख और रिन्यूअल की तारीख।"
            ]
          },
          {
            "h": "क्या गड़बड़ होता है"
          },
          {
            "p": "सेल्स कॉल में किए गए वादे जिन्हें किसी ने नहीं लिखा। ग्राहक उन्हें याद रखता है; नई टीम नहीं।"
          }
        ],
        "curahold": "जीती गई डील अगली टीम तक एक हैंडओवर कार्ड के रूप में पहुंचती है, जिसमें स्टेकहोल्डर्स, किए गए वादे, खुले प्रोडक्ट अनुरोध और ज़रूरी तारीखें होती हैं।"
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "फ़ीचर रिक्वेस्ट",
        "seo": [
          "B2B में ग्राहकों की फ़ीचर रिक्वेस्ट कैसे संभालें | Curahold",
          "फ़ीचर रिक्वेस्ट तब होती है जब ग्राहक ऐसी चीज़ मांगे जो प्रोडक्ट अभी नहीं करता। इसे कैसे दर्ज करें, ग्राहक से जोड़ें और तैयार होने पर उन्हें बताएं।"
        ],
        "lead": "फ़ीचर रिक्वेस्ट तब होती है जब ग्राहक ऐसी चीज़ मांगे जो प्रोडक्ट अभी नहीं करता, अक्सर किसी मीटिंग या सपोर्ट बातचीत के दौरान।",
        "body": [
          {
            "h": "इन्हें अच्छी तरह कैसे संभालें"
          },
          {
            "ul": [
              "दर्ज करें कि किसने मांगा और उनके लिए यह क्यों ज़रूरी है।",
              "एक ही चीज़ की रिक्वेस्ट्स को आपस में जोड़ें।",
              "इंतज़ार कर रहे ग्राहकों और वैल्यू के हिसाब से प्राथमिकता दें।"
            ]
          },
          {
            "h": "चक्र पूरा करना"
          },
          {
            "p": "ज़्यादातर टीमें जो हिस्सा छोड़ देती हैं, वह है काम पूरा होने पर ग्राहक को बताना। रिलीज़ नोट से जवाब दी गई रिक्वेस्ट फ़ीचर से भी ज़्यादा भरोसा बनाती है।"
          }
        ],
        "curahold": "कई ग्राहक रिक्वेस्ट्स को एक स्टोरी से जोड़ा जा सकता है; बैकलॉग इंतज़ार कर रहे ग्राहक, उनकी वैल्यू और सबसे नज़दीकी रिन्यूअल दिखाता है, और काम पूरा होने पर ओनर को भेजने के लिए तैयार ड्राफ़्ट मिलता है।"
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "टचपॉइंट",
        "seo": [
          "कस्टमर टचपॉइंट क्या है? परिभाषा और उदाहरण | Curahold",
          "टचपॉइंट ग्राहक और आपकी टीम के बीच संपर्क का हर पल है: कॉल, मीटिंग, जवाब। इनकी गिनती से ज़्यादा इनकी लय क्यों मायने रखती है।"
        ],
        "lead": "टचपॉइंट ग्राहक और आपकी टीम के बीच संपर्क का हर पल है: कॉल, मीटिंग, ईमेल या किसी अनुरोध का जवाब।",
        "body": [
          {
            "h": "लय क्यों मायने रखती है"
          },
          {
            "p": "लंबी चुप्पी शुरुआती चेतावनी है। जिस ग्राहक से छह हफ़्तों से किसी ने बात नहीं की, उसे रिन्यू करना हर महीने मिलने वाले ग्राहक से ज़्यादा मुश्किल है।"
          },
          {
            "h": "हर एक से क्या बचाकर रखें"
          },
          {
            "ul": [
              "कब हुआ और कौन शामिल था।",
              "क्या तय हुआ।",
              "ओनर और तारीख के साथ अगला स्टेप।"
            ]
          }
        ],
        "curahold": "मीटिंग, कॉल और नोट्स हर ग्राहक की टाइमलाइन पर रहते हैं, आखिरी संपर्क के बाद का समय हेल्थ स्कोर में जुड़ता है, और हर ग्राहक की एक रिव्यू लय हो सकती है।"
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "मीटिंग फ़ॉलो-अप",
        "seo": [
          "ग्राहक मीटिंग फ़ॉलो-अप: पूरे होने वाले स्टेप्स | Curahold",
          "मीटिंग फ़ॉलो-अप ग्राहक के साथ तय बातों को ओनर और तारीख वाले काम में बदलता है, ताकि वादे निभें और ग्राहक भी उन्हें निभते देखे।"
        ],
        "lead": "मीटिंग फ़ॉलो-अप का मतलब है ग्राहक मीटिंग में तय बातों को, ब्योरे धुंधले होने से पहले, ओनर और तारीख वाले काम में बदलना।",
        "body": [
          {
            "h": "यह क्यों छूट जाता है"
          },
          {
            "p": "अगले स्टेप्स किसी के नोट्स में रह जाते हैं। एक हफ़्ते बाद किसी को याद नहीं रहता कि किसने क्या करने को कहा था, और सबसे पहले ग्राहक को पता चलता है।"
          },
          {
            "h": "अच्छा फ़ॉलो-अप कैसा दिखता है"
          },
          {
            "ul": [
              "कॉल खत्म होने से पहले अगले स्टेप्स लिखे जाते हैं।",
              "हर एक का ओनर और तारीख होती है।",
              "ग्राहक को उनकी पुष्टि करता एक छोटा नोट जाता है।"
            ]
          }
        ],
        "curahold": "मीटिंग के नोट्स में लिखे अगले स्टेप्स ग्राहक से जुड़े, ओनर और तारीख वाले टास्क बन जाते हैं, और वादे ग्राहक के पोर्टल में उनके साथ शेयर किए जा सकते हैं।"
      }
    ]
  },
  ms: {
    "title": "Templat dan glosari untuk pasukan pelanggan",
    "lead": "Templat yang boleh anda salin dan definisi ringkas untuk kerja mengekalkan pelanggan: pembaharuan, semakan perniagaan, kesihatan dan churn.",
    "seo": [
      "Templat dan glosari kejayaan pelanggan | Curahold",
      "Templat percuma untuk playbook pembaharuan dan semakan perniagaan, serta definisi ringkas skor kesihatan, churn, pembaharuan dan portal pelanggan."
    ],
    "templates": "Templat",
    "glossary": "Glosari",
    "inCurahold": "Dalam Curahold",
    "nav": [
      "Templat dan glosari",
      "Langkah pembaharuan, agenda semakan dan definisi ringkas."
    ],
    "items": [
      {
        "slug": "renewal-playbook",
        "kind": "template",
        "name": "Templat playbook pembaharuan",
        "seo": [
          "Templat playbook pembaharuan: langkah 90 hari | Curahold",
          "Playbook pembaharuan untuk disalin: apa yang dibuat 90, 75, 60 dan 30 hari sebelum kontrak diperbaharui, siapa pemilik setiap langkah, dan apa yang disemak."
        ],
        "lead": "Pembaharuan dimenangi dalam tiga bulan sebelum tarikhnya, bukan pada hari itu. Salin langkah ini, beri setiap satu pemilik, dan kira ke belakang dari tarikh pembaharuan.",
        "body": [
          {
            "h": "Langkah-langkah"
          },
          {
            "ol": [
              "90 hari sebelum: semak penggunaan, permintaan terbuka dan skor kesihatan; catat apa-apa yang membimbangkan anda.",
              "75 hari sebelum: tempah panggilan pembaharuan dengan pembuat keputusan dan kenalan harian.",
              "60 hari sebelum: hantar sebut harga pembaharuan, bersama sebarang perubahan tempat duduk atau pelan.",
              "30 hari sebelum: susuli sebut harga itu dan selesaikan soalan terbuka secara bertulis.",
              "Pada tarikh pembaharuan: sahkan pembaharuan yang ditandatangani dan catat apa yang dipersetujui."
            ]
          },
          {
            "h": "Sebelum panggilan pembaharuan"
          },
          {
            "ul": [
              "Apa yang ingin dicapai oleh pelanggan tahun ini, dan adakah mereka mencapainya?",
              "Janji manakah daripada mesyuarat terdahulu yang masih terbuka?",
              "Siapa yang membuat keputusan, dan adakah mereka hadir dalam mesyuarat dengan anda baru-baru ini?"
            ]
          }
        ],
        "curahold": "Hidupkan pembaharuan dan playbook pembaharuan membuka langkahnya sebagai tugasan sembilan puluh hari sebelum setiap tarikh pembaharuan, setiap satu dengan pemilik dan tarikh akhir yang dikira ke belakang dari pembaharuan."
      },
      {
        "slug": "business-review-agenda",
        "kind": "template",
        "name": "Templat agenda semakan perniagaan (QBR)",
        "seo": [
          "Templat agenda semakan perniagaan (QBR) | Curahold",
          "Agenda semakan perniagaan sejam untuk pasukan pelanggan: hasil berbanding matlamat, apa yang berubah, janji terbuka, pelan suku depan dan langkah yang jelas."
        ],
        "lead": "Semakan perniagaan suku tahunan harus meninggalkan pelanggan dengan bukti nilai dan kedua-dua pihak dengan langkah seterusnya yang sama. Agenda ini muat dalam satu jam.",
        "body": [
          {
            "h": "Agenda (60 minit)"
          },
          {
            "ol": [
              "5 minit: matlamat mesyuarat dan siapa yang hadir.",
              "15 minit: hasil berbanding matlamat yang ditetapkan suku lepas.",
              "10 minit: apa yang berubah di pihak mereka: orang, keutamaan, bajet.",
              "10 minit: permintaan dan janji terbuka, dan status setiap satu.",
              "15 minit: pelan untuk suku seterusnya.",
              "5 minit: langkah seterusnya, setiap satu dengan pemilik dan tarikh."
            ]
          },
          {
            "h": "Selepas mesyuarat"
          },
          {
            "p": "Hantar ringkasan pendek pada hari yang sama: apa yang dipersetujui, langkah seterusnya dengan pemilik dan tarikh, dan tarikh semakan berikutnya."
          }
        ],
        "curahold": "Catat semakan itu sebagai mesyuarat pada pelanggan dan tulis langkah seterusnya; apabila anda menyimpan, setiap satu menjadi tugasan dengan pemilik dan tarikh, yang boleh anda kongsi dalam portal pelanggan."
      },
      {
        "slug": "handover-checklist",
        "kind": "template",
        "name": "Senarai semak serahan jualan kepada onboarding",
        "seo": [
          "Senarai semak serahan jualan ke onboarding | Curahold",
          "Senarai semak serahan bagi urus niaga yang dimenangi: pihak berkepentingan, janji semasa jualan, permintaan terbuka, tarikh penting dan panggilan pertama."
        ],
        "lead": "Kebanyakan masalah dalam bulan-bulan pertama pelanggan bermula pada serahan: pasukan jualan tahu perkara yang tidak pernah sampai kepada pasukan onboarding. Salin senarai ini dan isikannya sebelum urus niaga bertukar tangan.",
        "body": [
          {
            "h": "Apa yang mesti dibawa oleh serahan"
          },
          {
            "ul": [
              "Pihak berkepentingan: pembuat keputusan, kenalan harian dan juara di pihak mereka, dengan cara menghubungi setiap seorang.",
              "Janji yang dibuat semasa jualan: ciri, tarikh, diskaun, apa-apa yang dinyatakan secara bertulis atau dalam panggilan.",
              "Permintaan produk terbuka yang ditunggu oleh pelanggan, dan apa yang telah diberitahu kepada mereka.",
              "Tarikh penting: tarikh tutup, tarikh mula guna yang dijangka dan tarikh pembaharuan.",
              "Mengapa mereka membeli: masalah yang ingin diselesaikan dan cara mereka menilai kejayaan."
            ]
          },
          {
            "h": "Sebelum panggilan pertama"
          },
          {
            "ol": [
              "Penjual dan pemilik onboarding membaca senarai ini bersama-sama, dalam 15 minit.",
              "Apa-apa yang tidak jelas dibawa balik kepada penjual, bukan kepada pelanggan.",
              "Panggilan pertama dibuka dengan mengulang matlamat pelanggan dalam kata-kata mereka sendiri."
            ]
          }
        ],
        "curahold": "Apabila urus niaga dimenangi, Curahold boleh menyediakan kad serahan untuk pasukan seterusnya dengan pihak berkepentingan, janji yang dibuat, permintaan produk terbuka, serta tarikh tutup dan pembaharuan. Kad itu menunggu sehingga pemilik baharunya mengesahkannya."
      },
      {
        "slug": "health-score-sheet",
        "kind": "template",
        "name": "Templat helaian skor kesihatan pelanggan",
        "seo": [
          "Templat skor kesihatan: isyarat, mata dan jalur | Curahold",
          "Helaian skor kesihatan untuk disalin: enam isyarat yang boleh diperhatikan, mata yang ditambah atau ditolak, dan jalur yang menunjukkan siapa perlu perhatian."
        ],
        "lead": "Skor kesihatan hanya membantu jika pasukan mempercayainya, dan pasukan mempercayai skor yang boleh dijelaskannya. Mulakan dengan beberapa isyarat yang boleh anda lihat, beri setiap satu wajaran, dan catat sebabnya.",
        "body": [
          {
            "h": "Isyarat dan mata (mula pada 50)"
          },
          {
            "ul": [
              "Bercakap dengan pelanggan dalam 30 hari lepas: +15. Tiada hubungan selama 60 hari: −20.",
              "Ada juara di pihak mereka yang membalas: +15. Juara itu sudah pergi: −25.",
              "Kerja yang dijanjikan lewat: −10 bagi setiap item, paling banyak −30.",
              "Penghalang atau permintaan sokongan terbuka yang lebih lama daripada dua minggu: −10.",
              "Penggunaan stabil atau meningkat: +10. Menurun selama dua bulan: −15.",
              "Pembaharuan kurang daripada 90 hari lagi tanpa panggilan ditempah: −10."
            ]
          },
          {
            "h": "Jalur"
          },
          {
            "ul": [
              "70 dan ke atas: sihat; kekalkan rentaknya.",
              "40 hingga 69: perhatikan; cari sebabnya minggu ini.",
              "Bawah 40: berisiko; pemilik membuat panggilan, dan ketua pasukan dimaklumkan."
            ]
          },
          {
            "p": "Setiap suku tahun, bandingkan wajaran dengan pelanggan yang benar-benar anda hilang dan kekalkan, dan ubah wajaran yang meneka dengan salah."
          }
        ],
        "curahold": "Setiap pelanggan mendapat skor 0 hingga 100 yang dibina daripada peraturan yang anda tetapkan, dengan sebab-sebabnya disenaraikan dan arah alirannya sepanjang tiga puluh hari lepas."
      },
      {
        "slug": "customer-health-score",
        "kind": "term",
        "name": "Skor kesihatan pelanggan",
        "seo": [
          "Apakah skor kesihatan pelanggan? Definisi | Curahold",
          "Skor kesihatan pelanggan meringkaskan keadaan hubungan pelanggan dalam satu angka, daripada isyarat seperti hubungan terakhir, kerja lewat dan isu terbuka."
        ],
        "lead": "Skor kesihatan pelanggan ialah satu angka, selalunya dari 0 hingga 100, yang meringkaskan sejauh mana hubungan dengan seorang pelanggan berjalan dengan baik.",
        "body": [
          {
            "p": "Ia dibina daripada isyarat yang boleh diperhatikan oleh pasukan: bila kali terakhir seseorang bercakap dengan pelanggan, sama ada kerja yang dijanjikan sudah lewat, sama ada ada juara di pihak mereka, penghalang terbuka dan permintaan sokongan. Setiap isyarat menambah atau menolak mata."
          },
          {
            "h": "Mengapa ia penting"
          },
          {
            "p": "Portfolio berpuluh-puluh pelanggan menyembunyikan seorang yang semakin senyap. Skor menyusun mereka, jadi perhatian pergi dahulu ke tempat pembaharuan berisiko."
          },
          {
            "h": "Ciri skor yang baik"
          },
          {
            "ul": [
              "Ia menjelaskan dirinya: sesiapa boleh melihat isyarat mana yang menggerakkannya.",
              "Ia menggunakan isyarat yang dipercayai pasukan dan boleh diambil tindakan.",
              "Ia diikuti dari semasa ke semasa, bukan dibaca sekali sahaja."
            ]
          }
        ],
        "curahold": "Setiap pelanggan mendapat skor 0 hingga 100 yang dibina daripada peraturan yang anda tetapkan, dengan sebab-sebabnya disenaraikan dan arah alirannya sepanjang tiga puluh hari lepas."
      },
      {
        "slug": "churn",
        "kind": "term",
        "name": "Churn",
        "seo": [
          "Apakah churn pelanggan? Definisi dan isyarat | Curahold",
          "Churn ialah bahagian pelanggan atau hasil yang hilang dalam satu tempoh. Apa yang dikira sebagai churn, cara ia diukur, dan isyarat awal yang datang sebelumnya."
        ],
        "lead": "Churn berlaku apabila pelanggan berhenti membeli: mereka membatalkan, atau tidak memperbaharui. Kadar churn ialah bahagian pelanggan, atau hasil, yang hilang dalam satu tempoh.",
        "body": [
          {
            "h": "Cara ia diukur"
          },
          {
            "ul": [
              "Churn pelanggan: pelanggan yang hilang dalam tempoh itu, dibahagi dengan pelanggan pada permulaannya.",
              "Churn hasil: hasil berulang yang hilang akibat pembatalan dan penurunan pelan, dibahagi dengan hasil berulang pada permulaan."
            ]
          },
          {
            "h": "Isyarat yang datang dahulu"
          },
          {
            "p": "Churn jarang datang tanpa amaran. Hubungan menjadi senyap, kerja yang dijanjikan tergelincir, juara pergi, permintaan sokongan bertimbun. Memerhati isyarat itulah cara pasukan bertindak sebelum tarikh pembaharuan."
          }
        ],
        "curahold": "Isyarat seperti ini menyumbang kepada skor kesihatan setiap pelanggan, jadi pelanggan yang semakin senyap muncul jauh sebelum pembaharuan mereka."
      },
      {
        "slug": "contract-renewal",
        "kind": "term",
        "name": "Pembaharuan kontrak",
        "seo": [
          "Apakah pembaharuan kontrak? Proses dan masa | Curahold",
          "Pembaharuan kontrak melanjutkan perjanjian pelanggan untuk tempoh baharu. Bila bermula, rupa prosesnya, dan mengapa ia bermula berbulan-bulan lebih awal."
        ],
        "lead": "Pembaharuan kontrak melanjutkan perjanjian pelanggan untuk satu tempoh lagi, selalunya dengan perubahan: lebih banyak tempat duduk, pelan yang berbeza atau harga baharu.",
        "body": [
          {
            "h": "Bila ia bermula"
          },
          {
            "p": "Untuk kontrak tahunan, kerja biasanya bermula kira-kira sembilan puluh hari lebih awal. Itu memberi masa untuk menyemak nilai yang diberikan, bertemu pembuat keputusan, menghantar sebut harga dan menyelesaikan soalan tanpa tergesa-gesa."
          },
          {
            "h": "Apa yang biasanya tidak kena"
          },
          {
            "ul": [
              "Tarikh itu disedari terlalu lewat.",
              "Orang yang menandatangani sudah pergi.",
              "Janji yang dibuat sepanjang tahun masih terbuka."
            ]
          }
        ],
        "curahold": "Pembaharuan boleh membuka playbooknya sendiri sembilan puluh hari lebih awal, sebagai tugasan dengan pemilik dan tarikh, bersama peluang pembaharuan dalam saluran jualan."
      },
      {
        "slug": "customer-portal",
        "kind": "term",
        "name": "Portal pelanggan",
        "seo": [
          "Apakah portal pelanggan? Definisi dan kegunaan | Curahold",
          "Portal pelanggan ialah tempat peribadi di mana pelanggan melihat kerja yang dikongsi, menghantar permintaan dan membaca balasan, tanpa mengejar e-mel."
        ],
        "lead": "Portal pelanggan ialah halaman web peribadi di mana pelanggan melihat kerja yang dikongsi dengan mereka, menghantar permintaan dan membaca balasan pasukan.",
        "body": [
          {
            "h": "Mengapa pasukan menggunakannya"
          },
          {
            "p": "Ia menggantikan e-mel status. Pelanggan melihat kemajuan bila-bila masa mereka mahu, dan permintaan mereka tiba di satu tempat, bukan dalam bebenang yang berselerak."
          },
          {
            "h": "Apa yang patut dikongsi"
          },
          {
            "ul": [
              "Langkah onboarding dan tarikhnya.",
              "Tugasan yang dijanjikan dalam mesyuarat.",
              "Jawapan kepada permintaan mereka."
            ]
          }
        ],
        "curahold": "Pelanggan log masuk dengan pautan dalam e-mel mereka dan hanya melihat apa yang anda kongsi; permintaan yang mereka hantar sampai ke papan pasukan anda."
      },
      {
        "slug": "customer-onboarding",
        "kind": "term",
        "name": "Onboarding pelanggan",
        "seo": [
          "Apakah onboarding pelanggan? Langkah dan matlamat | Curahold",
          "Onboarding pelanggan membawa pelanggan baharu dari tandatangan ke nilai pertama: serahan daripada jualan, persediaan, latihan dan hasil pertama yang kelihatan."
        ],
        "lead": "Onboarding pelanggan ialah masa antara tandatangan dengan saat pelanggan baharu mendapat nilai yang dibelinya, dan kerja yang dilakukan pasukan untuk memendekkan masa itu.",
        "body": [
          {
            "h": "Apa yang biasanya diliputi"
          },
          {
            "ul": [
              "Serahan daripada jualan, bersama apa yang dijanjikan.",
              "Panggilan permulaan yang menyepakati matlamat dan tarikh.",
              "Persediaan, import data dan latihan.",
              "Hasil pertama yang boleh dilihat dan dinamakan oleh pelanggan."
            ]
          },
          {
            "h": "Mengapa ia penting"
          },
          {
            "p": "Pelanggan yang melihat nilai lebih awal cenderung untuk kekal. Onboarding yang berlarutan membuatkan perbualan pembaharuan pertama bermula dengan keraguan."
          }
        ],
        "curahold": "Jika anda mempunyai pasukan onboarding, urus niaga yang dimenangi sampai kepadanya sebagai satu kad serahan dengan pihak berkepentingan, janji yang dibuat, permintaan terbuka dan tarikh penting, dan tugasannya boleh dikongsi dengan pelanggan dalam portal mereka."
      },
      {
        "slug": "cost-to-serve",
        "kind": "term",
        "name": "Kos untuk melayan",
        "seo": [
          "Kos untuk melayan: apa itu dan cara mengukurnya | Curahold",
          "Kos untuk melayan ialah usaha menjaga pelanggan, dalam jam atau wang, berbanding bayaran mereka. Cara mengukurnya dan apa yang dibuat sebelum pembaharuan."
        ],
        "lead": "Kos untuk melayan ialah usaha yang dibelanjakan pasukan untuk menjaga seorang pelanggan, berbanding apa yang dibayar oleh pelanggan itu.",
        "body": [
          {
            "h": "Cara mengukurnya"
          },
          {
            "p": "Ukuran paling mudah ialah jam: masa yang dicatat pasukan untuk seorang pelanggan dalam dua belas bulan lepas, dibahagi dengan nilai kontrak tahunannya. Membandingkan setiap pelanggan pada skala yang sama menunjukkan siapa yang memerlukan penjagaan paling banyak berbanding apa yang mereka bayar."
          },
          {
            "h": "Apa yang perlu dibuat dengannya"
          },
          {
            "ul": [
              "Cari kerja di sebalik angka yang tinggi: permintaan berulang, ciri yang tiada, jurang latihan.",
              "Betulkan puncanya sebelum pembaharuan, atau masukkan harga perkhidmatan tambahan ke dalamnya.",
              "Jangan menilai pelanggan berdasarkan angka ini sahaja: pelanggan yang banyak permintaan juga boleh menjadi rujukan terbaik anda."
            ]
          }
        ],
        "curahold": "Laporan Kos untuk melayan menunjukkan, bagi setiap pelanggan, jam yang dibelanjakan dalam 12 bulan lepas bagi setiap 1,000 nilai tahunan, supaya anda dapat melihat siapa yang paling mahal untuk dijaga."
      },
      {
        "slug": "net-revenue-retention",
        "kind": "term",
        "name": "Pengekalan hasil bersih (NRR)",
        "seo": [
          "Apakah pengekalan hasil bersih (NRR)? | Curahold",
          "Pengekalan hasil bersih menunjukkan hasil berulang sekumpulan pelanggan setahun kemudian, termasuk pembaharuan, pengembangan dan churn."
        ],
        "lead": "Pengekalan hasil bersih (NRR) ialah hasil berulang yang dibawa oleh sekumpulan pelanggan hari ini, sebagai peratusan daripada hasil kumpulan yang sama setahun lalu.",
        "body": [
          {
            "h": "Cara mengiranya"
          },
          {
            "p": "Ambil hasil berulang pelanggan yang ada pada awal tempoh. Tambah pengembangan mereka, tolak penurunan pelan dan churn, kemudian bahagikan dengan angka permulaan. Pelanggan baharu tidak dikira."
          },
          {
            "h": "Mengapa pasukan memantaunya"
          },
          {
            "ul": [
              "Melebihi 100% bermakna pelanggan sedia ada berkembang dengan sendirinya.",
              "Ia menunjukkan sama ada pembaharuan dan pengembangan mengatasi kerugian.",
              "Ia berubah perlahan, jadi ia memberi ganjaran kepada kerja yang konsisten bersama pelanggan."
            ]
          }
        ],
        "curahold": "Peluang pembaharuan dan pengembangan berada dalam saluran jualan yang sama dengan urus niaga baharu, dan paparan pembaharuan menunjukkan setiap pelanggan mengikut bulan pembaharuan bersama jumlah yang berisiko."
      },
      {
        "slug": "annual-recurring-revenue",
        "kind": "term",
        "name": "Hasil berulang tahunan (ARR)",
        "seo": [
          "Apakah hasil berulang tahunan (ARR)? | Curahold",
          "Hasil berulang tahunan ialah nilai setahun bagi langganan yang ditandatangani: apa yang dikira, apa yang tidak, dan kegunaannya."
        ],
        "lead": "Hasil berulang tahunan (ARR) ialah nilai setahun bagi langganan aktif: jumlah yang akan dibayar oleh pelanggan dalam dua belas bulan jika tiada apa-apa berubah.",
        "body": [
          {
            "h": "Apa yang dikira"
          },
          {
            "ul": [
              "Yuran langganan, ditukar kepada jumlah setahun.",
              "Tambahan dan tempat duduk berulang.",
              "Bukan yuran sekali sahaja seperti persediaan atau latihan."
            ]
          },
          {
            "h": "Mengapa ia penting bagi setiap pelanggan"
          },
          {
            "p": "ARR bagi setiap pelanggan menunjukkan di mana hasil berada, supaya pasukan memberi perhatian sewajarnya kepada pembaharuan terbesar dan dapat melihat jumlah yang berisiko apabila pelanggan senyap."
          }
        ],
        "curahold": "ARR boleh menjadi medan pada setiap pelanggan, dan laporan boleh menjumlahkannya mengikut pemilik, jalur skor kesihatan atau bulan pembaharuan, mengikut kebenaran setiap pembaca."
      },
      {
        "slug": "business-review",
        "kind": "term",
        "name": "Semakan perniagaan (QBR)",
        "seo": [
          "Apakah semakan perniagaan (QBR)? Tujuan | Curahold",
          "Semakan perniagaan ialah mesyuarat berkala untuk melihat hasil, janji terbuka dan rancangan seterusnya, biasanya setiap suku tahun."
        ],
        "lead": "Semakan perniagaan, sering diadakan setiap suku tahun dan dipanggil QBR, ialah mesyuarat di mana pelanggan dan pembekal menilai hasil dan bersetuju tentang langkah seterusnya.",
        "body": [
          {
            "h": "Apa yang diliputi"
          },
          {
            "ul": [
              "Hasil berbanding matlamat yang dipersetujui kali lepas.",
              "Apa yang berubah di pihak pelanggan.",
              "Permintaan dan janji yang masih terbuka, serta status setiap satu.",
              "Rancangan dan pemilik untuk tempoh seterusnya."
            ]
          },
          {
            "h": "Apa yang menjadikannya berguna"
          },
          {
            "p": "Ia berakhir dengan langkah seterusnya yang mempunyai pemilik dan tarikh. Semakan yang tindakannya tidak dicatat akan dilupakan sebelum semakan berikutnya."
          }
        ],
        "curahold": "Semakan perniagaan ialah mesyuarat pada garis masa pelanggan, dan langkah seterusnya yang dicatat di dalamnya menjadi tugasan dengan pemilik dan tarikh."
      },
      {
        "slug": "customer-success-manager",
        "kind": "term",
        "name": "Customer Success Manager (CSM)",
        "seo": [
          "Apakah tugas Customer Success Manager? | Curahold",
          "Customer Success Manager menjaga pelanggan selepas jualan: onboarding, penggunaan, semakan perniagaan, pembaharuan dan risiko awal."
        ],
        "lead": "Customer Success Manager (CSM) menjaga sekumpulan pelanggan selepas jualan, supaya mereka mendapat nilai yang dibeli dan terus kekal.",
        "body": [
          {
            "h": "Apa yang biasanya termasuk dalam peranan ini"
          },
          {
            "ul": [
              "Onboarding pelanggan baharu, atau mengambil alih daripada pasukan onboarding.",
              "Hubungan berkala dan semakan perniagaan.",
              "Memantau kesihatan dan bertindak atas amaran awal.",
              "Menyediakan pembaharuan dan mengenal pasti peluang pengembangan."
            ]
          },
          {
            "h": "Ke mana masa dihabiskan"
          },
          {
            "p": "Seorang CSM sering menjaga berpuluh-puluh pelanggan. Mengetahui siapa yang memerlukan perhatian minggu ini lebih penting daripada memberi masa yang sama kepada semua."
          }
        ],
        "curahold": "Setiap pelanggan mempunyai pemilik dalam setiap jabatan, dan senarai setiap orang disusun mengikut siapa yang memerlukan mereka, bersama sebab dan langkah seterusnya."
      },
      {
        "slug": "expansion-revenue",
        "kind": "term",
        "name": "Hasil pengembangan",
        "seo": [
          "Apakah hasil pengembangan? Upsell, cross-sell | Curahold",
          "Hasil pengembangan ialah hasil berulang tambahan daripada pelanggan sedia ada: lebih banyak tempat duduk, pelan lebih tinggi atau produk lain."
        ],
        "lead": "Hasil pengembangan ialah hasil berulang tambahan daripada pelanggan yang sudah anda miliki: lebih banyak tempat duduk, pelan lebih tinggi atau produk lain.",
        "body": [
          {
            "h": "Dari mana ia datang"
          },
          {
            "ul": [
              "Upsell: lebih banyak daripada apa yang mereka gunakan, atau pelan lebih tinggi.",
              "Cross-sell: produk yang belum mereka miliki.",
              "Pertumbuhan mereka sendiri: pasukan, lokasi atau negara baharu."
            ]
          },
          {
            "h": "Bila hendak membincangkannya"
          },
          {
            "p": "Pengembangan datang selepas nilai. Ia paling mudah apabila pelanggan boleh menyebut satu hasil, dan paling sukar apabila janji daripada permintaan lepas masih terbuka."
          }
        ],
        "curahold": "Paparan produk menunjukkan pelanggan mana memiliki produk mana, supaya ruang kosong kelihatan, dan membuka tugasan untuk mana-mana satu hanya memerlukan satu klik."
      },
      {
        "slug": "time-to-value",
        "kind": "term",
        "name": "Masa untuk mencapai nilai",
        "seo": [
          "Masa untuk mencapai nilai dan cara memendekkannya | Curahold",
          "Masa untuk mencapai nilai ialah tempoh pelanggan baharu menunggu hasil pertama. Mengapa ia penting untuk pembaharuan dan cara memendekkannya."
        ],
        "lead": "Masa untuk mencapai nilai ialah tempoh pelanggan baharu menunggu antara menandatangani dan melihat hasil pertama yang boleh mereka sebut.",
        "body": [
          {
            "h": "Mengapa ia penting"
          },
          {
            "p": "Perbualan pembaharuan pertama bermula pada hari mereka menandatangani. Pelanggan yang melihat nilai dalam beberapa minggu bercakap tentang pertumbuhan; pelanggan yang masih menunggu bercakap tentang harga."
          },
          {
            "h": "Cara pasukan memendekkannya"
          },
          {
            "ul": [
              "Persetujui satu hasil pertama dengan tarikh semasa mesyuarat permulaan.",
              "Serahkan janji jualan supaya tiada apa-apa perlu ditanya semula.",
              "Kongsi rancangan dengan pelanggan supaya kedua-dua pihak melihat langkah seterusnya."
            ]
          }
        ],
        "curahold": "Rancangan onboarding mempunyai langkah, matlamat dan tarikh, dan langkah yang anda pilih boleh dikongsi dengan pelanggan dalam portal mereka."
      },
      {
        "slug": "success-plan",
        "kind": "term",
        "name": "Rancangan kejayaan",
        "seo": [
          "Apakah rancangan kejayaan pelanggan? | Curahold",
          "Rancangan kejayaan mencatat matlamat pelanggan, langkah kedua-dua pihak dan cara kemajuan diukur, sebagai asas bagi setiap semakan."
        ],
        "lead": "Rancangan kejayaan mencatat apa yang ingin dicapai oleh pelanggan, langkah yang akan diambil oleh kedua-dua pihak dan cara kemajuan akan diukur.",
        "body": [
          {
            "h": "Apa yang biasanya terkandung"
          },
          {
            "ul": [
              "Matlamat pelanggan, dalam kata-kata mereka sendiri.",
              "Langkah di kedua-dua pihak, dengan pemilik dan tarikh.",
              "Ukuran yang menunjukkan kemajuan."
            ]
          },
          {
            "h": "Cara ia digunakan"
          },
          {
            "p": "Ia menjadi asas bagi setiap perbualan dan semakan perniagaan. Apabila dikemas kini bersama, kedua-dua pihak bekerja ke arah hasil yang sama."
          }
        ],
        "curahold": "Rancangan onboarding menyimpan matlamat, langkah dengan pemilik dan tarikh serta ukuran yang anda pantau, dan langkah yang melibatkan pelanggan boleh dikongsi dalam portal."
      },
      {
        "slug": "stakeholder-map",
        "kind": "term",
        "name": "Peta pihak berkepentingan",
        "seo": [
          "Apakah peta pihak berkepentingan dalam B2B? | Curahold",
          "Peta pihak berkepentingan menyenaraikan orang yang mempengaruhi keputusan pelanggan, peranan dan pendirian mereka, dan bila melibatkan mereka."
        ],
        "lead": "Peta pihak berkepentingan ialah senarai orang di pihak pelanggan yang terlibat dalam sesuatu keputusan, peranan mereka dan pendirian setiap seorang.",
        "body": [
          {
            "h": "Apa yang dicatat"
          },
          {
            "ul": [
              "Peranan dan pengaruh setiap orang.",
              "Pendirian mereka: penyokong, neutral atau penentang.",
              "Orang yang belum pernah anda temui."
            ]
          },
          {
            "h": "Mengapa ia penting selepas jualan"
          },
          {
            "p": "Keputusan pembaharuan jarang dibuat oleh seorang sahaja. Apabila juara anda pergi, peta menunjukkan siapa lagi yang tahu tentang nilai dan siapa yang perlu mendengarnya."
          }
        ],
        "curahold": "Setiap urus niaga menyimpan pihak berkepentingannya bersama jawatan dan pendirian mereka, dan mereka dibawa dalam kad serahan kepada pasukan yang menjaga pelanggan."
      },
      {
        "slug": "champion",
        "kind": "term",
        "name": "Juara",
        "seo": [
          "Siapakah juara dalam hubungan pelanggan B2B? | Curahold",
          "Juara ialah orang di pihak pelanggan yang memperjuangkan produk anda di dalam syarikat. Mengapa ia penting dan apa dibuat apabila mereka pergi."
        ],
        "lead": "Juara ialah orang di pihak pelanggan yang mempercayai apa yang anda tawarkan dan memperjuangkannya di dalam syarikat mereka.",
        "body": [
          {
            "h": "Mengapa ia penting"
          },
          {
            "p": "Juara mendapatkan mesyuarat, melindungi bajet dan membangkitkan masalah lebih awal. Pelanggan yang mempunyai juara aktif memperbaharui dengan lebih mudah."
          },
          {
            "h": "Apabila juara pergi"
          },
          {
            "ul": [
              "Ketahui siapa yang mengambil alih tugas mereka.",
              "Tunjukkan semula nilai kepada orang yang masih ada.",
              "Anggap ia sebagai risiko sehingga juara baharu muncul."
            ]
          }
        ],
        "curahold": "Kewujudan juara boleh menjadi isyarat dalam skor kesihatan, supaya pelanggan tanpa juara, atau yang juaranya telah pergi, naik ke atas senarai."
      },
      {
        "slug": "sales-to-success-handover",
        "kind": "term",
        "name": "Serahan daripada jualan kepada kejayaan pelanggan",
        "seo": [
          "Serahan jualan kepada kejayaan pelanggan | Curahold",
          "Serahan daripada jualan kepada kejayaan pelanggan membawa janji, orang penting dan tarikh utama, supaya pelanggan tidak menerangkan semula."
        ],
        "lead": "Serahan daripada jualan kepada kejayaan pelanggan membawa semua yang diperlukan oleh pasukan seterusnya, supaya pelanggan tidak perlu menerangkan semuanya semula.",
        "body": [
          {
            "h": "Apa yang perlu diserahkan"
          },
          {
            "ul": [
              "Pihak berkepentingan dan pendirian setiap seorang.",
              "Janji yang dibuat semasa jualan.",
              "Permintaan terbuka dan soalan tentang produk.",
              "Tarikh tutup dan tarikh pembaharuan."
            ]
          },
          {
            "h": "Apa yang sering silap"
          },
          {
            "p": "Janji yang dibuat dalam panggilan jualan yang tidak dicatat oleh sesiapa. Pelanggan mengingatinya; pasukan baharu tidak."
          }
        ],
        "curahold": "Urus niaga yang dimenangi sampai kepada pasukan seterusnya sebagai kad serahan dengan pihak berkepentingan, janji yang dibuat, permintaan produk yang terbuka dan tarikh utama."
      },
      {
        "slug": "feature-request",
        "kind": "term",
        "name": "Permintaan ciri",
        "seo": [
          "Cara mengurus permintaan ciri pelanggan B2B | Curahold",
          "Permintaan ciri ialah apabila pelanggan meminta sesuatu yang belum ada. Cara mencatatnya, mengaitkannya dengan pelanggan dan memaklumkan mereka."
        ],
        "lead": "Permintaan ciri berlaku apabila pelanggan meminta sesuatu yang belum dilakukan oleh produk, selalunya semasa mesyuarat atau perbualan sokongan.",
        "body": [
          {
            "h": "Cara mengurusnya dengan baik"
          },
          {
            "ul": [
              "Catat siapa yang meminta dan mengapa ia penting bagi mereka.",
              "Gabungkan permintaan untuk perkara yang sama.",
              "Utamakan mengikut pelanggan yang menunggu dan nilai mereka."
            ]
          },
          {
            "h": "Menutup kitaran"
          },
          {
            "p": "Bahagian yang paling kerap dilangkau ialah memberitahu pelanggan apabila kerja siap. Permintaan yang dijawab dengan nota keluaran membina lebih banyak kepercayaan daripada ciri itu sendiri."
          }
        ],
        "curahold": "Beberapa permintaan pelanggan boleh dikaitkan dengan satu cerita; backlog menunjukkan pelanggan yang menunggu, nilai mereka dan pembaharuan terdekat, dan apabila kerja siap pemilik mendapat draf yang sedia untuk dihantar."
      },
      {
        "slug": "touchpoint",
        "kind": "term",
        "name": "Titik sentuh",
        "seo": [
          "Apakah titik sentuh pelanggan? Definisi | Curahold",
          "Titik sentuh ialah setiap hubungan antara pelanggan dan pasukan anda: panggilan, mesyuarat, balasan. Mengapa rentaknya lebih penting."
        ],
        "lead": "Titik sentuh ialah setiap saat hubungan antara pelanggan dan pasukan anda: panggilan, mesyuarat, e-mel atau balasan kepada permintaan.",
        "body": [
          {
            "h": "Mengapa rentak penting"
          },
          {
            "p": "Senyap yang panjang ialah amaran awal. Pelanggan yang tidak dihubungi oleh sesiapa selama enam minggu lebih sukar diperbaharui berbanding pelanggan yang ditemui setiap bulan."
          },
          {
            "h": "Apa yang perlu disimpan daripada setiap satu"
          },
          {
            "ul": [
              "Bila ia berlaku dan siapa yang terlibat.",
              "Apa yang dipersetujui.",
              "Langkah seterusnya dengan pemilik dan tarikh."
            ]
          }
        ],
        "curahold": "Mesyuarat, panggilan dan nota berada pada garis masa setiap pelanggan, masa sejak hubungan terakhir dimasukkan ke dalam skor kesihatan, dan setiap pelanggan boleh mempunyai rentak semakan."
      },
      {
        "slug": "meeting-follow-up",
        "kind": "term",
        "name": "Susulan mesyuarat",
        "seo": [
          "Susulan mesyuarat pelanggan yang benar-benar siap | Curahold",
          "Susulan mesyuarat menukar apa yang dipersetujui dengan pelanggan kepada kerja dengan pemilik dan tarikh, supaya janji ditepati dan kelihatan."
        ],
        "lead": "Susulan mesyuarat bermaksud menukar apa yang dipersetujui dalam mesyuarat pelanggan kepada kerja yang mempunyai pemilik dan tarikh, sebelum butirannya dilupakan.",
        "body": [
          {
            "h": "Mengapa ia terlepas"
          },
          {
            "p": "Langkah seterusnya tinggal dalam nota seseorang. Seminggu kemudian tiada siapa ingat siapa berjanji untuk melakukan apa, dan pelangganlah yang pertama menyedarinya."
          },
          {
            "h": "Rupa susulan yang baik"
          },
          {
            "ul": [
              "Langkah seterusnya ditulis sebelum panggilan tamat.",
              "Setiap satu mempunyai pemilik dan tarikh.",
              "Pelanggan menerima nota ringkas yang mengesahkannya."
            ]
          }
        ],
        "curahold": "Langkah seterusnya yang ditulis dalam nota mesyuarat menjadi tugasan yang dikaitkan dengan pelanggan, dengan pemilik dan tarikh, dan janji boleh dikongsi dengan pelanggan dalam portal mereka."
      }
    ]
  },
};

/** The hub's words in one of the site's languages. */
export const hubCopy = (locale: SiteLocale): HubCopy => HUB[locale];
