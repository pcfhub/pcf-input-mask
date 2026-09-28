---
title: Overview
description: A text or phone column typed into a pattern, with the cursor kept where you type and an honest verdict on what was typed.
order: 1
---

# Input Mask

Type into a pattern — phone numbers, postal codes, IDs — and the column keeps
its shape.

The platform's own *Input Mask* control was deprecated in January 2023 and has
been unsupported since April 2024. This is a replacement you can install
today, for model-driven forms and canvas apps.

## What it does

- **Masks as you type.** `5551234567` becomes `(555) 123-4567` keystroke by
  keystroke. Characters a slot does not take — a letter in a phone number — are
  refused.
- **Keeps your place.** Type in the middle, delete across a `)`, paste into
  half a number: the cursor stays where you were typing, not at the end.
- **Reads what is already there.** A column holding `5551234567`,
  `(555) 123-4567` or `555.123.4567` is shown in the mask. A pasted or
  autofilled `+1 (212) 555-0100` fills a US mask with the country code dropped.
- **Says when a value is not finished.** A partial value is saved — nothing
  typed is lost — and the field says *Incomplete* once you leave it. A value
  already in the column that the mask cannot show is displayed exactly as
  saved, with a note, and left alone until someone types in the field.
- **Stores what you choose.** The formatted value, which is what views, search
  and exports already show, or the typed characters alone.

## Masks

| Mask | Pattern | Example |
| --- | --- | --- |
| US phone (the default) | `(999) 999-9999` | (212) 555-0100 |
| ZIP code | `99999` | 10001 |
| ZIP+4 | `99999-9999` | 10001-0001 |
| Canadian postal code | `A9A 9A9` | K1A 0B1 |
| SSN | `999-99-9999` | 123-45-6789 |
| Custom | your own | see below |

A custom pattern uses `9` for a digit, `a` for a letter, `A` for a letter made
upper-case, `*` for a letter or digit, and `\` before any character to make it
a literal. Anything else is a literal as it stands. `AA-9999` takes two
letters, draws the dash itself and takes four digits.

## Where it runs

Model-driven forms, on a **Text** or **Phone** column, and canvas apps. It has
no dependencies, calls no service and asks for no permissions.
