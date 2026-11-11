import type { MessageKey, Vars } from '../../../shared/src/i18n';

export type ErrorCode =
  | 'unauthenticated'
  | 'session_evicted'
  | 'forbidden'
  | 'read_only_seat'
  | 'not_found'
  | 'org_not_found'
  | 'validation'
  | 'invalid_token'
  | 'too_many_requests'
  | 'conflict'
  | 'device_mismatch'
  | 'bad_status'
  | 'bad_assignee'
  | 'email_taken'
  | 'role_in_use'
  | 'last_admin'
  | 'file_too_large'
  | 'oauth_failed'
  | 'oauth_not_configured'
  | 'no_account'
  | 'slug_taken'
  | 'domain_public'
  | 'join_closed'
  | 'already_member'
  | 'not_configured'
  | 'connection_failed'
  | 'import_too_large'
  | 'server';

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  session_evicted: 401,
  device_mismatch: 401,
  forbidden: 403,
  read_only_seat: 403,
  not_found: 404,
  org_not_found: 404,
  validation: 400,
  invalid_token: 400,
  bad_status: 400,
  bad_assignee: 400,
  file_too_large: 413,
  too_many_requests: 429,
  conflict: 409,
  email_taken: 409,
  role_in_use: 409,
  last_admin: 409,
  oauth_failed: 400,
  oauth_not_configured: 400,
  no_account: 404,
  slug_taken: 409,
  domain_public: 400,
  join_closed: 403,
  already_member: 409,
  not_configured: 400,
  connection_failed: 400,
  import_too_large: 413,
  server: 500,
};

export class HttpError extends Error {
  status: number;
  constructor(
    public code: ErrorCode,
    public vars: Vars = {},
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.status = STATUS[code];
  }
  get key(): MessageKey {
    return `errors.${this.code}` as MessageKey;
  }
}

export const fail = (code: ErrorCode, vars?: Vars, extra?: Record<string, unknown>): never => {
  throw new HttpError(code, vars, extra);
};
