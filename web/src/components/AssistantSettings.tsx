// Settings → Support: the company's AI assistant (api/src/routes/assist.ts).
// Off until an administrator turns it on (with a notice saying what goes
// to the AI provider), the monthly limit in dollars, how long questions are kept, and
// whether new help requests get a drafted first reply for Curahold support —
// with this month's use, so the cost is never a surprise.
import { useEffect, useState } from 'react';
import { api, get } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';

interface View {
  settings: { enabled: boolean; monthlyCapUsd: number; retentionDays: number; deskFirstReply: 'note' | 'off' };
  usage: { questions: number; modelQuestions: number; costUsd: number };
  engine: { available: boolean; model: string | null; maxMonthlyCapUsd: number };
  retentionChoices: number[];
  /** The draft first reply goes to the model only for requesters who accepted CuraAI's notice (operator setting). */
  deskNeedsConsent?: boolean;
}

/**
 * Settings: the company's assistant, off until an administrator turns it on (with a notice of what goes to the AI
 * provider), its monthly dollar limit and how long questions are kept.
 */
export function AssistantSettings() {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [view, setView] = useState<View | null>(null);
  const [cap, setCap] = useState('');
  useEffect(() => {
    void get<View>('/assist/settings').then((v) => {
      setView(v);
      setCap(String(v.settings.monthlyCapUsd));
    });
  }, []);
  if (!view) return null;
  const save = async (more: Partial<View['settings']>) => {
    const v = await api<View>('PUT', '/assist/settings', more);
    setView(v);
    setCap(String(v.settings.monthlyCapUsd));
    toast(t('assist.settings.saved'));
  };
  const usd = (n: number) => formatMoney(n, 'USD', locale);
  const s = view.settings;
  return (
    <section className="sheet" data-tour="ai-settings">
      <h3 className="section__head">{t('assist.settings.title')}</h3>
      <p className="field__hint">{t('assist.settings.lead')}</p>
      {!view.engine.available && <p className="muted">{t('assist.settings.unavailable')}</p>}
      {/* Off by default (legal texts): say plainly what turning it on sends, before anyone ticks the box. */}
      {!s.enabled && (
        <p className="notice" role="note" data-test="assist-off-notice">
          {t('assist.settings.offNotice')}
        </p>
      )}
      <p className="muted">{t('assist.settings.usage', { n: view.usage.questions, m: view.usage.modelQuestions, cost: usd(view.usage.costUsd) })}</p>
      <label className="checkbox">
        <input type="checkbox" checked={s.enabled} onChange={(e) => void save({ enabled: e.target.checked })} />
        <span>
          <strong>{t('assist.settings.enabled')}</strong> <span className="muted">{t('assist.settings.enabledHint')}</span>
        </span>
      </label>
      <div className="form">
        <label className="field">
          <span className="field__label">{t('assist.settings.cap')}</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            max={view.engine.maxMonthlyCapUsd}
            step={1}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={() => {
              const n = Number(cap);
              if (Number.isFinite(n) && n >= 0 && n !== s.monthlyCapUsd) void save({ monthlyCapUsd: n });
            }}
          />
          <span className="field__hint">{t('assist.settings.capHint', { max: usd(view.engine.maxMonthlyCapUsd) })}</span>
        </label>
        <label className="field">
          <span className="field__label">{t('assist.settings.retention')}</span>
          <select className="select" value={s.retentionDays} onChange={(e) => void save({ retentionDays: Number(e.target.value) })}>
            {view.retentionChoices.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t('assist.settings.retentionNone') : t('assist.settings.retentionDays', { n: d })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={s.deskFirstReply === 'note'} onChange={(e) => void save({ deskFirstReply: e.target.checked ? 'note' : 'off' })} />
        <span>
          <strong>{t('assist.settings.desk')}</strong>
          {view.deskNeedsConsent && <span className="muted"> {t('assist.settings.deskHint')}</span>}
        </span>
      </label>
    </section>
  );
}
