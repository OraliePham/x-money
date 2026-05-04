# Architecture

## Goals

This starter is optimized for maintainability, safe upgrades, and low test flakiness.

## Layers

```text
Tests
  ↓
Fixtures
  ↓
Page Objects
  ↓
Playwright Page / APIRequestContext
  ↓
Browser / HTTP layer
```

## Tests

Tests should contain scenario intent and assertions. Avoid putting CSS selectors, repeated setup, or environment parsing inside test files.

Example:

```ts
await todoPage.open();
await todoPage.addTodo('write maintainable tests');
await todoPage.expectTodoVisible('write maintainable tests');
```

## Fixtures

Fixtures compose reusable dependencies. They are the right place to create page objects, authenticated sessions, test accounts, API clients, and seeded data.

Current fixture:

```ts
export const test = base.extend({
  todoPage: async ({ page }, use) => {
    await use(new TodoPage(page));
  },
});
```

## Page objects

Page objects own selectors and page-level actions. Keep them small and focused. Prefer composition over large inheritance chains.

Good candidates for page objects:

- LoginPage
- DashboardPage
- SettingsPage
- SearchPage
- CheckoutPage

Avoid one global `AppPage` object that knows every part of the system.

## Locators

Preferred order:

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. `getByTestId`
6. CSS locator as fallback

Use CSS selectors only when the UI has no stable user-facing contract.

## Test categories

| Category | Folder | Purpose |
|---|---|---|
| Smoke | `tests/smoke` | Fast checks for critical paths. |
| E2E | `tests/e2e` | Full user journeys. |
| API | `tests/api` | HTTP/API-level validation. |

## Reporting

Playwright is configured to retain:

- screenshots only on failure;
- video only on failure;
- trace on first retry;
- HTML report after each run.

This keeps local and CI artifacts useful without becoming too large.

