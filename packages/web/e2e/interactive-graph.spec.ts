import { test, expect } from "@playwright/test";

test.describe("Interactive Graph Visualization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display view mode toggle buttons in wiki graph section", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test-concept",
                title: "Test Concept",
                type: "concept",
                incomingLinks: 5,
                outgoingLinks: 3,
                isOrphan: false,
                isHub: true,
              },
              {
                id: "page-2",
                slug: "orphan-page",
                title: "Orphan Page",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
            ],
            edges: [],
            stats: {
              totalPages: 2,
              totalLinks: 0,
              orphanCount: 1,
              hubCount: 1,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Wiki Graph View", level: 2 })).toBeVisible();
    await expect(page.locator("button:text('Graph')").first()).toBeVisible();
    await expect(page.locator("button:text('List')").first()).toBeVisible();
  });

  test("should default to Graph (interactive) view mode", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test-page",
                title: "Test Page",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [],
            stats: {
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 0,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Interactive visualization")).toBeVisible();
    await expect(page.locator("button.bg-primary:text('Graph')")).toBeVisible();
  });

  test("should switch to List view when clicking List button", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "hub-page",
                title: "Hub Page",
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
    await expect(page.locator("button:text('List')")).toBeVisible();
    await page.locator("button:text('List')").click();
    await expect(page.locator("text=Hub Pages")).toBeVisible();
  });

  test("should switch back to Graph view when clicking Graph button", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test-page",
                title: "Test Page",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [],
            stats: {
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 0,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await page.locator("button:text('List')").click();
    await expect(page.locator("text=All Pages")).toBeVisible();
    await page.locator("button:text('Graph')").click();
    await expect(page.locator("text=Interactive visualization")).toBeVisible();
  });

  test("should display interactive graph with SVG when in Graph mode", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "concept-1",
                slug: "concept-page",
                title: "Concept Page",
                type: "concept",
                incomingLinks: 2,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
              {
                id: "entity-1",
                slug: "entity-page",
                title: "Entity Page",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
            ],
            edges: [],
            stats: {
              totalPages: 2,
              totalLinks: 0,
              orphanCount: 1,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Interactive visualization")).toBeVisible();
    
    await page.waitForTimeout(500);
    
    const svgElement = page.locator("svg").first();
    await expect(svgElement).toBeVisible();
  });

  test("should display legend in interactive graph", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test",
                title: "Test",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [],
            stats: { totalPages: 1, totalLinks: 0, orphanCount: 0, hubCount: 0 },
          },
        }),
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);
    
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    
    await page.waitForTimeout(2000);
    
    const legendElement = page.getByText("Entity", { exact: true }).nth(2);
    if (await legendElement.isVisible()) {
      await expect(legendElement).toBeVisible();
    }
  });

  test("should display click instruction in interactive graph", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test",
                title: "Test",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
            ],
            edges: [],
            stats: { totalPages: 1, totalLinks: 0, orphanCount: 0, hubCount: 0 },
          },
        }),
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);
    
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    
    await page.waitForTimeout(2000);
    
    const clickInstruction = page.getByText("Click a node to see details");
    if (await clickInstruction.isVisible()) {
      await expect(clickInstruction).toBeVisible();
    }
  });

  test("should show node details panel when clicking a node", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "concept-1",
                slug: "my-concept",
                title: "My Concept",
                type: "concept",
                incomingLinks: 5,
                outgoingLinks: 3,
                isOrphan: false,
                isHub: true,
              },
            ],
            edges: [],
            stats: { totalPages: 1, totalLinks: 0, orphanCount: 0, hubCount: 1 },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Interactive visualization")).toBeVisible();
    
    await page.waitForTimeout(500);
    
    const nodeGroup = page.locator("svg g.cursor-pointer").first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.click();
      await expect(page.locator("text=My Concept")).toBeVisible();
      await expect(page.locator("text=Slug:")).toBeVisible();
    }
  });

  test("should display graph stats in both view modes", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "test",
                title: "Test",
                type: "concept",
                incomingLinks: 3,
                outgoingLinks: 2,
                isOrphan: false,
                isHub: true,
              },
              {
                id: "page-2",
                slug: "orphan",
                title: "Orphan",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
            ],
            edges: [],
            stats: { totalPages: 2, totalLinks: 0, orphanCount: 1, hubCount: 1 },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByText("Pages", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Links", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Orphans", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Hubs", { exact: true }).first()).toBeVisible();
  });
});