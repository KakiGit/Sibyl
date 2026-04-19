import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("LLM Integration E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should ingest content and synthesize answer with LLM", async ({
    page,
  }) => {
    const timestamp = Date.now();
    await expect(
      page.locator("h2").filter({ hasText: "Content Ingestion" })
    ).toBeVisible();

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill(`ml-knowledge-${timestamp}.txt`);

    const contentTextarea = page.locator(
      "textarea[placeholder*='ingested into the wiki']"
    );
    await contentTextarea.fill(
      `Machine Learning Fundamentals ${timestamp}

Machine learning is a subset of artificial intelligence that enables systems to learn from data. Key components include supervised learning, unsupervised learning, and reinforcement learning. Neural networks are a popular architecture.`
    );

    const typeSelectInIngestion = page
      .locator("section")
      .filter({ hasText: "Content Ingestion" })
      .locator("select")
      .first();
    await typeSelectInIngestion.selectOption("concept");

    const ingestButton = page
      .locator("section")
      .filter({ hasText: "Content Ingestion" })
      .locator("button", { hasText: "Ingest" })
      .first();
    await expect(ingestButton).toBeEnabled();
    await ingestButton.click();

    await expect(
      page.locator("text=Content ingested successfully")
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(1000);

    const queryInput = page.locator("input[placeholder*='Ask a question']");
    await queryInput.fill(`What is machine learning ${timestamp}?`);

    const synthesizeButton = page.getByRole("button", { name: "Synthesize" });
    await synthesizeButton.click();

    await expect(
      page.locator("text=Synthesizing answer")
    ).toBeVisible({ timeout: 5000 });

    const queryTitle = page.locator("span.font-semibold").filter({
      hasText: `Machine learning ${timestamp}`,
    });
    await expect(queryTitle).toBeVisible({ timeout: 60000 });

    const answerSection = page.locator(".prose");
    await expect(answerSection).toBeVisible({ timeout: 30000 });

    const answerText = await answerSection.textContent();
    expect(answerText?.toLowerCase()).toContain("machine");
    expect(answerText?.length).toBeGreaterThan(50);

    const modelBadge = page.locator("text=Model:");
    if (await modelBadge.isVisible()) {
      const modelText = await modelBadge.textContent();
      expect(modelText).toContain("glm-5");
    }
  });

  test("should ingest second page and cross-reference", async ({ page }) => {
    const timestamp = Date.now();

    const filenameInput = page.locator("input[placeholder*='document-name']");
    const contentTextarea = page.locator(
      "textarea[placeholder*='ingested into the wiki']"
    );
    const ingestButton = page
      .locator("section")
      .filter({ hasText: "Content Ingestion" })
      .locator("button", { hasText: "Ingest" })
      .first();

    await filenameInput.fill(`ai-overview-${timestamp}.txt`);
    await contentTextarea.fill(
      `AI Overview ${timestamp}

Artificial Intelligence is intelligence demonstrated by machines. AI includes machine learning, neural networks, and deep learning as key technologies.`
    );
    await ingestButton.click();

    await expect(
      page.locator("text=Content ingested successfully")
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(1000);

    const queryInput = page.locator("input[placeholder*='Ask a question']");
    await queryInput.fill(`What is AI ${timestamp}?`);

    const synthesizeButton = page.getByRole("button", { name: "Synthesize" });
    await synthesizeButton.click();

    await expect(
      page.locator("text=Synthesizing answer")
    ).toBeVisible({ timeout: 5000 });

    const answerSection = page.locator(".prose");
    await expect(answerSection).toBeVisible({ timeout: 60000 });

    const answerText = await answerSection.textContent();
    expect(answerText?.toLowerCase()).toContain("ai");
    expect(answerText?.length).toBeGreaterThan(50);
  });

  test("should display citations for synthesized answers", async ({
    page,
  }) => {
    const timestamp = Date.now();

    const filenameInput = page.locator("input[placeholder*='document-name']");
    const contentTextarea = page.locator(
      "textarea[placeholder*='ingested into the wiki']"
    );
    const ingestButton = page
      .locator("section")
      .filter({ hasText: "Content Ingestion" })
      .locator("button", { hasText: "Ingest" })
      .first();

    await filenameInput.fill(`citation-test-${timestamp}.txt`);
    await contentTextarea.fill(
      `Citation Page ${timestamp}

This is unique content ${timestamp} for testing citations.`
    );
    await ingestButton.click();

    await expect(
      page.locator("text=Content ingested successfully")
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(1000);

    const queryInput = page.locator("input[placeholder*='Ask a question']");
    await queryInput.fill(`What is citation page ${timestamp}?`);

    const synthesizeButton = page.getByRole("button", { name: "Synthesize" });
    await synthesizeButton.click();

    await expect(
      page.getByRole("button", { name: "Citations" })
    ).toBeVisible({ timeout: 60000 });

    await page.getByRole("button", { name: "Citations" }).click();

    const citationCardTitle = page.getByText(
      `citation-test-${timestamp}`,
      { exact: false }
    ).first();
    await expect(citationCardTitle).toBeVisible({ timeout: 5000 });
  });

  test("should run lint and detect wiki health", async ({ page }) => {
    const timestamp = Date.now();

    const filenameInput = page.locator("input[placeholder*='document-name']");
    const contentTextarea = page.locator(
      "textarea[placeholder*='ingested into the wiki']"
    );
    const ingestButton = page
      .locator("section")
      .filter({ hasText: "Content Ingestion" })
      .locator("button", { hasText: "Ingest" })
      .first();

    await filenameInput.fill(`lint-test-${timestamp}.txt`);
    await contentTextarea.fill(
      `Lint Test ${timestamp}

Content for lint testing ${timestamp}.`
    );
    await ingestButton.click();

    await expect(
      page.locator("text=Content ingested successfully")
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(1000);

    const lintRunButton = page.getByRole("button", { name: "Run Lint" });
    await lintRunButton.click();

    await expect(
      page.locator("h2").filter({ hasText: "Wiki Health Check" })
    ).toBeVisible({ timeout: 15000 });

    const statsCard = page
      .locator("section")
      .filter({ hasText: "Wiki Health Check" })
      .locator("div.p-3");
    await expect(statsCard.first()).toBeVisible({ timeout: 5000 });
  });

  test("should handle synthesis with no matching pages gracefully", async ({
    page,
  }) => {
    const timestamp = Date.now();

    const queryInput = page.locator("input[placeholder*='Ask a question']");
    await queryInput.fill(`Nonexistent topic ${timestamp} xyz`);

    const synthesizeButton = page.getByRole("button", { name: "Synthesize" });
    await synthesizeButton.click();

    await expect(
      page.locator("text=No relevant wiki pages found")
    ).toBeVisible({ timeout: 30000 });
  });

  test("should file content as new wiki page", async ({ page }) => {
    const timestamp = Date.now();

    const filingTitleInput = page.locator("input[placeholder*='Wiki page title']");
    await filingTitleInput.fill(`Filed Page ${timestamp}`);

    const filingTextarea = page.locator(
      "textarea[placeholder*='file into the wiki']"
    );
    await filingTextarea.fill(
      `Filed Content ${timestamp}

This content was filed directly to the wiki.`
    );

    const filingSubmitButton = page
      .locator("section")
      .filter({ hasText: "Content Filing" })
      .getByRole("button", { name: "File Content" })
      .nth(1);
    await filingSubmitButton.click();

    await expect(
      page.locator("text=Content filed successfully")
    ).toBeVisible({ timeout: 15000 });

    const filedCardTitle = page.getByText(`Filed Page ${timestamp}`).first();
    await expect(filedCardTitle).toBeVisible({ timeout: 5000 });
  });

  test("should ingest content with LLM enhancement", async ({ page }) => {
    const timestamp = Date.now();

    const filenameInput = page.locator("input[placeholder*='document-name']");
    await filenameInput.fill(`llm-enhanced-${timestamp}.txt`);

    const contentTextarea = page.locator(
      "textarea[placeholder*='ingested into the wiki']"
    );
    await contentTextarea.fill(
      `Deep Learning Fundamentals ${timestamp}

Deep learning is a subset of machine learning that uses neural networks with many layers. Key applications include image recognition, natural language processing, and autonomous vehicles. Popular frameworks include TensorFlow and PyTorch. Deep neural networks can learn complex patterns from large datasets.`
    );

    const llmCheckbox = page.locator("#useLlm");
    await llmCheckbox.check();
    await expect(llmCheckbox).toBeChecked();

    const ingestButton = page.getByRole("button", { name: "Ingest with LLM" });
    await expect(ingestButton).toBeEnabled();
    await ingestButton.click();

    await expect(
      page.locator("text=Content ingested with LLM enhancement")
    ).toBeVisible({ timeout: 60000 });

    await expect(page.locator("text=LLM")).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    const queryInput = page.locator("input[placeholder*='Ask a question']");
    await queryInput.fill(`What is deep learning ${timestamp}?`);

    const synthesizeButton = page.getByRole("button", { name: "Synthesize" });
    await synthesizeButton.click();

    await expect(
      page.locator("text=Synthesizing answer")
    ).toBeVisible({ timeout: 5000 });

    const answerSection = page.locator(".prose");
    await expect(answerSection).toBeVisible({ timeout: 60000 });

    const answerText = await answerSection.textContent();
    expect(answerText?.toLowerCase()).toContain("deep");
    expect(answerText?.length).toBeGreaterThan(50);
  });
});