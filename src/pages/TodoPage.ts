import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class TodoPage extends BasePage {
  readonly newTodoInput: Locator;
  readonly todoItems: Locator;
  readonly todoCount: Locator;

  constructor(page: Page) {
    super(page);
    this.newTodoInput = page.getByPlaceholder('What needs to be done?');
    this.todoItems = page.locator('.todo-list li');
    this.todoCount = page.locator('.todo-count');
  }

  async open(): Promise<void> {
    await this.goto('/');
    await expect(this.newTodoInput).toBeVisible();
  }

  async addTodo(title: string): Promise<void> {
    await this.newTodoInput.fill(title);
    await this.newTodoInput.press('Enter');
  }

  async addTodos(titles: readonly string[]): Promise<void> {
    for (const title of titles) {
      await this.addTodo(title);
    }
  }

  itemByText(title: string): Locator {
    return this.todoItems.filter({ hasText: title });
  }

  async completeTodo(title: string): Promise<void> {
    await this.itemByText(title).getByRole('checkbox').check();
  }

  async expectTodoVisible(title: string): Promise<void> {
    await expect(this.itemByText(title)).toBeVisible();
  }

  async expectTodoCompleted(title: string): Promise<void> {
    await expect(this.itemByText(title)).toHaveClass(/completed/);
  }

  async expectTodoCount(text: string | RegExp): Promise<void> {
    await expect(this.todoCount).toContainText(text);
  }
}
