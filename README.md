# Input Mask

Type into a pattern — phone numbers, postal codes, IDs — and the column keeps its shape.

> **Reference example · built with AI.** This control was written with AI (Claude) and tested on a live Dataverse form; its code has not been reviewed line by line. It is published as a worked example and is not maintained — read the source and [`SPEC.md`](SPEC.md) (what was measured on the form) before you use it. Fixes are not guaranteed.

[![Build](https://github.com/pcfhub/pcf-input-mask/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-input-mask/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-input-mask/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-input-mask/actions/workflows/release.yml)

[![Try it live on PCFHub](https://pcfhub.dev/badges/try-it-live.svg)](https://pcfhub.dev/components/pcf-input-mask)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-input-mask), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

A Text or Phone column typed into a fixed pattern — `(999) 999-9999`, `A9A 9A9`,
or the maker's own — for model-driven forms and canvas apps. It replaces the
platform's *Input Mask* control, deprecated in January 2023 and unsupported
since April 2024.

The work is in keeping the user's place. Every keystroke changes the value the
box holds, and a browser moves the cursor to the end whenever that happens, so
the control redraws after each edit and puts the cursor back by counting the
characters before it — typing in the middle, deleting across a `)`, pasting
half a number all leave it where the user was. The platform's late,
out-of-order echoes of its own writes are recognised and ignored.

Two decisions a reader would otherwise question. A partial value is **written**,
not held back — a form's save cannot be blocked from a control, and losing what
was typed is worse than keeping it with an *Incomplete* message; `isValid` is
there for a canvas app to gate its Save on. And a stored value the mask cannot
read whole is shown with a note and left alone until someone edits it.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | SingleLine.Text or SingleLine.Phone | bound, **required** | — | The column |
| `mask` | Enum | input | `phone-us` | `phone-us`, `zip`, `zip4`, `postal-ca`, `ssn` or `custom` |
| `pattern` | SingleLine.Text | input | — | The pattern when `mask` is `custom`: `9` digit, `a` letter, `A` upper-case letter, `*` either, `` literal |
| `store` | Enum | input | `formatted` | `formatted` stores what is shown; `raw` stores the typed characters alone |
| `guide` | Enum | input | `on` | The `(___) ___-____` guide in an empty, focused field |
| `placeholder` | SingleLine.Text | input | — | Hint text while the field is empty |
| `isValid` | TwoOptions | output | — | Empty or complete; for a canvas Save. Do not bind on a model-driven form |

Blank inputs mean the default, decided in code. Strings ship in English,
Spanish, French, German and Japanese. No framework, no library, no
`uses-feature` — nothing for a maker to approve at install.

## On the hub

The demo is `full`: the control reaches no Web API, device or navigation, so
the hub's harness answers everything it reads. The presets cover the US phone,
an empty field with its guide, a Canadian postal code, a custom `AA-9999`,
raw storage, and a stored value that does not fit. What the demo cannot show
is the platform's echo timing, which only a real form produces.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-input-mask/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control gets one too: `dev/fluent-stub.js` stands
in for the Fluent the platform would supply, and its header says exactly where
the stand-in is less capable than the real thing.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

```bash
npm run bump -- --minor      # every version location, in one edit
npm run release -- --draft   # .release-notes.md, from the commits since the last tag
# …rewrite the notes, commit the bump…
npm run release -- --push
```

**On PowerShell, call the scripts directly** — `node scripts/version.mjs --minor`.
npm swallows a `--` flag there, warns *"Unknown cli config"*, and runs the
script with no arguments: it prints the report, changes nothing, and reads as a
bump that found nothing to do.

`npm run bump` with no argument is a **read**: it prints every place the version
lives and exits 1 if they disagree. Worth running before anything else, because
the same check otherwise happens in CI — on a Windows runner, after the pack, on
a tag that has already been pushed. `npm run check` now runs it too.

The version lives in **three** places, more in a repository holding several
controls, and they are checked against each other:

- `InputMask/ControlManifest.Input.xml` → `<control version="…">`
- `Solution/src/Other/Solution.xml` → `<Version>`
- `package.json` → `"version"`

Doing it by hand is still fine, and then the thing to get right is the tag:

```bash
git tag -a --cleanup=verbatim v1.2.3 -F notes.md && git push origin v1.2.3
```

**Without `--cleanup=verbatim`, git drops every `## Heading` in the notes as a
comment, silently.** `npm run release` passes it, and then reads the tag back to
confirm the headings survived — because the failure is invisible in the command
that caused it.

**The tag message is the release body, and the release body is the changelog
on the hub.** A lightweight tag gets GitHub's generated notes instead, which
for a repository without pull requests is a single compare link — and the
workflow warns when that is about to happen.

There is deliberately no `CHANGELOG.md`. The hub builds the changelog from
release notes, and `docs/changelog.md` is a hard failure in `npm run check`.

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `InputMask/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
