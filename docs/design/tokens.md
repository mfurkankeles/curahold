# Design tokens

One scale for each kind of value, defined once at the top of `web/src/styles.css` (`:root`, and
`:root[data-theme='dark']` for colours). The customer portal is its own page and repeats the scales in
`.p-root` (`web/portal/portal.css`). Rules below the token block never write a radius, a text size, a
colour or a duration of their own: they take a token. Spacing is the one exception to "take a token":
it is written in px, and every value is a multiple of 4.

## Corner radius (6 values)

| Token | Value | Use |
| --- | --- | --- |
| `0` | 0 | Square: table cells, full-bleed bars, a corner that meets another surface |
| `--r-xs` | 4px | Tiny marks: checkboxes, keyboard keys, rails, inline code, small tags |
| `--r-s` | 6px | Controls: buttons, fields, menu items, chips with a square look |
| `--r-m` | 10px | Containers: cards, panes, popovers, menus, toasts |
| `--r-l` | 14px | Large surfaces: dialogs, sheets, the task panel, hero tiles |
| `--r-pill` | 999px | Pills, avatars, dots, round buttons, progress bars (also replaces `50%` on square elements) |

## Type (10 sizes)

| Token | Size | Use |
| --- | --- | --- |
| `--fs-2xs` | 11px | Counters, avatar initials, axis labels, the smallest meta text |
| `--fs-xs` | 12px | Meta text, captions, badges, table headers |
| `--fs-s` | 13px | Secondary text, dense lists, menu items, inline code |
| `--fs-m` | 14px | Body text (the root size) |
| `--fs-l` | 16px | Emphasised body, card titles, every field on a phone (a phone zooms in under 16px) |
| `--fs-xl` | 20px | Panel and section titles; the page title on a phone |
| `--fs-2xl` | 24px | Page titles, dialog titles, sign-in headings |
| `--fs-3xl` | 30px | Big figures in tiles and gauges |
| `--fs-4xl` | 36px | Lead figures (KPI, the leading metric tile) |
| `--fs-5xl` | 56px | A single figure that is the whole chart (report builder "big number") |

Line heights: `--lh-tight` 1.1 for figures, `--lh-snug` 1.25 for headings, `--lh-body` 1.45 for text.

## Spacing (4 px grid)

Every padding, margin and gap is a multiple of 4px (0, 4, 8, 12, 16, 20, 24, 32, 40, 48 …).
Named steps for new code: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-6` 24, `--s-8` 32.
Negative margins that cancel a border (−1px, −2px) are not spacing and are allowed.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` | 150ms | Hover, press, colour and border changes, small pops (menus, tooltips) |
| `--dur` | 200ms | Anything that moves or changes size: panels, dialogs, toasts, pages, charts filling in |
| `--stagger` | 40ms | Delay step between siblings landing one after another (`calc(var(--n) * var(--stagger))`) |
| `--ease` | cubic-bezier(.2, .7, .3, 1) | Default easing for movement |
| `--ease-out` | ease-out | Things leaving |

Interface motion is always 150–200 ms. All motion is off under `prefers-reduced-motion: reduce`.

Ambient loops are not answers to a hand, so they are outside the 150–200 ms rule. These are all of them:

| Token | Value | Where |
| --- | --- | --- |
| `--loop-shimmer` | 1.4s | Skeleton shimmer (`.skeleton`, `.pane__wait`) |
| `--loop-shine` | 1.2s | Image placeholder shine (`.thumb__wait`); also the assistant button's start delay |
| `--loop-caret` | 1s | The blinking caret while the assistant writes |
| `--loop-pulse` | 1.6s | The guided-tour spotlight pulse (demo only) |
| `--loop-twinkle` | 5s | The assistant button's twinkle, twice, then still |

## Colour

Semantic, never literal. Each has a light and a dark value; text tokens meet WCAG 2.2 AA (4.5:1) on
`--paper`, `--surface`, `--surface-2` and `--sunk` in both themes, status fills meet 4.5:1 with `--on-status`.

