y# Long-term maintenance plan

## Upgrade strategy

Use small, frequent upgrades instead of rare large migrations.

Recommended cadence:

| Cadence | Action |
|---|---|
| Weekly | Review Dependabot PRs for dev dependencies. |
| Monthly | Upgrade Playwright minor/patch version in a dedicated PR. |
| Quarterly | Review architecture, flaky tests, and CI runtime. |
| Before major release | Read release notes and run the full suite in a staging branch. |

## Playwright upgrade checklist

1. Read Playwright release notes.
2. Update `@playwright/test`.
3. Run `npm install` to update `package-lock.json`.
4. Run `npx playwright install --with-deps`.
5. Run `npm run typecheck`.
6. Run `npm run lint`.
7. Run `npm run test:chromium` locally.
8. Run the full suite in CI.
9. Inspect traces for any new flakiness.
10. Merge only if CI is green.

## Dependency policy

- Pin Playwright exactly to reduce browser-version drift.
- Let Dependabot propose updates through pull requests.
- Keep third-party dependencies minimal.
- Prefer official Playwright features before adding plugins.
- Use `npm audit` as signal, then verify whether the vulnerability affects test-only code.

## Test stability rules

Avoid:

- `page.waitForTimeout()`
- test order dependency
- shared mutable state between tests
- force-clicking as default behavior
- brittle CSS selectors for visible UI
- hard-coded credentials or cookies

Prefer:

- web-first assertions such as `toBeVisible`, `toHaveText`, `toHaveURL`
- `getByRole`, `getByLabel`, `getByPlaceholder`
- isolated browser contexts
- seeded test data
- cleanup in fixtures or API helpers
- CI artifacts: trace, screenshot, video

## Version update workflow

Create a branch:

```bash
git checkout -b chore/update-playwright
```

Update dependency:

```bash
npm install -D @playwright/test@latest
npx playwright install --with-deps
```

Validate:

```bash
npm run verify
```

Commit:

```bash
git add package.json package-lock.json
git commit -m "chore: update playwright"
```

## Scaling plan

When the suite grows:

1. Split tests by product domain: `auth`, `billing`, `search`, `profile`.
2. Add project-level sharding in CI.
3. Move repeated API calls into typed API clients.
4. Add test data builders.
5. Add visual regression only for stable pages.
6. Track flaky tests separately and block repeated flaky merges.
7. Add ownership metadata for critical test suites.

## Security notes

- Never store real session cookies in this repository.
- Use dedicated test accounts.
- Keep `.env` out of version control.
- Rotate credentials used in CI.
- Use repository secrets for CI values.
- Do not run browser automation against third-party services in ways that violate their terms.

