import { test as base, expect } from '@playwright/test';
import { TodoPage } from '@pages/TodoPage.js';

type AppFixtures = {
  todoPage: TodoPage;
};

export const test = base.extend<AppFixtures>({
  todoPage: async ({ page }, use) => {
    const todoPage = new TodoPage(page);
    await use(todoPage);
  },
});

export { expect };
