// The cost model (scripts/quality/cost.mts): every input says where it comes
// from, the trial is the catalogue's three months, and — the owner's pricing
// rule — no plan is loss-making per customer even with every cost driver at its
// cap. If a new price list breaks that rule, this test says so before launch.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, PLANS, regionalPrice, type Interval } from '../shared/src/billing';
import { IN, companyCost, costPerQuestion, minSeats, scenario, unit } from '../scripts/quality/cost.mjs';

const inputs = JSON.parse(readFileSync('scripts/quality/cost.inputs.json', 'utf8'));

describe('the cost model', () => {
  it('marks every input with its source or "assumption", all in one file', () => {
    const groups = Object.entries(inputs).filter(([k]) => !k.startsWith('_') && k !== 'readOn') as [string, Record<string, { value: unknown; source: string }>][];
    expect(groups.length).toBeGreaterThan(5);
    for (const [g, items] of groups)
      for (const [k, v] of Object.entries(items)) {
        expect(v, `${g}.${k}`).toHaveProperty('value');
        expect(typeof v.source === 'string' && v.source.length > 5, `${g}.${k} needs a source`).toBe(true);
      }
  });

  it('uses the catalogue: three-month trial and the plan caps as the worst case', () => {
    expect(CATALOGUE.trial.months).toBe(3);
    const team = PLANS.team;
    const worst = companyCost(12, 'team', 'month', 'worst');
    expect(worst.use.questions).toBe(team.caps.aiQuestionsPerSeat! * 12);
    expect(worst.lines.ai).toBeCloseTo(team.caps.aiQuestionsPerSeat! * 12 * costPerQuestion('worst'), 6);
    expect(worst.use.fileGb).toBe(team.caps.storageGbPerSeat! * 12);
    expect(costPerQuestion('worst')).toBeGreaterThan(costPerQuestion('typical'));
  });

  it('no plan loses money on a company of a typical size, even at every cap', () => {
    for (const p of Object.keys(PLANS))
      for (const iv of ['month', 'year'] as Interval[])
        for (const { seats } of IN.scenarios.teamMix as { seats: number }[]) expect(unit(seats, p, iv, 'worst').contribution, `${p} ${iv} ${seats} seats`).toBeGreaterThan(0);
  });

  it('every regional price pays for itself from five seats at the caps', () => {
    for (const r of CATALOGUE.regions.filter((x) => x.prices))
      for (const p of Object.keys(PLANS))
        for (const iv of ['month', 'year'] as Interval[]) {
          const rp = regionalPrice(r, p, iv);
          const s = minSeats(p, iv, rp.amount / (IN.fx[rp.collect] ?? 1), r.tax.b2b ? (r.tax.rate ?? 0) : 0);
          expect(s, `${r.key} ${p} ${iv}`).not.toBeNull();
          expect(s!).toBeLessThanOrEqual(5);
        }
  });

  it('scales: cost per seat falls as customers grow, and the fixed floor is covered', () => {
    const small = scenario(10, 'worst');
    const big = scenario(300, 'worst');
    expect(big.perSeat).toBeLessThan(small.perSeat);
    expect(small.profit).toBeGreaterThan(0);
  });
});
