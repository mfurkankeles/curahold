// Starting points a company picks at sign-up. Everything a template creates
// (vocabulary, account fields, boards, automations) is ordinary settings
// afterwards — nothing here is special-cased anywhere else.
import type { AutomationPreset } from './automation';
import { translate, type Locale, type Terms } from './i18n';
import type { AccountField, Column, Localized } from './model';

export const TEMPLATE_KEYS = ['customer_success', 'account_management', 'sales', 'support', 'marketing', 'hr', 'it', 'finance', 'legal', 'product', 'blank'] as const;
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
    { key: 'good', label: L('Healthy', 'İyi'), color: 'leaf' },
    { key: 'watch', label: L('Watch', 'İzlenmeli'), color: 'honey' },
    { key: 'risk', label: L('At risk', 'Riskli'), color: 'coral' },
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

// ---------------------------------------------------------------- product / project management
//
// The stages of a product team's board. They are ordinary board columns — a
// company can rename, add or remove them — and the Product template below seeds
// a delivery board with them. Defined here (above TEMPLATES) so the template can
// reuse the one stage list rather than repeat it.

/** The stages of a product team's board, in order. Only "done" counts as finished. */
export const PM_STAGE_KEYS = ['backlog', 'ready', 'in_progress', 'code_review', 'qa', 'uat', 'done', 'blocked', 'rejected'] as const;
export type PmStageKey = (typeof PM_STAGE_KEYS)[number];

/** The stage names in both shipped languages — mirrors the pm.stage.* dictionary so a static template board can carry them. */
const PM_STAGE_L: Record<PmStageKey, Localized> = {
  backlog: L('Backlog', 'Backlog'),
  ready: L('Ready', 'Hazır'),
  in_progress: L('In progress', 'Devam ediyor'),
  code_review: L('Code review', 'Kod incelemesi'),
  qa: L('QA', 'QA'),
  uat: L('UAT', 'UAT'),
  done: L('Done', 'Tamamlandı'),
  blocked: L('Blocked', 'Engelli'),
  rejected: L('Rejected', 'Reddedildi'),
};

/** The PM workflow as template-board columns (localized, for TEMPLATES). */
const pmTemplateColumns = (): TemplateBoard['columns'] => PM_STAGE_KEYS.map((key) => ({ key, name: PM_STAGE_L[key], done: key === 'done' }));

