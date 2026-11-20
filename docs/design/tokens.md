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

**Per script** (`html:lang(…)` rules at the top of `styles.css`; no web font outside Latin, 0 KB). Figtree draws
Latin (en, tr, ms) and the Latin words inside other scripts; each other script uses the system font made for it,
named for Windows, Apple and Android in turn.

| Script | Stack after Figtree | Body | Line height | Notes |
| --- | --- | --- | --- | --- |
| Arabic, Persian | Segoe UI, SF Arabic, Geeza Pro, Noto Sans Arabic, Tahoma | 15px | 1.7 | no letter-spacing (letters join) |
| Hebrew | Segoe UI, SF Hebrew, Arial Hebrew, Noto Sans Hebrew | 15px | 1.6 | |
| Devanagari (hi) | Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari | 15px | 1.75 (headings 1.4) | no letter-spacing (the headline joins) |
| Japanese | Hiragino Sans, Yu Gothic UI, Meiryo, Noto Sans JP | 14px | 1.7 | `font-synthesis: none`, no italics |
| Korean | Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR | 14px | 1.7 | `word-break: keep-all`, `font-synthesis: none` |
| Chinese | PingFang SC/TC, Microsoft YaHei/JhengHei UI, Noto Sans SC/TC | 14px | 1.7 | `font-synthesis: none`, no italics |

Outside Latin no text is under 12px (`--fs-2xs` becomes 12px) and headings have no negative tracking.

## Spacing (4 px grid)

