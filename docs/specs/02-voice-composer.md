# 02. Voice composer

> **Pre-build plan (historical).** Decisions D1 to D26 in 00-conventions ([section 8](00-conventions.md#8-decisions-after-spec-review-these-override-sections-1-to-7-and-any-spec), [section 9](00-conventions.md#9-model-provider-change-d26-overrides-section-5-d8-cost-numbers-d16-and-d17)) override it; the app uses Gemini 2.5 Flash-Lite (D26), not the Claude API.
> Current status: [HANDOFF.md](../../HANDOFF.md). Unchecked boxes below are the plan's acceptance list, not a status report.

## 1. Summary

The composer on `/workshop` is where a workshop member says (or types) what happened. Speech becomes a live transcript, the person always reviews and edits it, then sends it to `workshop-agent` and watches honest progress until proposals arrive.

Serves: works end to end, several real interactions, product taste ("Just tell it", never auto-send), judicious AI use (human reviews the input before the AI sees it), logs, prioritization (voice in Chrome, typing everywhere).

## 2. Scope

| Item | Must/Nice/Cut | Why |
|---|---|---|
| Typed note + Send to `workshop-agent` with `x-request-id` | Must | Works in every browser, the fallback path |
| Web Speech hook (feature detection, `es-EC`/`en-US`, interim results, 2:00 cap) | Must | The core product insight |
| Tap to talk (desktop "Click to talk", mobile tap) | Must | Simplest start/stop |
| Hold to talk on mobile (release to stop) | Must | WhatsApp habit, 10 lines of pointer code |
| Review step with editable transcript (never auto-send) | Must | Speech errors are caught by a person |
| Low-confidence words (confidence threshold + code heuristic), wavy underline | Must | Spoken hat codes are the top error source |
| Language toggle Español (Ecuador) / English | Must | One prop on the recognizer |
| Unsupported browser notice, typing as default | Must | Firefox and others |
| Blocked permission notice (from the `not-allowed` error) | Must | Otherwise the mic silently fails |
| Agent running steps (timed list, last step waits for the response) + Stop | Must | Feedback during a 3 to 10 s wait |
| Agent failed card + Try again | Must | Note is never lost |
| "You said / You wrote" bubble, assistant summary, meta row (member vs admin) | Must | Shows what the AI understood |
| Character limit 1000 with counter | Must | Matches the server contract |
| Unsure-word chips ("Tap to retype") | Nice | Faster correction, the underline already shows them |
| Slide to cancel (110 px) | Nice | Cancel button covers it |
| First-use permission notice via `navigator.permissions` | Nice | Browser prompt works without it |
| Silence detection (8 s no speech, `no-speech` error) | Nice | Empty review is the fallback |
| Hat tag chip from `/workshop?hat=TQ-7F3K2&record=1` | Nice | Depends on the Hat detail mic |
| Example chips, rotating placeholder | Nice | Demo help |
| Keyboard `/` to focus | Nice | Desktop only |
| Edit note confirm ("Discard these proposals and edit your note?") | Nice | Needs bulk reject from spec 04 |
| Streaming real agent steps (SSE) | Cut | More code and failure states, documented as next step |
| Server speech-to-text for unsupported browsers | Cut | Extra vendor, README next step |
| Attach photo | Cut | Disabled button with tooltip "Photos are coming soon." |
| Offline banner | Cut | Per conventions |

## 3. User stories

**Workshop member**
- As a member with straw in my hands, I hold the mic, say the update in Spanish, and release, so I don't type.
- As a member, I see my words as I talk and fix any misheard word before sending, so the agent gets the right note.
- As a member on Firefox, I see why voice is missing and can type instead.
- As a member, I see the assistant working and can stop it, and if it fails my note is still there.
- As a member, I see "4 actions prepared · 2.1 s" without costs or JSON.

**Admin**
- As an admin, I see "4 tool calls · 2.1 s · $0.004 · View trace" and can jump to the run.
- As an admin, when a run fails I open View details to the run trace.

## 4. UI

**Route:** `/workshop` (main column, above the proposal panel). Optional query: `?hat=TQ-7F3K2` (tag) and `&record=1` (start recording).

**Components**

| Component | File | Job |
|---|---|---|
| `Composer` | `components/workshop/Composer.tsx` | Renders card (desktop) or dock (mobile) from one state |
| `useComposer` | `components/workshop/useComposer.ts` | `useReducer(composerReducer)` + side effects (send, timers) |
| `composerReducer` | `lib/voice/composerMachine.ts` | Pure state machine (unit tested) |
| `useSpeechRecognition` | `lib/voice/useSpeechRecognition.ts` | Wraps Web Speech, emits events to the reducer |
| `toWords`, `isLikelyCode` | `lib/voice/words.ts` | Pure: results -> words with `low` flag |
| `MicButton` | `components/workshop/MicButton.tsx` | 72 px mic, pointer events, pulse ring |
| `AgentSteps`, `RunBubbles` | `components/workshop/AgentRun.tsx` | Steps list, You said / Assistant bubbles, meta row |
| `VoiceNotice` | `components/workshop/VoiceNotice.tsx` | Tinted notice card (copy table below) |

**Copy (word for word, from handoff "Workshop dashboard > Voice composer")**
- Title "Just tell me what happened", subtitle "Hold the mic and talk, like a WhatsApp voice note."
- Language chip "Español (Ecuador)" / "English". Hat chip "About TQ-7F3K2 ×".
- Desktop footer: Attach (disabled, tooltip "Photos are coming soon."), `n / 1000`, mic "Click to talk", Send.
- Mobile idle: mic "Hold to talk", link "⌨ Type instead".
- Recording: "● Recording", timer `0:07`, caption "Up to 2 minutes", "‹ Slide to cancel", "Release to stop" / "Tap to stop", desktop "Click to stop". Low word tooltip "Not sure I heard this right."
- Review: "Check the transcript, then send.", chips intro "Not sure I heard these right. Tap to retype:", buttons Send, Re-record, Discard. Toasts "Voice note discarded." and "Recording discarded."
- Notices: see handoff table "Permission and error notices" (First use, Blocked, Unsupported browser, Silence, Connection lost).
- Running steps: "Reading your note...", "Looking up weavers and hats...", "Checking stage rules...", "Preparing proposals...". Stop toast "Stopped. Nothing was saved."
- Failed: "The assistant couldn't finish. Your note is still here." with Try again and View details (admin) or Reference (member).
- After run: "You said:" (mic icon) or "You wrote:", assistant summary, meta row.

**States and layout**

| State | Desktop card | Mobile dock (above 64 px tab bar) |
|---|---|---|
| idle | Textarea 3 to 8 rows, example chips, footer with mic + Send (secondary if empty, primary if text) | 3-column grid: hat chip, 72 px mic + "Type instead", language chip |
| typing (mobile only) | n/a | Pill textarea, mic button (back to voice), 48 px round Send. Counter shows only above 900 |
| explaining / blocked / silence | Notice above the textarea | Notice inside the dock |
| unsupported | Notice, mic hidden, textarea focused | Dock starts in typing layout, mic hidden |
| recording | Live transcript box (1.5 px `--err` border, `aria-live="polite"`), footer "● Recording", waveform, timer, Cancel, red stop mic | Transcript (max 112 px, scroll), timer + waveform, row: Slide to cancel or Cancel, mic, hint |
| review | Editable textarea, unsure chips, Send / Re-record / Discard | Textarea, chips, 48 px row: delete icon, Re-record, Send fills rest |
| sending | Textarea read-only, opacity .55, steps list (`aria-live="polite"`), Stop | Same, inside the dock |
| failed | Red card under the textarea, note kept and editable | Same |

- Empty: idle with example chips (no proposals yet; the proposal empty state belongs to spec 04).
- Loading: none (composer renders instantly; permission query result updates it).
- When proposals are open on mobile, the dock is replaced by the approve bar (spec 04). Its mic swaps the bar back to this dock in recording state.

**Role differences**

| | Member | Admin |
|---|---|---|
| Meta row | "{n} actions prepared · {s} s" (n = proposals returned) | "{tool_calls} tool calls · {s} s · ${cost} · View trace" (link `/runs/{run_id}`) |
| Failed card | "Reference: req_8f2a" + copy icon (toast "Reference copied. Share it with support.") | "View details" -> `/runs/{run_id}` if known, else `/logs?request_id=...` |

`s` = `meta.latency_ms / 1000` with one decimal. Cost formatted with 3 decimals.

## 5. Data

No new tables or columns. The composer only calls `workshop-agent`, which writes `agent_runs` and `proposals` (spec 03). Client writes only `app_logs` rows through `lib/log.ts` (RLS: insert where `user_id = auth.uid()`).

Browser storage (convenience only, wrapped in try/catch):

| Key | Value |
|---|---|
| `tt-voice-lang` | `es-EC` or `en-US` |
| `tt-mic-explained` | `1` after the first-use notice was accepted |

## 6. Server logic and API

**Request** (contract from conventions section 4):

```ts
const requestId = newRequestId(); // "req_" + 12 hex
const res = await fetch(`${SUPABASE_URL}/functions/v1/workshop-agent`, {
  method: "POST",
  signal: abort.signal,                     // Stop and 60 s timeout
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${session.access_token}`,
    apikey: SUPABASE_ANON_KEY,
    "x-request-id": requestId,
  },
  body: JSON.stringify({ note: note.trim(), input_mode, hat_tag: hatTag ?? undefined }),
});
```

Plain `fetch` instead of `supabase.functions.invoke` so we control `AbortController` and headers directly.

**Response handling**

| Result | Composer does |
|---|---|
| 200 `{ run_id, summary, proposals, meta }` | `RESPONSE_OK`: hand proposals to the panel (spec 04), show bubbles + meta, clear note and hat tag |
| 401 | Open the session expired dialog (handoff), keep the note |
| 429 `rate_limited` | Failed card with "You've sent a lot of notes. Try again in a few minutes." (new copy, see Open questions) |
| 4xx/5xx `{ error: { code, message, request_id } }` | Failed card, reference = `error.request_id` |
| Network error or 60 s timeout | Failed card, reference = our `requestId`, client logs `ui.error` |
| Aborted by Stop | Back to idle with the note, toast "Stopped. Nothing was saved." |

**Agent running steps: timed client list (decision)**

`workshop-agent` is one JSON request. Options considered:

| Option | Verdict |
|---|---|
| Stream real steps over SSE | Cut. Needs a streaming function, partial-failure states, more code than the 2 hours allow |
| Show specific steps like "Looking up weaver 'Rosa'..." before we know them | Rejected. Dishonest |
| Timed generic list of the steps every run really does, last step waits for the response | **Chosen** |

Rules: step 1 shows at 0 s, step 2 at 1.2 s, step 3 at 2.4 s, step 4 at 3.6 s. A step gets its check only when the next one starts. Step 4 keeps spinning until the response arrives; it is never checked early. On response all steps check, then the real numbers appear in the meta row. If the response arrives before 3.6 s, remaining steps check at once.

**Speech hook (`useSpeechRecognition`)**

```ts
const SR = typeof window !== "undefined"
  ? (window.SpeechRecognition ?? (window as any).webkitSpeechRecognition)
  : undefined;
