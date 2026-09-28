/**
 * What a mask is: a row of slots, each accepting one kind of character, with
 * literals between them.
 *
 * Pure — no DOM and no `context` — so the suite loads it from source and
 * asserts every rule here without a browser.
 *
 * The syntax is the one masks have used since long before PCF, and the one the
 * platform's own retired Input Mask control used:
 *
 * | In the pattern | Accepts                                   |
 * | -------------- | ----------------------------------------- |
 * | `9`            | a digit                                   |
 * | `a`            | a letter, as typed                        |
 * | `A`            | a letter, made upper-case                 |
 * | `*`            | a letter or a digit                       |
 * | `\x`           | the character `x`, as a literal           |
 * | anything else  | itself, as a literal                      |
 */

export type Accept = 'digit' | 'letter' | 'alnum';

export type Token =
    | { kind: 'slot'; accept: Accept; upper: boolean }
    | { kind: 'literal'; char: string };

export interface Mask {
    tokens: Token[];
    /** How many characters a complete value has — the slots, not the literals. */
    slots: number;
    /** Every slot takes a digit: the phone keypad is the right keyboard. */
    numeric: boolean;
}

/**
 * The presets a maker picks from. A preset is a pattern with a name, nothing
 * more — `custom` with the same pattern behaves identically.
 *
 * Only shapes that are fixed-length. A ZIP that may or may not carry its +4 is
 * two presets, not one with an optional section: an optional section makes
 * "complete" ambiguous, and `isValid` exists to answer exactly that.
 */
export const PRESETS: Record<string, string> = {
    'phone-us': '(999) 999-9999',
    zip: '99999',
    zip4: '99999-9999',
    'postal-ca': 'A9A 9A9',
    ssn: '999-99-9999',
};

/** `mask` left blank, or naming nothing this version knows. */
export const DEFAULT_PRESET = 'phone-us';

export type Resolved =
    | { ok: true; mask: Mask; pattern: string }
    | { ok: false; reason: 'empty' | 'no-slots' };

/**
 * The mask a maker's two inputs describe.
 *
 * Blank is the default, never an error: a manifest `default-value` on an
 * optional property is applied by some hosts and not by others, so the code
 * decides what blank means. An unknown preset name is treated as blank, which
 * is what an older control does with a preset a newer manifest added.
 *
 * `custom` with an unusable pattern is a named state rather than a throw — the
 * control says so on the form instead of rendering a field that takes nothing.
 */
export function resolve(preset: string | null | undefined, custom: string | null | undefined): Resolved {
    const name = (preset ?? '').trim();

    if (name === 'custom') {
        const pattern = custom ?? '';

        if (pattern.trim() === '') {
            return { ok: false, reason: 'empty' };
        }

        const mask = parse(pattern);

        return mask.slots === 0 ? { ok: false, reason: 'no-slots' } : { ok: true, mask, pattern };
    }

    const pattern = PRESETS[name] ?? PRESETS[DEFAULT_PRESET];

    return { ok: true, mask: parse(pattern), pattern };
}

export function parse(pattern: string): Mask {
    const tokens: Token[] = [];
    const chars = Array.from(pattern);

    for (let i = 0; i < chars.length; i += 1) {
        const c = chars[i];

        if (c === '\\') {
            // A trailing backslash escapes nothing and stands for itself.
            tokens.push({ kind: 'literal', char: i + 1 < chars.length ? chars[(i += 1)] : c });
        } else if (c === '9') {
            tokens.push({ kind: 'slot', accept: 'digit', upper: false });
        } else if (c === 'a') {
            tokens.push({ kind: 'slot', accept: 'letter', upper: false });
        } else if (c === 'A') {
            tokens.push({ kind: 'slot', accept: 'letter', upper: true });
        } else if (c === '*') {
            tokens.push({ kind: 'slot', accept: 'alnum', upper: false });
        } else {
            tokens.push({ kind: 'literal', char: c });
        }
    }

    const slotTokens = tokens.filter((token) => token.kind === 'slot');

    return {
        tokens,
        slots: slotTokens.length,
        numeric: slotTokens.length > 0 && slotTokens.every((token) => token.kind === 'slot' && token.accept === 'digit'),
    };
}

/**
 * A letter is a character with case. No regular expression, so no `u` flag
 * and no alphabet chosen for the maker: `é`, `ß`'s capital, Cyrillic and
 * Greek all count, and a character with no case — CJK, digits, punctuation —
 * does not.
 */
export function isLetter(c: string): boolean {
    return c.toLowerCase() !== c.toUpperCase();
}

export function isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
}

/** The character this slot would hold for `c`, or `null` if it refuses it. */
export function take(slot: Extract<Token, { kind: 'slot' }>, c: string): string | null {
    if (slot.accept === 'digit') {
        return isDigit(c) ? c : null;
    }

    if (slot.accept === 'letter') {
        return isLetter(c) ? (slot.upper ? c.toUpperCase() : c) : null;
    }

    return isDigit(c) || isLetter(c) ? c : null;
}

/** The slot tokens alone, in order. */
export function slotsOf(mask: Mask): Extract<Token, { kind: 'slot' }>[] {
    return mask.tokens.filter((token): token is Extract<Token, { kind: 'slot' }> => token.kind === 'slot');
}

/**
 * The guide shown in an empty, focused field: every slot as `_`, the literals
 * as themselves — `(___) ___-____`.
 */
export function guide(mask: Mask): string {
    return mask.tokens.map((token) => (token.kind === 'slot' ? '_' : token.char)).join('');
}
