import { expect, test } from '@fixtures/test.js';
import { todoItems } from '@data/todos.js';

test.describe('TodoMVC user journey', () => {
  test.beforeEach(async ({ todoPage }) => {
    await todoPage.open();
    await todoPage.addTodos(todoItems.regression);
  });

  test('user can complete one todo', async ({ todoPage }) => {
    const target = todoItems.regression[0];

    await todoPage.completeTodo(target);

    await todoPage.expectTodoCompleted(target);
    await todoPage.expectTodoCount(/2 items left/);
  });

  test('active filter hides completed todo', async ({ todoPage, page }) => {
    const target = todoItems.regression[0];

    await todoPage.completeTodo(target);
    await page.getByRole('link', { name: 'Active' }).click();

    await expect(todoPage.itemByText(target)).toBeHidden();
  });
});
