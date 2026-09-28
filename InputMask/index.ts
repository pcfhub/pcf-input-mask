import { IInputs, IOutputs } from './generated/ManifestTypes';
import { Mask, guide, resolve } from './pattern';
import { applyInput, caretAt, extract, isLossy, render } from './format';
import { Store, stored, storeOf, verdictOf } from './verdict';
import { Probe, createProbe } from './probe';

/** The 0.0.1 probe build. False, and `probe.ts` deleted, before 0.1.0. */
const PROBE = true;

/** How many of this control's own writes an echo is recognised among. */
const ECHO_MEMORY = 32;

/**
 * A text or phone column typed into a pattern.
 *
 * The control holds the value as its **characters** — what went into the
 * slots — and draws everything else from them: the display, the string
 * written, the cursor, the verdict (`pattern.ts`, `format.ts`, `verdict.ts`,
 * all pure and asserted from source).
 *
 * The edit path is the part worth reading. The browser makes each edit, and
 * `onInput` then compares the field with the display the control last drew
 * and redraws it — one path for typing, paste, delete, autofill (which fires
 * no `beforeinput` to cancel), undo, and a composition once it has ended.
 * Assigning a *different* value moves a browser's cursor to the end, so every
 * redraw puts it back by counting characters, not display positions.
 */
