# Who sees what, and how

Design note for Curahold's role-based visibility: customer reach per role,
per-field access, pages of cards (each role's home) and "see it as them".

## What others do (November 2026)

| Product | What it does well | Where it falls short |
|---|---|---|
| monday.com | A column can be restricted for viewing or for editing. | Not both on the same column at once; a long-running request in its community. |
| Planhat | Keeps *Roles* (what you may see and do) apart from *Home Templates* (what your screen shows). | Two separate concepts to learn; templates are pinned sections. |
| Airtable | Field edit permissions hold everywhere, including the API and mobile. | They limit editing only; who can *see* a field is a separate problem. |
| Smartsheet | A view can show each viewer only the rows that name them. | Filters on one contact column; a separate product to buy. |
| Asana | Clear object levels: admin, editor, commenter, viewer. | Per project, not per customer or field. |
| ClickUp | Private custom fields with named exceptions. | Guests cannot be added as exceptions. |

Sources:
[monday column permissions](https://support.monday.com/hc/en-us/articles/360011926640),
[monday community request](https://community.monday.com/t/ability-to-control-column-view-and-column-editing-permissions/123072),
[Planhat Home Templates and Roles](https://help.planhat.com/en/articles/10118439-user-personas-and-roles),
[Airtable field editing permissions](https://support.airtable.com/articles/2296468758-airtable-field-and-table-editing-permissions),
[Smartsheet Dynamic View, current user](https://community.smartsheet.com/discussion/115388/dynamicview-filter-include-current-user),
[Asana project permissions](https://help.asana.com/s/article/individual-project-permissions),
[ClickUp private custom fields](https://help.clickup.com/hc/en-us/articles/26025804975895-Custom-Field-permissions),
[ClickUp guest exceptions request](https://feedback.clickup.com/feature-requests/p/private-custom-field-exceptions-cannot-include-guests-need-field-visibility-per).

## What Curahold does

**One role, three answers.** A role answers: what may this person *do*
(permissions), which *customers* do they see (reach), and which *page* do
they land on (home). An administrator sets all three on one screen.

1. **Customer reach** per role: all, their team's, or only their own.
   Enforced in the database (row-level security), so every list, search,
   page card and API call agrees. Contacts, opportunities and other records
   follow their customer. Handing a customer to someone outside one's own
   reach is allowed and goes through a checked database function.
2. **Field access**: *who sees* and *who changes* each field are two separate
   choices on the same field (the thing monday cannot do). A hidden field is
   left out of every response; a read-only one is marked and refused on
   change (unchanged values may be sent back). People who run company
   settings see everything; only they change access rules, and saving a
   field list from someone else keeps the fields they cannot see.
3. **Pages of cards**: one page serves a whole role. Each card is computed
   inside the viewer's own database scope, with only the fields their role
   may see, so "Team view" shows a manager their team and an executive the
   company. A card that needs a hidden field disappears for that role. Each
   role has one home page; a page can be open to everyone or chosen roles.
4. **See it as them**: an administrator opens Curahold as a chosen person.
   The server answers as that person (their role, seat, reach, fields), so
   it is the real view, not a simulation. Read only, sessions excluded, and
   written to the activity log.
5. **Option colours** from Curahold's own palette, shown as chips in lists,
   pages and bars.

### Cards

My open tasks, Coming renewals, Needs attention, Gone quiet, Stakeholder
risks, A number (customers, total value, needing attention, renewals, open
or overdue tasks), Breakdown (by a choice field, owner or team), Team load,
Connections (only for people who manage them), Note.

Each card guesses the field it needs (renewal date, health, annual value)
and can be pointed at another one. Without a suitable field it says what to
add instead of showing nothing.

### Starting pages

| Page | Home for | Cards |
|---|---|---|
| My day | member | my tasks, my renewals, my at-risk, my quiet, my stakeholder risks |
| Team view | admin, manager | three numbers, team load, renewals, attention, two breakdowns, connections |
| Leadership summary | viewer | three numbers, a breakdown, renewals |

## Own names, own look

Ideas and features are not protected; names, trade dress and copy are. So
Curahold uses plain descriptive words of its own and none of the
competitors' product names or terms: *Home* / *Ana sayfa*, *Pages* /
*Sayfalar*, *Card* / *Kart*, *Which customers they see* / *Hangi müşterileri
görür*, *Who sees it / Who changes it* / *Kimler görür / Kimler değiştirir*,
*See it as them* / *Onun gözünden bak*. Colours are named for what they look
like (sea, leaf, honey, coral, sky, plum, stone, rose). The visual language
is Curahold's: the time rail on rows (calm, soon, today, late), hairline
cards, the deep-teal sidebar. No layout, icon or text was copied.

## Not in this round

- Per-board field access for tasks (task fields are few and shared today).
- A person's own extra pages ("pin to my home"); pages are set by
  administrators for now.
- Exports: when Excel export comes, it uses the same field rules.
