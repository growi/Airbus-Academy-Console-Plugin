import { expect, type Locator, type Page, test } from '@playwright/test';

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

const expandWorkloads = async (page: Page) => {
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  await expect(workloads).toBeVisible();
  if ((await workloads.getAttribute('aria-expanded')) !== 'true') await workloads.click();
  await expect(workloads).toHaveAttribute('aria-expanded', 'true');
};

const expectSpotlightOn = async (spotlight: Locator, target: Locator) => {
  await expect.poll(async () => {
    const spotlightBox = await spotlight.boundingBox();
    const targetBox = await target.boundingBox();
    if (!spotlightBox || !targetBox) return false;
    return ['x', 'y', 'width', 'height'].every(
      (property) =>
        Math.abs(
          spotlightBox[property as keyof typeof spotlightBox] -
            targetBox[property as keyof typeof targetBox]
        ) < 2
    );
  }).toBe(true);
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

test('performs the Continue-driven presentation and verifies every step', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-manual/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const spotlight = page.locator('.academy-guidance__spotlight');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(guidancePanel).toContainText('Open Workloads');
  await expect(spotlight).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(guidancePanel).toContainText('Open Pods');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  )).toBe(1);
  const podsTarget = page.locator('a[href="/k8s/all-namespaces/core~v1~Pod"]');
  await expect(podsTarget).toBeVisible();
  await expect(spotlight).toBeVisible();
  await expectSpotlightOn(spotlight, podsTarget);
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(guidancePanel).toContainText('Open the Academy database pod');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1$/);
  await expect(guidancePanel).toContainText('Inspect the logs');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/logs$/);
  await expect(guidancePanel).toContainText('Open the container terminal');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
  await expect(guidancePanel).toContainText('Presentation complete');
});

test('performs the timed presentation and verifies every step', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-timed/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  await expect(guidancePanel).toContainText('Open Workloads');
  await expect(guidancePanel).toContainText('Continuing in 5s');
  await expect(guidancePanel).toContainText('Open Pods', { timeout: 8_000 });
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  )).toBe(1);
  await expectSpotlightOn(
    page.locator('.academy-guidance__spotlight'),
    page.locator('a[href="/k8s/all-namespaces/core~v1~Pod"]')
  );
  await expect(guidancePanel).toContainText('Open the Academy database pod', { timeout: 8_000 });
  await expect(guidancePanel).toContainText('Inspect the logs', { timeout: 8_000 });
  await expect(guidancePanel).toContainText('Open the container terminal', { timeout: 8_000 });
  await expect(guidancePanel).toContainText('Timed presentation complete', { timeout: 8_000 });
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
});

test('restarts the Continue presentation cleanly after completion and Stop', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-manual/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (const title of [
    'Open Workloads',
    'Open Pods',
    'Open the Academy database pod',
    'Inspect the logs',
    'Open the container terminal'
  ]) {
    await expect(guidancePanel).toContainText(title);
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
  }
  await expect(guidancePanel).toContainText('Presentation complete');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem('academy-guidance.active-module')
  )).toBeNull();

  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) === 'true') await workloads.click();
  await expect(workloads).toHaveAttribute('aria-expanded', 'false');
  const home = page.getByRole('button', { name: 'Home', exact: true });
  if ((await home.getAttribute('aria-expanded')) !== 'true') await home.click();
  await page.getByRole('link', { name: 'Academy guidance', exact: true }).click();
  await expect(page).toHaveURL(/\/academy\/guidance$/);
  await expect(workloads).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', {
    name: 'Start Academy portal container access (presentation: Continue)',
    exact: true
  }).click();
  await expect(guidancePanel).toContainText('Open Workloads');
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(guidancePanel).toContainText('Open Pods');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  )).toBe(1);
  const renderedPodsLink = page.getByRole('link', { name: 'Pods', exact: true });
  await expect(renderedPodsLink).toBeVisible();
  const renderedPodsHref = await renderedPodsLink.getAttribute('href');
  expect([
    '/k8s/all-namespaces/core~v1~Pod',
    '/k8s/ns/dcs-academy-portal/core~v1~Pod'
  ]).toContain(renderedPodsHref);
  await expectSpotlightOn(
    page.locator('.academy-guidance__spotlight'),
    renderedPodsLink
  );
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(guidancePanel).toContainText('Open the Academy database pod');
});
