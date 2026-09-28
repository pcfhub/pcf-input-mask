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

An empty value counts as valid on purpose: whether the field may be empty is
the form's own required-ness, not the mask's. Combine the two when both
matter:

```powerfx
DisplayMode: If(InputMask1.isValid && !IsBlank(InputMask1.Value), DisplayMode.Edit, DisplayMode.Disabled)
```

## Reading the value

**Value** is what the control writes: the formatted value, or the characters
alone with **Store as** set to raw.
