// A random id per browser, kept in localStorage. Sessions are bound to it,
// so a copied cookie does not work on another machine.
const KEY = 'tw_device';
const NO_STORAGE = 'no-storage-device-0000';
// Set once storage turns out to be unusable, so every call in this page gives the same answer.
let pinned: string | null = null;

export function getDeviceId(): string {
  if (pinned) return pinned;
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const buf = new Uint8Array(18);
      crypto.getRandomValues(buf);
      id = btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(KEY, id);
      // Some embedded browsers accept a value and do not keep it. A new id on every
      // request would end the session at once, so they share the no-storage id.
      if (localStorage.getItem(KEY) !== id) return (pinned = NO_STORAGE);
    }
    return id;
  } catch {
    return (pinned = NO_STORAGE);
  }
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser}, ${os}` : browser;
}
