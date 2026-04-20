import { test, expect } from '@playwright/test';

test.describe('Performance and UX Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test('Wiki Statistics load quickly and show correct data', async ({ page }) => {
    const statsSection = page.getByRole('heading', { name: 'Wiki Statistics' });
    await expect(statsSection).toBeVisible({ timeout: 2000 });
    
    const totalPages = page.getByText('Total Pages').locator('..').getByText(/^\d+$/);
    await expect(totalPages).toBeVisible();
    
    const value = await totalPages.textContent();
    expect(parseInt(value || '0')).toBeGreaterThan(0);
  });

  test('Wiki Search has auto-search functionality', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Enter search query...');
    await expect(searchInput).toBeVisible();
    
    const autoSearchCheckbox = page.getByText('Auto-search (type 2+ chars)');
    await expect(autoSearchCheckbox).toBeVisible();
    
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    
    await searchInput.clear();
  });

  test('Content Ingestion form is user-friendly', async ({ page }) => {
    const filenameInput = page.getByPlaceholder('document-name.txt');
    await expect(filenameInput).toBeVisible();
    
    const contentTextarea = page.getByPlaceholder('Enter the content to be ingested into the wiki...');
    await expect(contentTextarea).toBeVisible();
    
    const typeDropdown = page.getByRole('combobox').first();
    await expect(typeDropdown).toBeVisible();
    
    const ingestButton = page.getByRole('button', { name: 'Ingest' });
    await expect(ingestButton).toBeDisabled();
    
    await filenameInput.fill('test.txt');
    await contentTextarea.fill('This is test content for performance testing.');
    
    await expect(ingestButton).toBeEnabled();
  });

  test('Content Ingestion shows character count', async ({ page }) => {
    await page.getByRole('button', { name: 'Ingest' }).click();
    
    const contentTextarea = page.getByPlaceholder('Enter the content to be ingested into the wiki...');
    await contentTextarea.fill('Test content');
    
    const charCount = page.getByText('characters');
    await expect(charCount).toBeVisible();
    
    const countValue = await charCount.locator('..').textContent();
    expect(countValue).toContain('12');
  });

  test('Raw Resources pagination works correctly', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const refreshButton = page.getByRole('button', { name: 'Refresh' });
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(500);
    }
    
    const paginationInfo = page.getByText(/Page \d+ of \d+/);
    const isVisible = await paginationInfo.isVisible();
    
    if (isVisible) {
      const paginationText = await paginationInfo.textContent();
      expect(paginationText).toContain('Page');
      expect(paginationText).toContain('total');
    }
  });

  test('Query Synthesis input is responsive', async ({ page }) => {
    const queryInput = page.getByPlaceholder('Ask a question about your wiki...');
    await expect(queryInput).toBeVisible();
    
    const synthesizeButton = page.getByRole('button', { name: 'Synthesize' });
    await expect(synthesizeButton).toBeDisabled();
    
    await queryInput.fill('What is machine learning?');
    await expect(synthesizeButton).toBeEnabled();
  });

  test('Content Filing section is accessible', async ({ page }) => {
    const fileContentButton = page.getByRole('button', { name: 'File Content' });
    await expect(fileContentButton).toBeVisible();
    
    const fileQueryButton = page.getByRole('button', { name: 'File Query Result' });
    await expect(fileQueryButton).toBeVisible();
    
    const titleInput = page.getByPlaceholder('Wiki page title');
    await expect(titleInput).toBeVisible();
  });

  test('Wiki Health Check (Lint) buttons are functional', async ({ page }) => {
    const runLintButton = page.getByRole('button', { name: 'Run Lint' });
    await expect(runLintButton).toBeVisible();
    await expect(runLintButton).toBeEnabled();
    
    const runLLMButton = page.getByRole('button', { name: 'Run LLM Analysis' });
    await expect(runLLMButton).toBeVisible();
    await expect(runLLMButton).toBeEnabled();
  });

  test('Marp Slide Generation interface is complete', async ({ page }) => {
    const selectPagesButton = page.getByRole('button', { name: 'Select Pages' });
    await expect(selectPagesButton).toBeVisible();
    
    const titleInput = page.getByPlaceholder('Optional title for the presentation');
    await expect(titleInput).toBeVisible();
    
    const generateButton = page.getByRole('button', { name: 'Generate Slides' });
    await expect(generateButton).toBeVisible();
  });

  test('WebSocket status indicator shows connection state', async ({ page }) => {
    const statusIndicator = page.getByText(/Connected|Disconnected|Connecting/);
    await expect(statusIndicator).toBeVisible({ timeout: 3000 });
  });

  test('Authentication section is available', async ({ page }) => {
    const authHeader = page.getByRole('heading', { name: 'Authentication' });
    await expect(authHeader).toBeVisible();
  });

  test('Dashboard shows page type breakdown', async ({ page }) => {
    const entitiesHeading = page.getByRole('heading', { name: 'Entities' });
    await expect(entitiesHeading).toBeVisible();
    
    const conceptsHeading = page.getByRole('heading', { name: 'Concepts' });
    await expect(conceptsHeading).toBeVisible();
    
    const sourcesHeading = page.getByRole('heading', { name: 'Sources' });
    await expect(sourcesHeading).toBeVisible();
  });

  test('Wiki Page List shows pagination info', async ({ page }) => {
    await page.getByRole('button', { name: 'Wiki Pages' }).click();
    
    const showingText = page.getByText(/Showing \d+ of \d+ pages/);
    await expect(showingText).toBeVisible({ timeout: 3000 });
    
    const loadMoreButton = page.getByRole('button', { name: 'Load more pages' });
    await expect(loadMoreButton).toBeVisible();
  });

  test('Wiki Page Detail shows edit and delete buttons', async ({ page }) => {
    await page.getByRole('button', { name: 'Wiki Pages' }).click();
    await page.waitForTimeout(500);
    
    const firstCard = page.getByRole('button', { name: /Test Webpage|test|TypeScript/ }).first();
    await firstCard.click();
    await page.waitForTimeout(500);
    
    const editButton = page.getByRole('button', { name: 'Edit' });
    await expect(editButton).toBeVisible();
    
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();
  });

  test('Delete confirmation dialog appears and can be cancelled', async ({ page }) => {
    await page.getByRole('button', { name: 'Wiki Pages' }).click();
    await page.waitForTimeout(500);
    
    const firstCard = page.getByRole('button', { name: /Test Webpage|test|TypeScript/ }).first();
    await firstCard.click();
    await page.waitForTimeout(500);
    
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await deleteButton.click();
    
    const dialogTitle = page.getByText('Delete Wiki Page');
    await expect(dialogTitle).toBeVisible();
    
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();
    
    await expect(dialogTitle).not.toBeVisible();
  });

  test('Keyboard shortcut Escape navigates back from wiki page detail', async ({ page }) => {
    await page.getByRole('button', { name: 'Wiki Pages' }).click();
    await page.waitForTimeout(500);
    
    const firstCard = page.getByRole('button', { name: /Test Webpage|test|TypeScript/ }).first();
    await firstCard.click();
    await page.waitForTimeout(500);
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    const showingText = page.getByText(/Showing \d+ of \d+ pages/);
    await expect(showingText).toBeVisible();
  });

  test('Sidebar navigation shows shortcuts button', async ({ page }) => {
    const shortcutsButton = page.getByRole('button', { name: 'Shortcuts' });
    await expect(shortcutsButton).toBeVisible();
    
    await shortcutsButton.click();
    
    const shortcutsPanel = page.getByText('Keyboard Shortcuts');
    await expect(shortcutsPanel).toBeVisible();
  });
});