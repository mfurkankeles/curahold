// The header's and the inner pages' words, by language. See types.ts.
import type { Locale } from '../../shared/src/i18n';
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

export const INFO: Record<Locale, InfoCopy> = { en, tr, ar, he, fa, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko, hi, ms };

export const infoCopy = (locale: Locale): InfoCopy => INFO[locale];
