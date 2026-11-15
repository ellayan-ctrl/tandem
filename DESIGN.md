---
name: Tandem
description: Send together, save together. Cross-border transfers drawn as a corridor timetable.
colors:
  ink: "#0f2233"
  ground: "#f4f6f5"
  panel: "#ffffff"
  local: "#2f8a5b"
  local-text: "#1d5e3c"
  local-tint: "#e9f5ee"
  cross: "#3a6ea5"
  cross-text: "#26496e"
  cross-tint: "#ebf1f8"
  signal: "#c98a12"
  signal-text: "#62420c"
  signal-tint: "#fbf4e4"
  failure: "#a8392d"
  failure-text: "#8a2e25"
  failure-tint: "#fbeeec"
  wash: "#f4f6f7"
  hatch-ground: "#e8edef"
  divider: "#d5dde1"
  control-rule: "#b4c1c8"
  placeholder: "#5f717d"
  label-grey: "#4e5f6a"
  secondary-text: "#3c4c57"
  ink-hover: "#1b2b37"
typography:
  display:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-small:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.07em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  hairline: "1px"
  xs: "2px"
  sm: "2px"
  field: "3px"
  md: "4px"
  full: "9999px"
spacing:
  px: "1px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  panel-y: "14px"
  lg: "16px"
  panel-x: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-send:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    height: "52px"
    width: "100%"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  station-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "24px"
  station-tag-line:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
  status-local:
    backgroundColor: "{colors.local-tint}"
    textColor: "#174a30"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  status-cross:
    backgroundColor: "{colors.cross-tint}"
    textColor: "#1e3a58"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  status-signal:
    backgroundColor: "{colors.signal-tint}"
    textColor: "{colors.signal-text}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  status-failure:
    backgroundColor: "{colors.failure-tint}"
    textColor: "#6e2620"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  departure-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "8px 10px"
  departure-cell-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
  panel:
    backgroundColor: "{colors.panel}"
    padding: "14px 20px"
  nav-shell:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    height: "60px"
---

# Design System: Tandem

## Overview

**Creative North Star: "The Corridor Timetable"**

Every corridor is a transit line with two directions and every transfer is a scheduled departure. The matched part stays on the platform and is paid locally; only the remainder boards and crosses the border on Stellar. The interface is set like a departures board and a route map: a navy enamel shell, a cool off-white concourse, white work panels capped with an ink rule, two line colours that each carry one meaning, and countries written as two-letter station codes.

Density is that of a timetable, not a dashboard: rows, rules and figures, read left to right, with numbers always tabular. Colour is scarce and functional. Grey exists only to rank text and draw rules; it never decorates. Depth is almost absent: panels sit flat on the ground and are separated by their ink caps and by white space, not by shadow.

The system rejects the slate card stack with rounded shadow cards and a black pill button. Its one authored motion is the route strip easing to a new split.

**Key Characteristics:**
- Navy ink shell and ink-capped white panels on a cool off-white ground.
- Two line colours with fixed jobs: green is paid locally, blue crosses on Stellar.
- Waiting money is hatched, never coloured.
- Every routed amount is drawn as a route strip between two station stops.
- Barlow for everything, Barlow Semi Condensed for uppercase labels and tags, tabular figures throughout.
- Squared geometry: 2 to 4px corners, 1px rules, 3px ink accents.

## Colors

A navy-tinted neutral ramp carries the whole interface; three signal hues and one failure hue each mean exactly one thing.

### Primary
- **Enamel Ink** (`ink`): the shell bar, the 3px rule capping every panel, primary buttons, station tags, the selected departure cell, the amount underline, selection highlight, caret and checkbox accent. It is also the body text colour.

### Secondary
- **Platform Green** (`local`): the matched share, paid locally on both sides. Route strip segment, legend swatch, the "Matches now" figure (set in `local-text` for contrast), received amounts, copy-confirmed checks. `local-tint` backs its status chips.
- **Crossing Blue** (`cross`): the unmatched remainder that crosses on Stellar as USDC. Route strip segment, legend swatch, the "Crosses on Stellar" figure (in `cross-text`), proof links, inline text actions, and the keyboard focus ring (2px, offset 2px). `cross-tint` backs its status chips.

