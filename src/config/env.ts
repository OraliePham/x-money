import 'dotenv/config';

type Env = {
  baseUrl: string;
  isCi: boolean;
  testUserEmail?: string;
  testUserPassword?: string;
};

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requiredUrl(name: string, fallback: string): string {
  const value = optionalEnv(name) ?? fallback;

  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid URL. Current value: ${value}`);
  }
}

function loadEnv(): Env {
  const testUserEmail = optionalEnv('TEST_USER_EMAIL');
  const testUserPassword = optionalEnv('TEST_USER_PASSWORD');

  return {
    baseUrl: requiredUrl('BASE_URL', 'https://demo.playwright.dev/todomvc'),
    isCi: Boolean(process.env.CI),
    ...(testUserEmail === undefined ? {} : { testUserEmail }),
    ...(testUserPassword === undefined ? {} : { testUserPassword }),
  };
}

export const env = loadEnv();
