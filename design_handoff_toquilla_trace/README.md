# Handoff: Toquilla Trace

> **Implementation notes (added after the build).** This is the pre-build design spec (revision 2). Two facts changed: the model is Google Gemini `gemini-2.5-flash-lite` (decision D26), not `claude-opus-5-5`, so run details and logs show the Gemini model; and the app uses its own Tailwind components in `components/ui`, not Radix or shadcn. Current status: [HANDOFF.md](../HANDOFF.md).

## Overview
Toquilla Trace is a responsive web app that gives every genuine Ecuadorian toquilla straw ("Panama") hat a digital passport, from the weaver to the buyer.

- **Workshop staff** tell the app what happened, by voice first and by typing as a backup, in Spanish or English.
- **An AI agent** reads the note and *proposes* record changes.
- **A person approves** each change, while the **system enforces rules**: no skipped stages, and the grade must match the weave count.
- **Buyers** open a public passport (usually by scanning the QR code on the hat's tag), ask a read-only AI concierge questions, and can claim the hat.
- **Admins** (Toquilla Trace staff, not workshop users) debug the app through Agent runs (step-by-step traces) and a dense system log.

**Core principle:** AI actions are always transparent. The UI always shows:
- what the AI understood,
- what it proposes,
- what the rules allowed or blocked,
- who approved what.

Nothing the AI does is saved without a human click.

## About the design files
The files in `designs/` are **design references built in HTML**. They are working prototypes that show the intended look, copy and behaviour. They are **not production code to copy**.

Recreate them in the target codebase. The intended stack is **Next.js (App Router) + Tailwind CSS**. Use standard components such as Radix or shadcn primitives for dialogs, menus, popovers and tooltips.

The prototypes:
- use inline styles, CSS variables and a tiny template runtime (`support.js`),
- simulate the backend, the AI agent and speech recognition with timers and canned data,
- can be opened directly in a browser.

The Tweaks panel in each file (or the props listed below) jumps between states.

## Fidelity
**High-fidelity.** Colours, typography, spacing, copy, states and interactions are final. Recreate them closely using Tailwind and the tokens below. All copy is final and should be used word for word.

## Device priority
**Mobile-first (390px):**
- Workshop dashboard, Hats, Hat detail, Weavers
- Public passport and concierge
- Landing, Login

**Desktop-first (1440px):** Agent runs, Logs, Settings. These must still work on mobile.

**Rules on mobile-first screens:**
- The primary action sits at the bottom of the screen, within one-thumb reach.
- Nothing important is hover-only. Every hover affordance has a visible tap target.

**Breakpoint:** `< 768px` is mobile in the prototypes.
- Tables become cards.
- Side panels become full-screen sheets.
- Dialogs become bottom sheets with a drag handle.

## Roles (revision 2)
Two roles. Least privilege applies to people, not only to the AI.

| | Workshop member | Admin |
|---|---|---|
| Who | Workshop staff and owners (everyone who signs up) | Toquilla Trace staff who run the platform |
| Navigation | Workshop, Hats, Weavers. Mobile tab bar has **3 tabs** | Same, plus an **Admin** group in the desktop sidebar (Agent runs, Logs). On mobile, admins reach them from the user menu under **Admin tools**, never the tab bar |
| Agent meta row | "4 actions prepared · 2.1 s" | "4 tool calls · 2.1 s · $0.004 · View trace" |
| Approval failed card | "Reference: req_8f2a" with copy (toast "Reference copied. Share it with support.") | **View log** |
| Recent activity | No "View all" link | "View all in Logs" |
| Hat detail | Only the **Activity** tab. No "View in agent runs", "View logs for this hat" or "View trace" in the timeline popover | All of them |
| Agent runs / Logs pages | "{Page} is for admins" card with **Go to Workshop** | Full pages |
| User menu | Name, email, workshop | Same, plus a blue **Admin** badge next to the name |
| Data access (backend) | Row-level security: own workshop only | All rows, including `app_logs` |

**Why:** logs and traces hold payloads from every workshop (emails, notes, anonymous buyer questions), and workshop staff on a phone don't need JSON, tokens or costs.

**Prototype only:** the user menu has a dashed "Prototype only: view as Member / Admin" switch. The choice is stored in `localStorage['tt-role']` and shared by all prototype files. `?role=member` or `?role=admin` in the URL sets it too. Do not ship this switch.

---

## Files
| File | Contains | Hash routes / props |
|---|---|---|
| `Toquilla Trace.dc.html` | App shell, **Workshop dashboard** (voice composer, agent run, proposal review with all 8 card states, Today stats, activity, first-run onboarding), **Public passport** + **Buyer concierge**, user menu, help, toasts, dialogs (help, logout, discard, manual create, add weaver, claim logged-in/out) | `#passport`, `#passport/<CODE>` (not verified), `#record`, `#record/<CODE>` (opens composer recording, tagged to hat), `#welcome` (first run). Props: `role`, `passportViewer` (recipient/visitor), `composerState`, `micPermission`, `voiceError`, `firstRun`, `passportState`, `buyerLoggedIn`, `agentOutcome`, `simulateFailure`, `accent`. URL: `?role=`, `?viewer=visitor` |
| `Hats.dc.html` | **Hats list** (search, multi-select filters, sort, table/cards, bulk bar, row menu, pagination/load more), **Hat detail** (header, flags, production timeline, details edit, ownership chain, Activity/Logs tabs), **Weavers** grid; dialogs: advance, share, QR, transfer, archive, unsaved changes, new hat, add/edit weaver | `#hats`, `#flagged`, `#weaver/<name>`, `#detail/<CODE>`, `#weavers`. Props: `role`, `initialScreen`, `listState` (data/loading/empty), `weaversState` |
| `Builder.dc.html` | **Agent runs** (filters, summary strip, table/cards, run detail drawer with step timeline and JSON), **Logs** (filters, level chips, Live mode, density, detail panel, copy-as-prompt), **Settings** (Profile/Workshop/Appearance, change password, delete account) | `#runs`, `#run`, `#logs`, `#settings`. Props: `role` (defaults to admin), `initialScreen`, `runsState`, `logsState`. Members see the admins-only card on `#runs` / `#logs` |
| `Auth.dc.html` | **Landing** (hero, before/after strip, verify box, feature cards), **Log in**, **Sign up**, **Forgot password**, **404**, page **error** state, **session expired** dialog | `#landing`, `#login`, `#signup`, `#forgot`, `#404`, `#error`, `#session`, `#loggedout`. Props: `screen`, `loginOutcome` (success/wrong/tooMany/network) |
| `Component Sheet.dc.html` | Flow diagrams for the 3 journeys, buttons × states, inputs × states, controls, all badge families, proposal card × 8 states, steppers, ownership chain, toasts, chat bubbles, rows, tiles, empty/skeleton, dialogs | n/a |
| `support.js` | Prototype runtime only. **Do not port.** | n/a |

### Suggested Next.js routes
| Route | Screen | Notes |
|---|---|---|
| `/` | Landing | |
| `/login`, `/signup`, `/forgot` | Auth | |
| `/workshop` | Workshop dashboard | |
| `/hats` | Hats list | |
| `/hats/[code]` | Hat detail | |
| `/weavers` | Weavers | |
| `/hat/[code]` | Public passport | No app shell |
| `/runs` | Agent runs | |
| `/runs/[id]` | Run detail | Or a drawer over the list |
| `/logs` | Logs | |
| `/settings` | Settings | |
| 404 | Not found | Default 404 page |

---

## Design tokens

### Colours (CSS variables; light / dark)
Define the colours as CSS variables on `:root` and `[data-theme="dark"]`, then map them in `tailwind.config` (e.g. `colors: { bg: 'var(--bg)', ... }`). The values are OKLCH; the hex values are approximate sRGB equivalents.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `oklch(0.965 0.014 85)` #f8f3e9 | `oklch(0.2 0.01 70)` #191511 |
| `--surface` | `oklch(0.988 0.008 85)` #fefbf5 | `oklch(0.24 0.012 70)` #231e19 |
| `--surface2` | `oklch(0.94 0.018 82)` #f1eade | `oklch(0.28 0.014 70)` #2d2821 |
| `--line` | `oklch(0.87 0.022 80)` #dcd3c4 | `oklch(0.36 0.015 70)` #423c35 |
| `--ink` | `oklch(0.24 0.012 60)` #241e1a | `oklch(0.94 0.012 85)` #efebe2 |
| `--muted` | `oklch(0.47 0.015 60)` #615953 | `oklch(0.74 0.015 80)` #b0aaa0 |
| `--accent` (Andean green) | `oklch(0.42 0.085 162)` #115b3e | `oklch(0.74 0.11 162)` #63c095 |
| `--accent-strong` (hover) | `oklch(0.35 0.08 162)` #00472d | `oklch(0.8 0.1 162)` #7fd2aa |
| `--accent-tint` | `oklch(0.945 0.025 162)` #dff2e8 | `oklch(0.3 0.04 162)` #1a3428 |
| `--on-accent` | `oklch(0.99 0.005 85)` #fdfcf8 | `oklch(0.18 0.02 162)` #09140f |
| `--ok` | `oklch(0.46 0.11 150)` #1d6835 | `oklch(0.76 0.13 150)` #6fc884 |
| `--ok-tint` | `oklch(0.95 0.035 150)` #dff6e2 | `oklch(0.29 0.05 150)` #17321e |
| `--warn` | `oklch(0.5 0.11 65)` #8d5406 | `oklch(0.82 0.12 80)` #edbb64 |
| `--warn-tint` | `oklch(0.95 0.045 85)` #fcedcd | `oklch(0.31 0.05 75)` #3f2c10 |
| `--err` | `oklch(0.52 0.17 28)` #b6322b | `oklch(0.74 0.15 28)` #fb8274 |
| `--err-tint` | `oklch(0.955 0.03 28)` #ffe9e5 | `oklch(0.3 0.06 28)` #47211c |
| `--info` | `oklch(0.48 0.11 250)` #246099 | `oklch(0.76 0.1 245)` #79b8ed |
| `--info-tint` | `oklch(0.95 0.025 250)` #e2f0ff | `oklch(0.29 0.04 245)` #1a2d3e |
| `--straw` (avatars, texture) | `oklch(0.85 0.055 85)` #decca5 | `oklch(0.42 0.04 85)` #574c34 |
| `--cream` (certificate) | `oklch(0.975 0.022 88)` #fdf6e6 | `oklch(0.26 0.02 85)` #282319 |
| `--code` (JSON bg) | `oklch(0.22 0.012 60)` #1f1915 | `oklch(0.16 0.008 70)` #100d0a |

**Other colour values:**
- **Code text:** `oklch(0.92 0.012 85)`.
- **JSON syntax colours:** keys `oklch(0.8 0.08 250)`, strings `oklch(0.82 0.1 140)`, numbers `oklch(0.83 0.11 70)`, booleans/null `oklch(0.78 0.12 330)`.
- **Scrim:** light `rgb(30 24 12 / .38)`, dark `rgb(0 0 0 / .55)`.
- **Shadow:** light `0 1px 2px rgb(40 30 10/.06), 0 10px 30px rgb(40 30 10/.10)`; dark `0 1px 2px rgb(0 0 0/.3), 0 10px 30px rgb(0 0 0/.35)`.

**Alternative accent (indigo):** this was proposed but not chosen. Indigo is available as `[data-accent="indigo"]`.

| Token | Light | Dark |
|---|---|---|
| `--accent` | #3c448d | #9eacf1 |
| `--accent-strong` | #2b3077 | #b3c0ff |
| `--accent-tint` | #e8ecfe | #262c47 |
| `--on-accent` | (unchanged) | #0e101f |

### Typography
| Role | Font | Usage |
|---|---|---|
| Serif | **Newsreader** (Google Fonts; opsz 6 to 72, 400/500/600, italic 400) | Landing and passport headings, certificate, weaver names, auth card titles, logo wordmark (600) |
| Sans | **Instrument Sans** (400/500/600/700) | All app UI |
| Mono | **JetBrains Mono** (400/500) | Hat codes, IDs, JSON, log times, counters, kbd |
| Icons | **Material Symbols Rounded** (variable, FILL 0) | Every icon. Lucide is an acceptable swap if mapped one to one. |

**Type scale (px):**
| Element | Size |
|---|---|
| App body | 14, line-height 1.45 |
| Auth / landing body | 15 to 16 |
| Small / meta | 12 to 13 |
| Table header | 11 to 12, uppercase, tracking .04em, 700 |
| Page title (app) | 28 / 600 / tracking -0.015em |
| Card title | 15 to 18 / 600 |
| Landing H1 | 80 desktop / 44 mobile; Newsreader 500, line-height 1.04, tracking -0.025em; second sentence in italic `--accent` |
| Passport grade ("Superfino") | 84 desktop / 56 mobile; Newsreader 500, line-height 1 |
| Hat detail code | 36 / 28, mono 500 |
| Certificate code | mono 26 |
| Stat tile number | 26 / 600 |

### Radius, spacing, sizes
- **Radius:**

  | Element | Radius |
  |---|---|
  | Small badges | 6 to 7 |
  | Inputs / buttons | 10 (mobile bars 12 to 14; round 24/36) |
  | Cards | 14 to 16 |
  | Large sections | 18 |
  | Dialogs | 16 (sheet top corners 18) |
  | Pills / chips | 999 |

- **Spacing:** 4-pt based, mostly 6, 8, 10, 12, 14, 16, 18, 20, 24 and 32. Page padding is 32 to 36 desktop and 16 mobile. Card padding is 16 to 20.
- **Hit targets:** buttons are 44px tall (desktop compact controls 36 to 40). Mobile bottom-bar buttons are 48 to 52px. The voice mic is **72px**. FABs are 56 to 64px.
- **Sidebar:** 240px, collapses to 72px. Mobile top bar is 56px; bottom tab bar is 64px.
- **Dialogs:** max 520px (help and manual create 560px).
- **Side panels:** concierge 400px; log detail 440px (inline at ≥1180px, overlay below); run drawer `min(760px, 92vw)`.
- **Log rows:** 36px compact / 48px comfortable.

### Texture
A woven crosshatch is used only as an accent: the certificate border, empty states, the landing hero edge and the onboarding card frame. It is never behind text.

```css
background:
  repeating-linear-gradient(45deg,  transparent 0 4px, var(--straw) 4px 6px),
  repeating-linear-gradient(-45deg, transparent 0 4px, var(--straw) 4px 6px),
  var(--cream);
```

**Logo mark:** a 28px rounded square (radius 7) in `--accent`. It carries the same crosshatch in `rgb(255 255 255/.28)` (3px/5px), next to the "Toquilla Trace" wordmark in Newsreader 600, 20px.

### Motion
- **Standard:** 150 to 200ms ease for hover, menus, drawers and toasts. Elements enter with fade + translateY(6px), 180ms.
- **Rich moments:** only the Verified seal and a successful Claim get the stamp animation: `scale(1.8) rotate(-14deg) → scale(.94) → 1`, 600ms, `cubic-bezier(.2,1.3,.4,1)`.
- **Recording:** the mic pulses with a red ring (`scale .95→1.55`, opacity .55→0, 1.2s). A waveform of 18 to 26 bars animates scaleY .2↔1 with staggered delays. A red dot blinks at 1s.
- **Reduced motion:** honour `prefers-reduced-motion` by disabling all of the above.

---

## Domain rules (must be enforced server-side and reflected in the UI)
- **Stages:** Weaving → Washing → Bleaching → Blocking → Finished.
  - A hat moves only one step forward: never backward, never skipping.
  - Selects show non-next stages as disabled, with "Stages can't be skipped."
- **Grades by rows per inch:** Standard 8 to 14, Fino 15 to 24, Superfino 25+.
  - A mismatch shows the inline warning "18 rows/inch usually means Fino." with a "Use Fino" fix.
- **Ownership:** Workshop → Seller → Buyer.
  - Only the current owner can advance or transfer.
  - When the user isn't the owner, the button is disabled and shows "Only the current owner can change the stage."
- **Hat code:** `^TQ-[A-Z0-9]{5}$`. Inputs auto-uppercase, auto-insert the hyphen and allow max 8 characters. The error text is "Codes look like TQ-7F3K2."
- **Anomalies (flags):** grade/weave mismatch, production faster than expected, weaver not found.

## AI visual language (use consistently everywhere)
- **Sparkle icon** (`auto_awesome`): its labels are "Proposed by AI" and "Assistant".
- **Proposed by AI:** 1.5px **dashed** `--accent` border on an `--accent-tint` background.
- **Approved by a human:** 1.5px **solid** `--ok` border on `--ok-tint`, with a check icon.
- **Blocked by rules:** 1.5px solid `--err` border on `--err-tint`, with a **lock** icon.
- **Needs your answer:** solid `--warn` border on `--warn-tint`, with a help icon.
- **Never colour alone:** every state also has an icon and a text label.

---

## Screens

### Global shell
**Desktop:**
- Sticky left sidebar, 240px wide, `--surface` background, right border `--line`.
  - **Top:** the logo, which links to `/workshop`.
  - **Nav:** Workshop, Hats, Weavers. Each item is 44px tall with radius 10, a 21px icon and 14px text.
  - **Admin group (admins only):** a divider, a small uppercase "Admin" label with a shield icon, then Agent runs and Logs.
    - The active item has an `--accent-tint` background, weight 700 and an accent icon.
    - Hover shows an `--accent-tint` background.
    - Workshop carries a pending-proposals count badge: 20px pill, `--accent`.
    - Logs (admin group) carries a red dot (8px) when there are errors in the last hour.
  - **Bottom:** the avatar (32px circle, `--straw`, initials) with "Xavier / Taller Pillco, Cuenca", which opens the user menu.
  - **Collapse toggle:** "Collapse sidebar" / "Expand sidebar". At 72px the labels hide and items show tooltips.

**Mobile:**
- 56px top bar: logo on the left, avatar on the right (44px target).
- 64px fixed bottom tab bar with **3 tabs** (icon 23px + 11px label): Workshop, Hats, Weavers. The active tab is `--accent`. Admin pages are never in the tab bar.

**User menu:** 280px popover. On desktop it opens bottom-left next to the sidebar; on mobile it drops from the top right.
- Shows the name, email and workshop.
- Items: Profile & workshop, Theme (Light / Dark / System segmented), Help, **Admin tools** (admins on mobile: Agent runs, Logs with the red dot), Log out.
- Admins get a blue "Admin" badge next to their name.
- Log out asks for confirmation only if proposals are pending: "You have 3 proposals waiting for review. They'll still be here when you come back."
- Closes on outside click, Esc, or picking an item.

**Toasts:**
- Dark pill (`--ink` background, `--bg` text, radius 12) with a coloured leading icon (success ok, info info, warning warn, error err, undo accent), an optional action and a close ×.
- Positioned bottom-right on desktop (380px) and top-center on mobile.
- Auto-dismiss after 5s, pause on hover, max 3 stacked.
- The **Undo** variant lasts 10s and has a 3px accent countdown bar along its bottom edge.

**Dialogs:**
- Header has the title (18/600) and a 36px close button. The footer puts secondary on the left and primary on the right.
- Destructive primaries use `--err`.
- Close via ×, Esc or the backdrop, except destructive confirmations, which close only via their buttons.
- Focus is trapped while open.
- On mobile, dialogs are bottom sheets with a 40×4 drag handle.

### Workshop dashboard (`/workshop`), mobile-first
**Layout:**
- **Desktop:** two columns that wrap. Main column is `flex: 2 1 560px` and holds the composer, the conversation and the proposals. Side column is `flex: 1 1 300px` and holds Today and Recent activity.
- **Mobile:** everything stacks.
- **Header:** "Workshop" with the greeting "Good morning/afternoon/evening, Xavier". On the right, a "+ New hat manually" secondary button.

**Voice composer.** Voice is the primary path; typing is the backup.
- **Card:**
  - Title "Just tell me what happened" (18/600, waveform icon).
  - Subtitle "Hold the mic and talk, like a WhatsApp voice note."
  - Language chip toggling **Español (Ecuador)** (default) / **English**.
  - Optional hat chip "About TQ-7F3K2 ×" in `--info-tint`.
- **Desktop:**
  - The textarea is always visible. It grows from 3 to 8 rows, and its placeholder rotates every 4s through the three Spanish examples.
  - Example chips: "Or try an example:" followed by 3 chips.
  - Footer: Attach (disabled, tooltip "Photos are coming soon."), counter `n / 1000`, then **72px round mic** with the label "Click to talk", then Send.
  - Send is secondary when the text box is empty and primary when it has text. Shortcut: ⌘/Ctrl+Enter.
- **Mobile:**
  - The composer is docked above the tab bar.
  - Idle layout is a 3-column grid: hat chip on the left; in the centre a **72px mic** with "Hold to talk" and the "⌨ Type instead" link under it; language chip on the right.
  - "Type instead" switches to a pill textarea with a mic button (back to voice) and a 48px round Send.
- **Recording:**
  - **How it starts and stops:** press and hold, then release to stop; or tap to start and tap again to stop. Swiping left more than 110px while holding cancels, with a "‹ Slide to cancel" hint that follows the finger and turns red past 60px.
  - **Mic:** turns `--err` with the pulse ring.
  - **Live transcript box:** 1.5px `--err` border. Words appear as they are heard; the last 2 are `--muted` (unconfirmed), then `--ink`. Low-confidence words get a wavy `--warn` underline and the tooltip "Not sure I heard this right."
  - **Timer:** mono `0:07`. It turns amber at 1:50, recording stops automatically at 2:00, and the caption reads "Up to 2 minutes".
  - **Desktop footer:** "● Recording", waveform, timer, Cancel, and a red stop mic labelled "Click to stop".
  - **Mobile dock:** transcript, timer and waveform, then a row with Slide-to-cancel or Cancel on the left, the mic in the centre, and "Release to stop" / "Tap to stop" on the right.
- **Review (never auto-send):**
  - The label "Check the transcript, then send." sits above an editable text box.
  - Unsure words are listed as amber chips ("Not sure I heard these right. Tap to retype:"). Tapping one selects that word in the text box.
  - Buttons: **Send** (primary), **Re-record**, **Discard**. On mobile these are a 48px bottom row: delete icon, Re-record, then Send filling the rest.
- **Permission and error notices:** shown inline above the input on desktop and in the dock on mobile. Each is an icon, text and actions on a tinted card.

  | Case | Copy | Actions / behaviour |
  |---|---|---|
  | First use | "We need your microphone to turn your voice into a note. Toquilla Trace doesn't store audio. Your browser's speech service turns it into text." | **Allow microphone**, Type instead |
  | Blocked | "Microphone is blocked. Allow it in your browser settings, or type your note instead." | **How to allow** link, Type instead |
  | Unsupported browser | "Voice isn't supported in this browser. Type your note instead." | Mic hidden, typing is the default |
  | Silence | "Couldn't hear anything. Try again closer to the phone." | Try again, Type instead |
  | Connection lost | "Voice input stopped. Your text so far is saved." | Shown in review |
- **Agent running:**
  - Steps appear one at a time with spinner → check: "Reading your note..." → "Looking up weaver 'Rosa'..." → "Checking stage rules..." → "Preparing proposals...".
  - **Stop** shows the toast "Stopped. Nothing was saved."
  - The text box is read-only and dimmed (opacity .55).
- **Agent failed:** red card "The assistant couldn't finish. Your note is still here." with **Try again** and **View details** (opens the run).
- **After the run:**
  - **Your note:** a right-aligned bubble labelled "You said:" with a mic icon (voice) or "You wrote:" (typed), plus the hat tag if any.
  - **Edit note:** opens the confirm "Discard these proposals and edit your note?" with **Cancel** / **Discard and edit**.
  - **Assistant bubble:** left-aligned with the sparkle avatar and a 1 to 2 sentence summary.
  - **Meta row:** members see "4 actions prepared · 2.1 s"; admins see "4 tool calls · 2.1 s · $0.004 · View trace".

**Proposal review panel:**
- **Header:** "Review proposals (4)", **Reject all** (text button) and **Approve all valid (n)** (primary; skips question and blocked cards). On mobile, a 48px **mic** (accent tint, "Record another update"), Reject all and Approve all valid sit in the docked bottom bar. Tapping the mic swaps the bar for the voice dock, so a new update can be recorded without clearing the queue. New proposals are added on top; earlier open ones stay below (toast "New proposals added. Earlier ones are still waiting below.").
- **Legend:** dashed = Proposed by AI, solid green = Approved, red = Blocked by rules. The keyboard hint "Focus a card, then A E R" shows on desktop only.
- **Card anatomy (radius 14, padding 16):**
  - Top row: type badge (Create hat / Advance stage / Flag issue / Transfer), "✦ Proposed by AI", confidence chip (High confidence green / Check this amber), "Edited by you" tag, status tag on the right.
  - Summary line, 15/600.
  - Field chips, e.g. `Qty 3 · Grade Fino · Rows/inch 18 · Weaver …`.
  - Mini stepper `Weaving ● → ○ Washing`.
  - Expandable **Why?** with the agent's reason.
  - Actions: Reject (text), Edit (secondary), Approve (primary, 132px). These sit on the right on desktop and form a full-width row on mobile.
- **The 8 states:**
  1. **Pending:** dashed accent border on tint.
  2. **Editing:** the card expands into a form:
     - Quantity stepper (1 to 20).
     - Grade segmented control.
     - Rows/inch (6 to 40, with the mismatch warning).
     - Weaver select with "+ Add new weaver".
     - Stage select where only the next stage is enabled.
     - **Save changes** / **Cancel**. Saving returns the card to Pending with "Edited by you".
  3. **Approving:** the Approve button keeps its width, shows a spinner and "Approving..." and is disabled.
  4. **Approved:** solid ok border on tint, "Approved by you · just now", and an **Undo** link for 10s (plus the undo toast).
  5. **Rejected:** collapsed to one muted line, summary struck through, "Rejected · **Restore**".
  6. **Blocked by rules:**
     - Red border, lock icon, no Approve button.
     - Message: "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing."
     - **Change to Washing** applies the fix and returns the card to Pending. **Dismiss** collapses it.
  7. **Needs your answer:** amber, "I found 2 weavers named Rosa. Which one?", with chips "Rosa Pillco (Sígsig)", "Rosa Guamán (Cuenca)" and "Someone else..." (opens Add weaver).
  8. **Approval failed:**
     - Error banner: "Couldn't save this change. Someone may have updated this hat."
     - Buttons: **Refresh and retry**, plus **View log** (admins) or "Reference: req_8f2a" with a copy icon (members).
     - Approvals are optimistic and revert to this state on failure.
- **When every card is resolved:** completion card "All done. 3 approved, 1 rejected." with **View updated hats** and **Write another note**, plus the toast "3 changes saved."
- **Empty state:** "No proposals yet. Hold the mic and tell me what happened, and I'll prepare changes for you to approve."
- **Keyboard:** `/` focuses the composer; `A` / `R` / `E` act on the focused card; `Esc` closes.

**Today:** 2×2 tiles.
- Hats in progress 12, Finished this week 5, Waiting for review 3, Flags to check 1 (warn style).
- Each tile opens Hats pre-filtered.

**Recent activity:**
- Shows the last 10 events (icon, text, actor · relative time, absolute time in the tooltip). Each item links to its hat.
- Admins get **View all in Logs**. Members get no link.

**First run** (after sign-up), replacing Today and activity:
- A card with the woven frame: "Let's add your first hat", "n of 3 done".
- Auto-ticking checklist:
  - **Add a weaver** with the **Add weaver** button.
  - **Send your first voice note** with the primary **Try it now** button (starts recording) and the "Use an example" link.
  - **Share a passport**, disabled until the first hat exists.

**Manual create dialog:**
- "Add a hat manually", with the note "Prefer typing a note? The assistant can do this for you."
- Fields:
  - Weaver (+ Add new weaver)
  - Grade (segmented)
  - Rows per inch (required, 6 to 40)
  - Straw color (Natural / Bleached / Dyed)
  - Size cm (52 to 64, optional)
  - Price USD (optional)
  - Notes
- Live validation.
- **Create hat** shows "Creating..." while loading; success shows the toast "TQ-8B2N4 created." with a View action.

### Public passport (`/hat/[code]`), mobile-first, no app shell
**Top bar and footer:**
- 64px top bar: logo (links to the landing page); on the right, **Log in** or the avatar.
- Footer: "Powered by Toquilla Trace" and **Report a problem**.

**Verified:**
1. **Certificate:**
   - 10px woven-texture frame around a `--cream` card.
   - Animated seal: 96px ring with a filled `verified` icon in `--ok`.
   - "VERIFIED AUTHENTIC" (12px caps, tracking .14em), "Recorded by Taller Pillco, Cuenca" (Newsreader 22), "Finished Oct 2, 2026".
   - Hat code: mono `TQ-9A1M8`.
2. **Hero:**
   - 4:3 photo placeholder.
   - Grade label "Superfino" (huge serif) and "Hand-woven by **Manuel Delgado** in Pile, Manabí".
   - On desktop, inline buttons: **Claim this hat**, **Share** (menu: Copy link / Show QR), **Ask about this hat**.
3. **Specs strip:**
   - Rows per inch 32, Grade, Straw Natural, Size 58 cm. Price shows only if the workshop enabled it.
   - The grade tile has a "What does this mean?" tooltip: "Superfino means 25+ rows per inch. Fewer than 1 in 100 hats reach this grade." It opens on tap and on hover.
4. **Story timeline:** vertical, 5 stages with dates and descriptions (e.g. "Weaving: May 12 to Sep 10, about 4 months of hand-weaving", "Blocking: shaped on a wooden form"). A Superfino takes months; a short weaving time is itself an anomaly flag.
5. **Weaver card:** initials avatar, "Weaving since 1985", bio, "Other hats by Manuel: 4".
6. **Ownership card:** the chain plus a text line with no personal names (e.g. "Owned by a verified buyer since Oct 10, 2026").

**Mobile bottom bar:** **Claim this hat** (fills the remaining width, 50px), Share (native share sheet), Ask. After claiming, it shows "Registered to you".

**Who sees Claim (revision 2):**
| Viewer | Claim button | Ownership line |
|---|---|---|
| The buyer the hat was transferred to (logged in) | Yes | "Transferred to you on Oct 10, 2026. Claim it to register it in your name." |
| Logged out | Yes (opens "Log in to claim this hat") | "Transferred to a buyer on Oct 10, 2026. Log in to claim it if it's yours." |
| Anyone else (e.g. someone scanning the tag in a shop) | **No.** The mobile bar shows Share + a full-width Ask | "Transferred to a buyer on Oct 10, 2026. Waiting for them to claim it." |
| The owner, after claiming | "Registered to you" | "Registered to you since Oct 18, 2026" |

The concierge's "Claim this hat" button follows the same rule.

**Claim flow:**
- **Logged out:** the dialog "Log in to claim this hat" with Log in / Create account; the user returns to the passport afterwards.
- **Logged in and transferred to this email:** "Claim TQ-9A1M8 as yours?" with Cancel / **Claim** ("Claiming..."). Success shows "This hat is now registered to you." with the stamp animation.
- **Not transferable to this user:** the button is disabled, with the tooltip "Only the person this hat was transferred to can claim it."

**Other states:**
- **Not verified:**
  - Red-bordered card "We can't verify this hat": "The code TQ-ZZZZZ isn't in our records. It may be mistyped, or the hat may not be genuine."
  - **Try another code** reveals an inline code input with the same validation; **Report a problem**.
  - Below: "How to spot a real Panama hat", 3 tips.
- **Archived:** muted banner above the verified content: "This hat was archived by its workshop. Its record is still valid."
- **Loading:** skeletons for the certificate and timeline.

**Buyer concierge** (read-only AI):
- **Entry and panel:** a desktop FAB (56px, "Ask about this hat") opens a 400px right panel; on mobile it opens from the bottom bar as a near-full-height sheet.
- **Header:** "Ask about TQ-9A1M8" with "Answers come only from this hat's record", a New chat icon and a close ×.
- **Intro:** "Hi! I can answer questions about this hat using its verified record. What would you like to know?"
- **Suggested questions:** "Is this hat real?", "Will it fit a 58 cm head?", "Is it good for golf?", "How do I care for it?", "Who made it?". After each answer, 3 not-yet-asked suggestions show.
- **Bubbles:**
  - User bubbles are right-aligned in `--accent`; assistant bubbles are left-aligned with the sparkle avatar.
  - **Source pills:** "From this hat's passport · Size" (ok tint) or "General care advice" (surface2).
  - Each answer has Copy (shows "Copied!"), Helpful and Not helpful toggles. Not helpful reveals an optional "What was wrong?" input with Send.
- **Typing indicator:** 3 bouncing dots and "Checking the record...".
- **Special replies:**
  - Unknown: "That isn't in this hat's record. You could ask the workshop directly." with a **Contact the workshop** mailto link.
  - Change request: "I can only read this hat's record, not change it." with a **Claim this hat** button.
  - Error: "I couldn't answer that. **Try again**".
  - Rate limit: banner "You've asked a lot of questions. Try again in a minute." with the composer disabled.
- **Composer:** grows from 1 to 4 lines, max 300 characters; the counter appears after 250.
- **Footer:** "AI answers can be wrong. The verified record above is the source of truth."

### Hats list (`/hats`), mobile-first
**Header:**
- "Hats" with the count ("24 hats", or "n of 24 hats" when filtered).
- Buttons: **Export CSV** (downloads; toast "Exported 24 hats."), "🎙 Just tell it" (desktop), and **+ New hat**.

**Toolbar:**
- Search "Search by code or weaver" with a clear × and debounce.
- Sort: Last updated, Code, Grade, Stage.
- View toggle Table / Cards, desktop only. Cards are forced when the window is narrower than the table needs.
- Filter chips: Stage, Grade, Weaver, Owner (Workshop / Seller / Buyer). Each is a multi-select popover with checkboxes, counts, **Clear** and **Done**, and becomes a bottom sheet on mobile. Active chips show a count badge.
- "Flagged only" toggle chip, and **Clear filters** while any filter is active.

**Table:**
- Columns: checkbox, Code (mono + copy icon, always visible), Grade badge, Rows/in, Weaver + village, Stage (5-dot mini stepper + label), Owner, Flags (warn pill with count; tap opens a list), Updated (relative; absolute in the tooltip), ⋯ menu.
- Clicking a row opens Hat detail.
- **Row menu:**
  - Open.
  - Advance to [next]. Disabled with a visible reason line ("This hat is finished." / "Only the current owner can change the stage.").
  - Copy public link (toast "Link copied.").
  - Show QR.
  - Transfer ownership...
  - Archive (destructive confirm: "Archive TQ-2C5P0? It will be hidden from lists but its passport stays valid.").

**Cards (mobile):** code, grade, copy, ⋯, weaver/village/rows, stepper, the flag text inline, owner and updated.

**Bulk bar:**
- A dark floating bar: "n selected", **Advance stage**, **Export selected**, **Clear selection**.
- Advance stage is enabled only when all selected hats share a stage; otherwise it is disabled with "Select hats in the same stage" (shown as text on mobile).

**Pagination:** "1 to 20 of 24" with Previous / Next and 20/50/100 per page. Mobile uses **Load more**.

**States:** skeleton rows; "No hats match these filters." with Clear filters; "No hats yet." with Add your first hat.

**Mobile mic:** a 64px floating mic (bottom right, above the tab bar) opens the Workshop composer already recording.

### Hat detail (`/hats/[code]`), mobile-first
**Header:**
- Breadcrumb "Hats / TQ-7F3K2".
- Code in large mono with a copy button (toast "Code copied.").
- Badges: grade, stage, Verified, flag count, Archived.
- **Desktop actions:** "🎙 Tell it", **Advance to [next stage]** (label always names the next stage; disabled reasons in the tooltip), **Share**, and ⋯ (Edit details, Transfer ownership..., Archive; admins also get View in agent runs and View logs for this hat).
- **Mobile:** a bottom bar with Share and **Advance to …**; the disabled reason shows above it as text. The floating mic sits above the bar and pre-tags the note "About TQ-7F3K2".

**Advance dialog:**
- Title "Move TQ-7F3K2 to Bleaching?", the mini stepper and "This can't be undone. Stages only move forward."
- Optional note field "Add a note (optional)".
- Buttons: **Cancel** / **Move to Bleaching**. Success toast: "TQ-7F3K2 moved to Bleaching."

**Flags panel** (warn card, shown only when flags exist):
- Each flag shows its text and who raised it.
- **Fix grade** opens edit with the grade control highlighted.
- **Mark as reviewed** opens an inline required reason field; the flag then turns muted: "Reviewed by Xavier: 'Recounted, it's 28.'"

**Production timeline:**
- Horizontal 5 columns on desktop, vertical on mobile.
- **Done steps:** 30px `--ok` circle with a check, date, "Approved by Xavier", and a source tag ("AI proposal" dashed accent / "Manual"). Tapping one opens a popover with the timestamp, approver, the original note (if from AI) and **View trace**.
- **Current step:** 3px accent ring and "In progress since Oct 14 (4 days)".
- **Upcoming steps:** hollow and muted.

**Details card:**
- Read-only grid: Grade, Rows per inch, Straw color, Size, Price, Weaver (link), Workshop, Created.
- **Edit details** turns it into a form with the same validation as manual create; stage is not editable.
- **Save** is disabled until something changes; **Cancel**.
- Navigating away with changes asks "Discard unsaved changes?" with **Keep editing** / **Discard**.

**Ownership chain:**
- Chips Workshop → Seller → Buyer. The current owner is accent with a pin icon; past owners are solid, with dates; future slots are dashed.
- **Transfer ownership...** opens the transfer dialog:
  - Title "Transfer TQ-7F3K2", radio cards To a seller / To a buyer, validated email, optional message.
  - Warning: "You won't be able to change this hat after transferring it."
  - Destructive **Transfer** button. Success toast: "Transfer recorded. They can claim it from the hat's passport."

**Tabs:** **Activity** (events, newest first) for everyone; **Logs** (compact mono rows, each with "Open in Logs") for admins only. The timeline popover's **View trace** link is admin only.

**Share dialog:**
- Read-only public URL with **Copy link** (shows "Copied!" for 2s).
- QR code with **Download PNG**.
- Link preview card.
- Toggle "Show price on public page" (default off).

### Weavers (`/weavers`), mobile-first
**Header and grid:**
- "Weavers" with the count and **+ Add weaver** (a FAB on mobile), plus a "Search weavers" box.
- Grid of 280px cards:
  - 48px initials avatar (Newsreader on `--straw`), name, "Village, Province".
  - Specialty grade badges, hats count, "Weaving since 1998".
  - ⋯ menu: Edit, View their hats (opens Hats filtered), Remove (disabled with the visible reason "Weavers with hats can't be removed.").

**Add/Edit dialog:**
- Fields:
  - Full name* and Village* (required)
  - Province (Azuay / Cañar / Manabí / Other)
  - Specialty (toggle chips)
  - Weaving since (optional)
  - Bio (200 characters with a counter)
- Checkbox "Show this weaver's name on public passports", with a live preview line. When off, the passport reads "A master weaver from Sígsig".
- Duplicate warning: "A weaver named Rosa Pillco from Sígsig already exists. Add anyway?"

**Empty state:** "No weavers yet. Add the artisans you work with so the assistant can recognize them in your notes."

### Agent runs (`/runs`), desktop-first, admins only
**Toolbar and summary:**
- Toolbar: "Search notes", Status (Proposed, Partially approved, Approved, Rejected, Failed, Stopped), Agent (Workshop agent / Buyer concierge), Date (Today / Last 7 days / Last 30 days / Custom date range), Clear filters.
- Summary tiles: Runs 42, Success rate 93%, Avg latency 2.4 s, Avg cost $0.005, Rule blocks 6.

**Table:**
- Columns: Started, Agent badge, User, Input (truncated, full text in the tooltip), Status pill, Tools, Tokens in/out, Latency, Cost, chevron. Numbers are mono and right-aligned.
- Below 768px, rows become cards.

**Run detail** (right drawer, `min(760px, 92vw)`):
- **Header:** run ID (mono + copy), status, agent, started/finished times, latency, tokens, cost, model.
- **Buttons:** **Copy run as JSON**, **Open related hats** (menu of codes), **View logs for this run** (Logs filtered by request ID).
- **Input:** the note as a quoted block.
- **Steps:** a numbered vertical timeline of collapsible cards, with **Expand all** / **Collapse all**.

  | Step | Contents |
  |---|---|
  | Model call | Tokens, latency, assistant text |
  | Tool call | Mono name, tag **Read** (info) or **Write: proposed only** (warn), Input/Output JSON blocks (syntax-highlighted, each collapsible with copy), duration |
  | Rule check | Green "Allowed: …" or red "Blocked: stage skip (Weaving → Finished)" |
  | Proposal | Compact read-only cards, dashed |
  | Human decision | "Approved by Xavier · 10:42:13", with a before/after diff table of edited fields |
  | Error | Red, with an error JSON block |

**States:** loading and empty for both the table and the detail.

**Members** who open `/runs` or `/logs` see a centered card: shield icon, "{Agent runs|Logs} is for admins", "This page shows technical details from every workshop, so only Toquilla Trace admins can open it. If something isn't working, share the reference from the error message with support.", and **Go to Workshop**. The backend must return 403 as well; hiding the link is not the security boundary.

### Logs (`/logs`), desktop-first, admins only
**Toolbar:**
- Search "Search messages, actions or IDs".
- Filters: Level (Debug/Info/Warn/Error), Source (Web app, Edge function, Workshop agent, Buyer concierge, Database), Action (searchable, because there are more than 7 options), User.
- Time range (15 min / 1 h / 24 h / 7 days / Custom), Clear filters.
- **Live** toggle, **Export JSON** (current filtered rows).

**Level chips:** "Errors n", "Warnings n", "Info n". Clicking one filters by that level.

**Table:**
- Sticky header. Columns: Time (mono `10:42:13.512`, full date in the tooltip), Level pill, Source, Action (mono), Message, User, Request ID (truncated + copy), ms.
- Error rows have a faint `--err-tint` background.
- Density toggle: Compact (36px) / Comfortable (48px).

**Live mode:** new rows stream in at the top with a 1.6s accent flash. If the user has scrolled down, rows queue behind a "↑ Paused, 12 new rows" pill; clicking it scrolls to the top and flushes the queue.

**Detail panel** (440px inline at ≥1180px, otherwise an overlay; full screen on mobile):
- Header: level and action, with ↑ ↓ (also the arrow keys) to step through rows, and close.
- Fields: message, timestamp, source, user, request ID + copy, hat link, run link, duration.
- Error block: message and stack in mono on `--code`.
- **Payload:** highlighted JSON with Expand all / Collapse and Copy (shows "Copied!").
- **Copy as prompt for an AI assistant** (primary). It copies a ready-made prompt (action, level, source, time, request ID, hat, run, duration, message, payload, error and stack, plus an instruction to explain the cause and propose a minimal fix). Toast: "Copied. Paste it into your AI assistant."
- **Copy request ID** and **Show all rows for this request** (filters the table by request ID).

### Settings (`/settings`)
**Tabs:** Profile, Workshop, Appearance (max width 760).
- **Profile:** Name, Email (read-only, dashed, "Contact support to change"), and **Change password** (dialog: Current, New with the hint "At least 8 characters", Confirm; errors for wrong current and mismatch; toast "Password updated.").
- **Workshop:** Workshop name, City, Public contact email (validated; used by the concierge's Contact link), switch "Show prices on public passports by default".
- **Appearance:** Theme Light / Dark / System (applies immediately and persists); Density Compact / Comfortable.

**Saving:**
- **Save changes** is disabled until something changes, shows "Saving..." while saving, and ends with the toast "Saved."
- **Discard** appears while there are changes.
- Leaving a tab or route with unsaved changes asks for confirmation.

**Danger zone** (bottom of Profile): **Delete account** opens a dialog that enables **Delete forever** only after the user types "Taller Pillco".

### Landing and auth, mobile-first
**Landing:**
- **Top bar:** logo; on the right, **Verify a hat** (desktop; scrolls to the box and focuses its input) and **Log in**.
- **Hero:** the headline "Every real Panama hat has a story. Now it has a passport." and the subhead "No forms, no typing. Just tell it what happened in the workshop, and the AI does the paperwork while you approve every change."
- **Hero buttons:** **Get started** (primary, opens Sign up) and **See a sample passport** (`/hat/TQ-9A1M8`).
- **Before/Now strip:** two equal cards.
  - Before: muted, red label, struck-through text "Open app, fill 8 fields, about 5 min".
  - Now: accent border on tint, mic badge, "Hold the mic, talk, about 10 s".
- **Woven band:** 14px.
- **Verify box:** "Have a hat code?", a 52px mono input with placeholder "TQ-XXXXX", and **Verify**, disabled until the format is valid.
- **Feature cards:** "Just tell it: a 10-second voice note instead of a 5-minute form", "You approve every change", "Buyers verify in one tap".
- **Footer:** "Made in Cuenca, Ecuador", About, Privacy.
- **Mobile bottom bar:** Verify a hat + Get started.

**Log in:**
- Title "Welcome back".
- Email (placeholder "you@workshop.com") and Password with an eye toggle (aria-label "Show password" / "Hide password").
- **Forgot password?** link and **Log in** ("Logging in..."). On mobile the primary button is in the bottom bar.
- Errors:
  - Inline: "Enter your email." / "That doesn't look like an email." / "Enter your password."
  - Banners: "Email or password is incorrect." (the password is cleared); "Too many attempts. Try again in 1 minute."; "Couldn't reach the server. Check your connection and try again." with **Retry**.

**Sign up:**
- Title "Create your workshop account".
- Fields: Your name, Workshop name (placeholder "Taller Pillco"), City (Cuenca, Montecristi, Sígsig, Pile, Other), Email, Password (the hint "At least 8 characters" turns into a green check once met), and the required checkbox "I agree to the terms".
- Existing email error: "This email already has an account. **Log in instead?**"
- **Create account** shows "Creating account..."; success opens the Workshop in its first-run state with the toast "Welcome to Toquilla Trace!"

**Forgot password:** **Send reset link**. Success replaces the form with "If an account exists for that email, we sent a reset link." and **Back to log in**.

**Other pages:**
- **404:** "Page not found", "This page doesn't exist or was moved.", **Go home** (logged out) or **Go to Workshop** (logged in).
- **Page error:** "Something went wrong", "We couldn't load this page. The error was saved to the log.", **Try again**, **Go to Workshop**, and a mono "Request ID: req_8f2a…" with a copy button.
- **Session expired:** "Your session expired. Log in again to continue.", single **Log in** button; keep the current route as the return URL.
- **Offline banner** (across the top of the app): "You're offline. Changes will fail until you reconnect." with a dismiss button.

---

## Interactions and behaviour (global)
- **Buttons:**
  - Every button has default, hover, focus (2px `--accent` ring, offset 2), pressed (translateY 1px) and disabled (opacity .45, not-allowed cursor) states.
  - Loading state: keep the width, show a spinner and an "…ing" label, and disable the button.
- **Inputs:**
  - Labels are always visible above the field.
  - States:

    | State | Style |
    |---|---|
    | Focus | Accent border + 3px `--accent-tint` ring |
    | Error | `--err` border + error icon + message below |
    | Disabled | `--surface2` background |
    | Read-only | Dashed border, muted text |
- **Selects / multi-selects:** show the selected count, add search above 7 options, and always offer Clear.
- **Copy actions:** an inline "Copied!" swap for 2s, or a toast.
- **Relative times everywhere,** with the absolute time in a tooltip.
- **Confirmation is required only for:** advancing a stage, transfer, archive, delete account, discarding proposals and discarding unsaved edits.
- **Optimistic updates for approvals:** revert to the Approval failed state on error.
- **Keyboard:** `/` composer, ⌘/Ctrl+Enter send, A/R/E on the focused proposal, `G` then `H` → Hats, `G` then `L` → Logs, `Esc` closes any menu, drawer or dialog (and cancels an active recording).
- **Accessibility:**
  - WCAG AA contrast.
  - Icon + text for every state.
  - 44px minimum targets.
  - aria-labels on icon-only buttons.
  - Focus trap in dialogs.
  - `aria-live` regions for agent steps, the live transcript and toasts.

## State management (suggested)
- **Voice composer** state machine:
  - States: `idle → (perm | blocked | unsupported) → recording{hold|tap, elapsed, words[{w, low, confirmed}]} → review{note, lowWords, lost?} → sending`. Silence goes to `silence`.
  - Use the Web Speech API (`SpeechRecognition`, `lang: 'es-EC' | 'en-US'`, `interimResults: true`) or a server STT with streaming partials. Map word confidence below a threshold to `low`.
  - Never auto-send.
  - Store whether the note was voice or typed (for "You said:" / "You wrote:") and the optional `hatTag`.
- **Agent run:** `idle | running{step} | done | failed | stopped`, streamed steps via SSE.
- **Proposals:** each item is `{id, type, status: pending|editing|approving|approved|rejected|dismissed|blocked|question|failed, conf, edited, draft, payload}`. Approve is optimistic, with a 10s undo window.
- **Data entities:**

  | Entity | Fields |
  |---|---|
  | `Profile` | userId, name, workshopId, role (member/admin) |
| `Hat` | code, grade, rows, straw, size, price, weaverId, stage(0 to 4), owner(workshop/seller/buyer), flags[], archived, version (used for optimistic locking; the "Row was updated by another user" error) |
  | `Weaver` | name, village, province, spec[], since, bio, showName |
  | `Run` | id, agent, user, input, status, steps[], tokens, latency, cost |
  | `LogRow` | ts, level, source, action, msg, user, requestId, hat, runId, durationMs, payload, error |
- **Preferences:** theme and density persisted per user (the prototype uses `localStorage['tt-theme']`).

## Sample data
Use this data in fixtures and seeds.

**Workshop and user:** Taller Pillco, Cuenca. User Xavier, xavier@tallerpillco.com.

**Weavers:**
| Name | Village | Province | Since | Specialty |
|---|---|---|---|---|
| Rosa Pillco | Sígsig | Azuay | 1992 | Fino |
| Rosa Guamán | Cuenca | Azuay | n/a | Standard |
| Manuel Delgado | Pile | Manabí | 1985 | Superfino |
| Carmen Quizhpi | Cuenca | Azuay | n/a | Fino |

**Hats:**
| Code | Grade | Rows/inch | Weaver | Stage | Owner / notes |
|---|---|---|---|---|---|
| TQ-7F3K2 | Fino | 18 | Rosa Pillco | Washing | Workshop |
| TQ-9A1M8 | Superfino | 32 | Manuel Delgado | Finished | Verified; buyer |
| TQ-2C5P0 | Standard | 10 | Rosa Guamán | Weaving | n/a |
| TQ-4K9D1 | "Superfino" | 18 | Carmen Quizhpi | Blocking | Flagged |
| TQ-8B2N4 | Fino | 20 | Carmen Quizhpi | Washing | n/a |

**Agent note (revision 2):** "Doña Rosa terminó 3 finos de 18 hileras. El TQ-7F3K2 ya está lavado, pasa a blanqueo. El TQ-2C5P0 ya está listo. Y el de Carmen dice superfino pero tiene 18 hileras."

Every proposal comes from something that was said, and each card's **Why?** quotes it:
- Create 3 Fino hats at 18 rows/inch → needs your answer (2 Rosas found). Quotes "terminó 3 finos de 18 hileras".
- Advance TQ-7F3K2 from Washing to Bleaching → pending. Quotes "el TQ-7F3K2 ya está lavado, pasa a blanqueo".
- Move TQ-2C5P0 to Finished → blocked by rules (it's still at Weaving). Quotes "el TQ-2C5P0 ya está listo".
- Flag TQ-4K9D1 for grade mismatch → pending. Quotes "el de Carmen dice superfino pero tiene 18 hileras".

Assistant summary: "I understood: Rosa finished 3 Fino hats (18 rows per inch), TQ-7F3K2 is washed and goes to bleaching, TQ-2C5P0 is done, and Carmen's hat may be graded wrong. I prepared 4 actions for you to review."

Spoken hat codes ("TQ-7F3K2") are marked low-confidence in the live transcript, because speech-to-text often mishears letter and digit codes. The backend should also fuzzy-match codes against open hats.

Model shown in run details and logs: `claude-opus-5-5` (as built: `gemini-2.5-flash-lite`, see the note at the top).

## Prototype notes (revision 2)
- Every note returns the same 4 canned proposals. The real agent derives them from the note.
- The prototype runtime calls `componentDidUpdate(prevProps)` without the previous state. The Workshop file now tracks previous state itself, which fixed a console error and the "n changes saved." toast that never fired.
- Revision 2 changes were made directly in the HTML by the developer (not by Claude Design). Backups of revision 1 are kept outside the repo.

## Assets
- **No raster assets.** The hat photo is a straw-striped 4:3 placeholder; QR codes are placeholders (generate real ones, e.g. with `qrcode`).
- **Fonts:** Google Fonts (Newsreader, Instrument Sans, JetBrains Mono).
- **Icons:** Material Symbols Rounded.
- **Imagery:** use real hat photography when available. Never use folkloric illustrations.
