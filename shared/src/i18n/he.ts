import type { MessageKey } from './en';

// Hebrew (עברית). Curahold speaks this language, but its dictionary is not written
// yet: every phrase falls back to English (see translate() in ./index.ts) until
// a native pass fills it in. Add entries by their MessageKey, keeping
// placeholders such as {name} and {account} exactly as in English.
export const he: Partial<Record<MessageKey, string>> = {};
