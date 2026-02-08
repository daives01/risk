type AppEmailArgs = {
  title: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
  detailRows?: Array<{ label: string; value: string }>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function appEmailHtml(args: AppEmailArgs): string {
  const detailRowsHtml = (args.detailRows ?? [])
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #323844; color: #8b95a7; width: 140px; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase;">${escapeHtml(row.label)}</td>
          <td style="padding: 8px 12px; border: 1px solid #323844; color: #e4e8ee; font-size: 14px;">${escapeHtml(row.value)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="background: #0b0d10; padding: 24px 12px; color: #e4e8ee;">
      <div style="margin: 0 auto; width: 100%; max-width: 560px; border: 1px solid #323844; background: #0f1216; font-family: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;">
        <div style="padding: 14px 16px; border-bottom: 1px solid #323844;">
          <div style="font-size: 20px; letter-spacing: 0.16em; color: #f2bf62; text-transform: uppercase;">LDGD</div>
          <div style="margin-top: 2px; font-size: 11px; letter-spacing: 0.08em; color: #8b95a7; text-transform: uppercase;">Legally Distinct Global Domination</div>
        </div>

        <div style="padding: 20px 16px 16px;">
          <h2 style="margin: 0 0 12px; color: #e4e8ee; font-size: 22px; line-height: 1.25;">${escapeHtml(args.title)}</h2>
          <p style="margin: 0 0 14px; color: #e4e8ee; font-size: 14px; line-height: 1.6;">${escapeHtml(args.intro)}</p>
          ${
            detailRowsHtml
              ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; margin: 0 0 16px;">${detailRowsHtml}</table>`
              : ""
          }
          <a href="${escapeHtml(args.ctaUrl)}" style="display: inline-block; padding: 10px 16px; border: 1px solid #f2bf62; color: #f2bf62; text-decoration: none; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;">
            ${escapeHtml(args.ctaLabel)}
          </a>
          <p style="margin: 16px 0 0; color: #8b95a7; font-size: 13px; line-height: 1.5;">${escapeHtml(args.footer)}</p>
        </div>
      </div>
    </div>
  `;
}

export function verificationEmailHtml(url: string): string {
  return appEmailHtml({
    title: "Verify your email",
    intro: "Click the button below to verify your email address.",
    ctaLabel: "Verify Email",
    ctaUrl: url,
    footer: "If you did not create an account, you can ignore this email.",
  });
}

export function resetPasswordEmailHtml(url: string): string {
  return appEmailHtml({
    title: "Reset your password",
    intro: "Click the button below to reset your password. This link expires in 1 hour.",
    ctaLabel: "Reset Password",
    ctaUrl: url,
    footer: "If you did not request this reset, you can ignore this email.",
  });
}

export function yourTurnEmailHtml(args: {
  gameName: string;
  gameUrl: string;
  turnDeadlineLabel: string | null;
}): string {
  return appEmailHtml({
    title: `Your turn in ${args.gameName}`,
    intro: "It is your turn to play.",
    ctaLabel: "Open Game",
    ctaUrl: args.gameUrl,
    detailRows: args.turnDeadlineLabel
      ? [{ label: "Turn Deadline", value: args.turnDeadlineLabel }]
      : undefined,
    footer: "You can disable turn emails from your account settings.",
  });
}
