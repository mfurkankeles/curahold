// The header's and the inner pages' words, by language. See types.ts.
import { gated } from '../gates';
import type { SiteLocale } from '../locales';
import type { InfoCopy } from './types';
import { en } from './en';
import { tr } from './tr';
import { ar } from './ar';
import { he } from './he';
import { fa } from './fa';
import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';
import { ja } from './ja';
import { ko } from './ko';
import { hi } from './hi';
import { ms } from './ms';

export const INFO: Record<SiteLocale, InfoCopy> = { en, tr, ar, he, fa, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko, hi, ms };

/** The info pages' copy (nav, footer, solution and resource pages) in one site language. */
export const infoCopy = (locale: SiteLocale): InfoCopy => gated(INFO[locale]);
