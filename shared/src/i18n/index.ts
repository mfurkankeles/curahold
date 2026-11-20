// The i18n module with every dictionary loaded: what the API server, the
// sales-site build and the tests use. Everything except the dictionaries lives
// in ./core; the browser bundles import that instead (./vite-plugin.ts) and
// fetch one language at a time.
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
import { registerDictionary } from './core';

// Fully written dictionaries first, then the ones that fall back to English.
registerDictionary('en', en);
registerDictionary('tr', tr);
registerDictionary('ar', ar);
registerDictionary('he', he);
registerDictionary('fa', fa);
registerDictionary('zh-Hans', zhHans);
registerDictionary('zh-Hant', zhHant);
registerDictionary('ja', ja);
registerDictionary('ko', ko);
registerDictionary('hi', hi);
registerDictionary('ms', ms);

export * from './core';
