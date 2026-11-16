// A small picture of each chart kind, for the builder's picker and the galleries. Kept apart from
// Charts.tsx so the home screen (which draws charts but never these) does not download it.
import type { ChartKind } from '../../../shared/src/reports';

/** A small picture of a chart kind, for pickers and the gallery. */
export function ChartGlyph({ kind, size = 28 }: { kind: ChartKind; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 28 28', fill: 'none', 'aria-hidden': true } as const;
  if (kind === 'bar')
    return (
      <svg {...s} className="glyph">
        <rect x="4" y="5" width="18" height="4" rx="2" className="glyph__a" />
        <rect x="4" y="12" width="12" height="4" rx="2" className="glyph__b" />
        <rect x="4" y="19" width="7" height="4" rx="2" className="glyph__c" />
      </svg>
    );
  if (kind === 'column')
    return (
      <svg {...s} className="glyph">
        <rect x="5" y="14" width="4" height="9" rx="2" className="glyph__c" />
        <rect x="12" y="6" width="4" height="17" rx="2" className="glyph__a" />
        <rect x="19" y="10" width="4" height="13" rx="2" className="glyph__b" />
      </svg>
    );
  if (kind === 'stacked')
    return (
      <svg {...s} className="glyph">
        <rect x="5" y="15" width="4" height="8" rx="1.5" className="glyph__a" />
        <rect x="5" y="9" width="4" height="5" rx="1.5" className="glyph__c" />
        <rect x="12" y="13" width="4" height="10" rx="1.5" className="glyph__a" />
        <rect x="12" y="5" width="4" height="7" rx="1.5" className="glyph__c" />
        <rect x="19" y="17" width="4" height="6" rx="1.5" className="glyph__a" />
        <rect x="19" y="11" width="4" height="5" rx="1.5" className="glyph__c" />
      </svg>
    );
  if (kind === 'line')
    return (
      <svg {...s} className="glyph">
        <path d="M4 20l6-7 5 4 9-11" className="glyph__line" />
        <circle cx="10" cy="13" r="1.8" className="glyph__a" />
        <circle cx="15" cy="17" r="1.8" className="glyph__a" />
      </svg>
    );
  if (kind === 'donut')
    return (
      <svg {...s} className="glyph">
        <circle cx="14" cy="14" r="8" className="glyph__ring" />
        <path d="M14 6a8 8 0 0 1 7.6 10.5" className="glyph__arc" />
      </svg>
    );
  if (kind === 'number')
    return (
      <svg {...s} className="glyph">
        <rect x="4" y="8" width="20" height="8" rx="3" className="glyph__a" />
        <rect x="4" y="19" width="11" height="3" rx="1.5" className="glyph__c" />
      </svg>
    );
  return (
    <svg {...s} className="glyph">
      <rect x="4" y="5" width="20" height="4" rx="1.5" className="glyph__a" />
      <rect x="4" y="12" width="20" height="3" rx="1.5" className="glyph__c" />
      <rect x="4" y="18" width="20" height="3" rx="1.5" className="glyph__c" />
    </svg>
  );
}
