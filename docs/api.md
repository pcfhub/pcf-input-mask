---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

- **Blank means the default.** An unset **Mask** is the US phone, an unset
  **Store as** is formatted, an unset **Guide** is on. The control decides
  this, not the manifest's default value, which some hosts apply and others do
  not.
- **An empty value is written as a cleared column**, not as an empty string.
- **A partial value is written.** **Is valid** says whether it is complete; the
  column says what was typed.
- **Is valid is notified when it changes**, including once on load when the
  stored value is partial or does not fit the mask.
- **A custom pattern with no `9`, `a`, `A` or `*` accepts nothing.** The field
  then shows the column as it is, takes no typing, and says so — it never
  writes.
