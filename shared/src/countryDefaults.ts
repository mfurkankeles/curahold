// A new company's clock and money, from the country on its trial request: a
// company in Türkiye starts on Istanbul time in lira, one in the Emirates on
// Dubai time in dirhams. Anything not listed keeps UTC and US dollars, and the
// administrator changes either in Settings → Company (the setup wizard's first step).

const EUR = (tz: string) => ({ timezone: tz, currency: 'EUR' });

const BY_COUNTRY: Record<string, { timezone: string; currency: string }> = {
  TR: { timezone: 'Europe/Istanbul', currency: 'TRY' },
  GB: { timezone: 'Europe/London', currency: 'GBP' },
  IE: EUR('Europe/Dublin'),
  DE: EUR('Europe/Berlin'),
  AT: EUR('Europe/Vienna'),
  FR: EUR('Europe/Paris'),
  NL: EUR('Europe/Amsterdam'),
  BE: EUR('Europe/Brussels'),
  LU: EUR('Europe/Luxembourg'),
  ES: EUR('Europe/Madrid'),
  PT: EUR('Europe/Lisbon'),
  IT: EUR('Europe/Rome'),
  GR: EUR('Europe/Athens'),
  FI: EUR('Europe/Helsinki'),
  EE: EUR('Europe/Tallinn'),
  LV: EUR('Europe/Riga'),
  LT: EUR('Europe/Vilnius'),
  SK: EUR('Europe/Bratislava'),
  SI: EUR('Europe/Ljubljana'),
  HR: EUR('Europe/Zagreb'),
  CY: EUR('Asia/Nicosia'),
  MT: EUR('Europe/Malta'),
  CH: { timezone: 'Europe/Zurich', currency: 'CHF' },
  PL: { timezone: 'Europe/Warsaw', currency: 'PLN' },
  CZ: { timezone: 'Europe/Prague', currency: 'CZK' },
  RO: { timezone: 'Europe/Bucharest', currency: 'RON' },
  SE: { timezone: 'Europe/Stockholm', currency: 'SEK' },
  NO: { timezone: 'Europe/Oslo', currency: 'NOK' },
  DK: { timezone: 'Europe/Copenhagen', currency: 'DKK' },
  AE: { timezone: 'Asia/Dubai', currency: 'AED' },
  SA: { timezone: 'Asia/Riyadh', currency: 'SAR' },
  QA: { timezone: 'Asia/Qatar', currency: 'QAR' },
  KW: { timezone: 'Asia/Kuwait', currency: 'KWD' },
  BH: { timezone: 'Asia/Bahrain', currency: 'BHD' },
  OM: { timezone: 'Asia/Muscat', currency: 'OMR' },
  JO: { timezone: 'Asia/Amman', currency: 'JOD' },
  EG: { timezone: 'Africa/Cairo', currency: 'EGP' },
  MA: { timezone: 'Africa/Casablanca', currency: 'MAD' },
  IL: { timezone: 'Asia/Jerusalem', currency: 'ILS' },
  AZ: { timezone: 'Asia/Baku', currency: 'AZN' },
  CN: { timezone: 'Asia/Shanghai', currency: 'CNY' },
  HK: { timezone: 'Asia/Hong_Kong', currency: 'HKD' },
  TW: { timezone: 'Asia/Taipei', currency: 'TWD' },
  JP: { timezone: 'Asia/Tokyo', currency: 'JPY' },
  KR: { timezone: 'Asia/Seoul', currency: 'KRW' },
  SG: { timezone: 'Asia/Singapore', currency: 'SGD' },
  MY: { timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' },
  IN: { timezone: 'Asia/Kolkata', currency: 'INR' },
  US: { timezone: 'America/New_York', currency: 'USD' },
  CA: { timezone: 'America/Toronto', currency: 'CAD' },
  MX: { timezone: 'America/Mexico_City', currency: 'MXN' },
  BR: { timezone: 'America/Sao_Paulo', currency: 'BRL' },
  AU: { timezone: 'Australia/Sydney', currency: 'AUD' },
  NZ: { timezone: 'Pacific/Auckland', currency: 'NZD' },
  ZA: { timezone: 'Africa/Johannesburg', currency: 'ZAR' },
};

/** The time zone and currency a company in this country (ISO 3166 alpha-2) most likely works in; null when unknown. */
export function countryDefaults(country: string | null | undefined): { timezone: string; currency: string } | null {
  return BY_COUNTRY[(country ?? '').trim().toUpperCase()] ?? null;
}
