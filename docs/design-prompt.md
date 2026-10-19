# Design prompt for Claude Design: Toquilla Trace

> **Historical.** This is the prompt that produced the first version of the design. The source of truth is now [design_handoff_toquilla_trace/README.md](../design_handoff_toquilla_trace/README.md) (revision 2: member/admin roles, corrected sample data, claim rules). Some sample data below is outdated on purpose, to show what changed.

Design a complete, high-fidelity, responsive web app called **Toquilla Trace**. Design **every screen, every button, every interaction and every state** described below. Deliver each screen at desktop (1440px) and mobile (390px) widths, plus a component sheet. Where this prompt gives exact copy (labels, placeholders, messages), use it word for word.

---

## 1. Product overview

Toquilla Trace gives every genuine Ecuadorian toquilla straw ("Panama") hat a digital passport that follows it from the weaver to the buyer.

- **Problem:** fake "Panama hats" made of paper straw are sold as Ecuadorian, and real weavers get no credit. Small workshops in Cuenca and Montecristi don't fill in web forms; they send short, messy notes in Spanish.
- **Solution:** an AI agent reads those notes and **proposes** record changes. A person **approves** them, and the system **enforces the rules** (no skipped stages, a grade must match its weave count). Every hat gets a public passport page that buyers can verify and ask questions about.
- **Core idea: "Just tell it."** Tracking tools fail because typing takes too long, so updates get skipped. Here, people say the update in about 10 seconds and the AI does the paperwork. Talking must always be the fastest, most visible path; typing is the backup.
- **Design principle:** AI actions must always be transparent. The user always sees what the AI understood, what it proposes, what the system allowed or blocked, and who approved what. Nothing the AI does is saved without a human click.

### Roles
1. **Workshop member** (logged in): records hats, manages weavers, uses the AI agent, approves proposals, transfers hats.
2. **Buyer** (anonymous or logged in): views a public hat passport, asks the concierge questions, and can claim ownership once logged in.
3. **Builder** (logged in, same account type in this demo): views agent runs and the system log for debugging.

### Platform and device priority
This is a **responsive web app** (no native app). Design every screen for both sizes, but optimize each one for its main user's device:

| Screens | Design first for | Why |
|---|---|---|
| Workshop dashboard, Hats, Hat detail, Weavers | **Mobile (390px)** | Workshop staff write notes on their phones, the way they use WhatsApp today |
| Public passport + buyer concierge, Landing, Login | **Mobile (390px)** | Buyers arrive by scanning a QR code on the hat's tag |
| Agent runs, Logs, Settings | **Desktop (1440px)** | Builders read dense tables and JSON on a big screen; mobile versions must still work |

On mobile-first screens, keep the primary action reachable with one thumb (bottom of the screen), and don't hide key actions behind hover.

### Domain rules the UI must reflect
- **Production stages, in fixed order:** Weaving → Washing → Bleaching → Blocking → Finished. A hat can only move one stage forward. It can never move backward or skip a stage.
- **Grades by rows per inch:** Standard 8 to 14, Fino 15 to 24, Superfino 25+. A mismatch between the claimed grade and the weave count is flagged.
- **Ownership chain:** Workshop → Seller → Buyer. Only the current owner can transfer a hat or advance its stage.
- **Hat codes** look like `TQ-7F3K2` (TQ, a hyphen, 5 uppercase letters and digits).
- **Anomalies** (warning flags): grade/weave mismatch, production faster than expected for the grade, a weaver not found.

---

## 2. Global elements (appear on all logged-in screens)

### 2.1 App shell
- **Desktop:** a left sidebar (240px, collapsible to a 72px icon rail with a toggle button at the bottom: "Collapse sidebar" / "Expand sidebar", with a tooltip when collapsed).
  - Top: the Toquilla Trace logo (a simple woven-square mark plus a wordmark). Clicking it goes to the Workshop dashboard.
  - Nav items with icon + label: **Workshop**, **Hats**, **Weavers**, **Agent runs**, **Logs**. Active item: accent background tint and bold label. Hover: subtle tint. Focus: visible focus ring.
  - A badge on **Workshop** with the count of pending proposals (e.g. "3"). A red dot on **Logs** when there are new errors in the last hour.
  - Bottom: the workshop name ("Taller Pillco, Cuenca") and the user avatar.
- **Mobile:** a top bar with the logo on the left and the avatar on the right, and a bottom tab bar with 5 tabs (Workshop, Hats, Weavers, Runs, Logs) using icon + short label. The active tab uses the accent color. The pending-proposals badge appears on the Workshop tab.

### 2.2 User menu (opens from the avatar)
- Shows the name, email and workshop name.
- Items: **Profile & workshop** (goes to Settings), **Theme** (a 3-way segmented control: Light / Dark / System), **Help** (opens the help modal, 2.6), **Log out**.
- **Log out** shows a confirmation dialog only if a proposal batch is waiting: title "Log out?", body "You have 3 proposals waiting for review. They'll still be here when you come back.", buttons **Cancel** and **Log out**. Otherwise it logs out directly and returns to the login screen with a toast "You've been logged out."
- The menu closes on outside click, the Esc key, or picking an item.

