/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/InputMask/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **If the bundle will not load here at all**, because it carries a browser
 * application that reads `document` at module scope — a Monaco, a map, a
 * charting library — do not grow `dom.js` to meet it. Keep the control's
 * decisions in modules that import nothing of the library, and drive those
 * instead, through `dev/modules.js`: it transpiles them with the TypeScript
 * already in devDependencies and refuses one that imports the library
 * (`pcf-code-editor` is the worked example). The skill has the shape under
 * *When the bundle cannot load in Node*.
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');
const fixture = require('./fixture.js');

const BUNDLE = path.join(root, 'out', 'controls', 'InputMask', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/InputMask. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
/*
 * **A stand-in component per name, not the name as the element type.** React
 * lower-cases an unknown element, so `MenuItem` became `<menuitem>` — which
 * HTML treats as a void element, and `renderToStaticMarkup` throws rather
 * than give it children. Every capitalised export is therefore a function
 * component rendering a `<div data-fluent="Name">` with the string, number
 * and boolean props the control passed — className, aria-*, title, disabled
 * — so `renderDeep` can look for them; a lower-case export (`webLightTheme`,
 * `tokens`) is a plain object. Found by `pcf-calendar-view`, whose move menu
 * was the first `MenuItem` a suite tried to render.
 */
const standIns = new Map();

function fluentStandIn(name) {
    if (!standIns.has(name)) {
        const StandIn = (props) => {
            const passed = { 'data-fluent': name };

            Object.keys(props || {}).forEach((key) => {
                const value = props[key];

                if (key !== 'children' && ['string', 'number', 'boolean'].includes(typeof value)) {
                    passed[key] = value;
                }
            });

            return React.createElement('div', passed, props.children);
        };

        StandIn.displayName = name;
        standIns.set(name, StandIn);
    }

    return standIns.get(name);
}

const fluent = new Proxy({}, {
    get: (_target, name) => {
        if (typeof name !== 'string') {
            return undefined;
        }

        return /^[A-Z]/.test(name) ? fluentStandIn(name) : {};
    },
});

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

/*
 * Every input the manifest declares, unset. The platform hands an unset input
 * over as `{ raw: null }`, never as a missing key, so a suite that omitted
 * them would be testing a context no host builds.
 */
const INPUTS = { mask: null, pattern: null, store: null, guide: null };

function mount(given) {
    const options = { ...given, inputs: { ...INPUTS, ...(given.inputs || {}) } };
    const container = dom.createElement('div');
    /*
     * What is the *instance's* rather than the render's: the call log, the
     * organisation URL and the rows behind the Web API. `createContext` runs
     * per render, so these are decided once here and handed to every context
     * this mount builds — `update()` included, which used to drop `calls` and
     * so could not record what a re-render made the control do.
     */
    const site = { calls: [], clientUrl: options.clientUrl || host.nextClientUrl(), fixture: options.fixture || fixture };
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, ...site });
    const instance = new registration.ctor();

    let notifications = 0;

    /*
     * The third argument is the state a previous mount handed to
     * `mode.setControlState`, and it was hard-coded to `{}` here — which made
     * the *return* half of that API unreachable from a suite. Pass `state` in
     * `options` to mount a control the way the platform remounts one after a
     * form tab switch. `{}` remains the default, because that is a first mount.
     */
    instance.init(context, () => {
        notifications += 1;
    }, options.state || {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** Every platform call the control made, on any pass. */
        calls: () => site.calls,
        /** The organisation URL this instance's `page.getClientUrl()` answers. */
        clientUrl: site.clientUrl,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...site, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  THE DECISION MODULES — pattern.ts, format.ts, verdict.ts, loaded from
 *  source. What a mask is, how an edit is read back, what is stored and when
 *  a value is complete. The bundle sections below prove index.ts asks these
 *  the right questions.
 * ======================================================================== */

const { createLoader } = require('./modules');
const load = createLoader({
    root: path.join(root, 'InputMask'),
    forbid: [[/(^|\/)index$/, 'the entry point'], [/generated/, 'the manifest types']],
});

const P = load('pattern');
const F = load('format');
const V = load('verdict');
const H = load('history');

const phone = P.resolve('phone-us', null).mask;
const digits = (text) => F.extract(phone, text).join('');

{
    check('a blank mask is the US phone — the code decides what blank means', P.resolve('', null).pattern === '(999) 999-9999' && P.resolve(null, null).pattern === '(999) 999-9999');
    check('a preset this version does not know is read as blank, not refused', P.resolve('phone-uk', null).ok === true && P.resolve('phone-uk', null).pattern === '(999) 999-9999');
    check('an empty custom pattern is a named state, not a throw', JSON.stringify(P.resolve('custom', '  ')) === '{"ok":false,"reason":"empty"}');
    check('so is a custom pattern with no slot in it', P.resolve('custom', 'ID-').reason === 'no-slots');
    check(
        '9 a A * are slots, and a backslash makes the next character a literal',
        JSON.stringify(P.parse('\\9aA*-').tokens.map((t) => (t.kind === 'slot' ? t.accept + (t.upper ? '^' : '') : t.char))) === '["9","letter","letter^","alnum","-"]',
    );
    check('a letter is a character with case — accents and other alphabets count, digits and CJK do not', P.isLetter('é') && P.isLetter('Ж') && !P.isLetter('7') && !P.isLetter('中'));
    check('an all-digit mask asks for the number pad, a postal code does not', phone.numeric && !P.resolve('postal-ca').mask.numeric);
    check('the guide is the pattern with every slot drawn as _', P.guide(phone) === '(___) ___-____');

    check('a stored raw value is read', digits('5551234567') === '5551234567');
    check('so is a stored formatted one', digits('(555) 123-4567') === '5551234567');
    check('and one typed by hand in another shape', digits('555.123.4567') === '5551234567');
    check('a leading + and country code is dropped when the number is too long for the mask', digits('+1 (555) 123-4567') === '5551234567');
    check('without the +, a long number keeps its first digits — no country code is guessed', digits('15551234567') === '1555123456');
    check('a literal that is itself a digit is read as the literal in a formatted value', F.extract(P.parse('+1 (999) 999'), '+1 (555) 123').join('') === '555123');
    check('an A slot upper-cases what it takes', F.render(P.resolve('postal-ca').mask, F.extract(P.resolve('postal-ca').mask, 'k1a 0b1')) === 'K1A 0B1');

    check('literals between characters are drawn, trailing ones are not', F.render(phone, ['5', '5', '5']) === '(555' && F.render(phone, ['5', '5', '5', '1']) === '(555) 1');
    check('an empty value draws nothing, not a lone (', F.render(phone, []) === '');
    check('the cursor before the first character sits after the leading literal', F.caretAt(phone, ['5'], 0) === 1);

    check('a stored value with content the mask drops is lossy', F.isLossy(phone, '555.123.4567 x12', F.extract(phone, '555.123.4567 x12')));
    check('the mask’s own punctuation lost is not', !F.isLossy(phone, '(555) 123-4567', F.extract(phone, '(555) 123-4567')));
    check('nor is a country code dropped after a +', !F.isLossy(phone, '+1 (555) 123-4567', F.extract(phone, '+1 (555) 123-4567')));

    // One edit, read back from the field: (old display, new text, caret after).
    const edit = (prev, text, caret, inputType) => {
        const chars = F.extract(phone, prev);
        const r = F.applyInput(phone, chars, F.render(phone, chars), text, caret, inputType);
        return `${F.render(phone, r.chars)}@${F.caretAt(phone, r.chars, r.k)}`;
    };

    check('Backspace just after ") " removes the digit before it, not only the space', edit('(555) 1', '(555)1', 5, 'deleteContentBackward') === '(551@3', edit('(555) 1', '(555)1', 5, 'deleteContentBackward'));
    check('Delete just before ") " removes the digit after it', edit('(555) 12', '(555 12', 4, 'deleteContentForward') === '(555) 2@4', edit('(555) 12', '(555 12', 4, 'deleteContentForward'));
    check('a digit typed in the middle shifts the rest and keeps the cursor after it', edit('(555) 12', '(5955) 12', 3, 'insertText') === '(595) 512@3', edit('(555) 12', '(5955) 12', 3, 'insertText'));
    check('a letter typed into a digit slot is refused and the cursor stays', edit('(555', '(555x', 5, 'insertText') === '(555@4', edit('(555', '(555x', 5, 'insertText'));
    check('a digit typed at the end of a complete value is refused', edit('(555) 123-4567', '(555) 123-45678', 15, 'insertText') === '(555) 123-4567@14');
    check('a paste in the middle flows into the slots', edit('(555', '(55125', 5, 'insertFromPaste') === '(551) 25@7', edit('(555', '(55125', 5, 'insertFromPaste'));
    check('a paste replacing everything is read as a whole value', edit('(555', '+1 (212) 555-0100', 17, 'insertFromPaste') === '(212) 555-0100@14', edit('(555', '+1 (212) 555-0100', 17, 'insertFromPaste'));
    check('of two identical digits, the cursor decides which was typed', edit('(555', '(5555', 2, 'insertText') === '(555) 5@2', edit('(555', '(5555', 2, 'insertText'));

    check('empty is its own verdict, not a failure', V.verdictOf(phone, []) === 'empty');
    check('complete and incomplete by slot count', V.verdictOf(phone, Array.from('5551234567')) === 'complete' && V.verdictOf(phone, ['5']) === 'incomplete');
    check('an empty value is stored as null, not ""', V.stored(phone, [], 'formatted') === null);
    check('formatted stores the display, raw the characters', V.stored(phone, Array.from('555'), 'formatted') === '(555' && V.stored(phone, Array.from('555'), 'raw') === '555');
    {
        const snap = (text, k) => ({ chars: Array.from(text), k });
        let h = H.empty();

        h = H.record(h, snap('', 0), 'insertText');
        h = H.record(h, snap('5', 1), 'insertText');
        h = H.record(h, snap('55', 2), 'insertText');
        check('a run of typing is one undo step', h.past.length === 1 && h.past[0].chars.join('') === '', JSON.stringify(h.past));

        h = H.record(h, snap('555', 3), 'insertFromPaste');
        h = H.record(h, snap('555212', 6), 'insertFromPaste');
        check('each paste is a step of its own', h.past.length === 3, String(h.past.length));

        const back = H.undo(h, snap('5552125550', 10));
        check('undo steps back to the field before the last edit and keeps the present for redo', back.to.chars.join('') === '555212' && back.history.future.length === 1);
        const forward = H.redo(back.history, back.to);
        check('redo steps forward again', forward.to.chars.join('') === '5552125550');
        check('a new edit ends the redo', H.record(back.history, snap('555212', 6), 'insertText').future.length === 0);
        check('nothing to undo is null, not a throw', H.undo(H.empty(), snap('', 0)) === null && H.redo(H.empty(), snap('', 0)) === null);
    }
    check('a blank or unknown store is formatted', V.storeOf(null) === 'formatted' && V.storeOf('digits') === 'formatted' && V.storeOf(' raw ') === 'raw');
}

/* ======================================================================== *
 *  THE CONTROL — the bundle, typed into with dom.user the way a person types.
 * ======================================================================== */

const field = (handle) => handle.find('input');
const message = (handle) => handle.find('.InputMask-message');
const shown = (handle) => (message(handle).hidden ? '' : message(handle).textContent);

{
    const stored = mount({ value: '5551234567' });

    check('a stored raw value is shown in the mask', field(stored).value === '(555) 123-4567', field(stored).value);
    check('and reading it writes nothing', stored.notifications() === 0, String(stored.notifications()));
    check('an all-digit mask asks for the number pad and the browser’s phone autofill', field(stored).inputMode === 'numeric' && field(stored).getAttribute('autocomplete') === 'tel-national');

    const typed = mount({ value: null });

    dom.user.type(field(typed), '5551234567');
    check('typing fills the mask as it goes', field(typed).value === '(555) 123-4567' && field(typed).selectionStart === 14, `${field(typed).value} @${field(typed).selectionStart}`);
    check('and hands back the formatted value', typed.outputs().value === '(555) 123-4567' && typed.outputs().isValid === true, JSON.stringify(typed.outputs()));
    check('one notification per character that changed the value', typed.notifications() === 10, String(typed.notifications()));

    const raw = mount({ value: null, inputs: { store: 'raw' } });

    dom.user.type(field(raw), '5551234567');
    check('store raw hands back the characters alone, the box still masked', raw.outputs().value === '5551234567' && field(raw).value === '(555) 123-4567', JSON.stringify(raw.outputs()));

    const refused = mount({ value: '(555' });

    // One notification already: an incomplete stored value reports isValid
    // false on load, so a canvas app gating Save knows before anyone types.
    check('an incomplete stored value reports isValid false on load, once', refused.notifications() === 1 && refused.outputs().isValid === false);

    /*
     * The first verdict in a canvas app is reported whatever it is. An output
     * nobody has reported reads false there, so through 0.1.1 a complete value
     * and an empty optional field read "not valid" until their first edit
     * (a published canvas app, 2026-10-07), and a Save gated on isValid was
     * off for a record nobody had touched.
     */
    const canvasComplete = mount({ host: 'canvas', value: '(555) 123-4567' });

    check(
        'in a canvas app a complete stored value reports isValid true on load, once, and the value unchanged',
        canvasComplete.notifications() === 1 && canvasComplete.outputs().isValid === true && canvasComplete.outputs().value === '(555) 123-4567',
        `${canvasComplete.notifications()} / ${JSON.stringify(canvasComplete.outputs())}`,
    );

    canvasComplete.update({ host: 'canvas', value: '(555) 123-4567' });
    check('and says it once, not on every render', canvasComplete.notifications() === 1, String(canvasComplete.notifications()));

    const canvasEmpty = mount({ host: 'canvas', value: null });

    check(
        'an empty optional field reports true there too, and clears nothing it was not asked to',
        canvasEmpty.notifications() === 1 && canvasEmpty.outputs().isValid === true && canvasEmpty.outputs().value === null,
        `${canvasEmpty.notifications()} / ${JSON.stringify(canvasEmpty.outputs())}`,
    );

    const canvasShort = mount({ host: 'canvas', value: '(555' });

    check('and an incomplete one reports false, once', canvasShort.notifications() === 1 && canvasShort.outputs().isValid === false);

    field(refused).setSelectionRange(4, 4);
    dom.user.type(field(refused), 'x');
    check('a letter in a phone mask changes nothing and notifies nothing', field(refused).value === '(555' && field(refused).selectionStart === 4 && refused.notifications() === 1);

    const back = mount({ value: '(555) 1' });

    field(back).setSelectionRange(6, 6);
    dom.user.backspace(field(back));
    check('Backspace after ") " deletes a digit rather than appearing to do nothing', field(back).value === '(551' && field(back).selectionStart === 3, `${field(back).value} @${field(back).selectionStart}`);

    const middle = mount({ value: '(555) 12' });

    field(middle).setSelectionRange(2, 2);
    dom.user.type(field(middle), '9');
    check('a digit typed in the middle keeps the cursor after it, not at the end', field(middle).value === '(595) 512' && field(middle).selectionStart === 3, `${field(middle).value} @${field(middle).selectionStart}`);

    const pasted = mount({ value: null });

    dom.user.paste(field(pasted), '+1 (212) 555-0100');
    check('a pasted international number fills a national mask', field(pasted).value === '(212) 555-0100', field(pasted).value);

    const filled = mount({ value: null });

    dom.user.autofill(field(filled), '212 555 0100');
    check('autofill — no beforeinput, no inputType — is masked too', field(filled).value === '(212) 555-0100' && filled.outputs().value === '(212) 555-0100', field(filled).value);

    const composed = mount({ value: null });

    dom.user.compose(field(composed), ['5', '55'], '555');
    check('a composition is left alone until it ends, then masked once', field(composed).value === '(555' && composed.notifications() === 1, `${field(composed).value} / ${composed.notifications()}`);

    /*
     * The late echo: the platform hands back an earlier keystroke after a
     * later one (measured 2026-09-13). The box must keep what was typed, and
     * the cursor where it was.
     */
    const echoed = mount({ value: null });

    dom.user.type(field(echoed), '555');
    echoed.update({ value: '(555' });
    echoed.update({ value: '(55' });
    echoed.update({ value: '(5' });
    check('a late echo of an earlier keystroke changes nothing', field(echoed).value === '(555' && field(echoed).selectionStart === 4 && echoed.outputs().value === '(555', `${field(echoed).value} @${field(echoed).selectionStart}`);

    echoed.update({ value: '2125550100' });
    check('a value the control never wrote is taken, and masked', field(echoed).value === '(212) 555-0100', field(echoed).value);

    /*
     * The hub's demo, measured 2026-09-28: it never writes the control's
     * output back into its value, and re-renders — on a width change, a theme
     * toggle, a locale — with the preset's value as it always was. Backspace,
     * leave the field, and the re-render handed `2125550100` down over
     * `(212) 555-010`; taken as the form's change, it wiped the edit and the
     * incomplete line with it.
     */
    const demo = mount({ value: '2125550100' });
    const d = field(demo);

    d.focus();
    d.setSelectionRange(14, 14);
    dom.user.backspace(d);
    d.blur();
    demo.update({ value: '2125550100' });
    demo.update({ value: '2125550100', dark: true });
    check('a host repeating its last value is not news — the edit and its message survive the demo’s re-render', d.value === '(212) 555-010' && shown(demo) === 'resx:InputMask_Incomplete' && demo.outputs().isValid === false, `${d.value} / ${shown(demo)}`);

    demo.update({ value: '5551234567' });
    check('but a value the host has not sent before is still taken', d.value === '(555) 123-4567', d.value);

    const cleared = mount({ value: '(555' });

    field(cleared).select();
    dom.user.backspace(field(cleared));
    check('clearing the field writes null, not ""', cleared.outputs().value === null && field(cleared).value === '', JSON.stringify(cleared.outputs()));

    /*
     * Undo. Measured on the form 2026-09-28: once the control rewrites the
     * box, the browser's own Ctrl+Z changes nothing and leaves the cursor at 0
     * — so the control cancels historyUndo/historyRedo and answers them.
     */
    const undoing = mount({ value: null });
    const u = field(undoing);

    dom.user.type(u, '5551');
    dom.user.paste(u, '234');
    check('typing then a paste', u.value === '(555) 123-4', u.value);

    check('Ctrl+Z is cancelled and answered by the control', dom.user.undo(u) === true);
    check('undoing the paste restores the field before it, the cursor where it was, and writes it', u.value === '(555) 1' && u.selectionStart === 7 && undoing.outputs().value === '(555) 1', `${u.value} @${u.selectionStart} / ${JSON.stringify(undoing.outputs())}`);

    dom.user.undo(u);
    check('the typed run before it is one more step, back to empty', u.value === '' && undoing.outputs().value === null, JSON.stringify(u.value));

    dom.user.redo(u);
    dom.user.redo(u);
    check('redo brings both back', u.value === '(555) 123-4' && undoing.outputs().value === '(555) 123-4', u.value);

    /*
     * Ctrl+Y from the key. On the form (0.0.3) Ctrl+Z worked and Ctrl+Y did
     * nothing — with every historyUndo cancelled the browser has nothing of its
     * own to redo. The key is taken instead.
     */
    const key = (k, extra) => {
        const event = { type: 'keydown', target: u, key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
        u.dispatchEvent(event);
        return event;
    };

    dom.user.undo(u);
    const ctrlY = key('y');
    check('Ctrl+Y redoes, and its default is prevented', ctrlY.defaultPrevented && u.value === '(555) 123-4', u.value);

    dom.user.undo(u);
    key('Z', { shiftKey: true });
    check('so does Ctrl+Shift+Z', u.value === '(555) 123-4', u.value);

    dom.user.undo(u);
    check('Ctrl+Z is left to beforeinput — the key is not taken', key('z').defaultPrevented === false && u.value === '(555) 1', u.value);
    dom.user.redo(u);

    u.setSelectionRange(3, 3);
    dom.user.undo(u);
    dom.user.undo(u);
    const caretBefore = u.selectionStart;
    check('with nothing left to undo, Ctrl+Z is still cancelled and the cursor does not jump', dom.user.undo(u) === true && u.value === '' && u.selectionStart === caretBefore);

    const replaced = mount({ value: null });

    dom.user.type(field(replaced), '555');
    replaced.update({ value: '2125550100' });
    dom.user.undo(field(replaced));
    check('a value from the form starts the history again — undo does not bring back what it replaced', field(replaced).value === '(212) 555-0100', field(replaced).value);
}

{
    const partial = mount({ value: null });

    dom.user.type(field(partial), '555');
    check('no message while the value is being typed', shown(partial) === '');

    field(partial).blur();
    check('an incomplete value is written, and said to be incomplete once the user leaves', partial.outputs().value === '(555' && shown(partial) === 'resx:InputMask_Incomplete' && field(partial).getAttribute('aria-invalid') === 'true', shown(partial));
    check('and isValid is false', partial.outputs().isValid === false);

    const empty = mount({ value: null });

    field(empty).blur();
    check('an empty value is valid — whether it may be empty is the column’s requirement', empty.outputs().isValid === true && shown(empty) === '');

    /*
     * A saved value the mask cannot show — measured on the form 2026-09-28:
     * 0.0.1 redrew `555-0152` as `(555) 015-2` and `ABC28UU7` under AA-9999 as
     * `AB-287`, values nobody saved, in red, on a record nobody had touched.
     * At rest it is shown as saved, with a neutral note; clicking in switches
     * to the mask; leaving without typing puts it back; nothing is written.
     */
    const short = mount({ value: '555-0152' });
    const box = field(short);

    check('a saved value too short for the mask is shown exactly as saved', box.value === '555-0152', box.value);
    check('with a neutral note, not an error', shown(short) === 'resx:InputMask_Unfit'
        && message(short).classList.contains('InputMask-message--note')
        && !short.container.classList.contains('InputMask--invalid')
        && box.getAttribute('aria-invalid') === 'false', short.container.className);
    check('and isValid false, reported once on load, the column left alone', short.notifications() === 1 && short.outputs().isValid === false && short.outputs().value === '555-0152', JSON.stringify(short.outputs()));

    box.focus();
    check('clicking in switches the box to the mask', box.value === '(555) 015-2', box.value);
    box.blur();
    check('leaving without typing puts the saved text back and writes nothing', box.value === '555-0152' && short.notifications() === 1 && shown(short) === 'resx:InputMask_Unfit', `${box.value} / ${short.notifications()}`);

    dom.user.type(box, '999');
    check('typing takes it into the mask, writes it, and drops the note', box.value === '(555) 015-2999' && short.outputs().value === '(555) 015-2999' && short.outputs().isValid === true, `${box.value} / ${JSON.stringify(short.outputs())}`);
    box.blur();
    check('and it stays in the mask after the user leaves', box.value === '(555) 015-2999' && shown(short) === '', box.value);

    const unfit = mount({ value: 'ABC28UU7', inputs: { mask: 'custom', pattern: 'AA-9999', store: 'raw' } });

    check('a saved value with characters no slot takes is shown as saved too', field(unfit).value === 'ABC28UU7' && shown(unfit) === 'resx:InputMask_Unfit', field(unfit).value);

    const both = mount({ value: '555.123.4567 x12', error: true });

    /*
     * Measured 2026-09-28: a model-driven form draws the platform's own
     * message under the field itself, so the control printing it too showed
     * every error twice. There the field is only marked; canvas draws nothing,
     * so there the text is shown.
     */
    check('on a model-driven form the platform’s error outranks the control’s, and is not printed twice', shown(both) === ''
        && both.container.classList.contains('InputMask--invalid') && field(both).getAttribute('aria-invalid') === 'true', shown(both));

    const bothCanvas = mount({ value: '555.123.4567 x12', error: true, host: 'canvas' });

    check('in canvas, which draws nothing, the platform’s message is shown', shown(bothCanvas) === host.DEFAULTS.errorMessage, shown(bothCanvas));

    /*
     * Measured 2026-09-28: a 22-character formatted value in a 20-character
     * column is refused at save. A mask that long can never be saved
     * complete, so the maker is told on sight.
     */
    const long = { mask: 'custom', pattern: 'AAAA-9999-9999-9999-99' };
    const tooLong = mount({ value: null, maxLength: 20, inputs: long });

    check('a formatted mask longer than the column says so', shown(tooLong) === 'resx:InputMask_TooLong' && tooLong.container.classList.contains('InputMask--invalid'), shown(tooLong));
    check('stored raw, the same mask fits and says nothing', shown(mount({ value: null, maxLength: 20, inputs: { ...long, store: 'raw' } })) === '');
    check('in canvas there is no column length to compare with', shown(mount({ value: null, host: 'canvas', inputs: long })) === '');

    /*
     * A canvas app hands the property an `attributes` that describes no
     * column: `MaxLength: 100` for a literal and for an 850-character
     * Dataverse column alike (a published canvas app, 2026-10-06). Through
     * 0.1.1 a mask of 101 characters there was told "the column holds 100".
     */
    const canvasAttributes = host.createContext({ host: 'canvas' }).parameters.value.attributes;

    check(
        'the rig’s canvas host reports what a canvas app reports: 100, and no table',
        canvasAttributes.MaxLength === 100 && canvasAttributes.EntityLogicalName === '' && canvasAttributes.LogicalName === 'value',
        JSON.stringify(canvasAttributes),
    );

    const longer = { mask: 'custom', pattern: '9'.repeat(101) };

    check('a mask longer than a canvas app’s 100 is not told its column is too short', shown(mount({ value: null, host: 'canvas', inputs: longer })) === '', shown(mount({ value: null, host: 'canvas', inputs: longer })));
    check('on a form the same mask in a 100-character column still is', shown(mount({ value: null, maxLength: 100, inputs: longer })) === 'resx:InputMask_TooLong');

    const guided = mount({ value: null, placeholder: 'Phone' });

    check('the maker’s placeholder shows while the field is not focused', field(guided).placeholder === 'Phone');
    field(guided).focus();
    check('the guide replaces it while an empty field has focus', field(guided).placeholder === '(___) ___-____', field(guided).placeholder);
    field(guided).blur();

    const unguided = mount({ value: null, placeholder: 'Phone', inputs: { guide: 'off' } });

    field(unguided).focus();
    check('guide off keeps the maker’s placeholder', field(unguided).placeholder === 'Phone');
    field(unguided).blur();
}

{
    const custom = mount({ value: null, inputs: { mask: 'custom', pattern: 'AA-9999' } });

    dom.user.type(field(custom), 'ab1234');
    check('a custom pattern upper-cases its A slots and draws its literal', field(custom).value === 'AB-1234' && custom.outputs().value === 'AB-1234', field(custom).value);
    check('and a mixed mask asks for the full keyboard, with no autofill name', field(custom).inputMode === 'text' && field(custom).getAttribute('autocomplete') === '');

    const broken = mount({ value: 'kept as it is', inputs: { mask: 'custom', pattern: '' } });

    check('a custom pattern that accepts nothing tells the maker, shows the column and takes nothing', shown(broken) === 'resx:InputMask_BadPattern' && field(broken).disabled === true && field(broken).value === 'kept as it is' && broken.notifications() === 0);

    const switched = mount({ value: '12345' });

    switched.update({ value: '12345', inputs: { mask: 'zip', pattern: null, store: null, guide: null } });
    check('a mask changed on a mounted control re-reads the value under the new mask', field(switched).value === '12345' && shown(switched) === '', field(switched).value);
}

{
    const denied = mount({ security: 'no-access', value: null });

    check('a column the user cannot read says so, and hides the field', shown(denied) === 'resx:InputMask_NoAccess' && denied.find('.InputMask-field').hidden === true);
    check('a read-only column disables the input on an editable form', mount({ security: 'read-only', value: '5551234567' }).find('input').disabled === true);
    check('a disabled field takes no typing', (() => {
        const off = mount({ disabled: true, value: null });
        dom.user.type(field(off), '5');
        return field(off).value === '' && off.notifications() === 0;
    })());
    check('renders on a host that publishes no column metadata', Boolean(mount({ host: 'canvas', value: '5551234567' }).find('input')));
    check('the accessible name is the form’s own label', field(mount({ value: null })).getAttribute('aria-label') === 'Account name');
}

/* ------------------------------------------------------------ either shape */

/*
 * **`null` is not `undefined`, and this is the assertion worth keeping when the
 * rest of the example goes.**
 *
 * The generated `IOutputs` types every bound value as optional, so
 * `this.value ?? undefined` type-checks cleanly and means the opposite of what
 * a clear needs: `undefined` is "no change". A canvas app honours that strictly
 * and the field simply refuses to empty, while a model-driven form is more
 * forgiving — so the bug hides on the host most people test first.
 * `pcf-star-rating` shipped exactly this and its clear button did nothing.
 */
const cleared = mount({ value: null });

check(
    'a cleared column produces an output the platform can act on, not "no change"',
    cleared.outputs().value !== undefined,
    `getOutputs() returned ${JSON.stringify(cleared.outputs())}`,
);

/*
 * The resize contract, which is a pair and fails silently when half of it is
 * missing.
 *
 * `mode.allocatedWidth` is `-1` until the control calls
 * `mode.trackContainerResize(true)`, so a control that reflows on width without
 * asking lays out against -1 on every host and always picks its narrowest
 * branch. The scaffolded control reflows on neither, so all this can honestly
 * assert is that a narrow phone-sized container does not break it; the detail
 * line reports whether the control asked, which is the interesting half.
 *
 * **The moment your control reads `allocatedWidth` or `getFormFactor`, replace
 * this with the pair** — that it called `trackContainerResize(true)`, and that
 * it lays out differently at 320 than at 1200. `getFormFactor` is 0 unknown,
 * 1 desktop, 2 tablet, 3 phone: web is 1, and 3 is a phone, which is the
 * comparison people get backwards.
 */
const sized = mount({ width: 320, formFactor: 'phone' });

check(
    'renders in a phone-sized container',
    sized.element !== undefined ? sized.element !== null : Boolean(sized.find('input')),
    `trackContainerResize: ${sized.calls().some((call) => call.indexOf('trackContainerResize') === 0) ? 'called' : 'never called'}`,
);

/*
 * Hidden is a state, not an absence. Canvas relies on `mode.isVisible` — a
 * model-driven form hides the section itself — and a control that ignores it
 * stays on screen in a canvas app that asked for it to go.
 */
check(
    'renders nothing visible when the host says it is hidden',
    (() => {
        const hidden = mount({ visible: false });

        return hidden.element !== undefined
            ? hidden.props().visible === false
            : hidden.container.classList.contains('InputMask--hidden');
    })(),
);

/* ---------------------------------------------------- what destroy owes */

/*
 * **Keep this when the worked example above goes.** It is written against no
 * particular control and needs no knowledge of what yours takes.
 *
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. The interval
 * keeps firing against a container the platform has already thrown away; the
 * document listener keeps the whole control reachable, so nothing about it is
 * ever collected. On a form somebody leaves open all afternoon, or a subgrid
 * that re-renders its rows, they accumulate.
 *
 * Counting before and after is the whole trick. The scaffolded control takes
 * neither, so both numbers are zero and this passes trivially — which is the
 * point: it starts passing for a real reason the moment somebody adds a timer,
 * and fails the moment they forget the other half.
 */
disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({});

disposable.destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
    `${listenersBefore} → ${Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0)}`,
);

/*
 * The other half, and the leak this shape is famous for. `updateView` runs on
 * every change to any bound value, so a `setInterval` reached from the render
 * path adds a timer per render rather than replacing one.
 */
const rerendered = mount({});
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});
rerendered.update({});

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