### Tertiary
- **Departure Amber** (`signal`): a matching window that is closing, and testnet. The TESTNET tag in the shell, the countdown bar on the receipt, the current-stage mark. `signal-text` on `signal-tint` for pending status chips.
- **Failure Red** (`failure`): failed stages, payout failures, form errors. `failure-text` on `failure-tint` for alert strips.

### Neutral
- **Concourse** (`ground`): the page background behind every panel.
- **Panel White** (`panel`): work panels, fields, the receipt sheet.
- **Wash** (`wash`): hover fill on rows and controls, expanded row detail.
- **Hatch Ground** (`hatch-ground`) with **Control Rule** (`control-rule`) stripes: the hatched waiting segment.
- **Divider** (`divider`): 1px rules inside panels and between list rows.
- **Control Rule** (`control-rule`): 1px borders of fields, segmented controls and icon buttons; disabled button fill.
- **Placeholder** (`placeholder`), **Label Grey** (`label-grey`), **Secondary Text** (`secondary-text`): placeholder, uppercase labels and the currency sigil, and supporting sentences respectively. All three pass 4.5:1 on white.
- **Ink Hover** (`ink-hover`): hover state of ink buttons.

The Tailwind `slate`, `emerald`, `sky`, `amber` and `rose` scales are remapped to these families in `src/index.css`, so any `slate-*` class lands on the navy-tinted neutrals and any `emerald-*` or `sky-*` on the two line colours.

### Named Rules
**The Two Lines Rule.** Green means paid locally and blue means crosses on Stellar, everywhere, without exception. Neither is used as a generic accent, success colour or brand flourish.

**The Hatch Rule.** Money that is neither matched nor sent is drawn with the 135-degree hatch, never a colour, so waiting can never be misread as a state of the line.

**The Red Is Failure Rule.** Red appears only when something failed. Amber is the only warning hue and it means the window is closing or this is testnet.

**The No Decorative Grey Rule.** Neutrals rank text and draw rules. A grey fill, badge or icon tint that carries no meaning is not allowed.

## Typography

**Display Font:** Barlow (with ui-sans-serif, system-ui)
**Body Font:** Barlow (with ui-sans-serif, system-ui)
**Label Font:** Barlow Semi Condensed (with Barlow)
**Mono Font:** JetBrains Mono (with ui-monospace, Menlo)

**Character:** A grotesk with signage roots set at transit weight, paired with its own semi-condensed cut for the labels you would find on a platform board. Loaded weights: Barlow 400/500/600/700, Semi Condensed 500/600, JetBrains Mono 400/500.

### Hierarchy
- **Display** (600, 40px, line-height 1, -0.02em): the amount being sent and the receipt total. One per view.
- **Headline** (600, 30 to 32px, 1.25, -0.01em): the page title ("Send money", "My transfers").
- **Figure** (600, 28px, line-height 1): the matched and crossing split figures in the route panel, in their line colour's text shade. Totals tiles step down to 24px.
- **Title** (600, 18px): panel headings ("Your route", "Departs in", "Payment and recipient").
- **Body** (400, 15px, 1.5): base size set on `body`; fee lines, row text, receipt copy.
- **Body small** (400, 14px): supporting sentences, hints under fields, secondary row lines in `secondary-text`.
- **Label** (Semi Condensed 600, 12px, 0.07em, uppercase, `label-grey`): field labels, column heads, the From/To captions. Station tags, the TESTNET tag and the currency code use the same face in caps at 11 to 14px.
- **Mono** (400, 13px): order IDs, transaction hashes, Stellar addresses. Nothing else.

### Named Rules
**The Tabular Figures Rule.** `body` sets `font-variant-numeric: tabular-nums`; every amount, time and count lines up in columns. Figures are never set in monospace to look technical.

**The Condensed Label Rule.** Uppercase belongs only to the condensed label face. Headings and body copy stay in sentence case.

