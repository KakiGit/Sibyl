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
    await expect(
      tabsList.getByRole("tab", { name: "Summaries" }),
    ).toBeVisible();
  });

  test("should switch tabs when clicked", async ({ page }) => {
    const conceptsTab = page.getByRole("tab", { name: "Concepts" });
    await conceptsTab.click();
    await expect(conceptsTab).toHaveAttribute("data-state", "active");
  });

  test("should show empty state when no wiki pages exist", async ({ page }) => {
    await expect(page.locator("text=No wiki pages found")).toBeVisible();
  });

  test("should display wiki page cards when data exists", async ({
    page,
    context,
  }) => {
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

  test("should display type badges on wiki page cards", async ({
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

  test("should filter wiki pages by type when tab is selected", async ({
    page,
    context,
  }) => {
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
            {
              id: "1",
              type: "entity",
              title: "E1",
              slug: "e1",
              tags: [],
              updatedAt: Date.now(),
            },
            {
              id: "2",
              type: "concept",
              title: "C1",
              slug: "c1",
              tags: [],
              updatedAt: Date.now(),
            },
            {
              id: "3",
              type: "source",
              title: "S1",
              slug: "s1",
              tags: [],
              updatedAt: Date.now(),
            },
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
    await expect(
      page.locator("input[placeholder*='Ask a question']"),
    ).toBeVisible();
    await expect(page.locator("button:text('Synthesize')")).toBeVisible();
  });

  test("should show synthesized answer when query is submitted", async ({
    page,
    context,
  }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "What is React?",
            answer:
              "React is a JavaScript library for building user interfaces [[react-overview]]. It uses a component-based architecture [[react-overview]].",
            citations: [
              {
                pageSlug: "react-overview",
                pageTitle: "React Overview",
                pageType: "concept",
                relevanceScore: 100,
              },
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
    await expect(
      page.locator("text=React is a JavaScript library"),
    ).toBeVisible();
  });

  test("should display citations after synthesis", async ({
    page,
    context,
  }) => {
    await context.route("/api/synthesize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            query: "React hooks",
            answer:
              "Hooks are functions that let you use state [[hooks-guide]].",
            citations: [
              {
                pageSlug: "hooks-guide",
                pageTitle: "Hooks Guide",
                pageType: "concept",
                relevanceScore: 150,
              },
              {
                pageSlug: "react-overview",
                pageTitle: "React Overview",
                pageType: "concept",
                relevanceScore: 100,
              },
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

  test("should show loading state during synthesis", async ({
    page,
    context,
  }) => {
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

  test("should show error message when synthesis fails", async ({
    page,
    context,
  }) => {
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

  test("should display model badge when model is provided", async ({
    page,
    context,
  }) => {
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

test.describe("Content Ingestion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display content ingestion section", async ({ page }) => {
    await expect(page.locator("text=Content Ingestion")).toBeVisible();
  });

  test("should display ingest status cards", async ({ page, context }) => {
    await context.route("/api/ingest/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { unprocessed: 5, processed: 10, total: 15 },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=15")).toBeVisible();
    await expect(page.locator("text=10")).toBeVisible();
    await expect(page.locator("text=5")).toBeVisible();
  });

  test("should display filename input field", async ({ page }) => {
    await expect(
      page.locator("input[placeholder*='document-name']"),
    ).toBeVisible();
  });

  test("should display content textarea", async ({ page }) => {
    await expect(
      page.locator("textarea[placeholder*='Enter the content']"),
    ).toBeVisible();
  });

  test("should display type selector", async ({ page }) => {
    await expect(page.locator("select")).toBeVisible();
  });

  test("should display tags input field", async ({ page }) => {
    await expect(
      page.locator("input[placeholder*='ai, machine-learning']"),
    ).toBeVisible();
  });

  test("should display ingest button", async ({ page }) => {
    await expect(page.locator("button:text('Ingest')")).toBeVisible();
  });

  test("should display batch processing section", async ({ page }) => {
    await expect(page.locator("text=Batch Processing")).toBeVisible();
    await expect(
      page.locator("button:text('Process All Pending')"),
    ).toBeVisible();
  });

  test("should ingest content successfully", async ({ page, context }) => {
    await context.route("/api/ingest/text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            rawResourceId: "test-raw-id",
            wikiPageId: "test-wiki-id",
            slug: "test-document",
            title: "Test Document",
            type: "concept",
            processed: true,
          },
        }),
      });
    });

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("test-document.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("This is test content for ingestion.");

    await page.locator("button:text('Ingest')").click();

    await expect(
      page.locator("text=Content ingested successfully"),
    ).toBeVisible();
    await expect(page.locator("text=Test Document")).toBeVisible();
  });

  test("should show loading state during ingestion", async ({
    page,
    context,
  }) => {
    await context.route("/api/ingest/text", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            rawResourceId: "test-id",
            wikiPageId: "wiki-id",
            slug: "test",
            title: "Test",
            type: "concept",
            processed: true,
          },
        }),
      });
    });

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("test.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('Ingest')").click();

    await expect(page.locator("button:text('Ingest')")).toBeDisabled();
  });

  test("should show error message when ingestion fails", async ({
    page,
    context,
  }) => {
    await context.route("/api/ingest/text", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Ingestion failed",
          message: "Server error",
        }),
      });
    });

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("test.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('Ingest')").click();

    await expect(page.locator("text=Server error")).toBeVisible();
  });

  test("should clear form when clear button clicked", async ({ page }) => {
    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("test.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('Clear')").click();

    await expect(filenameInput).toHaveValue("");
    await expect(contentTextarea).toHaveValue("");
  });

  test("should disable ingest button when fields empty", async ({ page }) => {
    const ingestButton = page.locator("button:text('Ingest')");
    await expect(ingestButton).toBeDisabled();
  });

  test("should enable ingest button when fields filled", async ({ page }) => {
    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("test.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    const ingestButton = page.locator("button:text('Ingest')");
    await expect(ingestButton).toBeEnabled();
  });

  test("should process batch ingestion", async ({ page, context }) => {
    await context.route("/api/ingest/batch", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            processed: [
              {
                rawResourceId: "1",
                wikiPageId: "w1",
                slug: "doc1",
                title: "Doc 1",
                type: "concept",
              },
            ],
            failed: [],
            total: 1,
          },
        }),
      });
    });

    await page.locator("button:text('Process All Pending')").click();

    await expect(page.locator("text=Processed: 1 / 1")).toBeVisible();
  });

  test("should display type badge after successful ingestion", async ({
    page,
    context,
  }) => {
    await context.route("/api/ingest/text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            rawResourceId: "test-raw-id",
            wikiPageId: "test-wiki-id",
            slug: "entity-test",
            title: "Entity Test",
            type: "entity",
            processed: true,
          },
        }),
      });
    });

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill("entity-test.txt");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('Ingest')").click();

    await expect(page.locator("text=Entity")).toBeVisible();
  });
});

