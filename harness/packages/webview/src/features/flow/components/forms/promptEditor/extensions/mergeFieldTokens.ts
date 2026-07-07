// Canonical source for `{{varName}}` merge-field regex shapes. Five sites
// (InputRule, clipboardTextParser, deserializer split, prompt-schema extractor,
// binding-sync extractor) need slightly different flags and capture groups; all
// share the `\w+` name class so they cannot drift.

const NAME = String.raw`\w+`;

/** Global regex capturing varName. Use with `String.prototype.matchAll`. */
export const MERGE_FIELD_TOKEN_GLOBAL = new RegExp(`\\{\\{(${NAME})\\}\\}`, 'g');

/** Whole-token capture, suitable as a delimiter for `String.prototype.split`. */
export const MERGE_FIELD_TOKEN_SPLIT = new RegExp(`(\\{\\{${NAME}\\}\\})`);

/** End-anchored regex capturing varName; used by the Tiptap InputRule. */
export const MERGE_FIELD_TOKEN_TAIL = new RegExp(`\\{\\{(${NAME})\\}\\}$`);
