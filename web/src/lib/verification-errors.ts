const verificationErrorMessages = {
  token_expired: "This verification link has expired. Request a new one from sign in.",
  invalid_token: "This verification link is invalid.",
  user_not_found: "No account found for this email.",
};

export function getVerificationErrorMessage(code: string): string {
  switch (code) {
    case "token_expired":
    case "invalid_token":
    case "user_not_found":
      return verificationErrorMessages[code];
    default:
      return "Something went wrong verifying your email.";
  }
}
