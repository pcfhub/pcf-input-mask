---
title: Examples
description: Patterns for common shapes, and what each one stores.
order: 6
---

# Examples

| Shape | Mask | Custom pattern | Stored (formatted) | Stored (raw) |
| --- | --- | --- | --- | --- |
| US phone | US phone | — | `(212) 555-0100` | `2125550100` |
| Canadian postal code | Canadian postal code | — | `K1A 0B1` | `K1A0B1` |
| Order code | Custom | `AA-9999` | `AB-1234` | `AB1234` |
| Serial with a fixed prefix | Custom | `SN\-****-****` | `SN-4F2A-9Z01` | `4F2A9Z01` |
| Date-shaped reference | Custom | `9999/99/99` | `2026/09/28` | `20260928` |

## Fixed length only

Every mask is one length. A UK postcode (`SW1A 1AA`, `M1 1AE`, `B33 8TH`) has
several, and so does a ZIP that may or may not carry its +4 — use two
different columns or two masks, or a plain text column. A mask whose last part
is optional cannot say whether a value is complete, and saying that is what
**Is valid** is for.

## A literal that looks like a slot

`9`, `a`, `A` and `*` are slots. To draw one as a literal, put `\` before it:
`\A-999` is a literal `A`, a dash and three digits. `SN\-` above needs no
escape for the dash — only the four slot characters do — it is shown escaped
to make the point that escaping anything else is harmless.
