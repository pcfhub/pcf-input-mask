import { Mask } from './pattern';
import { render } from './format';

/**
 * What the value is, as far as the mask can say.
 *
 * `empty` is not a failure: whether a column may be empty is the platform's
 * business requirement, not the mask's, and a mask that called an empty
 * optional field invalid would block every canvas Save gated on `isValid`.
 */
export type Verdict = 'empty' | 'complete' | 'incomplete';

export function verdictOf(mask: Mask, chars: string[]): Verdict {
    if (chars.length === 0) {
        return 'empty';
    }

    return chars.length >= mask.slots ? 'complete' : 'incomplete';
}

export type Store = 'formatted' | 'raw';

/** Blank, or anything unknown, is `formatted` — what views already show. */
export function storeOf(value: string | null | undefined): Store {
    return (value ?? '').trim() === 'raw' ? 'raw' : 'formatted';
}

/**
 * How many characters a complete value takes in the column: every token when
 * formatted (each slot and each literal is one character), the slots alone when
 * raw. Measured on the form 2026-09-28: a 22-character formatted value in a
 * 20-character column is refused at save, on the field and in the form's
 * notification bar — so a mask longer than its column can never be saved
 * complete, and the maker is told on sight.
 */
export function neededLength(mask: Mask, store: Store): number {
    return store === 'raw' ? mask.slots : mask.tokens.length;
}

/**
 * The string written to the column. An empty value is `null`, not `''`: a
 * cleared column must be cleared, and `''` is a value on some hosts.
 */
export function stored(mask: Mask, chars: string[], store: Store): string | null {
    if (chars.length === 0) {
        return null;
    }

    return store === 'raw' ? chars.join('') : render(mask, chars);
}
