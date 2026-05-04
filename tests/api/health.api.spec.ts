import { expect, test } from '@playwright/test';

test.describe('API smoke examples', () => {
  test('base URL responds successfully @smoke', async ({ request, baseURL }) => {
    const response = await request.get(baseURL ?? '/');

    expect(response.ok()).toBeTruthy();
  });
});
