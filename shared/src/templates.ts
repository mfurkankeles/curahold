// Starting points a company picks at sign-up. Everything a template creates
// (vocabulary, account fields, boards, automations) is ordinary settings
// afterwards — nothing here is special-cased anywhere else.
import type { AutomationPreset } from './automation';
import type { Locale, Terms } from './i18n';
import type { AccountField, Localized } from './model';

export const TEMPLATE_KEYS = ['customer_success', 'account_management', 'sales', 'support', 'blank'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateBoard {
  key: string;
  name: Localized;
  columns: { key: string; name: Localized; done: boolean }[];
}

export interface Template {
  key: TemplateKey;
  name: Localized;
  description: Localized;
  terms: Terms;
  accountFields: AccountField[];
  teams: Localized[];
  boards: TemplateBoard[];
  automations: AutomationPreset[];
}

const L = (en: string, tr: string): Localized => ({ en, tr });
export const pick = (l: Localized | string | undefined, locale: Locale): string =>
  typeof l === 'string' ? l : (l?.[locale] ?? l?.en ?? l?.tr ?? '');

const COLS = {
  todo: { key: 'todo', name: L('To do', 'Yapılacak'), done: false },
  doing: { key: 'doing', name: L('In progress', 'Devam ediyor'), done: false },
  waiting: { key: 'waiting', name: L('Waiting on customer', 'Müşteride bekliyor'), done: false },
  done: { key: 'done', name: L('Done', 'Tamamlandı'), done: true },
};

const renewal: AccountField = { key: 'renewal_date', label: L('Renewal date', 'Yenileme tarihi'), type: 'date' };
const arr: AccountField = { key: 'arr', label: L('Annual value', 'Yıllık tutar'), type: 'money' };
const health: AccountField = {
  key: 'health',
  label: L('Health', 'Sağlık'),
  type: 'select',
  options: [
    { key: 'good', label: L('Healthy', 'İyi') },
    { key: 'watch', label: L('Watch', 'İzlenmeli') },
    { key: 'risk', label: L('At risk', 'Riskli') },
  ],
};
const tier: AccountField = {
  key: 'tier',
  label: L('Tier', 'Segment'),
  type: 'select',
  options: [
    { key: 'enterprise', label: L('Enterprise', 'Kurumsal') },
    { key: 'mid', label: L('Mid-market', 'Orta ölçek') },
    { key: 'smb', label: L('Small business', 'KOBİ') },
  ],
};
const website: AccountField = { key: 'website', label: L('Website', 'Web sitesi'), type: 'url' };

const overdueNotify: AutomationPreset = {
  key: 'overdue_notify',
  name: L('Tell the team lead about overdue tasks', 'Geciken görevi ekip liderine bildir'),
  trigger: { type: 'task_overdue', days: 2 },
  action: {
    type: 'notify',
    to: ['assignees', 'team_lead'],
    message: L('This task is 2 days overdue.', 'Bu görev 2 gündür gecikmede.'),
  },
};

export const TEMPLATES: Record<TemplateKey, Template> = {
  customer_success: {
    key: 'customer_success',
    name: L('Customer success', 'Müşteri başarısı'),
    description: L(
      'Onboarding, health checks and renewals for the customers your team looks after.',
      'Ekibinizin baktığı müşteriler için onboarding, sağlık takibi ve yenilemeler.',
    ),
    terms: { account: { en: { one: 'Customer', other: 'Customers' }, tr: { one: 'Müşteri', other: 'Müşteriler' } } },
    accountFields: [renewal, arr, health, tier, website],
    teams: [L('Customer Success', 'Müşteri Başarısı')],
    boards: [
      { key: 'main', name: L('Customer work', 'Müşteri işleri'), columns: [COLS.todo, COLS.doing, COLS.waiting, COLS.done] },
      { key: 'onboarding', name: L('Onboarding', 'Onboarding'), columns: [COLS.todo, COLS.doing, COLS.done] },
      { key: 'renewals', name: L('Renewals', 'Yenilemeler'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'renewal_plan',
        name: L('Plan the renewal 90 days ahead', 'Yenilemeden 90 gün önce plan aç'),
        trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 90 },
        action: {
          type: 'create_tasks',
          board: 'renewals',
          tasks: [
            {
              title: L('Renewal plan: {account_name}', 'Yenileme planı: {account_name}'),
              dueInDays: 7,
              assignee: 'account_owner',
              subtasks: [
                L('Review usage and value delivered', 'Kullanımı ve sağlanan değeri gözden geçir'),
                L('Note risks and open issues', 'Riskleri ve açık konuları not al'),
                L('Book a call with the decision maker', 'Karar vericiyle görüşme ayarla'),
              ],
            },
          ],
        },
      },
      {
        key: 'onboarding',
        name: L('Start onboarding for a new customer', 'Yeni müşteri için onboarding başlat'),
        trigger: { type: 'account_created' },
        action: {
          type: 'create_tasks',
          board: 'onboarding',
          tasks: [
            { title: L('Welcome call: {account_name}', 'Hoş geldin görüşmesi: {account_name}'), dueInDays: 3, assignee: 'account_owner' },
            { title: L('Finish setup: {account_name}', 'Kurulumu tamamla: {account_name}'), dueInDays: 14, assignee: 'account_owner' },
            { title: L('First value check: {account_name}', 'İlk değer kontrolü: {account_name}'), dueInDays: 30, assignee: 'account_owner' },
          ],
        },
      },
      {
        key: 'no_contact',
        name: L('Reach out after 30 quiet days', '30 gün temas yoksa görev aç'),
        trigger: { type: 'account_inactive', days: 30 },
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [{ title: L('Check in with {account_name}', '{account_name} ile temas kur'), dueInDays: 2, assignee: 'account_owner' }],
        },
      },
      overdueNotify,
    ],
  },
  account_management: {
    key: 'account_management',
    name: L('Account management', 'Hesap yönetimi'),
    description: L(
      'Business reviews, growth opportunities and renewals for key accounts.',
      'Önemli hesaplar için iş değerlendirmeleri, büyüme fırsatları ve yenilemeler.',
    ),
    terms: { account: { en: { one: 'Account', other: 'Accounts' }, tr: { one: 'Hesap', other: 'Hesaplar' } } },
    accountFields: [renewal, arr, tier, health, website],
    teams: [L('Account Management', 'Hesap Yönetimi')],
    boards: [
      { key: 'main', name: L('Account work', 'Hesap işleri'), columns: [COLS.todo, COLS.doing, COLS.waiting, COLS.done] },
      {
        key: 'growth',
        name: L('Growth', 'Büyüme'),
        columns: [
          { key: 'idea', name: L('Idea', 'Fikir'), done: false },
          { key: 'proposal', name: L('Proposal', 'Teklif'), done: false },
          { key: 'won', name: L('Won', 'Kazanıldı'), done: true },
          { key: 'lost', name: L('Lost', 'Kaybedildi'), done: true },
        ],
      },
      { key: 'renewals', name: L('Renewals', 'Yenilemeler'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'renewal_plan',
        name: L('Plan the renewal 120 days ahead', 'Yenilemeden 120 gün önce plan aç'),
        trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 120 },
        action: {
          type: 'create_tasks',
          board: 'renewals',
          tasks: [{ title: L('Renewal plan: {account_name}', 'Yenileme planı: {account_name}'), dueInDays: 7, assignee: 'account_owner' }],
        },
      },
      {
        key: 'qbr',
        name: L('Business review every quarter', 'Her çeyrek iş değerlendirmesi'),
        trigger: { type: 'account_every', days: 90 },
        conditions: [{ field: 'tier', op: 'eq', value: 'enterprise' }],
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [
            {
              title: L('Quarterly review: {account_name}', 'Çeyrek değerlendirmesi: {account_name}'),
              dueInDays: 14,
              assignee: 'account_owner',
              subtasks: [L('Write the agenda', 'Gündemi yaz'), L('Pull usage numbers', 'Kullanım rakamlarını çek'), L('Send the deck', 'Sunumu gönder')],
            },
          ],
        },
      },
      overdueNotify,
    ],
  },
  sales: {
    key: 'sales',
    name: L('Sales', 'Satış'),
    description: L('Deals from first call to signature, with hand-over to the customer team.', 'İlk görüşmeden imzaya fırsatlar ve müşteri ekibine devir.'),
    terms: { account: { en: { one: 'Company', other: 'Companies' }, tr: { one: 'Firma', other: 'Firmalar' } } },
    accountFields: [
      { key: 'industry', label: L('Industry', 'Sektör'), type: 'text' },
      { key: 'deal_value', label: L('Deal value', 'Fırsat tutarı'), type: 'money' },
      { key: 'close_date', label: L('Expected close', 'Beklenen kapanış'), type: 'date' },
      website,
    ],
    teams: [L('Sales', 'Satış')],
    boards: [
      {
        key: 'pipeline',
        name: L('Pipeline', 'Satış hunisi'),
        columns: [
          { key: 'new', name: L('New', 'Yeni'), done: false },
          { key: 'meeting', name: L('Meeting', 'Görüşme'), done: false },
          { key: 'proposal', name: L('Proposal', 'Teklif'), done: false },
          { key: 'won', name: L('Won', 'Kazanıldı'), done: true },
          { key: 'lost', name: L('Lost', 'Kaybedildi'), done: true },
        ],
      },
      { key: 'main', name: L('Follow-ups', 'Takipler'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'won_handover',
        name: L('Hand over won deals', 'Kazanılan fırsatı devret'),
        trigger: { type: 'task_moved', boardId: 'pipeline', column: 'won' },
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [{ title: L('Hand-over meeting: {account_name}', 'Devir toplantısı: {account_name}'), dueInDays: 5, assignee: 'assignees' }],
        },
      },
      {
        key: 'close_date',
        name: L('Check deals a week before expected close', 'Kapanıştan 7 gün önce kontrol et'),
        trigger: { type: 'account_date', field: 'close_date', daysBefore: 7 },
        action: {
          type: 'notify',
          to: ['account_owner'],
          message: L('Expected close is in a week — is the proposal on track?', 'Beklenen kapanışa bir hafta var — teklif yolunda mı?'),
        },
      },
      overdueNotify,
    ],
  },
  support: {
    key: 'support',
    name: L('Support escalations', 'Destek eskalasyonları'),
    description: L('Escalated customer issues with clear owners and follow-up.', 'Eskale edilen müşteri sorunları, net sorumlu ve takip ile.'),
    terms: { account: { en: { one: 'Customer', other: 'Customers' }, tr: { one: 'Müşteri', other: 'Müşteriler' } } },
    accountFields: [
      tier,
      {
        key: 'plan',
        label: L('Support plan', 'Destek paketi'),
        type: 'select',
        options: [
          { key: 'standard', label: L('Standard', 'Standart') },
          { key: 'premium', label: L('Premium', 'Premium') },
        ],
      },
    ],
    teams: [L('Support', 'Destek')],
    boards: [
      {
        key: 'main',
        name: L('Escalations', 'Eskalasyonlar'),
        columns: [
          { key: 'new', name: L('New', 'Yeni'), done: false },
          { key: 'doing', name: L('Investigating', 'İnceleniyor'), done: false },
          COLS.waiting,
          { key: 'solved', name: L('Solved', 'Çözüldü'), done: true },
        ],
      },
    ],
    automations: [
      {
        key: 'overdue_notify',
        name: L('Tell the team lead about overdue escalations', 'Geciken eskalasyonu ekip liderine bildir'),
        trigger: { type: 'task_overdue', days: 1 },
        action: { type: 'notify', to: ['assignees', 'team_lead'], message: L('This escalation is overdue.', 'Bu eskalasyon gecikmede.') },
      },
    ],
  },
  blank: {
    key: 'blank',
    name: L('Start empty', 'Boş başla'),
    description: L('One board and no rules — set everything up yourself.', 'Tek pano, kural yok — her şeyi kendiniz kurun.'),
    terms: {},
    accountFields: [],
    teams: [],
    boards: [{ key: 'main', name: L('Tasks', 'Görevler'), columns: [COLS.todo, COLS.doing, COLS.done] }],
    automations: [],
  },
};

export const isTemplateKey = (k: unknown): k is TemplateKey => typeof k === 'string' && (TEMPLATE_KEYS as readonly string[]).includes(k);
