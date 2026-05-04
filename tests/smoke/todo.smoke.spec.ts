import { test } from '@fixtures/test.js';
import { todoItems } from '@data/todos.js';

test.describe('TodoMVC smoke checks', () => {
  test('user can add a todo @smoke', async ({ todoPage }) => {
    await todoPage.open();
    await todoPage.addTodo(todoItems.smoke);
    await todoPage.expectTodoVisible(todoItems.smoke);
    await todoPage.expectTodoCount(/1 item left/);
  });
});