**The Mono Is Evidence Rule.** JetBrains Mono marks a machine identifier that someone might copy or verify on Stellar Expert. It is never decoration.

## Layout

A centred column (max 72rem, 16 / 24 / 32px gutters at mobile / sm / lg) under a full-width sticky shell bar. Pages open with the headline and a one-sentence description at 32px from the bar. The Send view is two columns from `lg`: a fluid work column and a 400px route panel that sticks 84px from the top; below `lg` the route panel follows the form. Work panels stack with 16px gaps; columns are 24 to 32px apart.

Panels pad 20px horizontally and 14 to 20px vertically. Inside a panel, regions are divided by 1px `divider` rules running edge to edge, not by nested cards.

Timetable rows share one column template: on My transfers, date (6.5rem), counterparty, route strip, amount (7rem, right-aligned), status (11rem), disclosure chevron. The column header row uses the label style. Below `md` a row collapses to name and amount on one line and the route strip with status beneath.

Choice sets are laid out as joined cells inside one 1px frame: the two-way mode switch and the seven-cell departures row (4 + 3 cells on mobile).

### Named Rules
**The Isolated Send Rule.** The irreversible action stands alone at the foot of the route panel, full width, below a rule, with its consequence written underneath. Nothing else shares its row.

**The One Baseline Rule.** Progress stages sit on a single baseline: equal grid columns, stop marks on one line, connectors drawn between them.

## Elevation & Depth

Flat. Panels are separated from the ground by colour and capped by a 3px ink rule; a near-invisible 1px shadow only softens the edge. The receipt modal is the single lifted surface, over a 55% ink scrim. Selection inside a control is shown by ink fill or an inset 3px ink underline, never by raising it.

### Shadow Vocabulary
- **Panel edge** (`box-shadow: 0 1px 2px rgb(15 34 51 / 0.06)`): every work panel.
- **Sheet lift** (`box-shadow: 0 16px 48px rgb(15 34 51 / 0.35)`): the receipt modal only; removed in print.

### Named Rules
**The Ink Cap Rule.** A work surface announces itself with a 3px ink top rule, not with a rounded corner or a shadow.

## Shapes

Squared and ruled. Buttons, tags, chips and icon buttons take a 2px corner; fields 3px; route strip ends and legend swatches 1px. The only round shapes are the station stops of the route strip and the stage marks of the receipt: white or ink discs with a 3px ink ring. Borders are 1px `control-rule` on controls and 1px `divider` inside panels; emphasis rules are 2 to 3px ink (panel cap, amount underline, active tab and filter underline).

Selects and disclosures carry a drawn 16px chevron in ink at stroke 2, matching the Lucide icon set; the browser's native arrow and `details` marker are always hidden.

## Components

### Buttons
- **Shape:** squared (2px).
- **Primary:** `ink` fill, white 600 text, 40 to 44px tall, 16 to 20px side padding. Hover shifts to `ink-hover`.
- **Send:** the primary at full panel width, 52px tall, 17px semibold, with a trailing arrow. Disabled falls to `control-rule` fill with `secondary-text`.
- **Outline:** transparent with a 1px inset ink (or `placeholder`) ring, ink 600 text, 36 to 44px tall; hover fills white.
- **Icon button:** 36 to 40px square, 1px `control-rule` ring, hover turns the ring ink and fills `wash`. In the receipt toolbar the ring is dropped and hover fills `hatch-ground`.
- **Text action:** `cross` text, medium weight, underline on hover.
- **Focus:** 2px `cross` outline, offset 2px, globally.

### Chips
- **Status:** 2px corner, 13px semibold, 2px by 8px. Tint plus deep text of the hue that owns the meaning: green for paid locally, blue for crossed, amber for waiting on a window, red for failed, neutral for anything else.
- **Station tag:** two-letter country code in the condensed face, caps, ink fill with white text (or white with a 1px inset ink ring), 20 / 24 / 32px tall. Countries are never shown as flag emoji.
- **TESTNET tag:** condensed caps in amber-300 inside a 1px amber ring on the navy shell.

