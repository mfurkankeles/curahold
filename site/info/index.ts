// The header's and the inner pages' words, by language. See types.ts.
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

export const INFO: Record<SiteLocale, InfoCopy> = { en, tr, ar, he, fa, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko };

export const infoCopy = (locale: SiteLocale): InfoCopy => INFO[locale];