### 2.3 Toasts (notifications)
- Position: bottom-right on desktop, top-center on mobile. Auto-dismiss after 5 seconds, pause on hover, with a close "×" button. Stack up to 3.
- Variants: success (check icon), info, warning, error (with a **Retry** action where relevant), and an **Undo** variant (with an **Undo** button and a 10-second countdown bar).
- Design every variant.

### 2.4 Dialogs (modals)
- Centered on desktop (max 520px wide), bottom sheet on mobile with a drag handle.
- Header with a title and a close "×" button; body; footer with secondary on the left and primary on the right. Destructive primary buttons use the error color.
- Close via "×", the Esc key, or clicking the backdrop (except for destructive confirmations, which only close via the buttons). Focus is trapped inside while open.

### 2.5 Loading, empty and error patterns
- **Skeletons** for tables, cards and the passport page while data loads.
- **Inline spinners** inside buttons during actions: the button keeps its width, the label changes (e.g. "Approving..."), and it is disabled.
- **Page error state:** an illustration-free icon, title "Something went wrong", body "We couldn't load this page. The error was saved to the log.", buttons **Try again** and **Go to Workshop**, plus a small monospaced "Request ID: req_8f2a..." with a copy icon.
- **Offline banner** across the top: "You're offline. Changes will fail until you reconnect." with a dismiss button.
- **Session expired dialog:** "Your session expired. Log in again to continue." with a single **Log in** button that keeps the current page as the return destination.

### 2.6 Help modal
- Title "How Toquilla Trace works".
- Three short numbered steps with icons: "1. Say what happened in the workshop, in Spanish or English. Typing works too." "2. Review what the AI proposes. Nothing is saved until you approve." "3. Share the hat's passport so buyers can verify it."
- A small table of the stage order and grade ranges.
- Button **Got it**.

### 2.7 Keyboard shortcuts (show them in tooltips and in the help modal)
- `/` focuses the agent note box. `Cmd/Ctrl + Enter` sends a note. `A` approves the focused proposal card, `R` rejects it, `E` edits it. `G then H` goes to Hats, `G then L` goes to Logs. `Esc` closes any menu, drawer or dialog.

### 2.8 Not found (404)
- Title "Page not found", body "This page doesn't exist or was moved.", button **Go to Workshop** (logged in) or **Go home** (logged out).

---

## 3. Screens

### 3.1 Landing + authentication

**Landing (logged out, route `/`)**
- Top bar: logo on the left; on the right, **Verify a hat** (text button that scrolls to the verify box) and **Log in** (secondary button).
- Hero: headline "Every real Panama hat has a story. Now it has a passport." Subhead "No forms, no typing. Just tell it what happened in the workshop, and the AI does the paperwork while you approve every change." Buttons: **Get started** (primary, opens Sign up) and **See a sample passport** (secondary, opens `/hat/TQ-9A1M8`).
- **Verify a hat** box: label "Have a hat code?", input with placeholder "TQ-XXXXX" (auto-uppercases, auto-inserts the hyphen, max length 8), button **Verify**.
  - Validation: invalid format shows inline error "Codes look like TQ-7F3K2." The button stays disabled until the format is valid.
  - On submit: navigates to the passport page.
- Three feature cards: "Just tell it: a 10-second voice note instead of a 5-minute form", "You approve every change", "Buyers verify in one tap". Under the hero, a small before/after strip: "Before: open app, fill 8 fields, about 5 min" vs "Now: hold the mic, talk, about 10 s".
- Footer: "Made in Cuenca, Ecuador", small links **About** and **Privacy** (static).

**Log in (route `/login`)**
- Card with title "Welcome back".
- Fields: **Email** (placeholder "you@workshop.com"), **Password** (with a show/hide eye toggle button, aria-label "Show password" / "Hide password").
- Link **Forgot password?** under the password field.
- Primary button **Log in** (loading label "Logging in...").
- Below: "New here? **Create an account**" link.
- Errors:
  - empty field on submit: inline "Enter your email." / "Enter your password."
  - bad email format: "That doesn't look like an email."
  - wrong credentials: a banner at the top of the card "Email or password is incorrect." (fields keep their values, password is cleared)
  - too many attempts: banner "Too many attempts. Try again in 1 minute."
  - network failure: banner "Couldn't reach the server. Check your connection and try again." with **Retry**.

**Sign up (route `/signup`)**
- Title "Create your workshop account".
- Fields: **Your name**, **Workshop name** (placeholder "Taller Pillco"), **City** (select: Cuenca, Montecristi, Sígsig, Pile, Other), **Email**, **Password** (with show/hide, and a strength hint under it: "At least 8 characters"), and a checkbox "I agree to the terms" (required).
- Primary button **Create account** (loading "Creating account...").
- Errors: required fields, "This email already has an account. **Log in instead?**", password too short.
- Success: goes to the Workshop dashboard in its first-run empty state, with a toast "Welcome to Toquilla Trace!"

**Forgot password (route `/forgot`)**
- Field **Email**, button **Send reset link**. Success state replaces the form: "If an account exists for that email, we sent a reset link." with a **Back to log in** link.

### 3.2 Workshop dashboard (route `/workshop`, the main screen)

Layout: on desktop, the agent composer and the proposal review take the main column (about 2/3), and a right column (about 1/3) shows "Today" stats and recent activity. On mobile, everything stacks: composer, proposals, stats, activity.

