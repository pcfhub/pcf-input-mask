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
`beforeinput` (measured), and a composition's `beforeinput` is not cancelable —
one read-back handles them all. A composition is left alone until
`compositionend` (Chromium's last `input` arrives before it). **Undo and redo
are the exception**: cancelled and answered from the control's own history
(`history.ts`), because the browser's stops matching the box after the first
rewrite. The general rules are in the skill — *A value the control reformats as
you type* in `references/rendering-and-hosts.md`.

## Measured — probes 0.0.1 to 0.0.4, Accounts form, cll365, 2026-09-28

Promoted to the skill, and only pointed at here:

- Late, reordered echoes, caught by the recent-writes guard (twice on this
  form, 120–430 ms) → `rendering-and-hosts.md`, *The caret, and what actually
  moves it*.
- The event shapes: typing, paste, Backspace, autofill (bare `input`, no
  `beforeinput`), an honoured `preventDefault`, undo broken by a rewrite and
  redo with it, an identical `value` assignment keeping the cursor →
  `rendering-and-hosts.md` and `verification.md`, *The cursor, and typing as a
  person does*.
- `type` on a type-group binding naming the wrong member (`SingleLine.Phone` on
  a Text column) → `manifest.md`, *Narrowing it*.
- The platform's own error drawn under the field by the modern form →
  `manifest.md`; this control marks the field and prints the text in canvas only.
- `customcontrols` said 0.0.3 while the page ran 0.0.2's bundle →
  `releasing.md`, *Measure before you write*.

This control's own:

- **The Text + Phone type group binds both** (`telephone1`, Format Phone;
  `accountnumber`, Format Text). On a Phone column the platform's call icon is
  gone — the control replaces the field (in `limitations.md`; a call button is a
  0.2.0 candidate, needing a probe of `openUrl('tel:…')`).
- **A saved value the mask cannot show is shown as saved.** 0.0.1 redrew
  `555-0152` as `(555) 015-2` and `ABC28UU7` under `AA-9999` as `AB-287`, in red,
  on a record nobody touched. From 0.0.2 it stays as saved with a neutral note;
  focus shows the mask, blur without typing restores it, nothing is written
  until the user types — the user's choice.
- **A partial value saves as typed** (`(555` read back), and **Business
  required** refuses only an empty value.
- **A value longer than the column is refused at save** (22 formatted in a
  20-character column: an error on the field and in the notification bar). The
  control warns the maker when `neededLength` exceeds `MaxLength`.
- **Per-keystroke notify.** Notifying on blur bought nothing and leaked a value
  through the verdict notify.
- **0.0.4 checks, all passed:** Ctrl+Y and Ctrl+Shift+Z redo from `keydown`;
  the required-field error shows once, under the field; the 22-character mask
  on `accountnumber` warns on sight.
- The platform's retired `MscrmControls.InputMask.InputMaskControl` 1.0.5 is
  still installed in the environment.

## Walkthrough — 0.1.0 on the form

The build with the probe removed. Import as an upgrade, publish, close the tab
and reopen the account, then confirm the page runs 0.1.0: the loaded
`bundle.js` must **not** contain `__pcfInputMaskProbe`.

| # | Do | Expect |
|---|---|---|
| W1 | Main Phone: type `5551234567` fast, then click away | `(555) 123-4567`, no message, no digit lost |
| W2 | Put the cursor just after `) ` and press Backspace | `(551) 234-567`, cursor after `55` |
| W3 | Select all, paste `+1 (212) 555-0100`; Ctrl+Z; Ctrl+Y | `(212) 555-0100`; back to the previous value; forward again |
| W4 | Clear, type `555`, click away, Save; read back | red *Incomplete: 3 of 10*; `(555` saved |
| W5 | Put `555-0152` back through the console (below), reopen | shown as `555-0152` with the grey note; click in shows `(555) 015-2`; click away restores it |
| W6 | Account Number, custom `AA-9999`, Store as raw: type `ab1234`, Save; read back | box `AB-1234`; column `AB1234` |
| W7 | The phone client (Power Apps mobile), Main Phone: type a number | number pad; value masked; no doubled digits |

**Result, 2026-09-28: W1–W6 passed on the Accounts form** with the page
confirmed running the 0.1.0 bundle (no probe in it). W7 (the phone client)
not run. **The control also works in a canvas app** (the user's check, same
day; whether a Save was gated on `isValid` was not reported).

```js
// Read back a column
fetch(`/api/data/v9.2/accounts(${Xrm.Page.data.entity.getId().replace(/[{}]/g, '')})?$select=telephone1,accountnumber`).then((r) => r.json()).then((j) => console.log(j.telephone1, j.accountnumber))
// Put a saved value back without the mask touching it
Xrm.Page.getAttribute('telephone1').setValue('555-0152'); Xrm.Page.data.save()
```

## The hub's demo, after release

**0.1.1 — measured on pcfhub.dev 2026-09-28.** In the published demo,
Backspace gave `(212) 555-010` and `isValid false`; clicking away then put
`(212) 555-0100` back, and the outputs said `2125550100` / `true`. The harness
never writes a control's output back into its value, and re-renders on a width
change (the incomplete line grows the frame), a theme or a locale with the
preset's value as it always was — which `adopt` took as the form's change. A
value equal to the host's last one is ignored now; a form never repeats
itself like that, since every write comes back as a new value. The standard
template scaffold had the same gap (`_template` 3154968); the skill says so in
`rendering-and-hosts.md`.

## Demo

`full`: nothing leaves the browser — no Web API, no device, no navigation —
and the harness answers everything the control reads: the bound value, four
inputs, focus. What the demo cannot show is the platform's echo timing.

## Not verified

- The Power Apps phone client with the Android keyboard, which composes every
  word — the composition path is asserted against Chromium's documented order
  only (W7 asks).
- A canvas app gating Save on `isValid` — the control is confirmed working in
  canvas, the output driving a Save is not.
- Whether a form OnChange handler on the column runs on every keystroke, now
  that every keystroke notifies (as every text control in the catalogue does).
