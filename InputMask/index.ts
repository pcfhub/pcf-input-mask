import { IInputs, IOutputs } from './generated/ManifestTypes';
import { Mask, guide, resolve } from './pattern';
import { applyInput, caretAt, charsBefore, extract, isLossy, render } from './format';
import { History, Snapshot, empty, record, redo, undo } from './history';
import { Store, neededLength, stored, storeOf, verdictOf } from './verdict';

/** How many of this control's own writes an echo is recognised among. */
const ECHO_MEMORY = 32;

/**
 * The column behind a bound property, when there is one.
 *
 * A model-driven form describes the column in `attributes`. A canvas app hands
 * over an `attributes` too, for every source, and it describes the *property*:
 * an empty `EntityLogicalName`, the property's own name as `LogicalName`, and
 * `MaxLength: 100` whatever the text is bound to (read in a published canvas
 * app, 2026-10-06). So `attributes` being there says nothing; a table's name in
 * it does.
 */
function columnOf<T extends object>(parameter: { attributes?: T }): T | undefined {
    const attributes = parameter.attributes as (T & { EntityLogicalName?: unknown }) | undefined;

    return typeof attributes?.EntityLogicalName === 'string' && attributes.EntityLogicalName !== ''
        ? attributes
        : undefined;
}

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
 * no `beforeinput` to cancel) and a composition once it has ended. Undo and
 * redo are the exception: the browser's own history stops matching the box the
 * moment a control rewrites it, so those two are cancelled in `beforeinput` and
 * answered from the control's own history (`history.ts`).
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

    /**
     * Every value this control wrote, newest last. The platform echoes writes
     * back late and **out of order** (measured 2026-09-13 on
     * pcf-address-autocomplete-azure): an incoming value found here is an
     * echo whatever its order, and one never written is the form's.
     */
    private written: string[] = [];

    /** The value the host handed over last time — see `adopt`. */
    private lastIncoming: string | undefined = undefined;

    /** The control's own undo history — see `history.ts`. */
    private history: History = empty();
    /** The field as it was when the edit now arriving began. */
    private before: Snapshot | null = null;

    /** The last context, for the handlers that redraw between renders. */
    private context!: ComponentFramework.Context<IInputs>;

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
        this.input.addEventListener('keydown', this.onKeyDown);
        this.input.addEventListener('beforeinput', this.onBeforeInput);
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
        this.input.removeEventListener('keydown', this.onKeyDown);
        this.input.removeEventListener('beforeinput', this.onBeforeInput);
        this.input.removeEventListener('input', this.onInput);
        this.input.removeEventListener('compositionstart', this.onCompositionStart);
        this.input.removeEventListener('compositionend', this.onCompositionEnd);
        this.input.removeEventListener('focus', this.onFocus);
        this.input.removeEventListener('blur', this.onBlur);
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;

        const parameter = context.parameters.value;

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
     * Take a value the column holds, unless it is this control's own echo —
     * or the host saying again what it said last time.
     *
     * The second case is the hub's demo, measured 2026-09-28: it never writes
     * a control's output back into its value, and re-renders on a width
     * change, a theme or a locale with the preset's value as it always was.
     * Leaving the field showed the incomplete line, the frame grew, and the
     * re-render handed down `2125550100` over `(212) 555-010` — taken as the
     * form's own change, it wiped the edit and its message. A form never
     * repeats itself like that: every write comes back as a new value, so a
     * value equal to the host's last one is not news on either host.
     *
     * A mask change re-reads even an echo: the same stored string is other
     * characters under another pattern.
     */
    private adopt(incoming: string, force: boolean): void {
        const mask = this.mask as Mask;
        const known = this.column ?? '';
        const echo = incoming !== known && this.written.includes(incoming);
        const repeated = incoming === this.lastIncoming;

        this.lastIncoming = incoming;

        if (!force && (incoming === known || echo || repeated)) {
            return;
        }

        if (!force || incoming !== known) {
            this.written = [];
        }

        // A value from the form starts the history again: undoing past it
        // would bring back a value the form has since replaced.
        this.history = empty();

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

    /**
     * Two jobs. Undo and redo are cancelled and answered here — measured
     * cancelable on the form. Every other edit only has its starting point
     * noted, for the history; the edit itself is read back in `onInput`.
     */
    private onBeforeInput = (event: Event): void => {
        const e = event as InputEvent;

        if (this.mask === null) {
            return;
        }

        if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
            event.preventDefault();
            this.step(e.inputType === 'historyUndo' ? 'undo' : 'redo');

            return;
        }

        if (!this.composing) {
            this.before = this.snapshot();
        }
    };

    /**
     * Redo from the key itself. On the form (0.0.3, 2026-09-28) Ctrl+Z worked
     * and Ctrl+Y did nothing — with every `historyUndo` cancelled, the
     * browser's own history never moves, so it has nothing to redo. Taken from
     * the key, redo works on the form (0.0.4).
     * Ctrl+Y and Ctrl+Shift+Z (Cmd+Shift+Z on a Mac) are taken here and their
     * default prevented, which also stops a `historyRedo` the browser might send
     * for the same key; the `beforeinput` path stays for redo from anywhere
     * else, such as a menu.
     */
    private onKeyDown = (event: KeyboardEvent): void => {
        if (this.mask === null || !(event.ctrlKey || event.metaKey) || event.altKey) {
            return;
        }

        const key = event.key.toLowerCase();

        if ((key === 'y' && !event.shiftKey) || (key === 'z' && event.shiftKey)) {
            event.preventDefault();
            this.step('redo');
        }
    };

    private snapshot(): Snapshot {
        const mask = this.mask as Mask;
        const caret = this.input.selectionStart ?? this.display.length;

        return { chars: this.chars.slice(), k: charsBefore(mask, this.chars, caret) };
    }

    private step(direction: 'undo' | 'redo'): void {
        const moved = (direction === 'undo' ? undo : redo)(this.history, this.snapshot());

        // Nothing to step to: the event is still cancelled, so the browser's
        // own undo cannot move the cursor to the start (measured in 0.0.2).
        if (moved === null) {
            return;
        }

        this.history = moved.history;
        this.show(moved.to.chars, moved.to.k);
    }

    /** Put these characters in the box, the cursor after the `k`th, and write. */
    private show(chars: string[], k: number): void {
        const mask = this.mask as Mask;

        this.chars = chars;
        this.display = render(mask, this.chars);
        this.saved = null;

        if (this.input.value !== this.display) {
            this.input.value = this.display;
        }

        const at = caretAt(mask, this.chars, k);

        if (this.input.selectionStart !== at || this.input.selectionEnd !== at) {
            this.input.setSelectionRange(at, at);
        }

        this.write();
        this.drawPlaceholder();
        this.drawState();
    }

    private onInput = (event: Event): void => {
        const e = event as InputEvent;

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
        this.before = this.mask === null ? null : this.snapshot();
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
    };

    private edit(inputType: string | undefined): void {
        if (this.mask === null) {
            return;
        }

        const mask = this.mask;
        const text = this.input.value;
        const caret = this.input.selectionStart ?? text.length;
        const result = applyInput(mask, this.chars, this.display, text, caret, inputType);

        if (result.chars.join('') !== this.chars.join('')) {
            // Autofill has no `beforeinput`, so no starting point was noted:
            // the whole previous value, cursor at its end, is the step back.
            const before = this.before ?? { chars: this.chars.slice(), k: this.chars.length };

            this.history = record(this.history, before, inputType);
        }

        this.before = null;
        this.show(result.chars, result.k);
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

        // Every keystroke, not on leaving the field: measured on the form
        // (SPEC.md P2), holding the write back bought nothing, and the late
        // echoes it would have avoided are what `written` is for.
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
     * own validation; then a mask the column is too short for; then a saved
     * value the mask cannot show, as a neutral note rather than an error —
     * nobody on this form typed it; then an incomplete value the user typed,
     * once they have left the field, since every value is incomplete while it
     * is being typed.
     *
     * **The platform's own message is not repeated on a model-driven form.**
     * Measured 2026-09-28: the form draws it under the field itself ("⊗ Main
     * Phone: Required fields must be filled in."), so printing
     * `errorMessage` showed every error twice. There the field is only marked
     * invalid; in canvas, which draws nothing, the text is shown. A column is
     * the tell, and `attributes` alone is not one — see `columnOf`. Through
     * 0.1.1 it was taken for one, and a mask longer than the 100 a canvas app
     * reports for no column said the column was too short.
     */
    private drawState(): void {
        const parameter = this.context.parameters.value;
        const mask = this.mask as Mask;
        const column = columnOf(parameter);
        const modelDriven = column !== undefined;
        const maxLength = column?.MaxLength;
        const needed = neededLength(mask, this.store);

        if (parameter.error) {
            this.showMessage(this.context, parameter.errorMessage, modelDriven ? 'mark' : 'error');
        } else if (maxLength !== undefined && maxLength > 0 && needed > maxLength) {
            this.showMessage(
                this.context,
                this.resources
                    .getString('InputMask_TooLong')
                    .replace('{0}', String(needed))
                    .replace('{1}', String(maxLength)),
                'error',
            );
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

            // The first verdict. A canvas app reads an output nobody has
            // reported yet as false, so through 0.1.1 a complete value and an
            // empty optional field both read "not valid" until their first
            // edit (a published canvas app, 2026-10-07). With no column behind
            // the value it is always reported. A form has no use for the
            // output and is told only when it is false, as before.
            if (!valid || !modelDriven) {
                this.notifyOutputChanged();
            }
        }
    }

    /**
     * `error` is red, `aria-invalid` and a line of text; `mark` is red and
     * `aria-invalid` with no text, for a message the host draws itself;
     * `note` is a neutral line that marks nothing invalid on screen —
     * `isValid` still says false.
     */
    private showMessage(
        _context: ComponentFramework.Context<IInputs>,
        text: string,
        tone: 'error' | 'mark' | 'note' | 'none',
    ): void {
        const invalid = tone === 'error' || tone === 'mark';
        const shown = tone === 'error' || tone === 'note';

        this.container.classList.toggle('InputMask--invalid', invalid);
        this.message.classList.toggle('InputMask-message--note', tone === 'note');
        this.input.setAttribute('aria-invalid', String(invalid));
        this.message.hidden = !shown;
        this.message.textContent = shown ? text : '';
    }

    /** See the scaffold: only the fallbacks, and only where the host says. */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('InputMask--dark', isDarkTheme);
    }
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