**Page header**
- Title "Workshop", subtitle "Good morning, Xavier" (time-based greeting).
- Right side: button **+ New hat manually** (secondary, opens the manual create dialog, 3.2.6).

#### 3.2.1 Agent composer (voice first, typing as backup)
- A card titled "Just tell me what happened" with the subtitle "Hold the mic and talk, like a WhatsApp voice note."
- **Voice is the main input.** Workshop staff already send WhatsApp voice notes, so talking must be the easiest path.
  - **Big round mic button** (at least 72px, accent color, mic icon) as the primary action. On mobile it sits centered at the bottom of the screen, within thumb reach. On desktop it sits to the left of the Send button. Label under it: "Hold to talk" (mobile) / "Click to talk" (desktop).
  - **Two ways to record:** press and hold (release to stop), or tap once to start and tap again to stop. Swiping left while holding cancels ("Slide to cancel" hint, like WhatsApp).
  - **Recording state:** the button turns red and pulses, a live waveform and a timer ("0:07") appear, and a max length of 2:00 is shown ("Up to 2 minutes"). At 1:50 the timer turns amber.
  - **Live transcript:** words appear in the text box as the person speaks (in light gray while unconfirmed, then normal color).
  - **After recording, nothing is sent automatically.** The transcript stays in the text box, editable, with the label "Check the transcript, then send." and buttons **Send** (primary), **Re-record** and **Discard**. This keeps a human check on speech-to-text mistakes before the agent sees the text.
  - **Low-confidence words** in the transcript are underlined in amber with a tooltip "Not sure I heard this right." Tapping one selects it so it's easy to retype.
  - **Language:** a small toggle chip "Español (Ecuador) / English", default Español. The transcript uses the chosen language.
  - **Mic permission states:** first use shows a short explainer "We need your microphone to turn your voice into a note. Audio isn't stored." with **Allow microphone**. If blocked: "Microphone is blocked. Allow it in your browser settings, or type your note instead." with a **How to allow** link. If the browser doesn't support voice input: hide the mic button and show "Voice isn't supported in this browser. Type your note instead."
  - **Errors:** "Couldn't hear anything. Try again closer to the phone." (silence), "Voice input stopped. Your text so far is saved." (connection lost).
- **Mic everywhere (mobile):** on the Hats and Hat detail screens, a small floating mic button (bottom right, above the tab bar) opens the composer already recording, so an update can be spoken from any workshop screen. On Hat detail, the note is pre-tagged with that hat's code.
- **Typing is the backup:** a **Type instead** link (keyboard icon) under the mic button expands the text box with the keyboard focused. On desktop the text box is always visible.
- Multiline textarea (auto-grows from 3 to 8 lines, then scrolls). Placeholder rotates between examples every 4 seconds while empty:
  - "Doña Rosa terminó 3 finos, 18 hileras, mañana van a blanqueo"
  - "TQ-7F3K2 ya está lavado"
  - "Manuel entregó un superfino de 32 hileras"
- Below the textarea:
  - **Example chips** (clicking fills the textarea): "3 new finos from Rosa", "Move TQ-7F3K2 to washing", "A new superfino from Manuel".
  - Character counter "42 / 1000" (turns warning color above 900, error above 1000 with message "Keep notes under 1000 characters." and the send button disabled).
  - A language hint: "Spanish or English is fine."
  - **Attach** icon button (paperclip), disabled, with tooltip "Photos are coming soon."
  - **Send** primary button (icon + "Send", disabled when empty). Shortcut hint "⌘ Enter".
- **While the agent runs** (replaces the button area):
  - A progress line with live steps that appear one by one: "Reading your note..." → "Looking up weaver 'Rosa'..." → "Checking stage rules..." → "Preparing proposals...". Each completed step gets a check icon.
  - A **Stop** button (secondary). Clicking it cancels the run and shows info toast "Stopped. Nothing was saved."
  - The textarea is read-only and dimmed.
- **Agent failure state:** an error card inside the composer: "The assistant couldn't finish. Your note is still here." Buttons **Try again** and **View details** (opens that run in Agent runs).
- After a successful run, the note collapses into a quoted "You said:" (voice, with a small mic icon) or "You wrote:" (typed) bubble above the proposals, with an **Edit note** link that restores it to the textarea and discards the current proposals (confirmation: "Discard these proposals and edit your note?" **Cancel** / **Discard and edit**).

#### 3.2.2 Agent summary
- Directly under the quoted note: a small assistant bubble with an AI icon and the label "Assistant", giving a 1 to 2 sentence plain-language summary: "I understood: Rosa Pillco finished 3 Fino hats with 18 rows per inch, and they go to bleaching tomorrow. I prepared 4 actions for you to review."
- Metadata row in small muted text: "4 tool calls · 2.1 s · $0.004 · **View trace**" (link to the run detail).