test.describe("Wiki Lint", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display wiki lint section", async ({ page }) => {
    await expect(page.locator("text=Wiki Health Check")).toBeVisible();
  });

  test("should display lint stats cards", async ({ page, context }) => {
    await context.route("/api/lint", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 10,
            totalPagesWithIssues: 3,
            issues: [],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: ["Wiki is in good health. No issues detected."],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Total Pages")).toBeVisible();
    await expect(page.locator("text=Pages with Issues")).toBeVisible();
  });

  test("should display run lint button", async ({ page }) => {
    await expect(page.locator("button:text('Run Lint')")).toBeVisible();
  });

  test("should show healthy message when no issues", async ({
    page,
    context,
  }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 5,
            totalPagesWithIssues: 0,
            issues: [],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: ["Wiki is in good health. No issues detected."],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Wiki is healthy")).toBeVisible();
  });

  test("should show issues found message when issues exist", async ({
    page,
    context,
  }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 5,
            totalPagesWithIssues: 2,
            issues: [
              {
                type: "orphan",
                severity: "medium",
                pageSlug: "orphan-page",
                pageTitle: "Orphan Page",
                details: "Page has no incoming or outgoing links",
                suggestedAction: "Add cross-references",
              },
            ],
            orphanPages: [
              {
                id: "1",
                slug: "orphan-page",
                title: "Orphan Page",
                type: "concept",
                updatedAt: Date.now(),
              },
            ],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: ["Consider linking 1 orphan pages"],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=1 issues found")).toBeVisible();
  });

  test("should display suggestions when available", async ({
    page,
    context,
  }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 5,
            totalPagesWithIssues: 1,
            issues: [],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: [
              "Consider linking orphan pages",
              "Create missing referenced pages",
            ],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Suggestions")).toBeVisible();
    await expect(
      page.locator("text=Consider linking orphan pages"),
    ).toBeVisible();
  });

  test("should display issue cards when issues exist", async ({
    page,
    context,
  }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 5,
            totalPagesWithIssues: 2,
            issues: [
              {
                type: "orphan",
                severity: "medium",
                pageSlug: "orphan-page",
                pageTitle: "Orphan Page",
                details: "Page has no links",
                suggestedAction: "Add cross-references",
              },
              {
                type: "missing_reference",
                severity: "high",
                pageSlug: "referrer",
                pageTitle: "Referrer Page",
                details: "Page references [[missing]] which doesn't exist",
                suggestedAction: "Create page missing",
              },
            ],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: [],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Issues")).toBeVisible();
    await expect(page.locator("text=Orphan Page")).toBeVisible();
    await expect(page.locator("text=Referrer Page")).toBeVisible();
  });

  test("should display issue type badges", async ({ page, context }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 1,
            totalPagesWithIssues: 1,
            issues: [
              {
                type: "missing_reference",
                severity: "high",
                pageSlug: "test",
                pageTitle: "Test",
                details: "Missing reference",
              },
            ],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: [],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Missing Ref")).toBeVisible();
    await expect(page.locator("text=High")).toBeVisible();
  });

  test("should filter issues by severity", async ({ page, context }) => {
    await context.route("/api/lint**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            totalPages: 5,
            totalPagesWithIssues: 3,
            issues: [
              {
                type: "missing_reference",
                severity: "high",
                pageSlug: "1",
                pageTitle: "High Issue",
                details: "High",
              },
              {
                type: "orphan",
                severity: "medium",
                pageSlug: "2",
                pageTitle: "Medium Issue",
                details: "Medium",
              },
              {
                type: "stale",
                severity: "low",
                pageSlug: "3",
                pageTitle: "Low Issue",
                details: "Low",
              },
            ],
            orphanPages: [],
            stalePages: [],
            missingReferences: [],
            potentialConflicts: [],
            suggestions: [],
            lintedAt: Date.now(),
          },
        }),
      });
    });

    await page.reload();

    await page.locator("button:text('High')").click();
    await expect(page.locator("text=High Issue")).toBeVisible();
    await expect(page.locator("text=Medium Issue")).not.toBeVisible();
    await expect(page.locator("text=Low Issue")).not.toBeVisible();

    await page.locator("button:text('Medium')").click();
    await expect(page.locator("text=Medium Issue")).toBeVisible();
    await expect(page.locator("text=High Issue")).not.toBeVisible();
  });

  test("should run lint when button clicked", async ({ page, context }) => {
    await context.route("/api/lint", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              totalPages: 10,
              totalPagesWithIssues: 0,
              issues: [],
              orphanPages: [],
              stalePages: [],
              missingReferences: [],
              potentialConflicts: [],
              suggestions: ["Wiki is in good health"],
              lintedAt: Date.now(),
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              totalPages: 5,
              totalPagesWithIssues: 1,
              issues: [
                {
                  type: "orphan",
                  severity: "medium",
                  pageSlug: "test",
                  details: "Test",
                },
              ],
              orphanPages: [],
              stalePages: [],
              missingReferences: [],
              potentialConflicts: [],
              suggestions: [],
              lintedAt: Date.now(),
            },
          }),
        });
      }
    });

    await page.reload();
    await expect(page.locator("text=1 issues found")).toBeVisible();

    await page.locator("button:text('Run Lint')").click();

    await expect(page.locator("text=Wiki is healthy")).toBeVisible();
  });

  test("should show loading state during lint", async ({ page, context }) => {
    await context.route("/api/lint", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              totalPages: 10,
              totalPagesWithIssues: 0,
              issues: [],
              orphanPages: [],
              stalePages: [],
              missingReferences: [],
              potentialConflicts: [],
              suggestions: [],
              lintedAt: Date.now(),
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              totalPages: 0,
              totalPagesWithIssues: 0,
              issues: [],
              orphanPages: [],
              stalePages: [],
              missingReferences: [],
              potentialConflicts: [],
              suggestions: [],
              lintedAt: Date.now(),
            },
          }),
        });
      }
    });

    await page.reload();
    await page.locator("button:text('Run Lint')").click();

    await expect(page.locator("button:text('Run Lint')")).toBeDisabled();
  });
});

