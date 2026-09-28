/**
 * The control's own undo and redo.
 *
 * A browser keeps an undo history for a text box only while it is the one
 * changing the value. The moment a control assigns `value` — which a mask does
 * on every keystroke — Chromium's history stops matching the box: measured on
 * the form 2026-09-28, Ctrl+Z fired `historyUndo`, changed nothing, and left the
 * cursor at 0. The event is cancelable, so the control cancels it and steps
 * back through a history of its own.
 *
 * Pure: snapshots in, snapshots out.
 */

export interface Snapshot {
    chars: string[];
    /** The cursor, as a count of characters before it. */
    k: number;
}

export interface History {
    past: Snapshot[];
    future: Snapshot[];
    /** The kind of the last recorded edit, so a run of typing is one step. */
    run: string | null;
}

/** Enough for any real session in one field; the oldest steps go first. */
const LIMIT = 100;

/**
 * Edits a browser treats as one step when they come in a row: typing a word
 * is undone as a whole, not a character at a time. Everything else — paste,
 * autofill, a finished composition, a cut — is a step of its own.
 */
const RUNS = ['insertText', 'deleteContentBackward', 'deleteContentForward'];

export function empty(): History {
    return { past: [], future: [], run: null };
}

/**
 * An edit happened: `before` is what the field held before it. A new edit
 * ends any redo — the future it would have restored no longer follows.
 */
export function record(history: History, before: Snapshot, kind: string | undefined): History {
    const run = kind !== undefined && RUNS.includes(kind) ? kind : null;
    const continues = run !== null && run === history.run && history.past.length > 0;
    const past = continues ? history.past : history.past.concat([before]).slice(-LIMIT);

    return { past, future: [], run };
}

/** Step back, or `null` when there is nothing to undo. */
export function undo(history: History, current: Snapshot): { history: History; to: Snapshot } | null {
    if (history.past.length === 0) {
        return null;
    }

    const to = history.past[history.past.length - 1];

    return {
        history: { past: history.past.slice(0, -1), future: history.future.concat([current]), run: null },
        to,
    };
}

/** Step forward again, or `null` when nothing was undone since the last edit. */
export function redo(history: History, current: Snapshot): { history: History; to: Snapshot } | null {
    if (history.future.length === 0) {
        return null;
    }

    const to = history.future[history.future.length - 1];

    return {
        history: { past: history.past.concat([current]), future: history.future.slice(0, -1), run: null },
        to,
    };
}
