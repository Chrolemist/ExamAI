// Automated SOLID Compliance Tests for GitHub Actions
import { test, expect } from '@playwright/test';

test.describe('SOLID Compliance Tests', () => {
  test('should pass all SOLID principle tests', async ({ page }) => {
    // Navigate to SOLID test page
    await page.goto('/tests/integration/test-solid.html');
    
    // Wait for tests to load
    await page.waitForSelector('#testResults', { timeout: 10000 });
    
    // Click "Run All Tests" button
    await page.click('#runAllTests');
    
    // Wait for tests to complete (max 30 seconds)
    await page.waitForFunction(() => {
      const runButton = document.querySelector('#runAllTests');
      return runButton && runButton.textContent === 'Run All Tests';
    }, { timeout: 30000 });
    
    // Check that all tests passed
    const results = await page.locator('#testResults .test-item').all();
    
    for (const result of results) {
      const status = await result.locator('.status').textContent();
      const testName = await result.locator('.test-name').textContent();
      
      expect(status, `Test "${testName}" should pass`).toBe('✓ PASS');
    }
    
    // Verify specific SOLID principles
    await expect(page.locator('text=Single Responsibility Principle')).toBeVisible();
    await expect(page.locator('text=Open/Closed Principle')).toBeVisible();
    await expect(page.locator('text=Liskov Substitution Principle')).toBeVisible();
    await expect(page.locator('text=Interface Segregation Principle')).toBeVisible();
    await expect(page.locator('text=Dependency Inversion Principle')).toBeVisible();
    
    // Check performance metrics
    const performanceSection = page.locator('#performanceMetrics');
    await expect(performanceSection).toBeVisible();
    
    // Verify no critical performance issues
    const loadTime = await page.locator('#loadTime').textContent();
    const loadTimeMs = parseInt(loadTime?.replace('ms', '') || '0');
    expect(loadTimeMs, 'Load time should be reasonable').toBeLessThan(5000);
  });

  test('should validate architectural compliance', async ({ page }) => {
    await page.goto('/tests/test-solid.html');
    await page.waitForSelector('#testResults');
    
    // Run specific architectural tests
    await page.click('#runArchitectureTests');
    
    // Wait for architecture tests to complete
    await page.waitForFunction(() => {
      const archTests = document.querySelectorAll('.arch-test');
      return archTests.length > 0 && Array.from(archTests).every(test => 
        test.classList.contains('completed')
      );
    }, { timeout: 15000 });
    
    // Verify modular structure
    const moduleTests = await page.locator('.module-test .status').allTextContents();
    for (const status of moduleTests) {
      expect(status).toBe('✓ PASS');
    }
  });

  test('should validate no broken dependencies', async ({ page }) => {
    await page.goto('/frontend/index.html');
    
    // Check for JavaScript errors
    let hasErrors = false;
    page.on('pageerror', (error) => {
      console.error('Page error:', error.message);
      hasErrors = true;
    });
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    
    // Verify no critical JavaScript errors
    expect(hasErrors, 'Page should load without JavaScript errors').toBe(false);
    
    // Check that key components are loaded
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#addCopilotBtn')).toBeVisible();
  });
});
