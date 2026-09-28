---
title: Limitations
description: What the mask does not do, and why.
order: 7
---

# Limitations

## It cannot stop a form saving

A code component has no way to block a model-driven form's save. A partial
value is therefore **written as typed** — nothing the user entered is lost —
and the field says **Incomplete** once they leave it. To make a partial value
unsaveable on a form, add a business rule or a column validation; in a canvas
app, gate your Save on **Is valid** (see [Canvas apps](canvas.md)).

## Fixed-length masks only

Every mask has one length. A ZIP that may or may not carry its +4, a UK
postcode, a phone number with an optional extension — each has more than one
length, and a mask with an optional part cannot say whether a value is
complete. Use one mask per shape, or leave such a column as plain text.

## Character shapes, not values

A mask checks what *kind* of character goes where: a digit, a letter. It does
not check that `99/99/9999` is a real date, that a month is at most 12, or
that a phone number exists. For a date, use a date column.

## No international phone numbers

The phone preset is the North American shape. A pasted or autofilled number
starting with `+` and a country code has the country code dropped when the
rest fits; there is no per-country formatting. A custom pattern covers any one
national shape.

## *Raw* makes views show the characters

With **Store as** set to raw, the column holds `2125550100`, and every view,
search result and export shows that — the mask is only on the form. Choose raw
for integrations, formatted for people.

## A value that does not fit is shown, not fixed

A saved value the mask cannot show — too short for it (`555-0152` in a US
phone mask) or holding something no slot takes (`555.123.4567 x12`) — is shown
exactly as saved, with a note, and **Is valid** is false for it. The column is
not rewritten until someone types in the field; then it is rewritten in the
mask, dropping what did not fit. To convert existing rows in bulk, update them
with a flow or an import.

## No call button on a phone column

On a **Phone** column the platform draws its own call icon beside the value.
The control replaces the whole field, so that icon is gone while the mask is on
it (measured on a model-driven form). A call button of the control's own is a
candidate for a later version.

## Typing into a full value

Once every slot is filled, a further character at the end is refused. One
typed in the middle is inserted and pushes the last character out, as
overtyping would — select what you want to replace first.

## Email and URL columns

The control binds Text and Phone columns only. An email or URL has no fixed
shape, and a browser gives an email field no cursor to put back.
