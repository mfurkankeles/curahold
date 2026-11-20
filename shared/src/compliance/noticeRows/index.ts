// The translated notice-table rows for every language past English and Turkish,
// read by scripts/compliance/legal-pack.ts only (nothing in the app bundles them).
// A new activity in dataInventory.ts needs a row in each file here; the generator
// stops with the language and the activity id when one is missing.
import type { NoticeLocale, NoticeText } from './types';
import ar from './ar';
import fa from './fa';
import he from './he';
import hi from './hi';
import ja from './ja';
import ko from './ko';
import ms from './ms';
import zhHans from './zh-Hans';
import zhHant from './zh-Hant';

export type { NoticeLocale, NoticeRow, NoticeText } from './types';

/** The notice-table words per language (draft translations; the English text prevails). */
export const NOTICE_ROWS: Record<NoticeLocale, NoticeText> = { ar, he, fa, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko, hi, ms };
