type AppEmailArgs = {
  title: string
  intro: string
  ctaLabel: string
  ctaUrl: string
  footer: string
  detailRows?: Array<{ label: string; value: string }>
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function appEmailHtml(args: AppEmailArgs): string {
  const details = (args.detailRows ?? [])
    .map((row) => `<p style="margin:0 0 16px;color:#444444;">${escapeHtml(row.value)}</p>`)
    .join('')

  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only}body,.email{background:#ffffff!important;color:#202020!important}</style></head>
  <body style="margin:0;background:#ffffff;color:#202020;">
  <div class="email" style="max-width:540px;margin:auto;padding:32px 24px;background:#ffffff;color:#202020;font:16px/1.65 Arial,sans-serif;">
    <p style="font-size:12px;color:#777777;margin:0 0 32px;">Legally Distinct Global Domination</p>
    <h1 style="font-size:26px;line-height:1.25;margin:0 0 16px;">${escapeHtml(args.title)}</h1>
    <p style="margin:0 0 24px;">${escapeHtml(args.intro)}</p>
    ${details}
    <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;background:#202020;color:#ffffff;border-radius:5px;padding:11px 18px;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(args.ctaLabel)}</a>
    <p style="margin:32px 0 0;font-size:12px;color:#777777;">${escapeHtml(args.footer)}</p>
  </div></body></html>`
}

export function verificationEmailHtml(url: string): string {
  return appEmailHtml({
    title: 'Verify your email',
    intro: 'Click the button below to verify your email address.',
    ctaLabel: 'Verify Email',
    ctaUrl: url,
    footer: 'If you did not create an account, you can ignore this email.',
  })
}

export function resetPasswordEmailHtml(url: string): string {
  return appEmailHtml({
    title: 'Reset your password',
    intro: 'Click the button below to reset your password. This link expires in 1 hour.',
    ctaLabel: 'Reset Password',
    ctaUrl: url,
    footer: 'If you did not request this reset, you can ignore this email.',
  })
}

export function yourTurnEmailHtml(args: {
  gameName: string
  gameUrl: string
  turnDeadlineLabel: string | null
}): string {
  return appEmailHtml({
    title: `Your turn in ${args.gameName}`,
    intro: 'It is your turn to play.',
    ctaLabel: 'Open Game',
    ctaUrl: args.gameUrl,
    detailRows: args.turnDeadlineLabel
      ? [{ label: 'Turn Deadline', value: args.turnDeadlineLabel }]
      : undefined,
    footer: 'You can disable turn emails from your account settings.',
  })
}

export function eliminationEmailHtml(args: {
  gameName: string
  gameUrl: string
  eliminatedByName: string | null
}): string {
  return appEmailHtml({
    title: `Eliminated from ${args.gameName}`,
    intro: args.eliminatedByName
      ? `${args.eliminatedByName} eliminated you from the game.`
      : 'You have been eliminated from the game.',
    ctaLabel: 'View Game',
    ctaUrl: args.gameUrl,

    footer: 'You can disable elimination emails from your account settings.',
  })
}

export function turnReminderEmailHtml(args: {
  gameName: string
  gameUrl: string
  deadlineLabel: string
  title: string
}): string {
  return appEmailHtml({
    title: args.title,
    intro: `Finish your turn in ${args.gameName} by ${args.deadlineLabel}.`,
    ctaLabel: 'Finish your turn',
    ctaUrl: args.gameUrl,
    footer: 'You can disable turn emails from your account settings.',
  })
}
