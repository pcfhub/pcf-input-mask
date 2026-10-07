---
title: Canvas apps
description: Bind the mask to a text value and gate a Save on whether it is complete.
order: 4
---

# Canvas apps

:::steps
1. Enable **Code components for canvas apps** for the environment.
2. **Insert → Get more components → Code**, and import **Input Mask**.
3. Bind **Value** to the field or variable holding the text.
4. Set **Mask**, and **Custom pattern** for a custom one.
:::

## Gating Save on *Is valid*

In a canvas app the save is yours, so it can wait for a complete value. **Is
valid** is `true` when the value is empty or fills the mask, and `false` while
it is partial or when the stored value does not fit:

```powerfx
// The Save button
DisplayMode: If(InputMask1.isValid, DisplayMode.Edit, DisplayMode.Disabled)
```

The control reports **Is valid** as soon as it loads, so the button is right
before anyone types. That report is an output change: `OnChange` runs once on
load.

:::callout{type=warning}
**0.1.1 and earlier reported nothing on load unless the value was incomplete,
and a canvas app reads that silence as `false`.** A record with a complete
phone number, or an empty optional field, kept a Save gated on **Is valid**
disabled until somebody edited the field. Those versions also told a custom
mask longer than 100 characters that "the column holds 100", whatever it was
bound to. 0.1.2 fixes both.

Importing 0.1.2 does not update an app that already has the control. Open the
app in Studio after the import, accept **Update code components**, then save
and publish — if Save is greyed out, change any formula first.
:::

An empty value counts as valid on purpose: whether the field may be empty is
the form's own required-ness, not the mask's. Combine the two when both
matter:

```powerfx
DisplayMode: If(InputMask1.isValid && !IsBlank(InputMask1.Value), DisplayMode.Edit, DisplayMode.Disabled)
```

## Reading the value

**Value** is what the control writes: the formatted value, or the characters
alone with **Store as** set to raw.
