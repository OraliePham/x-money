# Playwright TypeScript Starter

A maintainable Playwright + TypeScript starter for browser automation and end-to-end testing.

## What is included

- Playwright Test with TypeScript.
- Page Object Model for UI flows.
- Custom fixtures for dependency injection.
- Environment-based configuration through `.env`.
- Smoke, E2E, and API example test suites.
- GitHub Actions workflow.
- Dependabot configuration for dependency updates.
- ESLint, Prettier, and TypeScript type checking.
- Trace, screenshot, video, and HTML report settings.

## Requirements

- Node.js 20+; Node 22 LTS is recommended for new projects.
- npm 10+.

## Quick start

```bash
npm install
npx playwright install --with-deps
cp .env.example .env
npm run test:chromium
```

Open the HTML report:

```bash
npm run report
```

Run with Playwright UI mode:

```bash
npm run test:ui
```

Run smoke tests only:

```bash
npm run test:smoke
```

## Project structure

```text
.
├── .github/
│   ├── dependabot.yml
│   └── workflows/e2e.yml
├── docs/
│   ├── ARCHITECTURE.md
│   └── MAINTENANCE.md
├── src/
│   ├── config/env.ts
│   ├── fixtures/test.ts
│   ├── pages/BasePage.ts
│   ├── pages/TodoPage.ts
│   └── utils/logger.ts
├── test-data/todos.ts
├── tests/
│   ├── api/health.api.spec.ts
│   ├── e2e/todo.e2e.spec.ts
│   └── smoke/todo.smoke.spec.ts
├── playwright.config.ts
├── tsconfig.json
├── eslint.config.mjs
└── package.json
```

## Design rules

1. Test files should describe business behavior, not low-level selectors.
2. Page objects own locators and page-specific actions.
3. Fixtures create reusable objects and shared setup.
4. Test data stays outside test logic.
5. Use user-facing locators first: role, label, placeholder, text.
6. Avoid `waitForTimeout`; use web-first assertions and Playwright auto-waiting.
7. Add tags such as `@smoke`, `@regression`, `@critical` for selective runs.

## Environment variables

Copy `.env.example` to `.env` and adjust values:

```env
BASE_URL=https://demo.playwright.dev/todomvc
TEST_USER_EMAIL=
TEST_USER_PASSWORD=
```

Do not commit `.env`, real cookies, access tokens, or credentials.

## Common commands

| Command                 | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `npm run test`          | Run all tests.                                |
| `npm run test:chromium` | Run only Chromium project.                    |
| `npm run test:smoke`    | Run tests tagged `@smoke`.                    |
| `npm run test:headed`   | Run visible browser.                          |
| `npm run test:debug`    | Start Playwright debugger.                    |
| `npm run test:ui`       | Open Playwright UI mode.                      |
| `npm run typecheck`     | Run TypeScript compiler checks.               |
| `npm run lint`          | Run ESLint.                                   |
| `npm run format`        | Format files with Prettier.                   |
| `npm run verify`        | Run typecheck, lint, format check, and tests. |

## Profile manager

This project also includes a local browser profile manager for persistent Chromium sessions:

```bash
npm.cmd run profile:open
npm.cmd run profile:test-stealth
```

See [Profile Manager Usage](docs/PROFILE_MANAGER_USAGE.md) for creating profiles, launching custom URLs,
running stealth checks, and using the TypeScript APIs.

## Maintenance baseline

- Keep `@playwright/test` updated regularly.
- After each Playwright upgrade, run `npx playwright install --with-deps`.
- Review release notes before major/minor upgrades.
- Keep tests independent; do not rely on execution order.
- Keep selectors close to page objects.
- Prefer stable test IDs only when user-facing locators are not reliable.
- npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --read-comments --follow-verified-users --max-comments 100 --extract-detailed-info --max-users-to-process 10 --like-current-tweet
  npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --read-comments --feed-tab following --follow yes --follow-verified-users --max-comments 3 --extract-detailed-info --max-users-to-process 1 --like-current-tweet

npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --feed-tab following --read-comments --follow yes --follow-verified
-users --max-comments 1 --extract-detailed-info --max-users-to-process 1 --reply-text auto --auto-reply-template ./reply-templates.txt
--deepseek-model deepseek-chat --reply-stay --reply-max-length 280 --reply-timeout-ms 15000 --min-tweet-length 5 --like-current-tweet

npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --schedule-loop --schedule-interval-minutes 20

npx tsx src/profile-launcher.ts profile_behaha2709_id https://x.com/home --schedule-loop --schedule-interval-minutes 11 --schedule-max-runs --follow yes --feed-tab following --read-comments --like-current-tweet --follow-verified-users --reply-text auto --auto-reply-template ./reply-templates.txt