#### 3.2.3 Proposal review panel (the most important UI)
- Header: "Review proposals (4)" with **Approve all valid (3)** primary button and **Reject all** text button. "Approve all valid" skips cards in error or question states.
- A thin legend: dashed outline = "Proposed by AI", solid = "Approved", red = "Blocked by rules".
- **Proposal card anatomy** (design each variant):
  - Top row: an action-type badge (**Create hat** / **Advance stage** / **Flag issue** / **Transfer**), the label "Proposed by AI" with a small sparkle icon, and a confidence chip ("High confidence" green, "Check this" amber).
  - Summary line in plain language: "Create 3 hats · Fino · 18 rows/inch · Weaver: Rosa Pillco (Sígsig)".
  - Detail line with chips for each field. For stage changes, a mini stepper: `Weaving ● → ○ Bleaching`.
  - An expandable "Why?" link that reveals the agent's reason: "Your note says 'terminó 3 finos'. 18 rows per inch matches Fino (15 to 24)."
  - Action buttons on the right (desktop) or a bottom row (mobile): **Approve** (primary, check icon), **Edit** (secondary, pencil icon), **Reject** (text button, x icon).
- **Card states (design all):**
  1. **Pending** (dashed outline, soft accent tint).
  2. **Editing:** the card expands into a form: Quantity (number stepper, 1 to 20), Grade (segmented: Standard / Fino / Superfino), Rows per inch (number input; the grade auto-suggests and a warning appears if they mismatch: "18 rows/inch usually means Fino."), Weaver (searchable select with "+ Add new weaver" at the bottom), Stage (select limited to the allowed next stage, other stages shown disabled with a tooltip "Stages can't be skipped"). Buttons **Save changes** and **Cancel**. Saving re-validates and returns to Pending with an "Edited by you" tag.
  3. **Approving** (spinner in the Approve button, "Approving...").
  4. **Approved** (solid outline, success tint, check icon, "Approved by you · just now", and an **Undo** link available for 10 seconds that triggers the Undo toast).
  5. **Rejected** (collapsed to one line, muted, strikethrough summary, "Rejected · **Restore**").
  6. **Blocked by rules** (red outline and tint, lock icon, no Approve button). Message: "Can't move TQ-2C5P0 from Weaving to Finished. Next allowed stage: Washing." Buttons **Change to Washing** (applies the fix and returns the card to Pending) and **Dismiss**.
  7. **Needs your answer** (amber outline, question icon). Example: "I found 2 weavers named Rosa. Which one?" Quick-reply chips: "Rosa Pillco (Sígsig)", "Rosa Guamán (Cuenca)", "Someone else...". Picking "Someone else..." opens the Add weaver dialog. Answering updates the card to Pending.
  8. **Approval failed** (error banner inside the card): "Couldn't save this change. Someone may have updated this hat." Buttons **Refresh and retry** and **View log**.
- After all cards are resolved: a completion state "All done. 3 approved, 1 rejected." with buttons **View updated hats** and **Write another note** (clears and focuses the composer). A success toast "3 changes saved."
- Empty state (no proposals yet): illustration-free icon, "No proposals yet. Hold the mic and tell me what happened, and I'll prepare changes for you to approve."

#### 3.2.4 "Today" stats (right column)
- Four small stat tiles: **Hats in progress** (12), **Finished this week** (5), **Waiting for review** (3), **Flags to check** (1, warning color). Each tile is clickable and opens the Hats list pre-filtered (e.g. "Flags to check" opens Hats filtered to flagged).

#### 3.2.5 Recent activity (right column)
- A vertical feed of the last 10 events, each with an icon, text, actor and relative time: "You approved: TQ-7F3K2 moved to Washing · 5 min ago", "Assistant flagged TQ-4K9D1: Superfino with 18 rows/inch · 1 h ago". Each item links to the hat. A **View all** link goes to Logs filtered to the current user.

#### 3.2.6 Manual create dialog (button "+ New hat manually")
- Title "Add a hat manually". Note under the title: "Prefer typing a note? The assistant can do this for you."
- Fields: Weaver (searchable select + "Add new weaver"), Grade (segmented), Rows per inch (number, required, 6 to 40), Straw color (select: Natural, Bleached, Dyed), Size in cm (number, 52 to 64, optional), Price in USD (number, optional), Notes (textarea, optional).
- Live validation: grade/weave mismatch warning, out-of-range errors.
- Buttons **Cancel** and **Create hat** (loading "Creating..."). Success: toast "TQ-8B2N4 created." with a **View** action, and the dialog closes.

#### 3.2.7 First-run empty state (new workshop, no hats, no weavers)
- Replaces the stats and activity with an onboarding card: "Let's add your first hat". Three checklist steps with checkboxes that tick automatically: "Add a weaver" (button **Add weaver**), "Send your first voice note" (button **Try it now**, which starts recording; secondary link **Use an example** fills the composer with the Rosa example), "Share a passport" (enabled after the first hat exists).

### 3.3 Hats list (route `/hats`)

- Header: title "Hats", count "24 hats", buttons **+ New hat** (opens the manual create dialog) and **Export CSV** (secondary; downloads and shows toast "Exported 24 hats.").
- **Toolbar:**
  - Search input with a magnifier icon, placeholder "Search by code or weaver", a clear "×" button when it has text, debounced.
  - Filter dropdowns (multi-select with checkboxes, each shows a count badge when active): **Stage**, **Grade**, **Weaver**, **Owner** (Me / Seller / Buyer), and a toggle chip **Flagged only**.
  - **Clear filters** text button, visible only when filters are active.
  - Sort select: Last updated (default), Code, Grade, Stage.
  - View toggle (desktop only): **Table** / **Cards**.
