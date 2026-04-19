import { test, expect } from "@playwright/test";

test.describe("Wiki Link Extraction", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should create wiki links when content with wiki link syntax is ingested", async ({
    page,
    context,
  }) => {
    await context.route("/api/wiki-pages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "page-1",
              slug: "react",
              title: "React",
              type: "concept",
              summary: "A JavaScript library",
              tags: ["frontend"],
              updatedAt: Date.now(),
            },
            {
              id: "page-2",
              slug: "typescript",
              title: "TypeScript",
              type: "concept",
              summary: "Typed JavaScript",
              tags: ["typescript"],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route("/api/ingest/text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            rawResourceId: "raw-1",
            wikiPageId: "wiki-1",
            slug: "frontend-guide",
            title: "Frontend Guide",
            type: "concept",
            processed: true,
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=React")).toBeVisible();
    await expect(page.locator("text=TypeScript")).toBeVisible();
  });

  test("should display wiki graph view with links", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "node-1",
                slug: "react",
                title: "React",
                type: "concept",
                incomingLinks: 3,
                outgoingLinks: 2,
                isOrphan: false,
                isHub: true,
              },
              {
                id: "node-2",
                slug: "typescript",
                title: "TypeScript",
                type: "concept",
                incomingLinks: 2,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [
              { id: "e1", from: "node-1", to: "node-2", relationType: "reference" },
            ],
            stats: {
              totalPages: 2,
              totalLinks: 3,
              orphanCount: 0,
              hubCount: 1,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Wiki Graph View")).toBeVisible();
    await expect(page.locator("text=2")).toBeVisible();
    await expect(page.locator("text=3")).toBeVisible();
  });

  test("should show links created from wiki syntax in graph view", async ({
    page,
    context,
  }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "main-page",
                slug: "frontend-guide",
                title: "Frontend Guide",
                type: "concept",
                incomingLinks: 0,
                outgoingLinks: 3,
                isOrphan: false,
                isHub: false,
              },
              {
                id: "referenced-1",
                slug: "react",
                title: "React",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 0,
                isOrphan: false,
                isHub: false,
              },
              {
                id: "referenced-2",
                slug: "typescript",
                title: "TypeScript",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 0,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [
              {
                id: "link-1",
                from: "main-page",
                to: "referenced-1",
                relationType: "reference",
              },
              {
                id: "link-2",
                from: "main-page",
                to: "referenced-2",
                relationType: "reference",
              },
            ],
            stats: {
              totalPages: 3,
              totalLinks: 2,
              orphanCount: 0,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Frontend Guide")).toBeVisible();
    await expect(page.locator("text=React")).toBeVisible();
    await expect(page.locator("text=TypeScript")).toBeVisible();
  });

  test("should show correct outgoing link counts on node cards", async ({
    page,
    context,
  }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "hub-node",
                slug: "main-concept",
                title: "Main Concept",
                type: "concept",
                incomingLinks: 5,
                outgoingLinks: 3,
                isOrphan: false,
                isHub: true,
              },
            ],
            edges: [],
            stats: {
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 0,
              hubCount: 1,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Main Concept")).toBeVisible();
    await expect(page.locator("text=5")).toBeVisible();
    await expect(page.locator("text=3")).toBeVisible();
  });
});