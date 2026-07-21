import { expect, type Page, test } from '@playwright/test';

const MODULE_PATH = '/academy/lessons/academy-portal-container-access/start';

const login = async (page: Page) => {
  const username = process.env.CONSOLE_USERNAME ?? 'kubeadmin';
  const password = process.env.CONSOLE_PASSWORD;
  if (!password) throw new Error('CONSOLE_PASSWORD is required');

  await page.goto('/academy/guidance');
  const provider = page.getByText('kube:admin', { exact: false });
  if (await provider.isVisible().catch(() => false)) await provider.click();

  const usernameInput = page.getByRole('textbox', { name: 'Username' });
  const loginVisible = await usernameInput
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!loginVisible) {
    if (page.url().includes('/academy/guidance')) return;
    throw new Error(`OpenShift login did not become available at ${page.url()}`);
  }

  await usernameInput.fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/\/academy\/guidance/);
};

const installPerformanceProbe = async (page: Page) => {
  await page.addInitScript(() => {
    const metrics = { childMutations: 0, longTasks: [] as number[] };
    Object.assign(window, { academyE2EPerformance: metrics });
    new MutationObserver((records) => {
      metrics.childMutations += records.reduce(
        (total, record) => total + record.addedNodes.length + record.removedNodes.length,
        0
      );
    }).observe(document.body, { childList: true, subtree: true });
    new PerformanceObserver((entries) => {
      metrics.longTasks.push(...entries.getEntries().map((entry) => entry.duration));
    }).observe({ entryTypes: ['longtask'] });
  });
};

test('completes the Academy container-access lesson without blocking the console', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installPerformanceProbe(page);
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await page.goto(MODULE_PATH);

  const stopLesson = page.getByRole('button', { name: 'Stop', exact: true });
  const guidancePanel = page.locator('.academy-guidance__controller');
  await expect(stopLesson).toBeVisible();

  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  await expect(workloads).toBeVisible();
  if (await guidancePanel.getByText('Open Pods', { exact: true }).isVisible().catch(() => false)) {
    await workloads.click();
    await expect(workloads).toHaveAttribute('aria-expanded', 'false');
    await expect(guidancePanel).toContainText('Open Workloads');
  } else {
    await expect(guidancePanel).toContainText('Open Workloads');
  }
  await workloads.click();
  await expect(workloads).toHaveAttribute('aria-expanded', 'true');
  await expect(guidancePanel).toContainText('Open Pods');

  const pods = page.locator('a[href="/k8s/all-namespaces/core~v1~Pod"]');
  await expect(pods).toBeVisible();
  await pods.click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(guidancePanel).toContainText('Open the Academy database pod');

  const databasePod = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1"]'
  );
  await expect(databasePod).toBeVisible();
  await databasePod.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1$/);
  await expect(guidancePanel).toContainText('Inspect the logs');

  const logs = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/logs"]'
  );
  await expect(logs).toBeVisible();
  await logs.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/logs$/);
  await expect(guidancePanel).toContainText('Open the container terminal');

  const terminal = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/terminal"]'
  );
  await expect(terminal).toBeVisible();
  await terminal.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
  await expect(guidancePanel).toContainText('Lesson complete');

  await page.waitForTimeout(2_000);
  const metrics = await page.evaluate(() =>
    (window as typeof window & {
      academyE2EPerformance: { childMutations: number; longTasks: number[] };
    }).academyE2EPerformance
  );
  expect(Math.max(0, ...metrics.longTasks)).toBeLessThan(1_000);
  expect(metrics.childMutations).toBeLessThan(5_000);
  expect(pageErrors).toEqual([]);
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) =>
      ![
        'Firefox can’t establish a connection',
        'connection to wss:',
        'Error retrieving SelfSubjectReview',
        'Failed to get a valid plugin manifest',
        'Could not get OpenAPI definitions',
        'Error logging out',
        'Unable to fetch pod metrics'
      ].some((knownError) => message.includes(knownError))
  );
  expect(unexpectedConsoleErrors).toEqual([]);

  await stopLesson.click();
  await expect(guidancePanel).toHaveCount(0);
  await expect(stopLesson).toHaveCount(0);
});
