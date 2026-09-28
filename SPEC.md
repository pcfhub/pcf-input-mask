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
- Autofill's event shape (`dom.user.autofill` is Chromium's documented shape,
  not a measurement).
