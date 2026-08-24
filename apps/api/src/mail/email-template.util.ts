/**
 * `NotificationsService.createNotificationFromTemplate` renderuje szablony (`bodyTemplate`)
 * jako CZYSTY TEKST (podstawienie `{{zmienna}}`, patrz `renderTemplate` w tym serwisie) —
 * dotąd ten tekst szedł do skrzynki klienta bez żadnego opakowania: bez nagłówka, stopki,
 * nazwy firmy czy nawet klikalnych linków (surowy `http://...` w treści, którego część
 * klientów pocztowych nie zamienia automatycznie w link). Ta funkcja jest jedynym miejscem,
 * które opakowuje TEN SAM tekst w minimalny, profesjonalnie wyglądający układ HTML —
 * wywoływana raz, centralnie, w `MailService.send()`, więc obejmuje WSZYSTKIE 9 szablonów
 * bez zmiany ich treści w `seed.ts`/Ustawieniach.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function linkify(escapedText: string): string {
  return escapedText.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#2563eb;text-decoration:underline;">${url}</a>`,
  );
}

export interface EmailBrandingInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function wrapEmailHtml(branding: EmailBrandingInfo, bodyText: string): string {
  const paragraphsHtml = bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;white-space:pre-line;">${linkify(escapeHtml(p))}</p>`)
    .join('');

  const footerLines = [
    branding.address,
    [branding.phone, branding.email].filter(Boolean).join(' · '),
  ]
    .filter((line): line is string => !!line && line.trim().length > 0)
    .map((line) => escapeHtml(line));

  return `<!DOCTYPE html>
<html lang="pl">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;max-width:560px;">
            <tr>
              <td style="background:#111827;padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(branding.name)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#1f2937;font-size:14px;line-height:1.6;">
                ${paragraphsHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                <strong style="color:#374151;">${escapeHtml(branding.name)}</strong>
                ${footerLines.length ? '<br/>' + footerLines.join('<br/>') : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
