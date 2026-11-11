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
  | 'type_not_empty'
  | 'org_loop'
  | 'sync_running'
  | 'crm_error'
  | 'field_locked'
  | 'preview_read_only'
  | 'read_only_token'
  | 'bad_webhook_url'
  | 'support_ended'
  | 'support_blocked'
  | 'support_read_only'
  | 'support_not_allowed'
  | 'support_edit_admins'
  | 'support_too_many'
  | 'support_link_used'
  | 'help_too_many_files'
  | 'help_file_type'
  | 'portal_off'
  | 'portal_invite_owner'
  | 'portal_internal_email'
  | 'portal_email_taken'
  | 'portal_private_board'
  | 'portal_not_shared'
  | 'portal_method_off'
  | 'portal_bad_code'
  | 'portal_bad_password'
  | 'portal_locked'
  | 'portal_weak_password'
  | 'portal_passkey_failed'
  | 'portal_no_method'
  | 'required_fields'
  | 'link_loop'
  | 'form_off'
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
  field_locked: 403,
  preview_read_only: 403,
  read_only_token: 403,
  bad_webhook_url: 400,
  support_ended: 401,
  support_blocked: 403,
  support_read_only: 403,
  support_not_allowed: 403,
  support_edit_admins: 403,
  support_too_many: 409,
  support_link_used: 400,
  help_too_many_files: 400,
  help_file_type: 400,
  portal_off: 400,
  portal_invite_owner: 403,
  portal_internal_email: 400,
  portal_email_taken: 409,
  portal_private_board: 400,
  portal_not_shared: 400,
  portal_method_off: 400,
  portal_bad_code: 400,
  portal_bad_password: 400,
  portal_locked: 429,
  portal_weak_password: 400,
  portal_passkey_failed: 400,
  portal_no_method: 400,
  required_fields: 400,
  link_loop: 400,
  form_off: 404,
  already_member: 409,
  not_configured: 400,
  connection_failed: 400,
  import_too_large: 413,
  type_not_empty: 409,
  org_loop: 400,
  sync_running: 409,
  crm_error: 502,
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
