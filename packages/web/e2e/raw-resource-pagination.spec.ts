import { test, expect } from "@playwright/test";

test.describe("Raw Resource Pagination", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display pagination controls when many resources exist", async ({
    page,
    context,
  }) => {
    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 150 }),
      });
    });

    await context.route("/api/raw-resources?limit=50&offset=0", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `test-${i}`,
            type: "text",
            filename: `resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: i % 2 === 0,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page 1 of 3")).toBeVisible();
    await expect(page.locator("text=150 total")).toBeVisible();
  });

  test("should navigate to next page", async ({ page, context }) => {
    let currentPage = 0;

    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 100 }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") || "0");
      currentPage = offset / 50;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `page${currentPage}-resource-${i}`,
            type: "text",
            filename: `page${currentPage}-resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: true,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page 1 of 2")).toBeVisible();

    const nextButton = page.getByRole("button").filter({ has: page.locator("svg") }).nth(1);
    await nextButton.click();

    await expect(page.locator("text=Page 2 of 2")).toBeVisible();
  });

  test("should navigate to previous page", async ({ page, context }) => {
    let currentPage = 0;

    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 100 }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") || "0");
      currentPage = offset / 50;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `page${currentPage}-resource-${i}`,
            type: "text",
            filename: `page${currentPage}-resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: true,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page 1 of 2")).toBeVisible();

    const paginationButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    const nextButton = paginationButtons.nth(1);
    await nextButton.click();

    await expect(page.locator("text=Page 2 of 2")).toBeVisible();

    const prevButton = paginationButtons.first();
    await expect(prevButton).toBeEnabled();
    await prevButton.click();

    await expect(page.locator("text=Page 1 of 2")).toBeVisible();
  });

  test("should disable previous button on first page", async ({
    page,
    context,
  }) => {
    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 100 }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `resource-${i}`,
            type: "text",
            filename: `resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: true,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page 1 of 2")).toBeVisible();

    const paginationButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    const prevButton = paginationButtons.first();
    await expect(prevButton).toBeDisabled();
  });

  test("should disable next button on last page", async ({ page, context }) => {
    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 100 }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") || "0");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `resource-${offset}-${i}`,
            type: "text",
            filename: `resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: true,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page 1 of 2")).toBeVisible();

    const paginationButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    const nextButton = paginationButtons.nth(1);
    await nextButton.click();

    await expect(page.locator("text=Page 2 of 2")).toBeVisible();
    await expect(nextButton).toBeDisabled();
  });

  test("should not display pagination when less than page size", async ({
    page,
    context,
  }) => {
    await context.route("/api/raw-resources/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 25 }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `resource-${i}`,
            type: "text",
            filename: `resource-${i}.txt`,
            contentPath: `data/raw/documents/resource-${i}.txt`,
            createdAt: Date.now(),
            processed: true,
          })),
        }),
      });
    });

    await page.reload();

    await expect(page.locator("text=Page")).not.toBeVisible();
  });

  test("should display correct resource stats", async ({ page, context }) => {
    await context.route("/api/raw-index/stats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            stats: {
              pdfCount: 10,
              imageCount: 5,
              webpageCount: 20,
              textCount: 115,
              processedCount: 100,
              unprocessedCount: 50,
            },
          },
        }),
      });
    });

    await context.route("/api/raw-resources?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `resource-${i}`,
            type: i < 10 ? "pdf" : i < 15 ? "image" : i < 35 ? "webpage" : "text",
            filename: `resource-${i}`,
            contentPath: `data/raw/documents/resource-${i}`,
            createdAt: Date.now(),
            processed: i < 100,
          })),
        }),
      });
    });

    await page.reload();

    const rawResourcesSection = page
      .locator("section")
      .filter({ hasText: "Raw Resources" });

    await expect(rawResourcesSection.locator("text=150")).toBeVisible();
    await expect(rawResourcesSection.locator("text=100")).toBeVisible();
    await expect(rawResourcesSection.locator("text=50")).toBeVisible();
  });
});