- **Table (desktop) columns:** checkbox, Code (monospace, copy-on-hover icon), Grade badge, Rows/inch, Weaver (name + village), Stage (mini 5-dot stepper with the current stage label), Owner, Flags (warning icon with count and a tooltip listing them), Last updated (relative time, full timestamp on hover), and a row actions "⋯" menu.
  - Row hover: highlight; clicking the row opens Hat detail.
  - **Row actions menu:** **Open**, **Advance to [next stage]** (disabled with tooltip if Finished or not owner), **Copy public link** (toast "Link copied."), **Show QR**, **Transfer ownership...**, and **Archive** (destructive, confirmation dialog: "Archive TQ-2C5P0? It will be hidden from lists but its passport stays valid." **Cancel** / **Archive**).
- **Bulk actions bar** (appears at the bottom when rows are checked): "3 selected", **Advance stage** (only enabled if all selected hats share the same stage; tooltip otherwise "Select hats in the same stage"), **Export selected**, **Clear selection**.
- **Cards (mobile, and desktop Cards view):** code, grade badge, weaver, stepper, flags icon, and a "⋯" menu with the same actions.
- **Pagination:** "1 to 20 of 24" with **Previous** / **Next** buttons and a page size select (20 / 50 / 100). On mobile, a **Load more** button instead.
- **States:** loading skeleton rows; no results for filters: "No hats match these filters." with **Clear filters**; empty workshop: "No hats yet." with **Add your first hat**.

### 3.4 Hat detail (route `/hats/[code]`, workshop view)

- **Breadcrumb:** Hats / TQ-7F3K2.
- **Header:** code in large monospace with a copy icon button (toast "Code copied."), grade badge, stage badge, verified badge, and flags count if any.
- **Header buttons:** **Advance to Bleaching** (primary; label always names the next stage; disabled when Finished with tooltip "This hat is finished."; disabled when not owner with tooltip "Only the current owner can change the stage."), **Share** (opens the share dialog), and a "⋯" menu: **Edit details**, **Transfer ownership...**, **View in agent runs**, **View logs for this hat**, **Archive**.
- **Advance confirmation dialog:** "Move TQ-7F3K2 to Bleaching?" Body shows the mini stepper and "This can't be undone. Stages only move forward." Optional note field "Add a note (optional)". Buttons **Cancel** / **Move to Bleaching**. Success toast "TQ-7F3K2 moved to Bleaching."
- **Left column: details card.** Fields shown read-only: Grade, Rows per inch, Straw color, Size, Price, Weaver (link to weaver), Workshop, Created date. **Edit details** turns it into a form (same validation as manual create; stage is not editable here). Buttons **Save** / **Cancel**. Unsaved changes warning if the user navigates away: "Discard unsaved changes?" **Keep editing** / **Discard**.
- **Production timeline:** a vertical (mobile) or horizontal (desktop) 5-step timeline. Completed steps: filled circle, date, "Approved by Xavier", and a source tag "From AI proposal" or "Manual". Current step: accent ring, "In progress since Oct 14 (4 days)". Upcoming steps: hollow, muted. Hovering or tapping a completed step shows a popover with the exact timestamp, approver, original note text (if from AI) and a **View trace** link.
- **Ownership chain:** horizontal chips Workshop → Seller → Buyer, the current owner highlighted, past owners with transfer dates, future empty slots dashed.
- **Flags panel** (only if flags exist): each flag as a warning row with icon, text ("Grade is Superfino but rows per inch is 18 (Fino range)."), who raised it (Assistant or System), and buttons **Fix grade** (opens edit with grade focused) and **Mark as reviewed** (requires a short reason in a small popover, then the flag turns muted "Reviewed by Xavier: 'Recounted, it's 28.'").
- **History tab / Activity tab:** tabs at the bottom: **Activity** (every event on this hat, newest first) and **Logs** (the system log rows for this hat in compact form, each with a link to Logs).
- **Share dialog:** title "Share this hat's passport". Shows the public URL in a read-only input with **Copy link** button (changes to "Copied!" for 2 seconds), a QR code (with **Download PNG** button), and a preview card of how the link looks. A toggle "Show price on public page" (default off).
- **Transfer ownership dialog:** title "Transfer TQ-7F3K2". Radio: **To a seller** / **To a buyer**. Field: recipient email (validated) and optional message. Warning text: "You won't be able to change this hat after transferring it." Buttons **Cancel** / **Transfer** (destructive style). Success toast "Transfer sent to ana@shop.com." The ownership chain updates.

### 3.5 Weavers (route `/weavers`)

- Header: title "Weavers", count, button **+ Add weaver**.
- Search input "Search weavers".
- Grid of weaver cards: initials avatar (no real photos), name, village and province, specialty grades (badges), hats count, "Weaving since 1998" (optional), and a "⋯" menu: **Edit**, **View their hats** (opens Hats filtered by weaver), **Remove** (disabled if the weaver has hats, with tooltip "Weavers with hats can't be removed.").
- **Add / Edit weaver dialog:** Full name (required), Village (required), Province (select: Azuay, Cañar, Manabí, Other), Specialty (multi-select grades), Weaving since (year, optional), Short bio for the public passport (textarea, 200 characters, with counter, optional), and a checkbox "Show this weaver's name on public passports" (default on; when off, the passport shows "A master weaver from Sígsig"). Buttons **Cancel** / **Save weaver**. Duplicate warning: "A weaver named Rosa Pillco from Sígsig already exists. Add anyway?"
- Empty state: "No weavers yet. Add the artisans you work with so the assistant can recognize them in your notes." with **Add weaver**.

