---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

Nothing beyond a current Power Platform environment. The control has no
runtime dependencies — no React, no Fluent, no masking library — so there is
nothing to install first and nothing to keep in step with a platform upgrade.

It declares `external-service-usage` as disabled, so it is not a premium
component, and it declares no features, so it asks the installing maker for no
permissions.