test.describe("Content Filing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display content filing section", async ({ page }) => {
    await expect(page.locator("text=Content Filing")).toBeVisible();
  });

  test("should display filing mode tabs", async ({ page }) => {
    await expect(page.locator("button:text('File Content')")).toBeVisible();
    await expect(
      page.locator("button:text('File Query Result')"),
    ).toBeVisible();
  });

  test("should switch between filing modes", async ({ page }) => {
    await page.locator("button:text('File Query Result')").click();
    await expect(
      page.locator("input[placeholder*='Search query']"),
    ).toBeVisible();

    await page.locator("button:text('File Content')").click();
    await expect(
      page.locator("input[placeholder*='Wiki page title']"),
    ).toBeVisible();
  });

  test("should display filing form fields in content mode", async ({
    page,
  }) => {
    await expect(
      page.locator("input[placeholder*='Wiki page title']"),
    ).toBeVisible();
    await expect(
      page.locator("textarea[placeholder*='Enter the content']"),
    ).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
    await expect(page.locator("input[placeholder*='research']")).toBeVisible();
  });

  test("should display file content button", async ({ page }) => {
    await expect(page.locator("button:text('File Content')")).toBeVisible();
  });

  test("should file content successfully", async ({ page, context }) => {
    await context.route("/api/filing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            wikiPageId: "test-wiki-id",
            slug: "test-filed-page",
            title: "Test Filed Page",
            type: "summary",
            linkedPages: ["page-1", "page-2"],
            filedAt: Date.now(),
          },
        }),
      });
    });

    const titleInput = page.locator("input[placeholder*='Wiki page title']");
    await titleInput.fill("Test Filed Page");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("This is filed content for the wiki.");

    await page.locator("button:text('File Content')").click();

    await expect(page.locator("text=Content filed successfully")).toBeVisible();
    await expect(page.locator("text=Test Filed Page")).toBeVisible();
  });

  test("should show loading state during filing", async ({ page, context }) => {
    await context.route("/api/filing", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            wikiPageId: "test-id",
            slug: "test",
            title: "Test",
            type: "summary",
            linkedPages: [],
            filedAt: Date.now(),
          },
        }),
      });
    });

    const titleInput = page.locator("input[placeholder*='Wiki page title']");
    await titleInput.fill("Test");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('File Content')").click();

    await expect(page.locator("button:text('File Content')")).toBeDisabled();
  });

  test("should show error message when filing fails", async ({
    page,
    context,
  }) => {
    await context.route("/api/filing", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Filing failed",
          message: "Server error",
        }),
      });
    });

    const titleInput = page.locator("input[placeholder*='Wiki page title']");
    await titleInput.fill("Test");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('File Content')").click();

    await expect(page.locator("text=Server error")).toBeVisible();
  });

  test("should display filing history section", async ({ page }) => {
    await expect(page.locator("text=Filing History")).toBeVisible();
  });

  test("should show empty filing history state", async ({ page, context }) => {
    await context.route("/api/filing/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.reload();
    await expect(page.locator("text=No filing history yet")).toBeVisible();
  });

  test("should display filing history entries", async ({ page, context }) => {
    await context.route("/api/filing/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              wikiPageId: "id-1",
              title: "First Filed Page",
              slug: "first-filed-page",
              filedAt: Date.now(),
            },
            {
              wikiPageId: "id-2",
              title: "Second Filed Page",
              slug: "second-filed-page",
              filedAt: Date.now() - 100000,
            },
          ],
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=First Filed Page")).toBeVisible();
    await expect(page.locator("text=Second Filed Page")).toBeVisible();
  });

  test("should display type badge after successful filing", async ({
    page,
    context,
  }) => {
    await context.route("/api/filing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            wikiPageId: "test-id",
            slug: "concept-test",
            title: "Concept Test",
            type: "concept",
            linkedPages: [],
            filedAt: Date.now(),
          },
        }),
      });
    });

    const titleInput = page.locator("input[placeholder*='Wiki page title']");
    await titleInput.fill("Concept Test");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('File Content')").click();

    await expect(page.locator("text=Concept")).toBeVisible();
  });

  test("should file query result successfully", async ({ page, context }) => {
    await context.route("/api/filing/query", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            wikiPageId: "query-result-id",
            slug: "query-result-test",
            title: "Query Result: Test Query",
            type: "summary",
            linkedPages: ["page-1"],
            filedAt: Date.now(),
          },
        }),
      });
    });

    await page.locator("button:text('File Query Result')").click();

    const queryInput = page.locator("input[placeholder*='Search query']");
    await queryInput.fill("Test Query");

    await page.locator("button:text('File Query Result')").click();

    await expect(page.locator("text=Content filed successfully")).toBeVisible();
  });

  test("should show error when query filing has no matches", async ({
    page,
    context,
  }) => {
    await context.route("/api/filing/query", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "No matching wiki pages found" }),
      });
    });

    await page.locator("button:text('File Query Result')").click();

    const queryInput = page.locator("input[placeholder*='Search query']");
    await queryInput.fill("nonexistent");

    await page.locator("button:text('File Query Result')").click();

    await expect(
      page.locator("text=No matching wiki pages found"),
    ).toBeVisible();
  });

  test("should display linked pages badge", async ({ page, context }) => {
    await context.route("/api/filing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            wikiPageId: "test-id",
            slug: "linked-test",
            title: "Linked Test",
            type: "summary",
            linkedPages: ["page-1", "page-2", "page-3"],
            filedAt: Date.now(),
          },
        }),
      });
    });

    const titleInput = page.locator("input[placeholder*='Wiki page title']");
    await titleInput.fill("Linked Test");

    const contentTextarea = page.locator(
      "textarea[placeholder*='Enter the content']",
    );
    await contentTextarea.fill("Test content");

    await page.locator("button:text('File Content')").click();

    await expect(page.locator("text=3")).toBeVisible();
  });
});

