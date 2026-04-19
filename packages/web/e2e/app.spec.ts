import { test, expect } from "@playwright/test";

test.describe("Sibyl Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the header with title", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Sibyl");
    await expect(page.locator("text=Memory System")).toBeVisible();
  });

  test("should display dashboard section", async ({ page }) => {
    await expect(page.locator("text=Dashboard")).toBeVisible();
  });

  test("should display wiki pages section", async ({ page }) => {
    await expect(page.locator("text=Wiki Pages")).toBeVisible();
  });

  test("should display tabs for filtering wiki pages", async ({ page }) => {
    const tabsList = page.locator("role=tablist");
    await expect(tabsList.getByRole("tab", { name: "All" })).toBeVisible();
    await expect(tabsList.getByRole("tab", { name: "Entities" })).toBeVisible();
    await expect(tabsList.getByRole("tab", { name: "Concepts" })).toBeVisible();
    await expect(tabsList.getByRole("tab", { name: "Sources" })).toBeVisible();
    await expect(tabsList.getByRole("tab", { name: "Summaries" })).toBeVisible();
  });

  test("should switch tabs when clicked", async ({ page }) => {
    const conceptsTab = page.getByRole("tab", { name: "Concepts" });
    await conceptsTab.click();
    await expect(conceptsTab).toHaveAttribute("data-state", "active");
  });

  test("should show empty state when no wiki pages exist", async ({ page }) => {
    await expect(page.locator("text=No wiki pages found")).toBeVisible();
  });

  test("should display wiki page cards when data exists", async ({ page, context }) => {
    const apiServer = await context.route("/api/wiki-pages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "test-1",
              slug: "test-concept",
              title: "Test Concept",
              type: "concept",
              summary: "A test concept page",
              tags: ["test", "demo"],
              updatedAt: Date.now(),
            },
            {
              id: "test-2",
              slug: "test-entity",
              title: "Test Entity",
              type: "entity",
              summary: "A test entity page",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Test Concept")).toBeVisible();
    await expect(page.locator("text=Test Entity")).toBeVisible();
    await expect(page.locator("text=A test concept page")).toBeVisible();
  });

  test("should display type badges on wiki page cards", async ({ page, context }) => {
    await context.route("/api/wiki-pages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "test-1",
              slug: "test-entity",
              title: "Test Entity",
              type: "entity",
              summary: undefined,
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Entity")).toBeVisible();
  });

  test("should filter wiki pages by type when tab is selected", async ({ page, context }) => {
    await context.route("/api/wiki-pages?type=entity", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "entity-1",
              slug: "entity-test",
              title: "Entity Test",
              type: "entity",
              summary: undefined,
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await page.getByRole("tab", { name: "Entities" }).click();
    await expect(page.locator("text=Entity Test")).toBeVisible();
  });

  test("should display stat cards with counts", async ({ page, context }) => {
    await context.route("/api/wiki-pages**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { id: "1", type: "entity", title: "E1", slug: "e1", tags: [], updatedAt: Date.now() },
            { id: "2", type: "concept", title: "C1", slug: "c1", tags: [], updatedAt: Date.now() },
            { id: "3", type: "source", title: "S1", slug: "s1", tags: [], updatedAt: Date.now() },
          ],
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Total Pages")).toBeVisible();
    await expect(page.locator("text=Entities")).toBeVisible();
    await expect(page.locator("text=Concepts")).toBeVisible();
    await expect(page.locator("text=Sources")).toBeVisible();
  });
});