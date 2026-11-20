// A connection that stopped working, said in plain words in the reader's language, with the service's own
// message under it. Used by the reconnect banner, the CRM list and the connections health list so that a raw
// vendor message ("expired access/refresh token", often English) never stands on its own in another language.
import type { MessageKey } from '../../../shared/src/i18n';
import { troubleOf, type SyncErrorCode } from '../../../shared/src/sync';
import { useI18n } from '../lib/i18n';
import '../surfaces/admin.css';

/** Which sentence explains a kind of trouble. The sign-in one avoids "at the top of this page" so it reads right in lists too. */
const SENTENCE: Record<SyncErrorCode | 'other', MessageKey> = {
  rate: 'sync.errorCode.rate',
  auth: 'conn.reconnectBody',
  permission: 'sync.errorCode.permission',
  unreachable: 'sync.errorCode.unreachable',
  other: 'sync.errorCode.other',
};

/**
 * The plain explanation of `message` (one of the four kinds, or a neutral "it reported a problem") and, under it,
 * the vendor's text exactly as it came, marked as theirs. `code` wins over guessing from the text when the server
 * already classified the failure.
 */
export function ConnectionTrouble({ app, message, code }: { app: string; message: string | null | undefined; code?: SyncErrorCode | null }) {
  const { t } = useI18n();
  const kind = code ?? troubleOf(message) ?? 'other';
  return (
    <span className="conn-trouble" data-kind={kind}>
      <span className="conn-trouble__plain">{t(SENTENCE[kind], { app })}</span>
      {message && (
        <span className="conn-trouble__vendor">
          {app}: <bdi>{message}</bdi>
        </span>
      )}
    </span>
  );
}
