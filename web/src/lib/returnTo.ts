// Signing in on the way to the consent screen comes back to it, even from
// the email link opened in another tab.
const RETURN = 'app-after-login';
export function rememberReturn(to: string) {
  try {
    localStorage.setItem(RETURN, JSON.stringify({ to, exp: Date.now() + 20 * 60_000 }));
  } catch {
    /* no storage: the person starts again from the app */
  }
}
export function takeReturn(): string | null {
  try {
    const raw = localStorage.getItem(RETURN);
    localStorage.removeItem(RETURN);
    const v = raw ? (JSON.parse(raw) as { to: string; exp: number }) : null;
    return v && v.exp > Date.now() && v.to.startsWith('/connect-ai?') ? v.to : null;
  } catch {
    return null;
  }
}
