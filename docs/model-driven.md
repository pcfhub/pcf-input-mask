---
title: Model-driven apps
description: Put the mask on a Text or Phone column on a form.
order: 3
---

# Model-driven apps

:::steps
1. Open the form in the form designer and select a **Single line of text**
   column whose format is **Text** or **Phone**.
2. **+ Component**, then **Input Mask**.
3. Choose a **Mask**. For **Custom pattern**, fill in **Custom pattern** too.
4. Choose **Store as** — **Formatted** unless something downstream wants the
   digits alone.
5. Save and publish the form.
:::

## Leave *Is valid* unbound

The control has an output, **Is valid**, for canvas apps. Do not bind it on a
model-driven form: binding an output in the classic form designer breaks the
form's save. A form's save cannot be blocked from a control anyway — see
[Limitations](limitations.md).

## What the user sees

- The field shows the value in the mask. An empty field shows the guide, such
  as `(___) ___-____`, while it has focus (switch it off with **Guide**).
- A value that is not complete is saved as typed; once the user leaves the
  field it says **Incomplete**, with how many characters are there of how many
  the mask wants.
- A value already in the column that the mask cannot read whole — an
  extension typed after a phone number, say — is shown as far as the mask can
  read it, with a note giving the stored value. Nothing is rewritten until the
  user edits the field.
- A business rule's or the platform's own validation message wins over the
  control's.

## Choosing *Store as*

**Formatted** stores `(212) 555-0100`: what the user sees is what views,
Advanced Find, search and Excel exports show. **Raw characters only** stores
`2125550100`, for an integration or a duplicate-detection rule that wants
digits — views then show the digits too. Either way the control reads both
shapes, so switching later does not strand existing rows; they are rewritten in
the new shape only when someone edits them.
