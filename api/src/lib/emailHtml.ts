// A plain, light HTML version of the emails people act on (invitations,
// sign-in links), carrying the company's logo. The text version is always
// sent too, for clients that show text only.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function emailHtml(o: { org: string; logo: string | null; text: string; link: string; cta: string }): string {
  const paragraphs = o.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && p !== o.link)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.5">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const head = o.logo
    ? `<img src="${esc(o.logo)}" alt="${esc(o.org)}" style="max-height:40px;max-width:180px;display:block">`
    : `<strong style="font-size:17px;color:#0d4448">${esc(o.org)}</strong>`;
  return `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18282b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d8dfdd;border-radius:10px">
<tr><td style="padding:22px 26px;border-bottom:1px solid #e9eeec">${head}</td></tr>
<tr><td style="padding:24px 26px 8px;font-size:15px">${paragraphs}
<p style="margin:8px 0 22px"><a href="${esc(o.link)}" style="display:inline-block;background:#12786b;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:6px;font-weight:600">${esc(o.cta)}</a></p>
<p style="margin:0 0 18px;font-size:12px;color:#74878a;word-break:break-all">${esc(o.link)}</p></td></tr>
</table><p style="font-size:12px;color:#74878a;margin:14px 0 0">Tendwell</p></td></tr></table></body></html>`;
}
