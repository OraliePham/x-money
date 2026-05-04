import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async expectTitleToContain(text: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(text);
  }

  protected byRoleButton(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  protected byRoleLink(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name });
  }
}