Every padding, margin and gap is a multiple of 4px (0, 4, 8, 12, 16, 20, 24, 32, 40, 48 …).
Named steps for new code: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-6` 24, `--s-8` 32.
Negative margins that cancel a border (−1px, −2px) are not spacing and are allowed.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | 100ms | Hover, press, colour and border changes; menus and popovers closing; everything under "reduce motion" |
| `--dur-2` | 150ms | Menus, tooltips, the palette opening; dialogs, panels and toasts closing |
| `--dur-3` | 200ms | Dialogs, panels and toasts opening; page content; a phone sheet closing |
| `--dur-4` | 280ms | A phone sheet opening; a list item growing into its page (the upper limit) |
| `--ease-out` | cubic-bezier(.2, .7, .3, 1) | Things arriving (also `--ease`) |
| `--ease-in` | cubic-bezier(.4, 0, 1, 1) | Things leaving |
| `--ease-move` | cubic-bezier(.2, 0, 0, 1) | Things that change place or size (sheets, shared elements) |
| `--dist-1` / `--dist-2` / `--dist-3` | 4 / 8 / 16px | How far a menu / a dialog or page / a panel travels |
| `--stagger` | 30ms | Delay step between siblings landing one after another, at most 5 (150 ms in all) |

`--dur-fast` (= `--dur-2`) and `--dur` (= `--dur-3`) are the older names and still work.

Rules: an exit is 50 ms shorter than its entry; only `opacity` and `transform` move; nothing a hand starts
takes over 300 ms; one leading movement at a time. Under `prefers-reduced-motion: reduce` nothing moves, but
whatever opens or closes still fades for 100 ms, so a change of state is never lost.

**Exits.** React removes a closed element at once, so `lib/leave.ts` leaves a stand-in in its place: a copy
(scroll position and field values kept, no ids, `inert`, hidden from screen readers) with `data-leaving`,
which plays the exit in `motion.css` and removes itself. Give a new overlay `ref={useLeave()}` on its root
(or `useLeave(existingRef)`) and an exit rule; code that looks for an open dialog skips stand-ins
(`.dialog:not([data-leaving])`). `tests/motion.test.ts` reads the durations.

| Element | In | Out |
| --- | --- | --- |
| Task / record panel | 200 ms, 16 px from the end side + fade | 150 ms back the same way |
| Dialog, quick add | 200 ms, 8 px up + scale .98 | 150 ms the reverse |
| Search palette | 150 ms, scale .98 | 100 ms |
| Menu, popover, calendar | 150 ms, 4 px | 100 ms |
| Toast | 200 ms, 8 px up | 150 ms down |
| Phone sheet (filters, calendar) | 280 ms from below, `--ease-move` | 200 ms down |
| Scrims | 150 ms fade | 100 ms |

Ambient loops are not answers to a hand, so they are outside the 150–200 ms rule. These are all of them:

| Token | Value | Where |
| --- | --- | --- |
| `--loop-shimmer` | 1.4s | Skeleton shimmer (`.skeleton`, `.pane__wait`) |
| `--loop-shine` | 1.2s | Image placeholder shine (`.thumb__wait`); also the assistant button's start delay |
| `--loop-caret` | 1s | The blinking caret while the assistant writes |
| `--loop-pulse` | 1.6s | The guided-tour spotlight pulse (demo only) |
| `--loop-twinkle` | 5s | The assistant button's twinkle, twice, then still |
| `--loop-loader` | 1.2s | The brand loader's mark drawing itself (`components/Loader.tsx`, the demo's opening screen) |
| `--loop-route` | 800ms | The route bar's creep to 80 % |
| `--loop-spin` | 700ms | The ring of a busy button |

## Colour

Semantic, never literal. Each has a light and a dark value; text tokens meet WCAG 2.2 AA (4.5:1) on
`--paper`, `--surface`, `--surface-2` and `--sunk` in both themes, status fills meet 4.5:1 with `--on-status`.

- Surfaces: `--paper` (page), `--surface` (cards, fields), `--surface-2` (raised rows), `--sunk` (wells, hovers), `--scrim` (behind dialogs).
- Text: `--ink` (primary), `--ink-2` (secondary), `--ink-3` (meta; the lightest text allowed), `--on-ink`, `--on-brand`, `--on-status`.
- Lines: `--line` (hairlines), `--line-strong` (dividers that matter), `--field-line` (borders of inputs, selects and pickers: 3:1 on cards and the page).
- Focus: `--focus` (the keyboard ring, at least 4:1 on every light surface). Brand gradients `--grad`, `--new-bg`, `--new-hover`: their text is at least 4.5:1 on every stop; `--hover-shift` darkens a primary button under the pointer in light and lightens it in dark.
- `tests/contrast.test.ts` checks the pairs in both themes: text on every surface 4.5:1, field borders, focus and the brand mark 3:1.
- Brand: `--brand` (fills, marks), `--brand-ink` (brand text and links), `--brand-wash` / `--brand-soft` (tinted backgrounds).
- Time (the identity): `--calm`, `--soon`, `--today`, `--late`, `--done`, with `--soon-wash/-line/-ink`, `--late-wash/-line/-ink`, `--done-wash`, `--info-wash/-ink`.
- Navigation well: `--well`, `--well-2`, `--well-3`, `--well-deep`, `--well-ink`, `--well-mute`, `--well-hi`, `--nav-on`, `--nav-on-ink`.
- Everything else (label colours, the cookie banner, the demo bar) has its own named token in the same block.

### Chart colours

Charts take colour by the job it does. **Identity** (which series): `--series-1` … `--series-8`, in this order,
starting from the brand violet. **"Other"** and the quiet partner of a compared pair (what came in beside what got done):
`--series-other`. A colour a person chose for an option (`--chart-sky`, `--chart-plum` …) points at the nearest of the
eight, so a chosen colour is a validated one too.

| Slot | Hue | Light | Dark |
| --- | --- | --- | --- |
| 1 | violet (brand) | `#5b4de8` | `#8c7dff` |
| 2 | orange | `#dc6b30` | `#d95926` |
| 3 | teal | `#109b8b` | `#199e70` |
| 4 | honey | `#b98300` | `#c98500` |
| 5 | pink | `#d9578f` | `#d55181` |
| 6 | green | `#2f9e44` | `#0ca30c` |
| 7 | blue | `#2a78d6` | `#3987e5` |
| 8 | red | `#e34948` | `#e66767` |
| other | grey-violet | `#8a88a6` | `#76739a` |