- Surfaces: `--paper` (page), `--surface` (cards, fields), `--surface-2` (raised rows), `--sunk` (wells, hovers), `--scrim` (behind dialogs).
- Text: `--ink` (primary), `--ink-2` (secondary), `--ink-3` (meta; the lightest text allowed), `--on-ink`, `--on-brand`, `--on-status`.
- Lines: `--line` (hairlines), `--line-strong` (field borders, dividers that matter).
- Brand: `--brand` (fills, marks), `--brand-ink` (brand text and links), `--brand-wash` / `--brand-soft` (tinted backgrounds).
- Time (the identity): `--calm`, `--soon`, `--today`, `--late`, `--done`, with `--soon-wash/-line/-ink`, `--late-wash/-line/-ink`, `--done-wash`, `--info-wash/-ink`.
- Navigation well: `--well`, `--well-2`, `--well-3`, `--well-deep`, `--well-ink`, `--well-mute`, `--well-hi`, `--nav-on`, `--nav-on-ink`.
- Everything else (chart series, label colours, the cookie banner, the demo bar) has its own named token in the same block.

## Elevation

`--shadow-1` (a card lifted under the pointer), `--shadow-2` (popovers, menus, toasts), `--shadow-3`
(dialogs and sheets). Nothing else casts a shadow.

## Focus and touch

- Focus ring: `--ring` (2px solid `--focus`) at `--ring-offset` (2px), on `:focus-visible` only. A control that
  clips its outline draws the ring inside (`outline-offset: -2px`) instead of dropping it.
- Touch targets: `--tap` 44px on phones (`pointer: coarse`), never smaller than `--tap-min` 24px anywhere.

## Values that come from data

Some values cannot be a token because the data decides them (a bar's length, a colour a person chose, a
position on a timeline). Those are passed as CSS custom properties from the component
(`style={{ '--w': … }}`) and used by a class. See the list in the sweep report.

## Components

Shared patterns live in `web/src/components/` with their styles in `web/src/patterns.css`. A screen uses
these instead of building its own; each one is tokens-only, keyboard-complete, right-to-left aware and phone-first.

### Date field — `DateField`, `DateRangeField` (`components/DateField.tsx`)

Every date the person types or picks. Never `<input type="date">` or `datetime-local`: those show the
browser's format (mm/dd/yyyy in a Turkish interface).

- `<DateField value={iso} onChange={…} label=… min=… max=… />` — one day, `'YYYY-MM-DD'` or `''`.
- `<DateField time …/>` — a day and a time, `'YYYY-MM-DDTHH:mm'` in the person's clock; the time is a 24-hour box.
- `<DateRangeField from to onChange={({ from, to }) => …} />` — a period; the calendar takes the first day, then the last.
- Typing works in the person's own order and digits (`15.11.2026`, `15/11`, `2026/11/15`, Persian digits);
  a whole date is taken as soon as it is typed, a partial one on Enter or leaving the box. Out of `min`/`max`
  or unreadable: a short message under the box says what to type.
- The calendar: week start, month and weekday names from the language (Intl, Gregorian); a popover on a
  desktop, a bottom sheet under 600 px. Arrows (mirrored right-to-left), Home/End, Page Up/Down (+Shift: a
  year), Enter/Space, Escape (focus goes back to the button). Alt+↓ in the box opens it.
- Text formatting of dates, times and numbers comes from `lib/format.ts`, never from a screen.

### Filter sheet — `FilterSheet`, `FilterGroup`, `usePhone` (`components/FilterSheet.tsx`)

Every list screen's filters, order and view switch. On a desktop they stay inline in the toolbar (the
component renders them in place); at the phone width (≤ 860 px, where the bottom bar appears) they fold into
one **Filter** button that shows how many filters are on, and open in a sheet from the bottom with **Clear**
and **Apply**. Filters work as they change (the list behind updates); Apply closes the sheet.

- `<FilterSheet search={<input …/>} count={n} onClear={reset}>…controls…</FilterSheet>` — the search box
  stays outside the sheet and shares the first row with the button; the screen's other actions go below.
- Wrap each control in `<FilterGroup label=…>` so the sheet names it (a no-op on a desktop).
- A view switch moves into the sheet on a phone: render it inside when `usePhone()` is true, inline otherwise.
- Count filters only (owner, status, archived …), not the order or the view.
- Target: on every list screen the first row starts in the top half at 375 × 667.