export class InputMask implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    /** The filled surface the input sits in. See the stylesheet. */
    private field!: HTMLDivElement;
    private input!: HTMLInputElement;
    private message!: HTMLParagraphElement;
    private notifyOutputChanged!: () => void;
    private resources!: ComponentFramework.Resources;

    /** `null` while a custom pattern accepts nothing — see `resolve`. */
    private mask: Mask | null = null;
    /** Which inputs `mask` was built from, so a change in either rebuilds it. */
    private maskKey = '';
    private store: Store = 'formatted';

    private chars: string[] = [];
    /** Exactly what the control last put in the box. */
    private display = '';
    /** What the column holds, as far as this control knows. */
    private column: string | null = null;
    /**
     * A stored value the mask cannot show as it is — too short to fill it
     * (`555-0152` under `(999) 999-9999`) or holding something no slot takes
     * (`ABC28UU7` under `AA-9999`) — until the user edits it.
     *
     * Shown **exactly as saved** while the field is at rest, with a neutral
     * note: redrawn into the mask it read as `(555) 015-2` and `AB-287`,
     * values nobody saved, in red, on a record nobody had touched (measured
     * on the form, 2026-09-28). Clicking in switches to the mask; leaving
     * without typing puts the saved text back; nothing is written until the
     * user types.
     */
    private saved: string | null = null;
    private composing = false;
    private focused = false;
    private lastValid: boolean | undefined = undefined;
    private pendingNotify = false;

    /**
     * Every value this control wrote, newest last. The platform echoes writes
     * back late and **out of order** (measured 2026-09-13 on
     * pcf-address-autocomplete-azure): an incoming value found here is an
     * echo whatever its order, and one never written is the form's.
     */
    private written: string[] = [];

    /** The last context, for the handlers that redraw between renders. */
    private context!: ComponentFramework.Context<IInputs>;

    private probe: Probe | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.notifyOutputChanged = notifyOutputChanged;
        this.resources = context.resources;

        this.input = document.createElement('input');
        this.input.className = 'InputMask-input';
        this.input.type = 'text';
        this.input.spellcheck = false;
        this.input.addEventListener('input', this.onInput);
        this.input.addEventListener('compositionstart', this.onCompositionStart);
        this.input.addEventListener('compositionend', this.onCompositionEnd);
        this.input.addEventListener('focus', this.onFocus);
        this.input.addEventListener('blur', this.onBlur);

        this.message = document.createElement('p');
        this.message.className = 'InputMask-message';

        this.field = document.createElement('div');
        this.field.className = 'InputMask-field';
        this.field.append(this.input);

        this.container.classList.add('InputMask');
        this.container.append(this.field, this.message);

        if (PROBE) {
            this.probe = createProbe(this.input);
        }

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.resources = context.resources;
        this.render(context);
    }

    public getOutputs(): IOutputs {
        // `null` clears the column; `undefined` would be "no change".
        return {
            value: this.column === null ? (null as unknown as undefined) : this.column,
            isValid: this.isValid(),
        };
    }

    public destroy(): void {
        this.input.removeEventListener('input', this.onInput);
        this.input.removeEventListener('compositionstart', this.onCompositionStart);
        this.input.removeEventListener('compositionend', this.onCompositionEnd);
        this.input.removeEventListener('focus', this.onFocus);
        this.input.removeEventListener('blur', this.onBlur);
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;

        const parameter = context.parameters.value;

        if (this.probe && !this.probeSawShape) {
            this.probeSawShape = true;
            // P1 and P4: what the binding looks like on this column.
            this.probe.note('binding', {
                type: parameter.type,
                attributes: parameter.attributes,
                security: parameter.security,
                raw: parameter.raw,
                formatted: parameter.formatted,
                mask: context.parameters.mask.raw,
                store: context.parameters.store.raw,
                guide: context.parameters.guide.raw,
            });
        }

        this.applyTheme(context);
        this.container.classList.toggle('InputMask--hidden', !context.mode.isVisible);

        if (!context.mode.isVisible) {
            return;
        }

        // Compared against `false`, never read as a boolean: an unmapped
        // property's `security` is `{}`, and a column with no profile is
        // `undefined` on some hosts and an object on a real form.
        const security = parameter.security;

        if (security?.readable === false) {
            this.field.hidden = true;
            this.message.hidden = false;
            this.message.textContent = this.resources.getString('InputMask_NoAccess');

            return;
        }

        this.field.hidden = false;
        this.store = storeOf(context.parameters.store.raw);

        const key = `${context.parameters.mask.raw ?? ''}\u0000${context.parameters.pattern.raw ?? ''}`;
        const maskChanged = key !== this.maskKey;

        if (maskChanged) {
            this.maskKey = key;

            const resolved = resolve(context.parameters.mask.raw, context.parameters.pattern.raw);

            this.mask = resolved.ok ? resolved.mask : null;
        }

        const incoming = parameter.raw ?? '';

        if (this.mask === null) {
            // A pattern that accepts nothing: show the column as it is, take
            // no typing, and tell the maker. Nothing is written.
            this.input.value = incoming;
            this.input.disabled = true;
            this.container.classList.add('InputMask--disabled');
            this.showMessage(context, this.resources.getString('InputMask_BadPattern'), 'error');

            return;
        }

        this.adopt(incoming, maskChanged);

        this.input.disabled = context.mode.isControlDisabled || security?.editable === false;
        this.container.classList.toggle('InputMask--disabled', this.input.disabled);

        // The phone keypad for an all-digit mask; the browser's own autofill
        // for the presets it has a name for.
        this.input.inputMode = this.mask.numeric ? 'numeric' : 'text';
        this.input.setAttribute('autocomplete', autocompleteFor(context.parameters.mask.raw));

        this.input.setAttribute(
            'aria-label',
            context.mode.label || this.resources.getString('InputMask_Name'),
        );
        this.container.dir = context.userSettings.isRTL ? 'rtl' : 'ltr';

        this.drawPlaceholder();
        this.drawState();
    }

    /**
     * Take a value the column holds, unless it is this control's own echo.
     *
     * A mask change re-reads even an echo: the same stored string is other
     * characters under another pattern.
     */
    private adopt(incoming: string, force: boolean): void {
        const mask = this.mask as Mask;
        const known = this.column ?? '';
        const echo = incoming !== known && this.written.includes(incoming);

        this.probe?.note('updateView', {
            incoming,
            known,
            classified: incoming === known ? 'same' : echo ? 'echo' : 'adopt',
            box: this.input.value,
            caret: this.input.selectionStart,
        });

        if (!force && (incoming === known || echo)) {
            return;
        }

        if (!force || incoming !== known) {
            this.written = [];
        }

        this.column = incoming === '' ? null : incoming;
        this.chars = extract(mask, incoming);
        this.saved =
            incoming !== ''
            && (isLossy(mask, incoming, this.chars) || verdictOf(mask, this.chars) === 'incomplete')
                ? incoming
                : null;
        this.display = render(mask, this.chars);
        this.showBox();
    }

    /**
     * What the box holds: the saved text while a misfit value is at rest,
     * the mask otherwise. Only a *different* value is assigned — the same one
     * would be a no-op in a browser, but there is no reason to rely on it.
     */
    private showBox(): void {
        const text = this.saved !== null && !this.focused ? this.saved : this.display;

        if (this.input.value !== text) {
            this.input.value = text;
        }
    }

    private onInput = (event: Event): void => {
        const e = event as InputEvent;

        this.probe?.note('input', {
            inputType: e.inputType,
            data: e.data,
            isComposing: e.isComposing,
            value: this.input.value,
            caret: this.input.selectionStart,
        });

        // A composition is left alone until it ends: Chromium fires its last
        // `input` *before* `compositionend`, and rewriting the value under an
        // open composition breaks the IME — the Android keyboard composes
        // every word. See `onCompositionEnd`.
        if (this.composing || e.isComposing) {
            return;
        }

        this.edit(e.inputType);
    };

    private onCompositionStart = (): void => {
        this.composing = true;
    };

    private onCompositionEnd = (): void => {
        this.composing = false;
        this.edit('insertCompositionText');
    };

    private onFocus = (): void => {
        this.focused = true;
        this.showBox();
        this.drawPlaceholder();
        this.drawState();
    };

    private onBlur = (): void => {
        this.focused = false;
        this.showBox();
        this.drawPlaceholder();
        this.drawState();

        if (this.pendingNotify) {
            this.pendingNotify = false;
            this.notifyOutputChanged();
        }
    };

    private edit(inputType: string | undefined): void {
        if (this.mask === null) {
            return;
        }

        const mask = this.mask;
        const text = this.input.value;
        const caret = this.input.selectionStart ?? text.length;
        const result = applyInput(mask, this.chars, this.display, text, caret, inputType);

        this.chars = result.chars;
        this.display = render(mask, this.chars);
        this.saved = null;

        if (this.input.value !== this.display) {
            this.input.value = this.display;
        }

        const at = caretAt(mask, this.chars, result.k);

        if (this.input.selectionStart !== at || this.input.selectionEnd !== at) {
            this.input.setSelectionRange(at, at);
        }

        this.write();
        this.drawPlaceholder();
        this.drawState();
    }

    /**
     * Hand the value to the platform. Written even when incomplete, so nothing
     * typed is lost; `isValid` and the message say it is incomplete.
     */
    private write(): void {
        const value = stored(this.mask as Mask, this.chars, this.store);

        if (value === this.column) {
            return;
        }

        this.column = value;
        this.written.push(value ?? '');

        if (this.written.length > ECHO_MEMORY) {
            this.written.shift();
        }

        this.probe?.note('write', { value, mode: this.probe.notifyMode });

        if (this.probe?.notifyMode === 'blur' && this.focused) {
            this.pendingNotify = true;
            return;
        }

        this.lastValid = this.isValid();
        this.notifyOutputChanged();
    }

    private isValid(): boolean {
        if (this.mask === null) {
            return true;
        }

        return this.saved === null && verdictOf(this.mask, this.chars) !== 'incomplete';
    }

    private drawPlaceholder(): void {
        const own = this.context.parameters.placeholder.raw ?? '';
        const guideOn = (this.context.parameters.guide.raw ?? '').trim() !== 'off';

        this.input.placeholder = guideOn && this.focused && this.mask !== null ? guide(this.mask) : own;
    }

    /**
     * The message under the field, in order of who knows best: the platform's
     * own validation; then a saved value the mask cannot show, as a neutral
     * note rather than an error — nobody on this form typed it; then an
     * incomplete value the user typed, once they have left the field, since
     * every value is incomplete while it is being typed.
     */
    private drawState(): void {
        const parameter = this.context.parameters.value;
        const mask = this.mask as Mask;

        if (parameter.error) {
            this.showMessage(this.context, parameter.errorMessage, 'error');
        } else if (this.saved !== null) {
            this.showMessage(this.context, this.resources.getString('InputMask_Unfit'), 'note');
        } else if (!this.focused && verdictOf(mask, this.chars) === 'incomplete') {
            this.showMessage(
                this.context,
                this.resources
                    .getString('InputMask_Incomplete')
                    .replace('{0}', String(this.chars.length))
                    .replace('{1}', String(mask.slots)),
                'error',
            );
        } else {
            this.showMessage(this.context, '', 'none');
        }

        // A verdict that changed without a write — a saved value the mask
        // cannot show, a mask switched under it — is still news to a canvas app.
        const valid = this.isValid();

        if (this.lastValid !== undefined && valid !== this.lastValid) {
            this.lastValid = valid;
            this.notifyOutputChanged();
        } else if (this.lastValid === undefined) {
            this.lastValid = valid;

            if (!valid) {
                this.notifyOutputChanged();
            }
        }
    }

    /**
     * `error` is red and `aria-invalid`; `note` is a neutral line under the
     * field that marks nothing invalid on screen — `isValid` still says false.
     */
    private showMessage(
        _context: ComponentFramework.Context<IInputs>,
        text: string,
        tone: 'error' | 'note' | 'none',
    ): void {
        this.container.classList.toggle('InputMask--invalid', tone === 'error');
        this.message.classList.toggle('InputMask-message--note', tone === 'note');
        this.input.setAttribute('aria-invalid', String(tone === 'error'));
        this.message.hidden = tone === 'none';
        this.message.textContent = tone === 'none' ? '' : text;
    }

    /** See the scaffold: only the fallbacks, and only where the host says. */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('InputMask--dark', isDarkTheme);
    }

    private probeSawShape = false;
}

/**
 * The browser's autofill names for the presets that have one. A custom
 * pattern gets none: `off` would stop a saved value the maker wants, and a
 * guessed name fills the wrong thing.
 */
function autocompleteFor(preset: string | null | undefined): string {
    const name = (preset ?? '').trim();

    if (name === '' || name === 'phone-us') {
        return 'tel-national';
    }

    return name === 'zip' || name === 'zip4' || name === 'postal-ca' ? 'postal-code' : '';
}
