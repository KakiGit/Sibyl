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

test.describe("Query Synthesis", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display query synthesis section", async ({ page }) => {
    await expect(page.locator("text=Query Synthesis")).toBeVisible();
  });

  test("should display search input for queries", async ({ page }) => {
    await expect(page.locator("input[placeholder*='Ask a question']")).toBeVisible();
    await expect(page.locator("button:text('Synthesize')")).toBeVisible();
  });

  test("should show synthesized answer when query is submitted", async ({ page, context }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "What is React?",
            answer: "React is a JavaScript library for building user interfaces [[react-overview]]. It uses a component-based architecture [[react-overview]].",
            citations: [
              { pageSlug: "react-overview", pageTitle: "React Overview", pageType: "concept", relevanceScore: 100 },
            ],
            synthesizedAt: Date.now(),
            model: "mock-model",
          },
        }),
      });
    });

    const input = page.locator("input[placeholder*='Ask a question']");
    await input.fill("What is React?");
    await page.locator("button:text('Synthesize')").click();

    await expect(page.locator("text=What is React?")).toBeVisible();
    await expect(page.locator("text=React is a JavaScript library")).toBeVisible();
  });

  test("should display citations after synthesis", async ({ page, context }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "React hooks",
            answer: "Hooks are functions that let you use state [[hooks-guide]].",
            citations: [
              { pageSlug: "hooks-guide", pageTitle: "Hooks Guide", pageType: "concept", relevanceScore: 150 },
              { pageSlug: "react-overview", pageTitle: "React Overview", pageType: "concept", relevanceScore: 100 },
            ],
            synthesizedAt: Date.now(),
            model: "mock-model",
          },
        }),
      });
    });

    const input = page.locator("input[placeholder*='Ask a question']");
    await input.fill("React hooks");
    await page.locator("button:text('Synthesize')").click();

    await expect(page.locator("text=Citations")).toBeVisible();
    await page.locator("button:text('Citations')").click();
    await expect(page.locator("text=Hooks Guide")).toBeVisible();
    await expect(page.locator("text=React Overview")).toBeVisible();
  });

  test("should show loading state during synthesis", async ({ page, context }) => {
    await context.route("/api/synthesize", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "test",
            answer: "Test answer",
            citations: [],
            synthesizedAt: Date.now(),
          },
        }),
      });
    });

    const input = page.locator("input[placeholder*='Ask a question']");
    await input.fill("test query");
    await page.locator("button:text('Synthesize')").click();

    await expect(page.locator("text=Synthesizing answer")).toBeVisible();
  });

  test("should show error message when synthesis fails", async ({ page, context }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server error" }),
      });
    });

    const input = page.locator("input[placeholder*='Ask a question']");
    await input.fill("test");
    await page.locator("button:text('Synthesize')").click();

    await expect(page.locator("text=Server error")).toBeVisible();
  });

  test("should display model badge when model is provided", async ({ page, context }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "test",
            answer: "Test answer",
            citations: [],
            synthesizedAt: Date.now(),
            model: "glm-5",
          },
        }),
      });
    });

    const input = page.locator("input[placeholder*='Ask a question']");
    await input.fill("test");
    await page.locator("button:text('Synthesize')").click();

    await expect(page.locator("text=Model: glm-5")).toBeVisible();
  });
});