import { expect, test } from '@playwright/test'

test.describe('Public app smoke', () => {
  test('home page renders core sections', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Capturing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View Portfolio' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })

  test('bottom navigation switches sections', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Services' }).click()
    await expect(page.getByRole('button', { name: 'Services' })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('button', { name: 'Portfolio' }).click()
    await expect(page.getByRole('button', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('button', { name: 'Book', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Book a Session' })).toBeVisible()
  })
})
