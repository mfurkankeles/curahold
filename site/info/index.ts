// The header's and the inner pages' words, by language. See types.ts.
import type { Locale } from '../../shared/src/i18n';
import type { InfoCopy } from './types';
import { en } from './en';
import { tr } from './tr';

export const INFO: Partial<Record<Locale, InfoCopy>> = { en, tr };

export const infoCopy = (locale: Locale): InfoCopy => INFO[locale] ?? en;
