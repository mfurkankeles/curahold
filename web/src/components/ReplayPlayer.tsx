// Playing one of a person's recordings on the support desk. Loaded only when
// the team actually watches one, so rrweb's player (a heavy thing) stays out
// of the desk until then. It fetches the recording's events, ungzips them and
// hands them to the player; the fetch itself writes the playback to the desk's
// log, server-side.
import { gunzipSync, strFromU8 } from 'fflate';
import { useEffect, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';
import type { ReplayMeta } from '../../../shared/src/replay';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';

/** base64url → bytes. */
function fromBase64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export default function ReplayPlayer({ reference, replay, onClose }: { reference: string; replay: ReplayMeta; onClose: () => void }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    // rrweb-player is a Svelte component; $destroy tears it down (typed loosely across Svelte versions).
    let player: { $destroy?: () => void } | null = null;
    (async () => {
      let events: unknown[];
      try {
        const res = await fetch(`/api/desk/requests/${reference}/replays/${replay.id}`, { headers: { 'x-curahold-desk': '1' } });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { chunks: string[] };
        events = data.chunks.flatMap((b) => JSON.parse(strFromU8(gunzipSync(fromBase64url(b)))) as unknown[]);
      } catch {
        if (live) setError(true);
        return;
      }
      if (!live || !host.current || events.length < 2) {
        if (live && events.length < 2) setError(true);
        return;
      }
      const width = Math.min(host.current.clientWidth || 960, 1280);
      try {
        player = new rrwebPlayer({
          target: host.current,
          props: { events: events as any, width, height: Math.round((width * 9) / 16), autoPlay: true, showController: true, mouseTail: false },
        }) as unknown as { $destroy?: () => void };
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
      try {
        player?.$destroy?.();
      } catch {
        /* already gone */
      }
    };
  }, [reference, replay.id]);

  return (
    <div className="replaymodal" role="dialog" aria-modal="true" aria-label={t('desk.replay.watch')} onClick={onClose}>
      <div className="replaymodal__box" onClick={(e) => e.stopPropagation()}>
        <header className="replaymodal__head">
          <strong>{t('desk.replay.watch')}</strong>
          <button className="btn btn--quiet btn--small" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.close')}
          </button>
        </header>
        {error ? <p className="center-note muted">{t('desk.replay.failed')}</p> : <div className="replaymodal__player" ref={host} />}
      </div>
    </div>
  );
}