Measured (`tests/chart-palette.test.ts` recomputes it from `styles.css` on every run): neighbours are at least ΔE 8.3 apart
under simulated protanopia and deuteranopia (light; 8.4 dark) and 19.2 for full colour vision (19.3 dark), OKLab ×100,
Machado 2009 at full severity; every mark and "Other" is at least 3:1 on `--paper` and `--surface` in both themes; the first
three slots are apart in every pair. The palette it replaced failed: green beside orange-red measured ΔE 2.7 in dark, and its
grey slot read as no colour at all.

Rules:

- Slots are taken in order and never cycled (`paint()` in `components/Charts.tsx`): the order is what keeps neighbours apart.
  A ninth series is never a new colour; it is drawn as "Other". Colour follows the thing, not its rank: a filter that hides a
  series does not repaint the others.
- One series takes slot 1. Columns and bars that only compare sizes share one colour; do not colour bars by their value.
- Charts where any two marks can touch (scatter, maps, small multiples) use at most the first three slots.
- Colours people chose for options are kept unless two of them clash (`CLASHING_COLOURS` in `components/Charts.tsx`, the
  pairs under ΔE 8 simulated or 15 seen, recomputed by the test): then that chart takes the slots in order. The eight slots
  are only safe as neighbours; any two chosen colours can end up side by side.
- Identity is never colour alone: a legend for two or more series, the value written beside bars, the reading above the plot,
  and a table view (**Show as table**) on every chart.
- Status colours (`--done`, `--soon`, `--late` and their washes) are never a series.

### Status

A state (paid, overdue, at risk, failed …) is always an icon and words, never a colour alone (WCAG 1.4.1): `Pill` in the
console (`checkCircle` good, `clock` needs a look, `alert` needs action), the same icons on a tile that carries a tone
(`Stat` in the app: the side mark appears only with a state, and a screen reader hears the state in words).

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

### The five states — `components/Empty.tsx`

One family; a screen never draws its own.

| State | Component | Rule |
| --- | --- | --- |
| Empty | `EmptyState` (icon, title, body, one action as children) | An invitation: what goes here and the first step. A filtered-out list says "nothing matches", not "empty". |
| Loading | `SkeletonRows`, `SkeletonCards`; `RouteFallback` for a whole screen | Nothing for `--wait` (300 ms), then the content's shape at its final size: nothing moves when it arrives. |
| Error | `ErrorState` (whole screen or `ErrorBoundary`), `LoadError` = `ErrorState compact` (inside a screen) | What happened, what to do, **Try again**. Never an empty list in place of a failed load. |
| Offline | `OfflineBar` (in the shell) | Changes made offline are held in the tab with their key and sent when the connection is back (`lib/api.ts`); the bar says so and counts them. |
| Not allowed | `NotAllowed` | What is missing and who can give it (an administrator, in Settings → People); a way home. |

`--wait` (300 ms, in the Motion block) is how long a wait shows nothing at all; `useAfter(ms)` is its hook.

### Loading — `Loader`, `RouteBar` (`components/Loader.tsx`), `lib/loading.ts`, `lib/busy.ts`

Five parts, and a view waiting for data always shows its skeleton, never a spinner.

