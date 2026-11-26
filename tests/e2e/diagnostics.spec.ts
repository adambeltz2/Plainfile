import { expect, test } from '@playwright/test';
import { openVault } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('the error bar', () => {
  test('an unhandled error shows a bar with details to copy, and Dismiss clears it', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('test boom');
      }, 0);
    });
    const bar = page.locator('#fatal-bar');
    await expect(bar).toContainText('Something went wrong');
    await bar.locator('summary').click();
    const text = await bar.locator('textarea').inputValue();
    expect(text).toContain('tendfile v');
    expect(text).toContain('test boom');
    expect(text).toContain('Browser:');
    await bar.getByRole('button', { name: 'Dismiss' }).click();
    await expect(bar).toHaveCount(0);
    // The app still works.
    await expect(page.locator('.nav')).toBeVisible();
  });

  test('an unhandled promise rejection is shown too, once', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.evaluate(() => {
      void Promise.reject(new Error('rejected for a test'));
      void Promise.reject(new Error('and another'));
    });
    await expect(page.locator('#fatal-bar')).toHaveCount(1);
    await expect(page.locator('#fatal-bar')).toContainText('Something went wrong');
  });
});