/** The PM workflow as board columns, named in the given language (for creating/adding a board at runtime). Only "done" counts as finished. */
export function pmColumns(locale: Locale): Column[] {
  return PM_STAGE_KEYS.map((key) => ({ key, name: translate(locale, `pm.stage.${key}`), done: key === 'done' }));
}

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
  marketing: {
    key: 'marketing',
    name: L('Marketing campaigns', 'Pazarlama kampanyaları'),
    description: L('Plan, produce and ship campaigns and content, from brief to live.', "Brief'ten yayına kampanya ve içerikleri planlayın, üretin ve yayınlayın."),
    terms: { account: { en: { one: 'Audience', other: 'Audiences' }, tr: { one: 'Hedef kitle', other: 'Hedef kitleler' } } },
    accountFields: [website],
    teams: [L('Marketing', 'Pazarlama')],
    boards: [
      {
        key: 'campaigns',
        name: L('Campaigns', 'Kampanyalar'),
        columns: [
          { key: 'idea', name: L('Idea', 'Fikir'), done: false },
          { key: 'planned', name: L('Planned', 'Planlandı'), done: false },
          { key: 'production', name: L('In production', 'Üretimde'), done: false },
          { key: 'live', name: L('Live', 'Yayında'), done: false },
          { key: 'wrapped', name: L('Wrapped up', 'Tamamlandı'), done: true },
        ],
      },
      {
        key: 'content',
        name: L('Content calendar', 'İçerik takvimi'),
        columns: [
          { key: 'todo', name: L('To write', 'Yazılacak'), done: false },
          { key: 'writing', name: L('Writing', 'Yazılıyor'), done: false },
          { key: 'review', name: L('In review', 'İncelemede'), done: false },
          { key: 'published', name: L('Published', 'Yayınlandı'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
  },
  hr: {
    key: 'hr',
    name: L('HR & recruiting', 'İK ve işe alım'),
    description: L('Run hiring pipelines and people operations in one place.', 'İşe alım hunilerini ve İK operasyonlarını tek yerde yürütün.'),
    terms: { account: { en: { one: 'Candidate', other: 'Candidates' }, tr: { one: 'Aday', other: 'Adaylar' } } },
    accountFields: [],
    teams: [L('People', 'İnsan Kaynakları')],
    boards: [
      {
        key: 'hiring',
        name: L('Hiring pipeline', 'İşe alım hunisi'),
        columns: [
          { key: 'applied', name: L('Applied', 'Başvurdu'), done: false },
          { key: 'screening', name: L('Screening', 'Ön eleme'), done: false },
          { key: 'interview', name: L('Interviewing', 'Mülakat'), done: false },
          { key: 'offer', name: L('Offer', 'Teklif'), done: false },
          { key: 'hired', name: L('Hired', 'İşe alındı'), done: true },
          { key: 'declined', name: L('Not moving forward', 'Devam edilmedi'), done: true },
        ],
      },
      { key: 'people_ops', name: L('People operations', 'İK operasyonları'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [overdueNotify],
  },
  it: {
    key: 'it',
    name: L('IT helpdesk', 'BT yardım masası'),
    description: L('Take in support requests and changes, triage them and see them through.', 'Destek taleplerini ve değişiklikleri alın, önceliklendirin ve sonuçlandırın.'),
    terms: { account: { en: { one: 'Requester', other: 'Requesters' }, tr: { one: 'Talep eden', other: 'Talep edenler' } } },
    accountFields: [],
    teams: [L('IT', 'BT')],
    boards: [
      {
        key: 'helpdesk',
        name: L('Helpdesk', 'Yardım masası'),
        columns: [
          { key: 'new', name: L('New', 'Yeni'), done: false },
          { key: 'triage', name: L('Triage', 'Değerlendirme'), done: false },
          { key: 'doing', name: L('In progress', 'Devam ediyor'), done: false },
          COLS.waiting,
          { key: 'resolved', name: L('Resolved', 'Çözüldü'), done: true },
        ],
      },
      {
        key: 'changes',
        name: L('Change requests', 'Değişiklik talepleri'),
        columns: [
          { key: 'requested', name: L('Requested', 'Talep edildi'), done: false },
          { key: 'approved', name: L('Approved', 'Onaylandı'), done: false },
          { key: 'scheduled', name: L('Scheduled', 'Planlandı'), done: false },
          { key: 'done', name: L('Done', 'Tamamlandı'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
  },
  finance: {
    key: 'finance',
    name: L('Finance & approvals', 'Finans ve onaylar'),
    description: L('Route approvals and run the recurring finance close.', 'Onayları yönlendirin ve tekrarlayan finans kapanışını yürütün.'),
    terms: {},
    accountFields: [],
    teams: [L('Finance', 'Finans')],
    boards: [
      {
        key: 'approvals',
        name: L('Approvals', 'Onaylar'),
        columns: [
          { key: 'requested', name: L('Requested', 'Talep edildi'), done: false },
          { key: 'review', name: L('Under review', 'İncelemede'), done: false },
          { key: 'approved', name: L('Approved', 'Onaylandı'), done: false },
          { key: 'paid', name: L('Paid', 'Ödendi'), done: true },
          { key: 'rejected', name: L('Rejected', 'Reddedildi'), done: true },
        ],
      },
      {
        key: 'close',
        name: L('Month-end close', 'Ay sonu kapanışı'),
        columns: [COLS.todo, COLS.doing, { key: 'review', name: L('In review', 'İncelemede'), done: false }, COLS.done],
      },
    ],
    automations: [overdueNotify],
  },
  legal: {
    key: 'legal',
    name: L('Legal & contracts', 'Hukuk ve sözleşmeler'),
    description: L('Intake, draft, review and sign contracts and legal requests.', 'Sözleşme ve hukuki talepleri alın, hazırlayın, inceleyin ve imzalayın.'),
    terms: {},
    accountFields: [],
    teams: [L('Legal', 'Hukuk')],
    boards: [
      {
        key: 'contracts',
        name: L('Contracts', 'Sözleşmeler'),
        columns: [
          { key: 'intake', name: L('Intake', 'Talep alındı'), done: false },
          { key: 'drafting', name: L('Drafting', 'Hazırlanıyor'), done: false },
          { key: 'review', name: L('In review', 'İncelemede'), done: false },
          { key: 'negotiation', name: L('Negotiation', 'Müzakere'), done: false },
          { key: 'signed', name: L('Signed', 'İmzalandı'), done: true },
        ],
      },
      { key: 'requests', name: L('Legal requests', 'Hukuki talepler'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [overdueNotify],
  },
  product: {
    key: 'product',
    name: L('Product & engineering', 'Ürün ve mühendislik'),
    description: L(
      'Ship product with the full delivery workflow — backlog to done — alongside a discovery board.',
      "Ürünü tam teslim akışıyla geliştirin — backlog'tan tamamlanana — ve yanında bir keşif panosu.",
    ),
    terms: {},
    accountFields: [],
    teams: [L('Product', 'Ürün'), L('Engineering', 'Mühendislik')],
    boards: [
      { key: 'delivery', name: L('Delivery', 'Teslim'), columns: pmTemplateColumns() },
      {
        key: 'discovery',
        name: L('Discovery', 'Keşif'),
        columns: [
          { key: 'idea', name: L('Idea', 'Fikir'), done: false },
          { key: 'research', name: L('Research', 'Araştırma'), done: false },
          { key: 'shaping', name: L('Shaping', 'Şekillendirme'), done: false },
          { key: 'ready', name: L('Ready to build', 'Geliştirmeye hazır'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
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