| Part | What | Timing |
| --- | --- | --- |
| Skeleton | `SkeletonRows`, `SkeletonCards`, `SkeletonDash` (tiles over chart panes), `SkeletonPanel` (the side panel) | after `--wait`, at the final size |
| Route bar | a 2px brand line at the top while any skeleton or route fallback is on screen (each holds a mark in `lib/loading.ts`) | after `--dur-2`; creeps to 80 % in `--loop-route`; fills and fades when all is in |
| Brand loader | the mark drawing itself; inline SVG + CSS, under 1.2 KB, no GIF | after `--wait`; once seen it stays 400 ms; fades in `--dur-1` |
| Opening screen | the demo's start: the loader, the real step, a bar that follows the work, "Still getting ready" after 8 s, a 200 ms cross-fade into the app | |
| Busy button | `const [state, run] = useBusy()`, `{...busyProps(state)}`: the label stays, the first icon turns into a 14px ring after `--dur-2`, at least 300 ms, then a tick for 600 ms | |

### Buttons, Back and Close

- **Every action button has an icon and a label** (`<Icon …/>` first, then the words). A button with only an icon has an
  `aria-label`; `lib/tooltips.ts` makes it its tooltip. Choices in a segmented control or a tab strip and whole rows of a
  list are not action buttons: they are words.
- **Back**: every page that lives under another (a customer, a report, a settings section, an onboarding plan) shows
  `BackBar` above its title, in the same place (`parentOf` in `components/BackBar.tsx` says which page is above). On a
  phone the task and record panels are whole screens with Back at the start of their header.
- **Close**: every dialog, panel, sheet and popover closes with `CloseButton` (`components/ui.tsx`) at the end corner of
  its header: 44 × 44, a visible fill, "Close (Esc)" as its tooltip, apart from a destructive button. Esc does the same.

### Undo — `useUndo`, `useServerUndo` (`lib/undo.ts`)

The one way a change is taken back. A delete, a move, a bulk change or a settings change says what it did
in a toast with **Undo** for 7 seconds (a plain note shows 4 seconds, an error stays until closed; the count pauses while the
pointer or the focus is on the toast; at most three show at once, the oldest gives way); **Ctrl+Z / ⌘Z** takes back the latest one while it shows (not
while the focus is in a text field: there it belongs to the text). The toast area is a polite live region.

- `offer(text, takeBack, after?)` from `useUndo()` — `takeBack` restores, then "Put back" and `after` (reload).
- `undoable(text, undoId, after?)` from `useServerUndo()` — for answers that carry an `undoId` (bulk changes).
- `useTrashToast()` (`lib/trash.ts`) — a delete that went to the trash; built on `useUndo`.
- Never a confirmation dialog where an undo will do; keep `Confirm` for what cannot be undone.

### Numbers, money and dates in text — `lib/format.ts`, `useFormat()` (`lib/useFormat.ts`)

The one formatter module. Nothing in `web/src` or `web/portal` calls `Intl.NumberFormat`, `Intl.DateTimeFormat`
or `toLocale*String` itself (tests/format.test.ts fails if one does).

- `formatNumber`, `formatPercent` (0–100), `formatUnit`, `formatBytes`, `formatMoney`, `currencySign`,
  `formatDate` (a `'YYYY-MM-DD'` day is the same day everywhere; a timestamp is in the reader's clock),
  `formatDateTime`, `formatClock`, `formatMonth`, and the date field's `formatDayNumeric` / `parseDay`.
- Gregorian in every language, with the language's own digits (Persian digits in Persian; the Western digits
  the Arabic dictionary uses in Arabic).
- **One currency per screen.** A list shows every amount in the company's currency; an amount kept in
  another is converted and marked `≈`, and `ConvertedNote` (components/ui.tsx) under the list says at which
  rates and of which date. A screen about one customer shows that customer's own currency.

### Targets and focus of shared controls

Every shared control is at least `--tap-min` (24 px) and `--tap` (44 px) on a touch screen — the date
field and its calendar days, the filter button and sheet, chips, toasts and their Undo/close, checkboxes —
and its keyboard focus shows the ring (`--ring`, drawn inside with `outline-offset: -2px` where the control
clips). Avatars draw their initials with CSS (`data-initials`): the avatar is an image named after the person,
so a button holding avatars is named by the names it shows. Checked by `browser.mts tap fit axe`.