### 3.6 Public hat passport (route `/hat/[code]`, the buyer view and the "wow" screen)

No app sidebar or tabs. A minimal top bar with the logo (links to the landing page) and, on the right, **Log in** (if logged out) or the avatar (if logged in). Footer: "Powered by Toquilla Trace" and a **Report a problem** link.

**Verified state (design this in full detail):**
- **Certificate header:** a cream card with a subtle woven texture border, a large **Verified** seal (check icon, "Verified authentic", "Recorded by Taller Pillco, Cuenca"), the code `TQ-9A1M8` in monospace, and the date it was finished.
- **Hero:** hat photo placeholder (a neutral straw-colored rectangle with a hat icon, 4:3), grade as a large serif label "Superfino", and "Hand-woven by **Manuel Delgado** in Pile, Manabí".
- **Weaver card:** initials avatar, name, village, "Weaving since 1985", the short bio, and "Other hats by Manuel: 4".
- **Story timeline:** the 5 stages in a friendly vertical timeline with dates and plain descriptions: "Weaving: 23 days of hand-weaving", "Washing", "Bleaching", "Blocking: shaped on a wooden form", "Finished: Oct 2, 2026".
- **Specs grid:** Rows per inch (32), Grade explanation ("Superfino means 25+ rows per inch. Fewer than 1 in 100 hats reach this grade." shown as an info tooltip on a "What does this mean?" link), Straw (Natural), Size (58 cm), and Price (only if the workshop enabled it).
- **Ownership:** "Current owner: Workshop" or "Owned by a verified buyer since Oct 10, 2026" (no personal names).
- **Action buttons:**
  - **Claim this hat** (primary). If logged out: opens a dialog "Log in to claim this hat" with **Log in** and **Create account** (returns to this page after auth). If logged in and the hat was transferred to this user's email: confirmation dialog "Claim TQ-9A1M8 as yours?" **Cancel** / **Claim**, then a celebratory success state on the card: "This hat is now registered to you." If the hat isn't transferable to this user: disabled with tooltip "Only the person this hat was transferred to can claim it."
  - **Share** (secondary): uses the native share sheet on mobile; on desktop opens a small menu: **Copy link**, **Show QR**.
  - **Ask about this hat** (opens the concierge).

**Not verified state:** a full-width red-bordered card with an alert icon. Title "We can't verify this hat". Body "The code TQ-ZZZZZ isn't in our records. It may be mistyped, or the hat may not be genuine." Buttons **Try another code** (reveals an inline code input with the same validation as the landing page) and **Report a problem**. Below, a short "How to spot a real Panama hat" tips list (3 bullets).

**Archived state:** a muted banner "This hat was archived by its workshop. Its record is still valid." above the verified content.

**Loading state:** skeleton of the certificate card and timeline.

#### 3.6.1 Buyer concierge (read-only AI chat)
- **Entry point:** a floating round button bottom-right with a chat icon and the label "Ask about this hat" (label hides on scroll on mobile, icon stays). On desktop it opens a right-side panel (400px) that pushes nothing and overlays the page; on mobile it opens a full-height bottom sheet.
- **Panel header:** "Ask about TQ-9A1M8", a subtitle "Answers come only from this hat's record", a **New chat** icon button (clears the conversation, confirmation not needed) and a close "×".
- **Intro message from the assistant:** "Hi! I can answer questions about this hat using its verified record. What would you like to know?"
- **Suggested question chips** (shown until the first message, then a smaller set below each answer): "Is this hat real?", "Will it fit a 58 cm head?", "Is it good for golf?", "How do I care for it?", "Who made it?".
- **Composer:** single-line input that grows to 4 lines, placeholder "Ask a question...", **Send** icon button (disabled when empty), max 300 characters with a counter appearing after 250.
- **Message bubbles:** user messages right-aligned in the accent color; assistant messages left-aligned with the AI icon. Assistant answers include **source pills** under the text, such as "From this hat's passport · Size" or "From this hat's passport · Weaver", and a "General care advice" pill when the info is general rather than from the record. Each assistant message has small icon buttons **Copy** and thumbs **Helpful** / **Not helpful** (toggle state; clicking Not helpful shows an optional one-line "What was wrong?" input with **Send**).
- **Typing indicator:** three animated dots plus "Checking the record...".
- **"I don't know" style:** "That isn't in this hat's record. You could ask the workshop directly." with a **Contact the workshop** link (mailto).
- **Refusal for change requests:** if the user asks to change anything ("Mark this as mine", "Change the grade"), the assistant replies "I can only read this hat's record, not change it." plus, when relevant, a button **Claim this hat** inside the bubble.
- **Error state in a bubble:** "I couldn't answer that. **Try again**".
- **Rate limit state:** a banner in the panel "You've asked a lot of questions. Try again in a minute." with the composer disabled.
- **Footer note** in small muted text: "AI answers can be wrong. The verified record above is the source of truth."

