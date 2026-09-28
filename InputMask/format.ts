import { Mask, isDigit, isLetter, slotsOf, take } from './pattern';

/**
 * A masked value is its **characters** — what the user typed into the slots,
 * never the literals — and everything else is derived: the display, the value
 * stored, the cursor, the verdict.
 *
 * Pure, like `pattern.ts`, and asserted from source by the suite.
 */

/**
 * The characters as the mask shows them.
 *
 * Literals *between* characters are always drawn, the ones before the first
 * character appear with it, and the ones after the last do not — so "555"
 * reads `(555`, and the `) ` arrives with the fourth digit. Drawing the
 * trailing literals eagerly would store `(555) ` for an incomplete value and
 * put a literal under the user's next Backspace.
 */
export function render(mask: Mask, chars: string[]): string {
    return layout(mask, chars).text;
}

/** The display, and where each character sits in it. */
function layout(mask: Mask, chars: string[]): { text: string; at: number[] } {
    let text = '';
    let pending = '';
    let i = 0;
    const at: number[] = [];

    for (const token of mask.tokens) {
        if (token.kind === 'literal') {
            pending += token.char;
            continue;
        }

        if (i >= chars.length) {
            break;
        }

        text += pending;
        pending = '';
        at.push(text.length);
        text += chars[i];
        i += 1;
    }

    return { text, at };
}

/**
 * Where the cursor goes in the display to sit after the `k`th character.
 * Before the first character is *after* the leading literals — the cursor
 * belongs where typing continues, not inside `(`.
 */
export function caretAt(mask: Mask, chars: string[], k: number): number {
    const { text, at } = layout(mask, chars);

    if (chars.length === 0) {
        return 0;
    }

    if (k <= 0) {
        return at[0];
    }

    return k >= chars.length ? text.length : at[k - 1] + 1;
}

/**
 * The characters in `text`, taken in order into the slots after `into`; a
 * character no slot at that point accepts is dropped, and so is anything past
 * the last slot.
 */
function flow(mask: Mask, into: string[], text: string[]): string[] {
    const slots = slotsOf(mask);
    const out = into.slice();

    for (const c of text) {
        if (out.length >= slots.length) {
            break;
        }

        const kept = take(slots[out.length], c);

        if (kept !== null) {
            out.push(kept);
        }
    }

    return out;
}

/**
 * A pasted or autofilled international number is longer than a national mask:
 * `+1 (555) 123-4567` into `(999) 999-9999`. When the text starts with `+` and
 * has more digits than an all-digit mask has slots, the leading digits — the
 * country code — are the ones dropped. Without the `+` there is no telling a
 * country code from a typo, and the first digits are kept.
 */
function withoutCountryCode(mask: Mask, text: string): string {
    if (!mask.numeric || !/^\s*\+/.test(text)) {
        return text;
    }

    const digits = Array.from(text).filter(isDigit);

    return digits.length > mask.slots ? digits.slice(digits.length - mask.slots).join('') : text;
}

/**
 * A whole value — what Dataverse holds, or what replaced the whole field.
 *
 * Read against the pattern first, literal for literal, so a stored
 * `(555) 123-4567` is its ten digits even when a literal is itself a digit
 * (`+1 (999) …`); anything that does not follow the pattern is then taken
 * character by character, which reads the raw `5551234567` and the
 * hand-typed `555.123.4567` alike.
 */
export function extract(mask: Mask, text: string): string[] {
    const strict = readStrict(mask, text);

    return strict ?? flow(mask, [], Array.from(withoutCountryCode(mask, text)));
}

function readStrict(mask: Mask, text: string): string[] | null {
    const chars = Array.from(text);
    const out: string[] = [];
    let i = 0;

    for (const token of mask.tokens) {
        if (i >= chars.length) {
            break;
        }

        if (token.kind === 'literal') {
            if (chars[i] !== token.char) {
                return null;
            }
        } else {
            const kept = take(token, chars[i]);

            if (kept === null) {
                return null;
            }

            out.push(kept);
        }

        i += 1;
    }

    return i === chars.length && chars.length > 0 ? out : null;
}

/**
 * Whether reading `text` into the mask lost anything the user would call
 * content — a letter or a digit that no slot took. `555.123.4567 x12` loses
 * `x12`; a stored `(555) 123-4567` read by a mask storing raw digits loses
 * nothing, its punctuation is the mask's own.
 */
export function isLossy(mask: Mask, text: string, chars: string[]): boolean {
    const content = Array.from(withoutCountryCode(mask, text)).filter((c) => isDigit(c) || isLetter(c));
    const literals = mask.tokens.filter((t) => t.kind === 'literal').map((t) => (t.kind === 'literal' ? t.char : ''));
    const kept = chars.map((c) => c.toLowerCase());
    let j = 0;

    for (const c of content) {
        if (j < kept.length && c.toLowerCase() === kept[j]) {
            j += 1;
        } else if (!literals.includes(c)) {
            return true;
        }
    }

    return j < kept.length;
}

export interface Edited {
    chars: string[];
    /** The cursor, as a count of characters before it. See `caretAt`. */
    k: number;
}

/**
 * One edit, read back from the field after the browser made it.
 *
 * The control does not cancel `beforeinput` and redo the edit itself; it lets
 * the browser edit, then compares the field with the display it drew. That is
 * one path for every way text arrives — typing, paste, delete, autofill (which
 * fires no `beforeinput` at all), undo, and a composition once it ends.
 *
 * The comparison is anchored on the cursor: everything after it is text the
 * edit did not touch, so the changed run is found without guessing which of
 * two identical digits was typed. The run's position in the old display says
 * which characters it replaced, and the characters after it flow back into
 * the slots — re-checked, because a slot further on may take a different kind.
 *
 * A delete that removed only a literal — Backspace just after `) ` — removes
 * the character before it instead, or Backspace would appear to do nothing.
 */
export function applyInput(
    mask: Mask,
    prev: string[],
    oldDisplay: string,
    text: string,
    caret: number,
    inputType: string | undefined,
): Edited {
    const { at } = layout(mask, prev);
    const oldLength = oldDisplay.length;
    const newLength = text.length;
    const suffix = Math.max(0, Math.min(newLength - caret, oldLength));
    const limit = Math.min(caret, oldLength - suffix);
    let prefix = 0;

    while (prefix < limit && oldDisplay[prefix] === text[prefix]) {
        prefix += 1;
    }

    const removedEnd = oldLength - suffix;
    const inserted = text.slice(prefix, newLength - suffix);
    const start = at.filter((p) => p < prefix).length;
    const end = at.filter((p) => p < removedEnd).length;

    if (inserted === '' && start === end) {
        if ((inputType ?? '').startsWith('delete') && (inputType ?? '').endsWith('Backward') && start > 0) {
            return { chars: flow(mask, prev.slice(0, start - 1), prev.slice(start)), k: start - 1 };
        }

        if ((inputType ?? '').startsWith('delete') && (inputType ?? '').endsWith('Forward') && start < prev.length) {
            return { chars: flow(mask, prev.slice(0, start), prev.slice(start + 1)), k: start };
        }

        return { chars: prev, k: start };
    }

    const head = prev.slice(0, start);
    const tail = prev.slice(end);

    // Everything replaced: read it as a whole value, as a stored one is read.
    if (head.length === 0 && tail.length === 0) {
        const chars = extract(mask, inserted);

        return { chars, k: chars.length };
    }

    const typed = flow(mask, head, Array.from(inserted));
    const chars = flow(mask, typed, tail);

    return { chars, k: Math.min(typed.length, chars.length) };
}
