// src/auth/recipes.ts

export interface LoginStepField {
  selector: string;
  label: string;
  type: 'text' | 'password';
}

export interface LoginStep {
  fields: LoginStepField[];
  submitSelector?: string;
  postSubmitWait?: number;
}

export interface LoginRecipe {
  domain: string;
  loginUrl: string;
  steps: LoginStep[];
}

export const RECIPES: LoginRecipe[] = [
  {
    domain: 'www.linkedin.com',
    loginUrl: 'https://www.linkedin.com/login',
    steps: [
      {
        fields: [
          // LinkedIn redesigned login (2025+): React-generated IDs, no name attrs.
          // First non-webauthn text input is email. Password has autocomplete="current-password".
          // Keep legacy selectors (#username, session_key) as fallbacks for older layouts.
          { selector: '#username, input[name="session_key"], input[type="text"]:not([autocomplete="webauthn"])', label: 'Email', type: 'text' },
          { selector: '#password, input[name="session_password"], input[autocomplete="current-password"]', label: 'Password', type: 'password' },
        ],
        // No submitSelector — press Enter after filling password.
        // LinkedIn's submit button uses unstable hashed classes and div[role="button"],
        // but Enter key works reliably across all login page versions.
      },
    ],
  },
  {
    domain: 'accounts.google.com',
    loginUrl: 'https://accounts.google.com/signin',
    steps: [
      {
        fields: [{ selector: 'input[type="email"]', label: 'Email', type: 'text' }],
        submitSelector: '#identifierNext button',
        postSubmitWait: 3000,
      },
      {
        fields: [{ selector: 'input[type="password"]', label: 'Password', type: 'password' }],
        submitSelector: '#passwordNext button',
      },
    ],
  },
];

export function getRecipe(url: string): LoginRecipe | null {
  try {
    const domain = new URL(url).hostname;
    return RECIPES.find((r) => r.domain === domain) ?? null;
  } catch {
    return null;
  }
}