### Cards / Containers
- **Panel:** white, 3px ink top rule, square corners, panel-edge shadow, 20px side padding, internal regions split by 1px dividers.
- **Expanded row detail:** `wash` background, aligned to the row's column grid.
- **Receipt sheet:** a panel at max 42rem width with the sheet-lift shadow; regions (summary, stages, countdown, matches, parties, proof) split by dividers; the countdown region on a faint amber wash.

### Inputs / Fields
- **Field:** white, 1px `control-rule` border, 3px corner, 9px by 12px padding, 15px text, `placeholder` placeholder. Hover darkens the border to `placeholder`; focus sets an ink border plus a 1px ink ring and drops the outline.
- **Amount field:** borderless 40px display figures over a 2px ink underline that turns `cross` on focus; the dollar sigil in `label-grey`, the currency code in condensed caps, the local-currency equivalent beneath. Number spinners are removed.
- **Station picker:** a borderless select set at 18px semibold beside its station tag, hugging its content with the drawn chevron; hover turns the name `cross`. A 40px swap button sits between the pair.

### Navigation
- **Shell bar:** sticky `ink` bar, 56px (60px from `md`), logo and wordmark at left, TESTNET tag, settlement-contract link and account button at right.
- **Tabs:** 15px medium, `control-rule` at rest, white on hover and when active; the active tab carries a 3px white rule on the bar's bottom edge. Below `lg` the tabs move to a scrolling second row with a right-edge fade.
- **Filter tabs:** the same pattern on the ground: ink text with a 3px ink underline over a 1px `control-rule` baseline, counts in `label-grey`.

### Route Strip (signature)
Two ink-ringed station stops joined by a bar split into three flex segments in fixed order: green `local`, hatched waiting, blue `cross`, separated by 1px gaps, widths proportional to the amounts. Heights 6 / 10 / 14px (sm / md / lg). A zero total draws a plain `divider` bar. It carries an `aria-label` that spells out each share in words. Segment widths ease over 700ms on `cubic-bezier(0.16, 1, 0.3, 1)` and do not animate under reduced motion. It appears as the live preview on Send (lg, with station names above and the split figures beneath), on every My transfers row (sm) and in the receipt (md), always with a route key: a 10px swatch, a label and an amount.

### Departures Row
The matching-window picker set as a timetable: seven joined cells in one 1px frame, each with the duration in semibold and the departure clock time beneath in 13px. The chosen cell fills ink with white text and a `control-rule` time; others hover to `wash`.

### Stage Line
Receipt progress as stop marks on one baseline: done is an ink disc, current is a white disc with an amber ring and amber halo, failed is red, to-do is a white disc with a `control-rule` ring. Connectors are 2px ink up to the current stage and `divider` beyond it.

## Do's and Don'ts

### Do:
- **Do** cap every work panel with the 3px ink rule and keep its corners square.
- **Do** draw any amount that travels between two countries as a route strip, with its key.
- **Do** keep green for paid locally and blue for crosses on Stellar on every surface, including status chips and figures.
- **Do** hatch money that is still waiting.
- **Do** write countries as two-letter station tags in the condensed face.
- **Do** set uppercase only in Barlow Semi Condensed at 0.07em tracking.
- **Do** keep the irreversible action alone, full width, with its consequence written beneath it.
- **Do** put machine identifiers in JetBrains Mono and link them to Stellar Expert where they exist.

### Don't:
- **Don't** use rounded shadow cards or a pill-shaped black button; this world is ruled panels and squared ink buttons.
- **Don't** use green or blue as a generic success or brand accent; each already means one thing.
- **Don't** use red for anything but failure, or amber for anything but a closing window or testnet.
- **Don't** fill or tint with grey for decoration.
- **Don't** show flag emoji for countries.
- **Don't** set amounts in monospace, or set figures without tabular numerals.
- **Don't** let the browser draw select arrows or disclosure markers; use the drawn ink chevron.
- **Don't** add looping or ornamental motion; the route strip's split easing is the one authored movement.
