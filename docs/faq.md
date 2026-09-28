---
title: FAQ
description: Common questions about the mask.
order: 8
---

# FAQ

## Why was my partial value saved?

Because a form's save cannot be blocked from a control, and throwing away what
somebody typed is worse than keeping it with a warning. The field says
**Incomplete**; a business rule or column validation can make it unsaveable.
See [Limitations](limitations.md).

## Does it replace the platform's Input Mask control?

It covers what that control was used for — a fixed pattern on a text or phone
column — with the same pattern characters. The platform's control was
deprecated in January 2023 and is unsupported since April 2024.

## Can I switch *Store as* after rows exist?

Yes. The control reads both shapes, so existing rows display correctly either
way. Each row is rewritten in the new shape the next time someone edits it; to
convert them all at once, update them with a flow or a data import.

## Why is the number pad showing on my phone?

Every slot in the mask takes a digit, so the control asks for the numeric
keyboard. A mask with a letter slot asks for the full keyboard.

## Does it work in a canvas app?

Yes, with **Is valid** to gate a Save on. See [Canvas apps](canvas.md).

## Can the message say something else?

The messages are the control's own, in English, Spanish, French, German and
Japanese, following the user's language. A business rule's message on the
same column is shown in their place.
