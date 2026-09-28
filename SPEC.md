# Input Mask

Type into a pattern — phone numbers, postal codes, IDs — and the column keeps its shape.

Picked by the thirteenth demand run (28 Sep 2026): Microsoft deprecated its own
*Input Mask* control in Jan 2023 (unsupported since Apr 2024), forum threads
still ask for a replacement, and the hub had nothing. Decisions made with the
user before a line was written: `store` chooses formatted or raw; presets plus
a custom pattern, no library; an incomplete value is **written** and flagged,
never held back.

## The edit path

The browser makes each edit; `onInput` compares the field with the display
the control last drew, anchored on the cursor, and redraws (`format.ts`,
`applyInput`). Not `beforeinput` + `preventDefault`: autofill fires no
`beforeinput`, a composition's `beforeinput` is not cancelable, and undo is
another path again — one read-back handles them all. A composition is left
alone until `compositionend` (Chromium's last `input` arrives before it).

## Probe 0.0.1 — measure before 0.1.0

A throwaway `InputMask/probe.ts` behind `PROBE = true` in `index.ts`. Put the
control on the Accounts test form **twice**: on `telephone1` (a Phone column)
and on a plain text column. Then, in the browser console on the form:

```js
copy(JSON.stringify(__pcfInputMaskProbe.dump(), null, 1))
```

and paste the result back. **A wrong-way answer removes the feature that
depends on it.**

| # | Question | How | Cuts or changes |
|---|---|---|---|
| P1 | Does the `maskable` type group (Text + Phone) import and bind to `telephone1`? What do `type` and `attributes` say there (the `binding` entry)? Does the platform's own phone behaviour — the call icon, its formatting — still appear around the control? | Import; add to both columns; look; dump | Phone support — or Text only, and the type group goes |
| P2 | Typing `5551234567` at speed: how many `updateView` entries, in what order, carrying which `incoming`, and is any classified `adopt` that should be `echo`? Then `__pcfInputMaskProbe.notifyMode('blur')`, clear, type again. | Type fast; dump; switch; repeat; dump | When `notifyOutputChanged` fires in 0.1.0 |
| P3 | For typing, Backspace, paste (Ctrl+V of `+1 (212) 555-0100`), the browser's own autofill if it offers a phone, and Ctrl+Z: do `beforeinput`/`input` entries carry `inputType` and `data`? Is autofill's `input` a plain `Event`? Then `__pcfInputMaskProbe.blockHash(true)` and type `#`: does it appear? | Each action; dump | Confirms the rig's `dom.user` shapes, or corrects them |
| P4 | Does `attributes.MaxLength` arrive on each column? | `binding` entry | A maker warning when a formatted value is longer than the column |
| P5 | Type `555`, click away, **Save**. Is `(555` saved (read it back below), and is the control's own "Incomplete" message shown? With the column made **Business required**, does the partial value still save? | Save; read back | The wording in `limitations.md` |
| P6 | `__pcfInputMaskProbe.sameValueCaret()` — does an identical `value` assignment leave the cursor at 2 on the form's browser? | Console | The rig's cursor model (`dev/dom.js`) |

### Measured

**P1 — 2026-09-28, Accounts form, cll365. Right way: the Text + Phone type
group imports and binds to both.** On `telephone1` (Format `Phone`) the
control renders and **the platform's own phone affordance is gone** — no call
icon around it; the control replaces the whole field. Two things the binding
said:

- **`parameter.type` is not the column's format on a type-group binding.**
  `telephone1` answered `SingleLine.Phone` — and so did `accountnumber`, a
  **Text** column (`attributes.Format: "Text"`). Read `attributes.Format` /
  `FormatName` when the format matters; `type` names a group member, not
  necessarily the bound one. The control reads neither.
- `attributes` carries `Format`, `FormatName`, `MaxLength` (50 on
  `telephone1`, 20 on `accountnumber` — **P4's first half, answered**),
  `RequiredLevel`, `ImeMode` (1 on the phone column, 0 on text) and
  `Description`. `security` is the object shape, `formatted` equals `raw`.

**Found by looking, not asked:** a stored value that does not fill the mask
is re-drawn *into* it, and the re-drawing misrepresents it. `555-0152` (a
seven-digit local number) showed as `(555) 015-2` with *Incomplete: 7 of
10*; `ABC28UU7` under `AA-9999` showed as `AB-287` with the does-not-fit
note. Both in red on load, for a value nobody on the form typed. Stored
values were not changed (nothing was written).

**Changed in 0.0.2, the user's choice:** a saved value that is incomplete or
lossy under the mask is shown **exactly as saved** at rest, with a neutral
note (`InputMask_Unfit`, secondary text, no `aria-invalid`); focus switches
the box to the mask, blur without typing restores the saved text, and
nothing is written until the user types. `isValid` stays false for it. The
platform's call icon being gone goes into `limitations.md` for 0.1.0; a call
button of the control's own is a 0.2.0 candidate (it would need a probe
question: does `openUrl` take `tel:` on a form and on the phone client).

**P2 — 2026-09-28, 0.0.2 on `telephone1`. Right way; per-keystroke notify
kept.** Every write came back as an `updateView` **120–430 ms** later. Typing
`2` 137 ms after `1` produced the reorder on this control too: write
`(555) 1` (38716), write `(555) 12` (38853), echo **`(555) 1`** (38870), echo
`(555) 12` (38973). The recent-writes guard classified the late one as an echo
and the box kept `(555) 12`, cursor at 8 — a single-value guard would have put
`(555) 1` back and dropped the `2`. Blur mode bought nothing and leaked: the
first keystroke flipped `isValid` true → false, and that verdict notify carried
`(5` to the platform (178383) while the value notify was being held. 0.1.0
notifies on every keystroke and the switch goes.

**P3 (typing only) — same log.** Typing arrives as `InputEvent`,
`cancelable: true`, `inputType: "insertText"`, `data` the character; `input`
carries the same `inputType`/`data`; the `change` on leaving is a plain `Event`.
As the rig models.

**P3 (the rest) and P6 — 2026-09-28, same form.** All as the rig models
except undo:

- **Paste:** a `ClipboardEvent` `paste`, then `beforeinput`/`input`
  `insertFromPaste` with `data` the whole pasted text; `+1 (212) 555-0100`
  written as `(212) 555-0100`.
- **Autofill** (Chrome's saved phone): a bare `input` — **no `inputType`, no
  `beforeinput`** — then `change`; `3318942937` written as `(331) 894-2937`.
  The read-back edit path handled it; a `beforeinput`-only control would not.
- **`preventDefault` on `beforeinput` is honoured:** `#` blocked, no `input`.
- **Undo is broken by any control that rewrites the value.** `historyUndo`
  arrives, `cancelable: true`, and then — the browser's undo stack no longer
  matching the box — an `input` `historyUndo` with the **value unchanged** and
  the cursor at 0; the control then put the cursor after `(`. **0.1.0, the
  user's choice: the control keeps its own history** and answers
  `historyUndo`/`historyRedo` itself (cancel, step back, write, put the cursor
  back). The rig gains `dom.user.undo`/`redo` in the measured shape.
- **P6:** `sameValueCaret()` answered `selectionStart: 2` — an identical
  assignment leaves the cursor. The rig's model holds.
- Not in this log: Backspace just after `) ` (the runs deleted from the end).
  Proven in Chromium in the harness; goes into the walkthrough.
- The probe stayed in `blur` mode through the Ctrl+F5 — the page was not
  reloaded, or the form kept the control. It changes nothing above.

**0.0.3 on the form — 2026-09-28.**

- **A stale bundle, first.** With `customcontrols` answering `0.0.3`, Ctrl+Z
  still behaved as 0.0.2 (an `input` `historyUndo` after each `beforeinput`,
  no `write`) — the browser was running the old `bundle.js`. After a reload
  that took, **Ctrl+Z works.** The version on the record is not evidence of the
  code in the page; `performance.getEntriesByType('resource')` plus a
  `fetch` of the bundle and a search for a string only the new build has is.
- **Ctrl+Y does nothing.** Likely: every `historyUndo` is cancelled, so the
  browser's own history never moves and it has nothing to redo. 0.0.4 takes
  Ctrl+Y / Ctrl+Shift+Z from `keydown` and its probe logs the key to confirm.
- **The platform's retired control is still installed:**
  `MscrmControls.InputMask.InputMaskControl` 1.0.5 is in `customcontrols`.

**P5 — right way.** `555` typed, left, saved: read back `(555`. With the column
**Business required**, an empty value is refused by the platform and a partial
one **is saved** — required means non-empty, nothing more. The docs say so.

**P4, second half — the platform refuses a value longer than the column at
save.** `AAAA-9999-9999-9999-99` (22 formatted) in `accountnumber` (20): "You
have exceeded the maximum number of 20 characters in this field", on the field
and in the form's notification bar; nothing saved. **0.0.4:** when the column
publishes `MaxLength` and a complete value needs more (`neededLength`: every
token formatted, the slots raw), the field says so to the maker on sight.

**Found by looking: every error was shown twice.** The modern form draws the
platform's own message under the field ("⊗ Main Phone: Required fields must be
filled in.") and the control printed `errorMessage` above it. **0.0.4:** on a
model-driven form (the tell: `attributes` present) the field is only marked —
red, `aria-invalid` — and the text is left to the platform; canvas, which draws
nothing, still shows it. The template's scaffolds print it too, so every field
control in the catalogue probably doubles it — not yet looked at on another.

Reading a saved value back (P5), in the console:

```js
fetch(`/api/data/v9.2/accounts(${Xrm.Page.data.entity.getId().replace(/[{}]/g, '')})?$select=telephone1`).then((r) => r.json()).then((j) => console.log(j.telephone1))
```

## Demo

`full`: nothing leaves the browser — no Web API, no device, no navigation —
and the harness answers everything the control reads: the bound value, four
inputs, focus. What the demo cannot show is the platform's echo timing (P2).

## Not verified

- Everything in the P table above.
- The Power Apps phone client with the Android keyboard, which composes every
  word — the composition path is asserted against Chromium's documented order
  only.
- A canvas app gating Save on `isValid`.
- Whether a form OnChange handler on the column runs on every keystroke, now that
  every keystroke notifies (as every text control in the catalogue does).
- Autofill's event shape (`dom.user.autofill` is Chromium's documented shape,
  not a measurement).