export const voiceSupported = !!SR;

function start(lang: "es-EC" | "en-US") {
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => dispatch({ type: "RESULT", words: toWords(e.results, LOW_CONFIDENCE) });
  rec.onerror = (e) => dispatch({ type: "SR_ERROR", code: e.error });
  rec.onend = () => dispatch({ type: "SR_END" });
  rec.start(); // must run inside the pointer/click handler (iOS needs a user gesture)
}
```

- `toWords` rebuilds the whole transcript from `e.results` each time (with `continuous`, the list holds the full session). Simple and correct.
- Confidence is per result, not per word. Every word of a final result gets that result's confidence.
- `low = isFinal && confidence > 0 && confidence < LOW_CONFIDENCE` (`LOW_CONFIDENCE = 0.6`), OR `isLikelyCode(word)`. Confidence `0` means "unknown" (Safari often reports 0), so it is not marked low.
- `isLikelyCode(w)`: true when the token starts with `tq` (any case) or mixes letters and digits (`/[a-z]/i` and `/\d/`). Spoken codes are always low, per handoff.
- Interim (not final) words render `--muted`. This is the honest version of "last 2 words muted": interim results are usually the last 1 to 3 words.

**Error mapping**

| `SpeechRecognitionErrorEvent.error` | Event result |
|---|---|
| `not-allowed` | `blocked` notice, log `voice.permission {state:"denied"}` |
| `service-not-allowed` | `unsupported` (Safari with Siri off, Brave) |
| `audio-capture` | `blocked` notice (no mic available) |
| `no-speech` | `silence` notice |
| `network` | review with `lost = true` ("Voice input stopped. Your text so far is saved.") |
| `aborted` | ignored (we caused it) |
| any other | review with `lost = true`, log `voice.error` |

**Permission states (Nice)**: `navigator.permissions?.query({ name: "microphone" as PermissionName })` inside try/catch. Chrome, Edge and Safari 16+ answer `granted | prompt | denied`; Firefox and older Safari throw, which we treat as `unknown` (same as `prompt`). Subscribe to `status.onchange` and dispatch `PERM_CHANGE`. When state is `prompt`/`unknown` and `tt-mic-explained` is not set, pressing the mic shows the first-use notice instead of starting; **Allow microphone** sets the flag and starts in tap mode (the browser prompt appears).

**Browser behaviour**

| Browser | Behaviour |
|---|---|
| Chrome / Edge desktop and Android | Full support. Audio is processed by the browser vendor's speech service |
| iOS Safari (14.5+) | `webkitSpeechRecognition`. Start only from a gesture. `continuous` may end after a pause: `SR_END` with words goes to review. Confidence often 0. Mic CSS: `touch-action:none; user-select:none; -webkit-touch-callout:none` so long-press doesn't select text |
| Firefox | No constructor: unsupported notice, typing default, mic hidden |
| Brave and others exposing a broken constructor | First start fails with `service-not-allowed` or `network`: mapped above, typing still works |

**State machine (`composerReducer`)**

States:

| State | Data |
|---|---|
| `idle` | `note`, `inputMode`, `hatTag`, `typing` (mobile layout flag) |
| `explaining` | first-use notice |
| `blocked` | blocked notice |
| `recording` | `mode: "hold" \| "tap"`, `startedAt`, `words[]`, `baseNote` (text that was there before) |
| `silence` | silence notice |
| `review` | `note`, `lowWords[]`, `lost: boolean` |
| `sending` | `requestId`, `startedAt`, `step: 0..3` |
| `failed` | `note`, `error: { code, message }`, `requestId`, `runId?` |

`unsupported` is a constant flag (`voiceSupported === false`), not a state: idle with the mic hidden.

Transitions:

| From | Event | To | Side effect |
|---|---|---|---|
| idle | `MIC_DOWN` (mobile) | recording(hold) | `start(lang)`, log `voice.start` |
| idle | `MIC_CLICK` / `MIC_UP_SHORT` | recording(tap) | same |
| idle | `MIC_*` when perm `prompt` and not explained | explaining | none |
| idle | `MIC_*` when perm `denied` | blocked | none |
| explaining | `ALLOW` | recording(tap) | set `tt-mic-explained`, `start` |
| explaining / blocked / silence | `TYPE_INSTEAD` | idle (typing) | focus textarea |
| silence | `TRY_AGAIN` | recording(tap) | `start` |
| recording(hold) | `MIC_UP` after < 350 ms | recording(tap) | none (it was a tap) |
| recording(hold) | `MIC_UP` after >= 350 ms | review, or silence if no words | `stop()`, log `voice.stop` |
| recording(tap) | `MIC_CLICK` / `STOP` | review, or silence if no words | `stop()`, log `voice.stop {reason:"user"}` |
| recording | `RESULT` | recording | update `words` |
| recording | `TICK` with elapsed >= 120 s | review | `stop()`, log `voice.stop {reason:"max_2min"}` |
| recording | `NO_SPEECH_8S` (no result in first 8 s) | silence | `abort()`, log `voice.stop {reason:"silence"}` |
| recording | `SLIDE_CANCEL` (dx < -110) / `CANCEL` / `ESC` | idle (note = baseNote) | `abort()`, toast "Recording discarded.", log `voice.cancel` |
| recording | `SR_END` (not requested) | review, or silence if no words | log `voice.stop {reason:"ended"}` |
| recording | `SR_ERROR` | per error table | log `voice.error` |
| review | `EDIT` | review | update `note` |
| review | `RERECORD` | recording(tap) | replaces the transcript part, log `voice.start` |
| review | `DISCARD` | idle (empty) | toast "Voice note discarded.", log `voice.cancel {reason:"discard_review"}` |
| idle / review / failed | `SEND` (valid note) | sending | `fetch`, start step timer |
| sending | `STEP_TICK` | sending (step + 1, max 3) | none |
| sending | `RESPONSE_OK` | idle (empty) | pass result to panel |
| sending | `RESPONSE_ERR` | failed | log `ui.error` only for network/timeout |
| sending | `STOP_RUN` | idle (note kept) | `abort.abort()`, toast, log `agent.run.end {status:"stopped"}` |
| failed | `TRY_AGAIN` | sending | new `requestId` |
| failed | `EDIT` | idle | none |
| any | `LANG_TOGGLE` | same | ignored while `recording` or `sending` |

Recording appends to existing text: final `note = (baseNote + " " + transcript).trim()`. `inputMode = "voice"` if any recording contributed to the note, else `"typed"`. Editing a transcript keeps `voice`.

**Hold vs tap and slide (MicButton)**
- `pointerdown`: `preventDefault`, `setPointerCapture`, record `downAt`, `downX`, dispatch `MIC_DOWN` (mobile) or `MIC_CLICK` (desktop, tap only).
- `pointermove` while holding: `dx = Math.min(0, x - downX)`; hint follows the finger; hint red when `dx < -60`; dispatch `SLIDE_CANCEL` when `dx < -110`.
- `pointerup`: dispatch `MIC_UP` with `heldMs`.
- Keyboard: Enter/Space on the focused mic toggles tap mode. `Esc` cancels recording. `/` focuses the textarea (not while focus is in an input). Cmd/Ctrl+Enter sends from the textarea.

**Hat tag (Nice)**: read `hat` from the query string, keep it only if `isValidCode(hat)` from `@domain/domain`. With `record=1`, auto-start only when permission is `granted` (Safari blocks start without a gesture); otherwise focus the mic.

## 7. Business rules and edge cases

1. Nothing is sent without a Send click or Cmd/Ctrl+Enter. Stopping a recording always lands in review, never in sending.
2. Send is disabled when `note.trim()` is empty or longer than 1000 characters. Counter color: muted, `--warn` above 900, `--err` above 1000.
3. Recording auto-stops at 120 s; the timer turns amber at 110 s.
4. A hold shorter than 350 ms becomes tap mode (recording continues until the next tap).
5. Sliding left more than 110 px cancels; the transcript from this recording is dropped and any earlier text is kept.
6. If no result arrives within 8 s of start, or the browser reports `no-speech`, the state is `silence`.
7. Ending with zero words goes to `silence`, not to an empty review.
8. A `network` error keeps the words heard so far in review with the "Voice input stopped" notice.
9. Words with final confidence in (0, 0.6) are low. Confidence 0 is not low. Any token with letters and digits or starting with "TQ" is low.
10. Unsure chips list only low words that still appear in the note; tapping one selects its first occurrence in the textarea.
11. The language toggle is disabled while recording or sending; the choice persists in `tt-voice-lang`.
12. Stop during sending aborts the fetch and keeps the note. No hat is ever written by `workshop-agent`, so "Nothing was saved." is true.
13. A failed run keeps the note and the hat tag; Try again uses a new request id.
14. `input_mode` is `voice` if any recording contributed, else `typed`.
15. An invalid `?hat=` value is ignored silently.
16. On unsupported browsers the mic is never rendered and the textarea is focused.
17. Members never see token, cost or tool counts in the composer.
18. All voice state stays in the browser. No audio is uploaded by our app.

## 8. Logging

Client rows go through `lib/log.ts` (`source: "web"`, batched, retried once, never throws). All include `request_id` when one exists and `hat_code` when a tag is set.

| Action | Level | When | Payload |
|---|---|---|---|
| `voice.permission` | info | permission query result, change, or `not-allowed` | `{ state: "granted"\|"prompt"\|"denied"\|"unknown", via: "query"\|"change"\|"error"\|"allow_click" }` |
| `voice.start` | info | recognizer started | `{ lang, mode: "hold"\|"tap", rerecord: boolean }` |
| `voice.stop` | info | recording ended into review or silence | `{ reason: "user"\|"max_2min"\|"silence"\|"ended", duration_ms, words, low_words, chars }` |
| `voice.cancel` | info | slide, Cancel, Esc, Discard in review | `{ reason: "slide"\|"button"\|"esc"\|"discard_review", duration_ms }` |
| `voice.error` | warn | any recognizer error except `aborted` | `{ code, lang, browser: "chrome"\|"safari"\|"firefox"\|"other" }` |
| `agent.run.end` | info | user pressed Stop | `{ status: "stopped", waited_ms }` (see Open questions) |
| `ui.error` | error | network failure or 60 s timeout on send | `{ where: "composer.send", code: "network"\|"timeout" }` |

Transcript text is not logged on the client. The server logs the note in `agent.run.start` (admin only).

## 9. Security and privacy

- The note is untrusted data. It is sent as JSON and the server places it in user content for Claude (spec 03). The UI renders it as text only (React escaping, no `dangerouslySetInnerHTML`).
- Auth: the JWT goes in `Authorization`; the request id carries no user data. No tokens are logged.
- Our app never records or uploads audio. Chrome and Edge send audio to the vendor's speech service; see Open questions about the "Audio isn't stored." copy.
- Least privilege in UI: members see counts and latency only. Cost and tool counts render for admins only (the server should also strip them, see Open questions).
- `localStorage` holds only the language and a flag. No PII.

## 10. Tests

Vitest, `tests/voice/*.test.ts`. All pure, no browser.

**`composerReducer`**

| Start | Event | Expected |
|---|---|---|
| idle, perm granted | `MIC_DOWN` | recording, mode `hold` |
| recording(hold), started t=0 | `MIC_UP` heldMs 200 | recording, mode `tap` |
| recording(hold) with 3 words | `MIC_UP` heldMs 900 | review, note "Doña Rosa terminó" |
| recording(tap), 0 words | `STOP` | silence |
| recording, baseNote "Hola" | `SLIDE_CANCEL` | idle, note "Hola" |
| recording, elapsed 119 | `TICK` elapsed 120 | review |
| recording | `SR_ERROR` `not-allowed` | blocked |
| recording, words ["El","TQ-7F3K2"] | `SR_ERROR` `network` | review, lost true, note "El TQ-7F3K2" |
| idle, perm prompt, not explained | `MIC_CLICK` | explaining |
| review, note "x".repeat(1001) | `SEND` | review (unchanged) |
| review, note "  " | `SEND` | review (unchanged) |
| sending | `STOP_RUN` | idle, note kept |
| sending | `RESPONSE_ERR` `{code:"internal"}` | failed, note kept |
| recording | `LANG_TOGGLE` | recording, lang unchanged |

**`toWords`**
- Final result "Doña Rosa terminó" confidence 0.92 -> 3 words, none low.
- Final result "18 hileras" confidence 0.41 -> both low.
- Final result "hola" confidence 0 -> not low.
- Interim result "pasa a" -> 2 words, `confirmed: false`, not low.
- Final "el TQ 7F3K2" confidence 0.95 -> "TQ" and "7F3K2" low, "el" not low.

**`isLikelyCode`**: "TQ-7F3K2" true, "tq" true, "7F3K2" true, "18" false, "hileras" false, "B2" true.

**Payload builder** `buildAgentRequest({note:"  hola ", usedVoice:true, hatTag:"TQ-7F3K2"})` -> `{ note:"hola", input_mode:"voice", hat_tag:"TQ-7F3K2" }`; with `hatTag:"bad"` -> no `hat_tag`.

**Integration (manual, deployed)**
- Chrome desktop: click mic, say the sample note, stop, edit a word, send; proposals appear; Logs show `voice.start`, `voice.stop`, then `agent.run.start` with the same request id as the Network tab header.
- Firefox: unsupported notice, typing works end to end.
- Deny mic in Chrome: blocked notice appears.

## 11. Acceptance criteria

- [ ] On Chrome desktop, clicking the mic shows a live transcript with a red border and a running timer.
- [ ] Stopping shows "Check the transcript, then send." with editable text; nothing is sent until Send.
- [ ] A spoken hat code like "TQ-7F3K2" is underlined in amber with the tooltip "Not sure I heard this right."
- [ ] On a phone (Chrome Android or iOS Safari), holding the mic records and releasing goes to review; a quick tap records until the next tap.
- [ ] Recording stops by itself at 2:00 and the timer is amber from 1:50.
- [ ] Switching to English changes recognition language (an English sentence transcribes correctly).
- [ ] In Firefox the mic is hidden, the notice "Voice isn't supported in this browser. Type your note instead." shows, and a typed note gets proposals.
- [ ] With the mic blocked, the notice "Microphone is blocked..." shows with Type instead.
- [ ] Typing 1001 characters turns the counter red and disables Send.
- [ ] While the agent runs, the steps appear one by one, the text is dimmed and read-only, and Stop shows "Stopped. Nothing was saved." with the note intact.
- [ ] When the function fails, the red card shows; Try again resends the same note.
- [ ] After a run, "You said:" (voice) or "You wrote:" (typed) shows with the summary.
- [ ] A member sees "n actions prepared · s s"; an admin sees tool calls, cost and View trace.
- [ ] The Network tab shows `x-request-id: req_` + 12 hex on the `workshop-agent` call, and the same id appears in Logs.

## 12. Build plan

Share of the 2 hours: **25 minutes** for the Must items (inside the README "0:45 to 1:15" slice together with spec 04). Nice items only if time is left.

| # | Task | Min |
|---|---|---|
| 1 | `composerMachine.ts` reducer + `words.ts` + tests | 7 |
| 2 | `useSpeechRecognition` (detect, start/stop/abort, error map, 2:00 timer) | 5 |
| 3 | `Composer` UI: desktop card + mobile dock from one state, `MicButton` hold/tap | 7 |
| 4 | Send with `fetch` + request id + AbortController, timed steps, failed card, bubbles, meta row by role | 5 |
| 5 | Log calls (`voice.*`, stop, `ui.error`) | 1 |
| | **Total Must** | **25** |
| N1 | Unsure chips + slide to cancel | 4 |
| N2 | Permission query + first-use notice + silence timer | 4 |
| N3 | Hat tag + `record=1`, example chips, `/` shortcut | 3 |

## 13. Interview talking points

- **Why browser speech:** free, no vendor, live partials, fits 2 hours. The cost is coverage (no Firefox) and accuracy, which is why typing is always there and the transcript is always reviewed.
- **Why never auto-send:** speech errors on codes and names are common; a person fixes them before the agent acts. The AI never sees text the human didn't confirm.
- **Why a pure reducer:** every transition is a table row and a unit test. Browser APIs only dispatch events. I can explain any state by pointing at one line.
- **Confidence mapping:** the API only gives per-result confidence, so we combine a threshold (0.6) with a code heuristic, because codes are the costly error.
- **Honest progress:** one request, so the step list is timed but the last step never finishes before the server does. Next step: stream real tool calls over SSE from `agent_runs.steps`.
- **Extending in 45 minutes:** swap the hook for a server STT (Whisper or similar) behind the same events; per-word confidence from that API plugs into `toWords`; add the edit-note flow; fuzzy-match spoken codes client-side against open hats to pre-fix the transcript.

## 14. Open questions

1. **No log action for a user-stopped run.** Conventions list no `agent.run.stop`. This spec logs `agent.run.end` from `web` with `{status:"stopped"}`. Prefer adding `agent.run.stop`?
2. **Server side of Stop.** `workshop-agent` should check `req.signal.aborted` before inserting proposals and set `agent_runs.status = "stopped"`, otherwise stopped runs leave pending proposals that reappear on reload. `agent_runs.status` values are not listed in conventions (handoff uses Proposed, Partially approved, Approved, Rejected, Failed, Stopped). Owner: spec 03.
3. **Meta for members.** The contract returns `meta` (tokens, cost) to everyone and only hides it in UI. Least privilege suggests the function omits `tokens_*` and `cost_usd` for members.
4. **Rate limit copy** is not in the handoff. Proposed: "You've sent a lot of notes. Try again in a few minutes."
5. **"Audio isn't stored."** True for our app, but Chrome/Edge send audio to Google/Microsoft for recognition. Consider "Audio isn't stored by Toquilla Trace." or a help line.
6. **Members and "View details"** on the failed run card: handoff says it opens the run, but members can't open runs. This spec shows the Reference instead (same pattern as the approval failed card).
7. **Handoff suggests SSE** for agent steps ("streamed steps via SSE"). This spec uses a timed list; SSE is Cut.
8. **"Last 2 words muted"** in the handoff is implemented as "interim words muted", which is what the API actually knows.
