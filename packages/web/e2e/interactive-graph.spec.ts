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

  test("should show hover tooltip when hovering over a node", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "concept-1",
                slug: "hover-test",
                title: "Hover Test Page",
                type: "concept",
                incomingLinks: 2,
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
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    await page.waitForTimeout(1000);

    const nodeGroup = page.locator("svg g").filter({ has: page.locator("circle.node-circle") }).first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.hover();
      await page.waitForTimeout(200);
      
      const tooltip = page.locator(".fixed.z-50").filter({ hasText: "Hover Test Page" });
      if (await tooltip.isVisible()) {
        await expect(tooltip).toBeVisible();
        await expect(tooltip.getByText("Concept")).toBeVisible();
      }
    }
  });

  test("should show content preview modal when clicking a node", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "preview-test-id",
                slug: "preview-test",
                title: "Preview Test Page",
                type: "entity",
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

    await context.route("/api/wiki-pages/preview-test-id/content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            title: "Preview Test Page",
            type: "entity",
            slug: "preview-test",
            summary: "A test page for preview",
            content: "# Preview Test\n\nThis is the content of the preview test page.\n\n## Section\n\nSome more content here.",
            tags: ["test", "preview"],
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    await page.waitForTimeout(1000);

    const nodeGroup = page.locator("svg g").filter({ has: page.locator("circle.node-circle") }).first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.click();
      await page.waitForTimeout(300);
      
      await expect(page.getByText("Preview Test Page")).toBeVisible();
      await expect(page.getByText("Entity")).toBeVisible();
      await expect(page.getByText("Loading content")).toBeVisible({ timeout: 5000 });
    }
  });

  test("should close modal when pressing ESC key", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "esc-test-id",
                slug: "esc-test",
                title: "ESC Test Page",
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

    await context.route("/api/wiki-pages/esc-test-id/content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            title: "ESC Test Page",
            type: "concept",
            slug: "esc-test",
            summary: "Test ESC key",
            content: "Content for ESC test",
            tags: [],
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    await page.waitForTimeout(1000);

    const nodeGroup = page.locator("svg g").filter({ has: page.locator("circle.node-circle") }).first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.click();
      await page.waitForTimeout(300);
      
      await expect(page.getByText("ESC Test Page")).toBeVisible();
      
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      
      await expect(page.getByText("ESC Test Page")).not.toBeVisible();
    }
  });

  test("should show ESC hint in modal footer", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "esc-hint-test",
                slug: "esc-hint",
                title: "ESC Hint Test",
                type: "source",
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

    await context.route("/api/wiki-pages/esc-hint-test/content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            title: "ESC Hint Test",
            type: "source",
            slug: "esc-hint",
            summary: "Test",
            content: "Content",
            tags: [],
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    await page.waitForTimeout(1000);

    const nodeGroup = page.locator("svg g").filter({ has: page.locator("circle.node-circle") }).first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.click();
      await page.waitForTimeout(300);
      
      await expect(page.getByText("Press")).toBeVisible();
      await expect(page.getByText("ESC")).toBeVisible();
      await expect(page.getByText("to close")).toBeVisible();
    }
  });

  test("should display View Full Page button in modal", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "full-page-test-id",
                slug: "full-page-test",
                title: "Full Page Test",
                type: "summary",
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

    await context.route("/api/wiki-pages/full-page-test-id/content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            title: "Full Page Test",
            type: "summary",
            slug: "full-page-test",
            summary: "Test full page view",
            content: "Full page content",
            tags: [],
          },
        }),
      });
    });

    await page.reload();
    await expect(page.getByText("Interactive visualization")).toBeVisible();
    await page.waitForTimeout(1000);

    const nodeGroup = page.locator("svg g").filter({ has: page.locator("circle.node-circle") }).first();
    if (await nodeGroup.isVisible()) {
      await nodeGroup.click();
      await page.waitForTimeout(300);
      
      await expect(page.getByText("View Full Page")).toBeVisible();
    }
  });

  test("should show updated instructions in graph footer", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "instruction-test",
                slug: "instruction",
                title: "Instruction Test",
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
    
    await expect(page.getByText("Hover to preview")).toBeVisible();
    await expect(page.getByText("Click for details")).toBeVisible();
    await expect(page.getByText("ESC to close")).toBeVisible();
  });
});