test.describe("Wiki Graph View", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display wiki graph view section", async ({ page }) => {
    await expect(page.locator("text=Wiki Graph View")).toBeVisible();
  });

  test("should display graph stats cards", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "1",
                slug: "page-1",
                title: "Page 1",
                type: "concept",
                incomingLinks: 2,
                outgoingLinks: 1,
                isOrphan: false,
                isHub: false,
              },
              {
                id: "2",
                slug: "page-2",
                title: "Page 2",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
              {
                id: "3",
                slug: "page-3",
                title: "Page 3",
                type: "source",
                incomingLinks: 5,
                outgoingLinks: 3,
                isOrphan: false,
                isHub: true,
              },
            ],
            edges: [
              { id: "e1", from: "1", to: "3", relationType: "references" },
              { id: "e2", from: "3", to: "1", relationType: "related" },
            ],
            stats: {
              totalPages: 3,
              totalLinks: 2,
              orphanCount: 1,
              hubCount: 1,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Pages")).toBeVisible();
    await expect(page.locator("text=Links")).toBeVisible();
    await expect(page.locator("text=Orphans")).toBeVisible();
    await expect(page.locator("text=Hubs")).toBeVisible();
  });

  test("should show empty state when no wiki pages exist", async ({
    page,
    context,
  }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [],
            edges: [],
            stats: {
              totalPages: 0,
              totalLinks: 0,
              orphanCount: 0,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=No wiki pages to visualize")).toBeVisible();
  });

  test("should display hub pages section when hubs exist", async ({
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
                id: "hub-1",
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
    await expect(page.locator("text=Hub Pages")).toBeVisible();
    await expect(page.locator("text=Hub Page")).toBeVisible();
  });

  test("should display orphan pages section when orphans exist", async ({
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
                id: "orphan-1",
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
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 1,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Orphan Pages")).toBeVisible();
    await expect(page.locator("text=Orphan Page")).toBeVisible();
  });

  test("should display node cards with connection counts", async ({
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
                id: "node-1",
                slug: "connected-page",
                title: "Connected Page",
                type: "concept",
                incomingLinks: 3,
                outgoingLinks: 2,
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
    await expect(page.locator("text=Connected Page")).toBeVisible();
  });

  test("should display type badges on node cards", async ({
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
                id: "entity-1",
                slug: "entity-node",
                title: "Entity Node",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
              {
                id: "concept-1",
                slug: "concept-node",
                title: "Concept Node",
                type: "concept",
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
              orphanCount: 2,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Entity")).toBeVisible();
    await expect(page.locator("text=Concept")).toBeVisible();
  });

  test("should display hub badge on hub nodes", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "hub-1",
                slug: "hub-node",
                title: "Hub Node",
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
    await expect(page.locator("text=Hub")).toBeVisible();
  });

  test("should display orphan badge on orphan nodes", async ({
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
                id: "orphan-1",
                slug: "orphan-node",
                title: "Orphan Node",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
                isOrphan: true,
                isHub: false,
              },
            ],
            edges: [],
            stats: {
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 1,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Orphan")).toBeVisible();
  });

  test("should show loading state during fetch", async ({ page, context }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [],
            edges: [],
            stats: {
              totalPages: 0,
              totalLinks: 0,
              orphanCount: 0,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Wiki Graph View")).toBeVisible();
  });

  test("should show error message when graph fetch fails", async ({
    page,
    context,
  }) => {
    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server error" }),
      });
    });

    await page.reload();
    await expect(page.locator("text=Failed to load wiki graph")).toBeVisible();
  });
});

