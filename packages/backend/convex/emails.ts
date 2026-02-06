export function verificationEmailHtml(url: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Verify your email</h2>
      <p>Click the button below to verify your email address.</p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 6px;">
        Verify email
      </a>
      <p style="margin-top: 16px; font-size: 14px; color: #71717a;">
        If you didn't create an account, you can ignore this email.
      </p>
    </div>
  `;
}

export function resetPasswordEmailHtml(url: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 6px;">
        Reset password
      </a>
      <p style="margin-top: 16px; font-size: 14px; color: #71717a;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;
}
