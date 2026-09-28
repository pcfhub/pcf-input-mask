/**
 * THROWAWAY — the 0.0.1 probe. Deleted before 0.1.0; nothing may import it
 * but `index.ts` behind `PROBE`.
 *
 * Every question it answers is in SPEC.md (P1–P6). It records passively and
 * offers a few active calls on `window.__pcfInputMaskProbe`; the answers are
 * pasted back from the console:
 *
 *   copy(JSON.stringify(__pcfInputMaskProbe.dump(), null, 1))
 */

export type NotifyMode = 'keystroke' | 'blur';

interface Entry {
    t: number;
    what: string;
    detail?: unknown;
}

export interface Probe {
    note(what: string, detail?: unknown): void;
    notifyMode: NotifyMode;
}

export function createProbe(input: HTMLInputElement): Probe {
    const started = Date.now();
    const log: Entry[] = [];
    let blockHash = false;

    const probe: Probe = {
        notifyMode: 'keystroke',
        note(what: string, detail?: unknown): void {
            log.push({ t: Date.now() - started, what, detail });

            if (log.length > 2000) {
                log.shift();
            }
        },
    };

    // P3: what the form's browser delivers, before the control touches it.
    const record = (event: Event): void => {
        const e = event as InputEvent;

        probe.note(event.type, {
            inputType: e.inputType,
            data: e.data,
            isComposing: e.isComposing,
            cancelable: event.cancelable,
            constructor: event.constructor && event.constructor.name,
            value: input.value,
            caret: input.selectionStart,
        });
    };

    ['beforeinput', 'compositionstart', 'compositionend', 'paste', 'change'].forEach((type) => {
        input.addEventListener(type, record);
    });

    // P3: is preventDefault on beforeinput honoured on the form?
    input.addEventListener('beforeinput', (event) => {
        if (blockHash && (event as InputEvent).data === '#') {
            event.preventDefault();
            probe.note('blocked #', { defaultPrevented: event.defaultPrevented });
        }
    });

    (window as unknown as Record<string, unknown>).__pcfInputMaskProbe = {
        /** Everything recorded, oldest first. */
        dump: () => log.slice(),
        clear: () => {
            log.length = 0;
        },
        /** P2: 'keystroke' (default) or 'blur'. */
        notifyMode: (mode: NotifyMode) => {
            probe.notifyMode = mode;
            probe.note('notifyMode', mode);
            return mode;
        },
        /** P3: type # into the field afterwards; it should not appear. */
        blockHash: (on: boolean) => {
            blockHash = on;
            return on;
        },
        /**
         * P6: put the cursor at 2, assign the value the box already holds, and
         * report where the cursor is. 2 means an identical assignment leaves it;
         * the length means it moves it.
         */
        sameValueCaret: () => {
            input.focus();
            input.setSelectionRange(2, 2);
            // eslint-disable-next-line no-self-assign
            input.value = input.value;
            return { value: input.value, selectionStart: input.selectionStart, length: input.value.length };
        },
    };

    probe.note('probe installed');

    return probe;
}