### 3.7 Agent runs (route `/runs`, builder view)

- Header: title "Agent runs", subtitle "Every time the assistant worked, step by step."
- **Toolbar:** search ("Search notes"), filters **Status** (Proposed, Partially approved, Approved, Rejected, Failed, Stopped), **Agent** (Workshop agent / Buyer concierge), **Date range** (Today, Last 7 days, Last 30 days, Custom with a date range picker), and **Clear filters**.
- **Summary strip:** Runs (42), Success rate (93%), Avg latency (2.4 s), Avg cost ($0.005), Rule blocks (6). Each is a small tile.
- **Runs table columns:** Started (relative time), Agent (badge), User, Input (the note, truncated to one line, full text on hover), Status badge, Tool calls (count), Tokens (in / out), Latency, Cost, and a chevron. Clicking a row opens the run detail. On mobile, rows become cards.
- **Run detail (route `/runs/[id]`, or a large right drawer on desktop):**
  - Header: run ID in monospace with copy button, status badge, agent badge, started and finished times, total latency, tokens, cost, model name.
  - Buttons: **Copy run as JSON**, **Open related hats** (menu listing affected hat codes), **View logs for this run** (opens Logs filtered by this request ID).
  - **Input section:** the full original note in a quoted block.
  - **Step timeline (the core of this screen),** vertical, numbered steps, each collapsible:
    - "Model call" step: model name, tokens, latency, and the assistant's text if any.
    - "Tool call" step: tool name in monospace (e.g. `find_weaver`), a type tag **Read** (blue) or **Write: proposed only** (amber), input JSON and output JSON in syntax-highlighted, collapsible code blocks with a copy button each, and duration.
    - "Rule check" step: green "Allowed" or red "Blocked: stage skip (Weaving → Finished)".
    - "Proposal" step: the proposal card in compact read-only form.
    - "Human decision" step: "Approved by Xavier · 10:42:13" or "Rejected", with any edits shown as a before/after diff of fields.
    - "Error" step: red, the error message, and the stack or API error code in a code block.
  - Controls: **Expand all** / **Collapse all**.
  - Empty and loading states for the table and the detail.

### 3.8 System log (route `/logs`, builder view)

Purpose: every action in the app is written to a log table so a developer (or an AI coding assistant) can debug from it. Optimize for density and fast scanning.

- Header: title "Logs", subtitle "Every action in the app, newest first."
- **Toolbar:**
  - Search input "Search messages, actions or IDs".
  - Filters: **Level** (multi: Debug, Info, Warn, Error), **Source** (multi: Web app, Edge function, Workshop agent, Buyer concierge, Database), **Action** (searchable multi-select of action names like `auth.login`, `agent.run.start`, `agent.tool.call`, `proposal.approve`, `hat.stage.advance`, `hat.transfer`, `concierge.message`), **User**, **Time range** (Last 15 min, 1 h, 24 h, 7 days, Custom).
  - **Live** toggle (when on: new rows stream in at the top with a brief highlight, and a "Paused, 12 new rows" pill appears if the user scrolls down; clicking it jumps to the top).
  - **Export JSON** button (exports the current filtered rows).
  - **Clear filters**.
- **Level counters** above the table as clickable chips that filter: "Errors 3", "Warnings 7", "Info 214".
- **Table columns:** Time (monospace, `10:42:13.512`, full date on hover), Level (colored pill with icon, and the whole row gets a faint red tint for errors), Source, Action (monospace), Message (one line), User, Request ID (monospace, truncated, copy on hover), Duration (ms). Compact row height (36px) with a density toggle **Compact / Comfortable**.
- **Row click** opens a right-side detail panel (full-screen on mobile):
  - Title: the action name and level pill.
  - Fields: timestamp, source, user, request ID (with copy), hat code (link, if any), run ID (link, if any), duration.
  - **Payload** as syntax-highlighted JSON with a copy button and **Expand all** for nested keys.
  - **Error** block (for errors): message and stack trace in monospace.
  - Buttons: **Copy request ID**, **Show all rows for this request** (filters the table by request ID), **Copy as prompt for an AI assistant** (copies a ready-made text summarizing the error with its payload, so a developer can paste it into Claude to fix it; toast "Copied. Paste it into your AI assistant.").
  - Previous / Next row arrows in the panel header to step through rows without closing it.
- **States:** loading skeleton rows, no results ("No log rows match these filters."), and Live paused.

### 3.9 Settings (route `/settings`, from the user menu)

