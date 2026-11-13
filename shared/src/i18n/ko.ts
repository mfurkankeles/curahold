import type { MessageKey } from './en';

// Korean (한국어). Filled market surface by market surface; every key not yet
// here falls back to English. First pass: the sales site's plan strings.
export const ko: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': '팀',
  'billing.plan.business': '비즈니스',
  'billing.point.boards': '보드, 작업, 체크리스트, 자동화',
  'billing.point.customers': '고객, 연락처, 영업 기회, 나만의 레코드',
  'billing.point.meetings': '미팅, 타임라인, 헬스 스코어, 비즈니스 리뷰',
  'billing.point.reports': '리포트, 대시보드, 목표',
  'billing.point.chat': 'Slack, Teams, Google Chat, 이메일 알림',
  'billing.point.crm': 'CRM 또는 스프레드시트와 양방향 동기화 (Salesforce, HubSpot 등)',
  'billing.point.portal': '고객사 담당자를 위한 고객 포털',
  'billing.point.playbooks': '플레이북, 그리고 자동으로 시작되는 갱신',
};