test.describe("Wiki Page Detail View", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should navigate to detail view when clicking wiki page card", async ({
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
              id: "test-page-1",
              slug: "test-concept",
              title: "Test Concept",
              type: "concept",
              summary: "A test concept page",
              tags: ["test", "demo"],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/test-page-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Test Concept",
              type: "concept",
              slug: "test-concept",
              summary: "A test concept page",
              tags: ["test", "demo"],
              sourceIds: [],
              content:
                "# Test Concept\n\nThis is the full content of the test concept page.\n\n## Details\n\nMore details here.",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Test Concept" }),
    ).toBeVisible();

    await page.getByRole("heading", { name: "Test Concept" }).click();

    await expect(page.locator("h2")).toContainText("Test Concept");
    await expect(page.locator("text=test-concept")).toBeVisible();
    await expect(page.locator("text=This is the full content")).toBeVisible();
  });

  test("should display page metadata in detail view", async ({
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
              id: "test-page-1",
              slug: "test-entity",
              title: "Test Entity",
              type: "entity",
              summary: "A test entity summary",
              tags: ["entity", "important"],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/test-page-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Test Entity",
              type: "entity",
              slug: "test-entity",
              summary: "A test entity summary",
              tags: ["entity", "important"],
              sourceIds: [],
              content: "Entity content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "test-page-1",
                slug: "test-entity",
                title: "Test Entity",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
              },
            ],
            edges: [],
            stats: {
              totalPages: 1,
              totalLinks: 0,
              orphanCount: 1,
              hubCount: 0,
            },
          },
        }),
      });
    });

    await page.reload();
    await page.getByRole("heading", { name: "Test Entity" }).click();

    await expect(page.locator("text=Metadata")).toBeVisible();
    await expect(page.locator("text=A test entity summary")).toBeVisible();
    await expect(page.locator("text=entity")).toBeVisible();
    await expect(page.locator("text=important")).toBeVisible();
  });

  test("should display connections section in detail view", async ({
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
              slug: "main-page",
              title: "Main Page",
              type: "concept",
              summary: "Main",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route("/api/wiki-pages/page-1/content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            title: "Main Page",
            type: "concept",
            slug: "main-page",
            summary: "Main page summary",
            tags: [],
            sourceIds: [],
            content: "Main page content",
            createdAt: Date.now() - 10000,
            updatedAt: Date.now(),
          },
        }),
      });
    });

    await context.route("/api/wiki-links/graph", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nodes: [
              {
                id: "page-1",
                slug: "main-page",
                title: "Main Page",
                type: "concept",
                incomingLinks: 1,
                outgoingLinks: 2,
              },
              {
                id: "page-2",
                slug: "referenced-page",
                title: "Referenced Page",
                type: "entity",
                incomingLinks: 0,
                outgoingLinks: 0,
              },
              {
                id: "page-3",
                slug: "referrer-page",
                title: "Referrer Page",
                type: "source",
                incomingLinks: 0,
                outgoingLinks: 0,
              },
            ],
            edges: [
              { from: "page-1", to: "page-2", relationType: "reference" },
              { from: "page-3", to: "page-1", relationType: "reference" },
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
    await page.getByRole("heading", { name: "Main Page" }).click();

    await expect(page.locator("text=Connections")).toBeVisible();
    await expect(page.locator("text=References")).toBeVisible();
    await expect(page.locator("text=Referenced by")).toBeVisible();
    await expect(page.locator("text=Referenced Page")).toBeVisible();
    await expect(page.locator("text=Referrer Page")).toBeVisible();
  });

  test("should show edit button in detail view", async ({ page, context }) => {
    await context.route("/api/wiki-pages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "edit-test-1",
              slug: "edit-test",
              title: "Edit Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/edit-test-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Edit Test",
              type: "concept",
              slug: "edit-test",
              summary: "Test",
              tags: [],
              sourceIds: [],
              content: "Test content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Edit Test" }).click();

    await expect(page.locator("button:text('Edit')")).toBeVisible();
  });

  test("should enter edit mode when clicking edit button", async ({
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
              id: "edit-mode-1",
              slug: "edit-mode",
              title: "Edit Mode Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/edit-mode-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Edit Mode Test",
              type: "concept",
              slug: "edit-mode",
              summary: "Test summary",
              tags: ["test"],
              sourceIds: [],
              content: "Initial content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Edit Mode Test" }).click();

    await page.locator("button:text('Edit')").click();

    await expect(page.locator("text=Edit Page")).toBeVisible();
    await expect(page.locator("textarea[rows='15']")).toBeVisible();
    await expect(page.locator("button:text('Save')")).toBeVisible();
    await expect(page.locator("button:text('Cancel')")).toBeVisible();
  });
  test("should save edited content successfully", async ({ page, context }) => {
    await context.route("/api/wiki-pages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "save-test-1",
              slug: "save-test",
              title: "Save Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/save-test-1/content",
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                title: "Save Test Updated",
                type: "concept",
                slug: "save-test",
                summary: "Updated summary",
                tags: ["updated"],
                sourceIds: [],
                content: "Updated content from test",
                createdAt: Date.now() - 10000,
                updatedAt: Date.now(),
              },
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                title: "Save Test",
                type: "concept",
                slug: "save-test",
                summary: "Original summary",
                tags: [],
                sourceIds: [],
                content: "Original content",
                createdAt: Date.now() - 10000,
                updatedAt: Date.now(),
              },
            }),
          });
        }
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Save Test" }).click();

    await page.locator("button:text('Edit')").click();

    const textarea = page.locator("textarea[rows='15']");
    await textarea.fill("Updated content from test");

    await page.locator("button:text('Save')").click();

    await expect(page.locator("text=Page updated successfully")).toBeVisible();
  });

  test("should cancel edit and return to view mode", async ({
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
              id: "cancel-test-1",
              slug: "cancel-test",
              title: "Cancel Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/cancel-test-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Cancel Test",
              type: "concept",
              slug: "cancel-test",
              summary: "Test summary",
              tags: [],
              sourceIds: [],
              content: "Original content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Cancel Test" }).click();

    await page.locator("button:text('Edit')").click();

    await expect(page.locator("text=Edit Page")).toBeVisible();

    await page.locator("button:text('Cancel')").click();

    await expect(page.locator("text=Edit Page")).not.toBeVisible();
    await expect(page.locator("button:text('Edit')")).toBeVisible();
  });

  test("should go back to list view when clicking back button", async ({
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
              id: "back-test-1",
              slug: "back-test",
              title: "Back Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
            {
              id: "back-test-2",
              slug: "another-page",
              title: "Another Page",
              type: "entity",
              summary: "Another",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/back-test-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Back Test",
              type: "concept",
              slug: "back-test",
              summary: "Test summary",
              tags: [],
              sourceIds: [],
              content: "Test content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Back Test" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Another Page" }),
    ).toBeVisible();

    await page.getByRole("heading", { name: "Back Test" }).click();

    await expect(page.locator("h2")).toContainText("Back Test");
    await expect(
      page.getByRole("heading", { name: "Another Page" }),
    ).not.toBeVisible();

    await page.locator("button").first().click();

    await expect(
      page.getByRole("heading", { name: "Back Test" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Another Page" }),
    ).toBeVisible();
  });

  test("should display type badge in detail view", async ({
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
              id: "badge-test-1",
              slug: "badge-entity",
              title: "Badge Entity Test",
              type: "entity",
              summary: "Entity",
              tags: [],
              updatedAt: Date.now(),
            },
            {
              id: "badge-test-2",
              slug: "badge-source",
              title: "Badge Source Test",
              type: "source",
              summary: "Source",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/badge-test-1/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Badge Entity Test",
              type: "entity",
              slug: "badge-entity",
              summary: "Entity test",
              tags: [],
              sourceIds: [],
              content: "Entity content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await context.route(
      "/api/wiki-pages/badge-test-2/content",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Badge Source Test",
              type: "source",
              slug: "badge-source",
              summary: "Source test",
              tags: [],
              sourceIds: [],
              content: "Source content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();

    await page.getByRole("heading", { name: "Badge Entity Test" }).click();
    await expect(page.locator("text=Entity")).toBeVisible();

    await page.locator("button").first().click();

    await page.getByRole("heading", { name: "Badge Source Test" }).click();
    await expect(page.locator("text=Source")).toBeVisible();
  });

  test("should show loading state when fetching page content", async ({
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
              id: "loading-test-1",
              slug: "loading-test",
              title: "Loading Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/loading-test-1/content",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              title: "Loading Test",
              type: "concept",
              slug: "loading-test",
              summary: "Test",
              tags: [],
              sourceIds: [],
              content: "Content",
              createdAt: Date.now() - 10000,
              updatedAt: Date.now(),
            },
          }),
        });
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Loading Test" }).click();

    await expect(page.locator("text=Loading page content")).toBeVisible();
  });

  test("should show error state when page content fetch fails", async ({
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
              id: "error-test-1",
              slug: "error-test",
              title: "Error Test",
              type: "concept",
              summary: "Test",
              tags: [],
              updatedAt: Date.now(),
            },
          ],
        }),
      });
    });

    await context.route(
      "/api/wiki-pages/error-test-1/content",
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Server error" }),
        });
      },
    );

    await page.reload();
    await page.getByRole("heading", { name: "Error Test" }).click();

    await expect(page.locator("text=Failed to load wiki page")).toBeVisible();
    await expect(page.locator("button:text('Go Back')")).toBeVisible();
  });
});