- Tabs: **Profile**, **Workshop**, **Appearance**.
- **Profile:** Name, Email (read-only with "Contact support to change"), **Change password** button (opens a dialog: Current password, New password, Confirm; errors for mismatch and wrong current password; success toast "Password updated.").
- **Workshop:** Workshop name, City, Public contact email (used by the concierge's "Contact the workshop" link), toggle "Show prices on public passports by default".
- **Appearance:** Theme (Light / Dark / System), Density (Compact / Comfortable).
- Each tab has **Save changes** (disabled until something changes, loading "Saving...", success toast "Saved.") and an unsaved-changes warning when leaving.
- A **Danger zone** section at the bottom of Profile: **Delete account** (destructive; dialog requires typing the workshop name to enable the **Delete forever** button).

---

## 4. Interaction details that apply everywhere

- **Every button** needs designed default, hover, focus (visible 2px ring), active/pressed, disabled and loading states.
- **Every input** needs default, focus, filled, error (red border + message below + error icon), disabled and read-only states, with labels always visible above the field (no placeholder-only labels).
- **Selects and multi-selects** show the selected count, have search when there are more than 7 options, and include a "Clear" option.
- **Copy actions** show a brief "Copied!" inline swap or a toast.
- **Optimistic updates** for approvals: the card shows Approved instantly, and if saving fails it reverts and shows the Approval failed state.
- **Confirmation is required** for: advancing a stage, transferring ownership, archiving, deleting the account, discarding proposals, and discarding unsaved edits. Nothing else asks for confirmation.
- **Relative times** ("5 min ago") everywhere, with the absolute timestamp in a tooltip.
- **Motion:** subtle and fast (150 to 200 ms) for hovers, drawers and toasts; a slightly richer moment (a seal stamp animation) only for the Verified badge and a successful Claim. Respect "reduce motion" settings.
- **Responsive behavior:** tables become cards under 768px, side panels become full-screen sheets, dialogs become bottom sheets, and sticky action bars (bulk actions, proposal Approve all) stay pinned at the bottom on mobile.

## 5. Visual direction

- Inspired by toquilla straw and Ecuadorian craft, but modern and clean, never touristy or folkloric.
- **Palette:** straw cream and warm beige for backgrounds, deep charcoal text, one rich accent (deep Andean green or indigo; propose both and pick one), plus semantic colors: success (verified, approved), warning (flags, needs answer), error (blocked, not verified, errors), info (read tools, logs).
- **Texture:** a subtle woven crosshatch pattern only as an accent (passport certificate border, empty states, landing hero edge). Never behind text.
- **Typography:** an elegant serif for headings on the landing and passport pages; a clean sans-serif for the app UI; monospace for codes, IDs, JSON and logs.
- **AI visual language:** a consistent small sparkle icon and the label "Proposed by AI" or "Assistant". Proposed = dashed outline + soft accent tint. Approved by a human = solid outline + success tint. Blocked by rules = red outline + lock icon. Use these consistently across the dashboard, hat detail timeline and agent runs.
- **Light and dark mode** for every screen.
- **Accessibility:** WCAG AA contrast, all states understandable without color (icon + text), 44px minimum touch targets, visible focus, and aria-labels on icon-only buttons.

## 6. Sample data (use it in every mockup)

- **Workshop:** Taller Pillco, Cuenca. **User:** Xavier, xavier@tallerpillco.com.
- **Weavers:** Rosa Pillco (Sígsig, Azuay, since 1992, Fino), Rosa Guamán (Cuenca, Azuay, Standard), Manuel Delgado (Pile, Manabí, since 1985, Superfino), Carmen Quizhpi (Cuenca, Azuay, Fino).
- **Hats:**
  - `TQ-7F3K2` Fino, 18 rows/inch, Rosa Pillco, Bleaching, owner Workshop
  - `TQ-9A1M8` Superfino, 32 rows/inch, Manuel Delgado, Finished, Verified, owner Buyer
  - `TQ-2C5P0` Standard, 10 rows/inch, Rosa Guamán, Weaving, owner Workshop
  - `TQ-4K9D1` claimed Superfino but 18 rows/inch, Carmen Quizhpi, Blocking, flagged
  - `TQ-8B2N4` Fino, 20 rows/inch, Carmen Quizhpi, Washing
- **Agent note:** "Doña Rosa terminó 3 finos, 18 hileras, mañana van a blanqueo"
- **Proposals for that note:** Create 3 hats (Fino, 18 rows/inch, Rosa: needs your answer, 2 Rosas found); Advance TQ-7F3K2 to Washing (pending); Move TQ-2C5P0 to Finished (blocked by rules); Flag TQ-4K9D1 grade mismatch (pending).
- **Log rows:** `auth.login` info; `agent.run.start` info; `agent.tool.call find_weaver` info 38 ms; `rule.check` warn "Blocked: stage skip"; `proposal.approve` info; `hat.stage.advance` error "Row was updated by another user" 120 ms.

## 7. Deliverables

1. Every screen in section 3 at desktop and mobile sizes, including all listed states (empty, loading, error, success, editing, blocked, needs answer, not verified, archived, rate limited, offline, session expired).
2. Every dialog and drawer as its own frame: help, logout confirm, manual create, advance confirm, share, transfer, archive, add/edit weaver, claim (logged out and logged in), discard proposals, unsaved changes, change password, delete account.
3. A component sheet: buttons (all variants and states), inputs, selects, segmented controls, toggles, badges (stage, grade, verified, level, action type, confidence), proposal card (all 8 states), stage stepper (mini and full), timeline, ownership chain, toasts (all variants), dialogs, chat bubbles with source pills, log row, table row, stat tile, empty state, skeletons.
4. A short flow diagram for the 3 main journeys: (a) note → proposals → approve; (b) buyer opens passport → asks the concierge → claims the hat; (c) developer sees an error in Logs → opens the run trace → copies it as a prompt.
5. Keep everything buildable with Next.js and Tailwind CSS (standard components, simple layouts, no complex custom illustrations).
