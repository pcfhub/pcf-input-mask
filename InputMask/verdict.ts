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
 * The string written to the column. An empty value is `null`, not `''`: a
 * cleared column must be cleared, and `''` is a value on some hosts.
 */
export function stored(mask: Mask, chars: string[], store: Store): string | null {
    if (chars.length === 0) {
        return null;
    }

    return store === 'raw' ? chars.join('') : render(mask, chars);
}
