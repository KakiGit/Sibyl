import { test, expect } from "@playwright/test";

test.describe("Batch Delete Functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Raw Resources - shows Select Multiple button", async ({ page }) => {
    await page.waitForSelector("text=Raw Resources");
    await page.click("text=Raw Resources");
    await expect(page.locator("button:has-text('Select Multiple')")).toBeVisible();
  });

  test("Raw Resources - can enter selection mode", async ({ page }) => {
    await page.waitForSelector("text=Raw Resources");
    await page.click("text=Raw Resources");
    await page.click("button:has-text('Select Multiple')");
    await expect(page.locator("button:has-text('Cancel Selection')")).toBeVisible();
    await expect(page.locator("button:has-text('Select All')")).toBeVisible();
    await expect(page.locator("button:has-text('Delete (0)')")).toBeVisible();
  });

  test("Wiki Pages - shows Select Multiple button", async ({ page }) => {
    await page.waitForSelector("text=Wiki Pages");
    await page.click("text=Wiki Pages");
    await expect(page.locator("button:has-text('Select Multiple')")).toBeVisible();
  });

  test("Wiki Pages - can enter selection mode", async ({ page }) => {
    await page.waitForSelector("text=Wiki Pages");
    await page.click("text=Wiki Pages");
    await page.click("button:has-text('Select Multiple')");
    await expect(page.locator("button:has-text('Cancel Selection')")).toBeVisible();
    await expect(page.locator("button:has-text('Select All')")).toBeVisible();
    await expect(page.locator("button:has-text('Delete (0)')")).toBeVisible();
  });
});