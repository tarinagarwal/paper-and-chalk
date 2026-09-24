export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Magic-link sign-in email: plain text plus a small, table-based HTML version. */
export function magicLinkEmail({
  url,
  expiresInMinutes,
}: {
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  const subject = "Your Paper & Chalk sign-in link";
  const text = [
    "Sign in to Paper & Chalk",
    "",
    "Open this link to sign in:",
    url,
    "",
    `The link works once and expires in ${expiresInMinutes} minutes.`,
    "If you didn't ask for it, you can ignore this email.",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f0e8;font-family:Georgia,serif;color:#1c1b19">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffdf8;border:1px solid #e3ddd1;border-radius:14px">
          <tr><td style="padding:36px 36px 8px">
            <p style="margin:0;font-size:22px">Paper <span style="color:#c43e18;font-style:italic">&amp;</span> Chalk</p>
          </td></tr>
          <tr><td style="padding:8px 36px 0">
            <h1 style="margin:16px 0 8px;font-size:28px;font-weight:400">Sign in with one click</h1>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#46423b">
              This link works once and expires in ${String(expiresInMinutes)} minutes.
            </p>
          </td></tr>
          <tr><td style="padding:28px 36px">
            <a href="${safeUrl}" style="display:inline-block;background:#c43e18;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;padding:13px 22px;border-radius:10px">Sign in to Paper &amp; Chalk</a>
          </td></tr>
          <tr><td style="padding:0 36px 32px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b665e">
            Button not working? Paste this into your browser:<br />
            <span style="word-break:break-all;color:#46423b">${safeUrl}</span><br /><br />
            If you didn&#39;t ask for this email, you can ignore it.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