/* ======================================================================== *
 *  THE RIG'S OWN CLAIMS — keep these. They are about `dev/host.js`, not about
 *  the control, and they exist because a rig that silently answers the wrong
 *  host's question certifies whatever it is handed. Each one was a real bug in
 *  a sibling repository's rig before it was an assertion here.
 * ======================================================================== */

async function rigSelfCheck() {
    const relationships = (url) => `${url}/api/data/v9.2/EntityDefinitions(LogicalName='account')/OneToManyRelationships`;

    /*
     * Two hosts, two answers. The fetch stub is one global routed by origin,
     * and before it was, the stub belonged to whichever host a suite created
     * last — so a second mount's refusal became every mount's refusal.
     */
    const open = mount({});
    const refused = mount({ relationshipsStatus: 403 });
    const [a, b] = await Promise.all([fetch(relationships(open.clientUrl)), fetch(relationships(refused.clientUrl))]);

    check('rig: each host answers its own metadata fetch', a.status === 200 && b.status === 403, `${a.status} / ${b.status}`);
    check(
        "rig: a fresh host does not inherit an earlier host's answers",
        (await a.json()).value.some((row) => row.ReferencingAttribute === 'parentaccountid' && row.IsHierarchical === true),
    );

    let foreign = 'resolved';
    await fetch('https://nowhere.invalid/api/data/v9.2/x').catch((error) => { foreign = error.constructor.name; });
    // Whatever `fetch` was there before answers — Node's own, here, which cannot
    // resolve the name — and the claim is only that the rig did not answer it.
    check("rig: a URL on no host's origin is refused, not answered", foreign !== 'resolved', foreign);

    const ctx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const xml = "<fetch><entity name='account'><attribute name='accountid'/><attribute name='name'/><attribute name='accountid' rowaggregate='CountChildren' alias='children'/><filter><condition attribute='accountid' operator='eq-or-above' value='c1'/></filter></entity></fetch>";
    const chain = await ctx.webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`);

    check(
        'rig: eq-or-above answers the record and every ancestor, with child counts',
        chain.entities.map((row) => `${row.accountid}:${row.children}`).sort().join(',') === 'c1:2,p1:2,r1:2',
        JSON.stringify(chain.entities.map((row) => [row.accountid, row.children])),
    );

    let fault = null;
    await host.createContext({ fixture, clientUrl: host.nextClientUrl(), hierarchical: false })
        .webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`)
        .catch((error) => { fault = error; });
    check(
        'rig: a hierarchical operator on a table that is not hierarchical is refused as a plain object',
        fault !== null && !(fault instanceof Error) && typeof fault.errorCode === 'number' && typeof fault.message === 'string',
        fault && fault.constructor.name,
    );

    const page = await ctx.webAPI.retrieveMultipleRecords('account', "?$select=accountid,name&$filter=_parentaccountid_value eq c1&$orderby=name asc", 1);
    check('rig: maxPageSize truncates and says there is more', page.entities.length === 1 && typeof page.nextLink === 'string', JSON.stringify(page));

    /*
     * The audit half: rows through `webAPI`, values through the two functions
     * on the fetch stub. The `nextLink` has to carry the query, because a
     * control hands it straight back — before it did, page two of a filtered
     * list answered an unfiltered one.
     */
    const auditQuery = '?$select=auditid,createdon,action,_objectid_value,_userid_value&$filter=_objectid_value eq c1&$orderby=createdon desc';
    const first = await ctx.webAPI.retrieveMultipleRecords('audit', auditQuery, 10);
    check(
        'rig: the audit table ignores maxPageSize — every row, newest first, nextLink an empty string (measured)',
        first.entities.length === 26 && first.nextLink === '' && first.entities[0].createdon > first.entities[25].createdon
            && first.entities.every((row) => row._objectid_value === 'c1'),
        `${first.entities.length} ${JSON.stringify(first.nextLink)}`,
    );
    const paged = await ctx.webAPI.retrieveMultipleRecords('account', '?$select=accountid,name&$filter=_parentaccountid_value eq r1&$orderby=name asc', 1);
    const next = await ctx.webAPI.retrieveMultipleRecords('account', paged.nextLink, 1);
    check(
        'rig: any other table pages by a nextLink that carries the filter and the order',
        paged.entities.length === 1 && next.entities.length === 1 && paged.entities[0].accountid === 'o1' && next.entities[0].accountid === 'p1',
        JSON.stringify([paged.entities, next.entities]),
    );

    const api = `${ctx.page.getClientUrl()}/api/data/v9.2`;
    const detail = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, { headers: { Prefer: 'odata.include-annotations="*"' } }).then((r) => r.json());
    const plain = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`).then((r) => r.json());
    check(
        'rig: RetrieveAuditDetails answers by audit id with the AuditRecord — who, when, action — annotated only under Prefer',
        detail.AuditDetail['@odata.type'] === '#Microsoft.Dynamics.CRM.AttributeAuditDetail'
            && detail.AuditDetail.NewValue['_parentaccountid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] === 'account'
            && detail.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && detail.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === 'Priya Raman'
            && plain.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && plain.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === undefined,
        JSON.stringify(Object.keys(detail.AuditDetail)),
    );
    const unknown = await fetch(`${api}/audits(00000000-0000-0000-0000-0000000000ff)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    check('rig: an audit id the fixture does not hold is a 404', unknown.status === 404, String(unknown.status));

    const target = encodeURIComponent("{'@odata.id':'accounts(c1)'}");
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: 2, Count: 10, ReturnTotalRecordCount: true }));
    const history = await fetch(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`).then((r) => r.json());
    check(
        'rig: RetrieveRecordChangeHistory pages by @p, counts the whole history, and every detail carries its AuditRecord',
        history.AuditDetailCollection.AuditDetails.length === 10 && history.AuditDetailCollection.TotalRecordCount === 26
            && history.AuditDetailCollection.MoreRecords === true
            && history.AuditDetailCollection.AuditDetails.every((d) => typeof d.AuditRecord?.auditid === 'string')
            && history.AuditDetailCollection.AuditDetails[0].AuditRecord.auditid === first.entities[10].auditid,
        JSON.stringify([history.AuditDetailCollection.AuditDetails.length, history.AuditDetailCollection.TotalRecordCount]),
    );

    const definition = await fetch(`${api}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const off = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditEnabled: { org: false, table: false }, auditStatus: 403, auditSummary: false });
    const offApi = `${off.page.getClientUrl()}/api/data/v9.2`;
    const offDefinition = await fetch(`${offApi}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const offOrg = await off.webAPI.retrieveMultipleRecords('organization', '?$select=isauditenabled&$top=1');
    check(
        'rig: IsAuditEnabled is a managed property that follows the switch, on the table and the organisation',
        definition.IsAuditEnabled.Value === true && offDefinition.IsAuditEnabled.Value === false && offOrg.entities[0].isauditenabled === false,
        JSON.stringify([definition.IsAuditEnabled, offDefinition.IsAuditEnabled, offOrg.entities[0]]),
    );

    const refusedDetail = await fetch(`${offApi}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    let summaryFault = null;
    await off.webAPI.retrieveMultipleRecords('audit', auditQuery, 10).catch((error) => { summaryFault = error; });
    check(
        'rig: the two audit privileges refuse separately — a 403 body on the function, a plain-object fault on the query',
        refusedDetail.status === 403 && summaryFault !== null && !(summaryFault instanceof Error) && typeof summaryFault.errorCode === 'number',
        `${refusedDetail.status} / ${summaryFault && summaryFault.constructor.name}`,
    );

    let offline = 'resolved';
    const dark = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditStatus: 0 });
    await fetch(`${dark.page.getClientUrl()}/api/data/v9.2/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`)
        .catch((error) => { offline = error.constructor.name; });
    check('rig: auditStatus 0 is the offline shape, a TypeError', offline === 'TypeError', offline);

    /*
     * A write is applied to this host's own rows and audited, the way the
     * platform does it — so a control that writes can be shown its write on
     * the next read — and never reaches the shared fixture.
     */
    const F = '@OData.Community.Display.V1.FormattedValue';
    const writeCtx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const rowsBefore = (await writeCtx.webAPI.retrieveMultipleRecords('audit', auditQuery)).entities.length;
    await writeCtx.webAPI.updateRecord('account', 'c1', { name: 'Renamed', 'parentaccountid@odata.bind': '/accounts(r1)' });
    const written = await writeCtx.webAPI.retrieveRecord('account', 'c1', '?$select=name,_parentaccountid_value');
    const audited = (await writeCtx.webAPI.retrieveMultipleRecords('audit', auditQuery)).entities;
    const auditedDetail = await (await fetch(`${writeCtx.page.getClientUrl()}/api/data/v9.2/audits(${audited[0].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, { headers: { Prefer: 'odata.include-annotations="*"' } })).json();
    check(
        "rig: updateRecord applies to this host's row — a primitive under its key, a bind as the lookup with its annotations — and audits it as the newest row by the rig user",
        written.name === 'Renamed' && written._parentaccountid_value === 'r1' && written['_parentaccountid_value' + F] === 'Contoso Holdings'
            && audited.length === rowsBefore + 1 && audited[0]['_userid_value' + F] === 'Rig User' && audited[0].action === 2
            && auditedDetail.AuditDetail.OldValue.name === 'Contoso Deutschland GmbH' && auditedDetail.AuditDetail.NewValue.name === 'Renamed'
            && auditedDetail.AuditDetail.OldValue._parentaccountid_value === 'p1' && auditedDetail.AuditDetail.NewValue['_parentaccountid_value@Microsoft.Dynamics.CRM.associatednavigationproperty'] === 'parentaccountid',
        JSON.stringify([written, audited[0], auditedDetail.AuditDetail]),
    );
    check("rig: the shared fixture is untouched by a host's write, and a fresh host starts from it", fixture.tables.account.find((r) => r.accountid === 'c1').name === 'Contoso Deutschland GmbH' && !fixture.tables.audit.some((r) => r.auditid.startsWith('ffffffff'))
        && (await host.createContext({ fixture, clientUrl: host.nextClientUrl() }).webAPI.retrieveRecord('account', 'c1', '?$select=name')).name === 'Contoso Deutschland GmbH');
    let bindFault = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { 'nosuch@odata.bind': '/accounts(r1)' }).catch((e) => { bindFault = e; });
    let refFault = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { 'parentaccountid@odata.bind': '/accounts(nosuchid)' }).catch((e) => { refFault = e; });
    check('rig: an undeclared bind and a bind to a missing record refuse the way the server does', bindFault && /undeclared property 'nosuch'/.test(bindFault.message) && refFault && refFault.title === 'Record Is Unavailable', JSON.stringify([bindFault && bindFault.errorCode, refFault && refFault.errorCode]));
    let dropped = null;
    await writeCtx.webAPI.updateRecord('account', 'c1', { address1_composite: 'probe', name: 'Kept' }).then((r) => { dropped = r; });
    const afterDrop = await writeCtx.webAPI.retrieveRecord('account', 'c1', '?$select=name,address1_composite');
    check("rig: a write to a column the metadata marks not updatable resolves and changes nothing — the server's way — while the rest of the payload lands", dropped !== null && afterDrop.name === 'Kept' && afterDrop.address1_composite === undefined, JSON.stringify(afterDrop));
    const attrs = await (await fetch(`${writeCtx.page.getClientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes?$select=LogicalName,AttributeType,IsValidForUpdate`)).json();
    check("rig: EntityDefinitions/Attributes lists every labelled column as updatable and the fixture's frozen ones as not", attrs.value.some((x) => x.LogicalName === 'name' && x.IsValidForUpdate === true) && attrs.value.some((x) => x.LogicalName === 'address1_composite' && x.IsValidForUpdate === false && x.AttributeType === 'Memo'), String(attrs.value.length));
    check('rig: userSettings names the user the write is audited as', writeCtx.userSettings.userName === 'Rig User' && typeof writeCtx.userSettings.userId === 'string');
    check("rig: getEntityMetadata(target).EntitySetName is the target's, from the fixture", (await writeCtx.utils.getEntityMetadata('contact')).EntitySetName === 'contacts' && (await writeCtx.utils.getEntityMetadata('account')).EntitySetName === 'accounts');

    const metadata = await ctx.utils.getEntityMetadata('account', ['name', 'revenue', 'nosuchcolumn']);
    check(
        'rig: getEntityMetadata(table, columns).Attributes is an item collection of the columns asked for that the fixture names',
        metadata.Attributes.get('name').DisplayName === 'Account Name' && metadata.Attributes.getAll().length === 2 && metadata.Attributes.get('nosuchcolumn') === undefined,
        JSON.stringify(metadata.Attributes.getAll()),
    );

    const wrUrl = host.nextClientUrl();
    const wrCtx = host.createContext({ fixture, clientUrl: wrUrl });
    const wrFound = await fetch(`${wrCtx.page.getClientUrl()}/WebResources/new_/config/settings.json`);
    const wrMissing = await fetch(`${wrCtx.page.getClientUrl()}/WebResources/new_/config/missing.json`);
    check(
        'rig: a web resource answers 200 text/jscript with its text; a missing one 404 with an empty body — as a form did',
        wrFound.status === 200 && wrFound.headers.get('content-type') === 'text/jscript' && JSON.parse(await wrFound.text()).pageSize === 25
            && wrMissing.status === 404 && (await wrMissing.text()) === '',
        [wrFound.status, wrMissing.status].join(' / '),
    );
    const wrOffline = host.createContext({ fixture, clientUrl: host.nextClientUrl(), webResourceStatus: 0 });
    let wrFault = null;
    await fetch(`${wrOffline.page.getClientUrl()}/WebResources/new_/config/settings.json`).catch((e) => { wrFault = e; });
    const wrDenied = host.createContext({ fixture, clientUrl: host.nextClientUrl(), webResourceStatus: 403 });
    const wrDeniedReply = await fetch(`${wrDenied.page.getClientUrl()}/WebResources/new_/config/settings.json`);
    check('rig: webResourceStatus 0 rejects with a TypeError (offline), 403 refuses', wrFault instanceof TypeError && wrDeniedReply.status === 403);

    checkModuleLoader();
    checkDomCollections();
    checkDomCursor();

    disposeAll();
}

/*
 * The text entry cursor and `dom.user`, proved on bare elements — every caret
 * assertion a control's suite makes rests on these being a browser's rules
 * (see *The text entry cursor* in `dev/dom.js`).
 */
function checkDomCursor() {
    const box = dom.createElement('input');
    box.type = 'text';
    box.value = 'abcdef';

    check('rig: assigning a different value moves the cursor to the end', box.selectionStart === 6 && box.selectionEnd === 6);

    box.setSelectionRange(2, 2);
    box.value = 'abcdef';
    check('rig: assigning the same value leaves the cursor where it was', box.selectionStart === 2, String(box.selectionStart));

    box.setSelectionRange(9, 4);
    check('rig: setSelectionRange clamps to the length and pulls a start past the end back to it', box.selectionStart === 4 && box.selectionEnd === 4, `${box.selectionStart}–${box.selectionEnd}`);

    box.value = 'one\ntwo';
    check('rig: a single-line input strips line breaks, as its value sanitisation does', box.value === 'onetwo', JSON.stringify(box.value));

    const email = dom.createElement('input');
    email.type = 'email';
    let refused = null;
    try {
        email.setSelectionRange(0, 0);
    } catch (error) {
        refused = error;
    }
    check('rig: an email input has no cursor — selectionStart null, setSelectionRange throws InvalidStateError', email.selectionStart === null && refused !== null && refused.name === 'InvalidStateError');

    const seen = [];
    const typed = dom.createElement('input');
    ['beforeinput', 'input', 'focus', 'paste', 'change', 'compositionstart', 'compositionupdate', 'compositionend'].forEach((type) => {
        typed.addEventListener(type, (event) => seen.push(`${type}:${event.inputType || ''}:${event.data === undefined ? '' : event.data}:${event.isComposing ? 'c' : ''}`));
    });
    typed.value = 'Contoso';
    typed.setSelectionRange(3, 3);
    dom.user.type(typed, 'xy');
    check('rig: user.type edits at the cursor and leaves it after what was typed', typed.value === 'Conxytoso' && typed.selectionStart === 5, `${typed.value} @${typed.selectionStart}`);
    check('rig: …focusing first, then beforeinput and input per character with inputType and data', seen.join(' ') === 'focus::: beforeinput:insertText:x: input:insertText:x: beforeinput:insertText:y: input:insertText:y:', seen.join(' '));

    const blocked = dom.createElement('input');
    blocked.addEventListener('beforeinput', (event) => event.preventDefault());
    blocked.value = 'ab';
    check('rig: preventDefault on beforeinput stops the edit', dom.user.type(blocked, 'c') === false && blocked.value === 'ab');

    typed.setSelectionRange(3, 3);
    dom.user.backspace(typed);
    check('rig: backspace deletes the character before the cursor', typed.value === 'Coxytoso' && typed.selectionStart === 2, `${typed.value} @${typed.selectionStart}`);
    typed.setSelectionRange(0, 0);
    check('rig: backspace at the start deletes nothing and fires nothing', dom.user.backspace(typed) === false);
    typed.setSelectionRange(2, 4);
    dom.user.del(typed);
    check('rig: delete removes a selection', typed.value === 'Cotoso', typed.value);

    const limited = dom.createElement('input');
    limited.maxLength = 3;
    dom.user.type(limited, 'abcdef');
    dom.user.paste(limited, 'zz');
    check('rig: maxLength limits what the user types and pastes', limited.value === 'abc', limited.value);

    typed.focus();
    seen.length = 0;
    typed.value = '';
    dom.user.paste(typed, 'line one\nline two');
    check('rig: paste fires paste, then beforeinput/input insertFromPaste, one line', typed.value === 'line oneline two' && seen[0].indexOf('paste:') === 0 && seen[1].indexOf('beforeinput:insertFromPaste:') === 0, seen.join(' | '));

    seen.length = 0;
    typed.value = '';
    dom.user.compose(typed, ['k', 'ka'], 'か');
    check('rig: compose replaces its own run, ending on the committed text', typed.value === 'か' && typed.selectionStart === 1, typed.value);
    check(
        'rig: …and the last input arrives, still composing, before compositionend — as in Chromium',
        seen[0].indexOf('compositionstart') === 0 && seen[seen.length - 2] === 'input:insertCompositionText:か:c' && seen[seen.length - 1].indexOf('compositionend') === 0,
        seen.join(' '),
    );

    seen.length = 0;
    dom.user.autofill(typed, '555-0100');
    check('rig: autofill replaces the value with an input that has no inputType and no beforeinput, then change', typed.value === '555-0100' && seen.join(' ') === 'input::: change:::', seen.join(' '));

    const off = dom.createElement('input');
    off.disabled = true;
    check('rig: a disabled input takes no typing', dom.user.type(off, 'a') === false && off.value === '');

    const focusLog = [];
    const first = dom.createElement('input');
    const second = dom.createElement('input');
    first.addEventListener('blur', () => focusLog.push('first:blur'));
    second.addEventListener('focus', () => focusLog.push('second:focus'));
    first.focus();
    second.focus();
    second.focus();
    check('rig: moving focus blurs what had it, and focusing twice fires once', focusLog.join(' ') === 'first:blur second:focus', focusLog.join(' '));
    second.blur();
}

/*
 * `dev/dom.js` hands back what a browser hands back, and no more: a control
 * that calls `.map` on `querySelectorAll` or `.forEach` on `children` fails
 * on a form, so it has to fail here too.
 */
function checkDomCollections() {
    const root = dom.createElement('div');
    const a = root.appendChild(dom.createElement('span'));
    a.className = 'x';
    root.appendChild(dom.createElement('span')).setAttribute('id', 'second');
    a.appendChild(dom.createElement('span')).className = 'x';

    const all = root.querySelectorAll('span');
    check('rig: querySelectorAll is a NodeList — indexable, length, item, forEach, iterable', all.length === 3 && all[0] === a && typeof all.item === 'function' && all.item(5) === null
        && typeof all.forEach === 'function' && Array.from(all).length === 3 && Object.prototype.toString.call(all) === '[object NodeList]');
    check('rig: …with no Array methods, as in a browser', all.map === undefined && all.filter === undefined && all.find === undefined && !Array.isArray(all));
    check('rig: querySelectorAll walks depth-first, in document order', Array.from(root.querySelectorAll('.x')).length === 2 && root.querySelector('.x') === a);

    const kids = root.children;
    check('rig: children is an HTMLCollection — indexable, item, namedItem, iterable, no forEach', kids.length === 2 && kids[1].getAttribute('id') === 'second'
        && typeof kids.namedItem === 'function' && kids.namedItem('second') === kids[1] && [...kids].length === 2 && kids.forEach === undefined && kids.map === undefined);
}

/*
 * `dev/modules.js`, the loader for a control whose bundle cannot load here
 * (see its header). Nothing in this suite needs it, so it is proved on three
 * throwaway modules rather than left untested until the day one does: a
 * relative import is followed, a type annotation is stripped, and a package
 * the caller forbids is refused by name.
 */
function checkModuleLoader() {
    const os = require('os');
    const { createLoader } = require('./modules.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcf-modules-'));

    try {
        fs.writeFileSync(path.join(dir, 'rule.ts'), 'import { limit } from "./limit";\nexport function clamp(n: number): number { return Math.min(n, limit); }\n');
        fs.writeFileSync(path.join(dir, 'limit.ts'), 'export const limit: number = 5;\n');
        fs.writeFileSync(path.join(dir, 'leaky.ts'), 'import * as lib from "some-browser-library";\nexport const x = lib;\n');

        fs.writeFileSync(path.join(dir, 'unused.ts'), 'import * as lib from "some-browser-library";\nexport const y = 1;\n');
        fs.writeFileSync(path.join(dir, 'reach.ts'), 'import { View } from "./components/View";\nexport const z = View;\n');

        const load = createLoader({ root: dir, forbid: [/some-browser-library/, [/components\//, 'the component tree']] });
        check('rig: modules.js transpiles a decision module and follows its relative import', load('rule').clamp(9) === 5);

        let refused = null;
        try {
            load('leaky');
        } catch (error) {
            refused = error;
        }
        check('rig: modules.js refuses a forbidden import by name, rather than failing on its absence', refused !== null && /imports some-browser-library/.test(refused.message), String(refused && refused.message));

        let reached = null;
        try {
            load('reach');
        } catch (error) {
            reached = error;
        }
        check('rig: modules.js refuses a relative import into a forbidden path, naming what it is', reached !== null && /stay free of the component tree/.test(reached.message), String(reached && reached.message));
        check('rig: an import nothing uses is elided before the guard sees it — mutation-test the guard with a used import', load('unused').y === 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

rigSelfCheck().then(report, (error) => {
    check('rig: the self-check ran to the end', false, String(error && error.stack || error));
    report();
});

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
