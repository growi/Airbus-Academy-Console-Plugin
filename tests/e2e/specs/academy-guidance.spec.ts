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

test('searches and filters the registered tour catalog', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/guidance');

  const tours = page.getByRole('list', { name: 'Academy tours' });
  await expect(tours.getByRole('listitem')).toHaveCount(13);

  const search = page.getByRole('textbox', { name: 'Search tours' });
  await search.fill('Select the Academy namespace');
  await expect(tours.getByRole('listitem')).toHaveCount(3);

  await page.getByLabel('Filter tours by mode').selectOption('timed');
  await expect(tours.getByRole('listitem')).toHaveCount(1);
  await expect(tours).toContainText('Select the Academy namespace (presentation: timed)');

  await search.fill('does not exist');
  await expect(page.getByText('No matching tours', { exact: true })).toBeVisible();

  await search.fill('');
  await page.getByLabel('Filter tours by mode').selectOption('assisted');
  await page.getByRole('button', {
    name: 'Start Select the Academy namespace (assisted)',
    exact: true
  }).click();
  await expect(page.locator('.academy-guidance__controller')).toContainText('Step 1 of 8');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('starts a tour with a runtime Educates namespace', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(
    () => {
      const redirectUri = `${window.location.origin}/academy/guidance`;
      window.open(
        `/academy/lessons/educates-session-pods/start?namespace=academy-console-plugin&redirectUri=${encodeURIComponent(redirectUri)}`,
        '_blank'
      );
    }
  );
  const popup = await popupPromise;

  const bubble = popup.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');
  await expandWorkloads(popup);
  await expect(bubble).toContainText('Open session Pods');

  await popup.getByRole('link', { name: 'Pods', exact: true }).click();
  await expect(popup).toHaveURL(
    /\/k8s\/ns\/academy-console-plugin\/core~v1~Pod$/
  );
  const controller = popup.locator('.academy-guidance__controller');
  await expect(controller).toContainText('Lesson complete');
  await popup.getByRole('button', { name: 'Return to Academy lesson' }).click();
  await expect(popup).toHaveURL(/\/academy\/guidance$/);
  await popup.close();
});

test('returns a same-tab external tour to its browser history checkpoint', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/guidance');
  const returnHistoryLength = await page.evaluate(() => history.length);
  const redirectUri = `${new URL(page.url()).origin}/academy/guidance`;
  await page.goto(
    `/academy/lessons/educates-session-pods/start?namespace=academy-console-plugin&redirectUri=${encodeURIComponent(redirectUri)}&returnHistoryLength=${returnHistoryLength}`
  );

  const bubble = page.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');
  await expandWorkloads(page);
  await expect(bubble).toContainText('Open session Pods');
  await page.getByRole('link', { name: 'Pods', exact: true }).click();
  await expect(page).toHaveURL(
    /\/k8s\/ns\/academy-console-plugin\/core~v1~Pod$/
  );

  await page.getByRole('button', { name: 'Return to Academy lesson' }).click();
  await expect(page).toHaveURL(/\/academy\/guidance$/);
});

test('presents the A08 OpenShift console tour', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/lessons/lab-a08-openshift-console-timed/start');

  const bubble = page.locator('.academy-guidance__bubble');
  for (const title of [
    'Open Workloads',
    'Open Deployments',
    'Open Networking',
    'Open Services',
    'Open Storage',
    'Open PersistentVolumeClaims',
    'Open ConfigMaps'
  ]) {
    await expect(bubble).toContainText(title, { timeout: 8_000 });
  }
  await expect(page).toHaveURL(
    /\/k8s\/ns\/dcs-academy-portal\/core~v1~ConfigMap$/,
    { timeout: 8_000 }
  );
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);
});

test('keeps the spotlight aligned while navigation menus move or hide its target', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/lessons/lab-a08-openshift-console/start');

  const spotlight = page.locator('.academy-guidance__spotlight');
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) !== 'true') await workloads.click();
  await page.getByRole('link', { name: 'Deployments', exact: true }).click();

  const networking = page.locator('[data-quickstart-id="qs-nav-networking"]');
  if ((await networking.getAttribute('aria-expanded')) !== 'true') await networking.click();
  const services = page.getByRole('link', { name: 'Services', exact: true });
  await expectSpotlightOn(spotlight, services);

  await workloads.click();
  await expect(spotlight).toHaveCount(0);
  await workloads.click();
  await expect(spotlight).toHaveCount(0);

  await networking.click();
  await expectSpotlightOn(spotlight, services);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('presents the A06 namespace-isolation tour', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/lessons/lab-a06-namespace-isolation-timed/start');

  const bubble = page.locator('.academy-guidance__bubble');
  for (const title of [
    'Open Workloads',
    'Open ConfigMaps across projects',
    'Open the project selector',
    'Filter for the portal namespace',
    'Select dcs-academy-portal',
    'Open kube-root-ca.crt in dcs-academy-portal',
    'Open the project selector again',
    'Filter for the plugin namespace',
    'Select academy-console-plugin',
    'Filter for kube-root-ca.crt',
    'Open kube-root-ca.crt in academy-console-plugin'
  ]) {
    await expect(bubble).toContainText(title, { timeout: 8_000 });
  }
  await expect(page).toHaveURL(
    /\/k8s\/ns\/academy-console-plugin\/configmaps\/kube-root-ca\.crt$/,
    { timeout: 8_000 }
  );
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);
});

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
  const guidanceBubble = page.locator('.academy-guidance__bubble');
  await expect(stopLesson).toBeVisible();

  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  await expect(workloads).toBeVisible();
  if (await guidanceBubble.getByText('Open Pods', { exact: true }).isVisible().catch(() => false)) {
    await workloads.click();
    await expect(workloads).toHaveAttribute('aria-expanded', 'false');
    await expect(guidanceBubble).toContainText('Open Workloads');
  } else {
    await expect(guidanceBubble).toContainText('Open Workloads');
  }
  await workloads.click();
  await expect(workloads).toHaveAttribute('aria-expanded', 'true');
  await expect(guidanceBubble).toContainText('Open Pods');

  const pods = page.getByRole('link', { name: 'Pods', exact: true });
  await expect(pods).toBeVisible();
  await pods.click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(guidanceBubble).toContainText('Open the Academy database pod');

  const databasePod = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1"]'
  );
  await expect(databasePod).toBeVisible();
  await databasePod.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1$/);
  await expect(guidanceBubble).toContainText('Inspect the logs');

  const logs = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/logs"]'
  );
  await expect(logs).toBeVisible();
  await logs.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/logs$/);
  await expect(guidanceBubble).toContainText('Open the container terminal');

  const terminal = page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/terminal"]'
  );
  await expect(terminal).toBeVisible();
  await terminal.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
  await expect(guidancePanel).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem('academy-guidance.active-module')
  )).toBeNull();

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

  await expect(stopLesson).toHaveCount(0);
});

test('performs the Continue-driven presentation and verifies every step', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-manual/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const guidanceBubble = page.locator('.academy-guidance__bubble');
  const spotlight = page.locator('.academy-guidance__spotlight');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(guidanceBubble).toContainText('Open Workloads');
  await expect(spotlight).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(guidanceBubble).toContainText('Open Pods');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  )).toBe(1);
  const podsTarget = page.getByRole('link', { name: 'Pods', exact: true });
  await expect(podsTarget).toBeVisible();
  await expect(spotlight).toBeVisible();
  await expectSpotlightOn(spotlight, podsTarget);
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(guidanceBubble).toContainText('Open the Academy database pod');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1$/);
  await expect(guidanceBubble).toContainText('Inspect the logs');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/logs$/);
  await expect(guidanceBubble).toContainText('Open the container terminal');
  await continueButton.click();
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
  await expect(guidancePanel).toHaveCount(0);
});

test('performs the timed presentation and verifies every step', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-timed/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const guidanceBubble = page.locator('.academy-guidance__bubble');
  await expect(guidanceBubble).toContainText('Open Workloads');
  await expect(guidanceBubble).toContainText(/Continuing in \d+s/);
  const initialCountdown = Number(
    (await guidanceBubble.textContent())?.match(/Continuing in (\d+)s/)?.[1]
  );
  await expect.poll(async () => Number(
    (await guidanceBubble.textContent())?.match(/Continuing in (\d+)s/)?.[1]
  )).toBeLessThan(initialCountdown);
  await expect(guidanceBubble).toContainText('Open Pods', { timeout: 8_000 });
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  )).toBe(1);
  await expectSpotlightOn(
    page.locator('.academy-guidance__spotlight'),
    page.getByRole('link', { name: 'Pods', exact: true })
  );
  await expect(guidanceBubble).toContainText('Open the Academy database pod', { timeout: 8_000 });
  await expect(guidanceBubble).toContainText('Inspect the logs', { timeout: 8_000 });
  await expect(guidanceBubble).toContainText('Open the container terminal', { timeout: 8_000 });
  await expect(guidancePanel).toHaveCount(0, { timeout: 8_000 });
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
});

test('restarts the Continue presentation cleanly after automatic completion', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-manual/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const guidanceBubble = page.locator('.academy-guidance__bubble');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (const title of [
    'Open Workloads',
    'Open Pods',
    'Open the Academy database pod',
    'Inspect the logs',
    'Open the container terminal'
  ]) {
    await expect(guidanceBubble).toContainText(title);
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
  }
  await expect(guidancePanel).toHaveCount(0);
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
  await expect(guidanceBubble).toContainText('Open Workloads');
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(guidanceBubble).toContainText('Open Pods');
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
  await expect(guidanceBubble).toContainText('Open the Academy database pod');
});

test('restarts the timed presentation after automatic completion with Workloads expanded', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/ns/dcs-academy-portal/core~v1~Pod');
  await expandWorkloads(page);
  await page.goto('/academy/lessons/academy-portal-container-access-timed/start');

  const guidancePanel = page.locator('.academy-guidance__controller');
  const guidanceBubble = page.locator('.academy-guidance__bubble');
  await expect(guidancePanel).toBeVisible();
  await expect(guidancePanel).toHaveCount(0, { timeout: 35_000 });

  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  const home = page.getByRole('button', { name: 'Home', exact: true });
  if ((await home.getAttribute('aria-expanded')) !== 'true') await home.click();
  await page.getByRole('link', { name: 'Academy guidance', exact: true }).click();
  await expect(page).toHaveURL(/\/academy\/guidance$/);
  if ((await workloads.getAttribute('aria-expanded')) !== 'true') await workloads.click();
  await expect(workloads).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', {
    name: 'Start Academy portal container access (presentation: timed)',
    exact: true
  }).click();
  await expect(guidanceBubble).toContainText('Open Workloads');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('academy-guidance.active-module') ?? '{}').step
  ), { timeout: 8_000 }).toBe(1);
  await expect(page).toHaveURL(/\/academy\/guidance$/);
  await expect(guidanceBubble).toContainText('Open Pods');
  await expectSpotlightOn(
    page.locator('.academy-guidance__spotlight'),
    page.getByRole('link', { name: 'Pods', exact: true })
  );
});

test('filters and selects the Academy namespace in assisted mode', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/all-namespaces/core~v1~Pod');
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) === 'true') await workloads.click();
  await page.goto('/academy/lessons/academy-portal-namespace-filter/start');

  const bubble = page.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');
  await workloads.click();
  await expect(bubble).toContainText('Open Pods across all projects');
  await page.getByRole('link', { name: 'Pods', exact: true }).click();
  await expect(bubble).toContainText('Open the project selector');

  const namespaceSelector = page.locator('.co-namespace-dropdown__menu-toggle');
  await namespaceSelector.click();
  await expect(bubble).toContainText('Filter for Academy namespaces');
  const namespaceFilter = page.locator('[data-test="dropdown-text-filter"]');
  await namespaceFilter.fill('academy');
  await expect(bubble).toContainText('Select dcs-academy-portal');
  await page.getByRole('menuitem', { name: 'dcs-academy-portal', exact: true }).click();
  await expect(page).toHaveURL(/\/k8s\/ns\/dcs-academy-portal\/core~v1~Pod$/);
  await expect(bubble).toContainText('Open the Academy database pod');

  await page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1"]'
  ).click();
  await expect(bubble).toContainText('Inspect the logs');
  await page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/logs"]'
  ).click();
  await expect(bubble).toContainText('Open the container terminal');
  await page.locator(
    'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/terminal"]'
  ).click();
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);
});

test('filters and selects the Academy namespace in Continue mode', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/all-namespaces/core~v1~Pod');
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) === 'true') await workloads.click();
  await page.goto('/academy/lessons/academy-portal-namespace-filter-manual/start');

  const bubble = page.locator('.academy-guidance__bubble');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (const title of [
    'Open Workloads',
    'Open Pods across all projects',
    'Open the project selector',
    'Filter for Academy namespaces',
    'Select dcs-academy-portal',
    'Open the Academy database pod',
    'Inspect the logs',
    'Open the container terminal'
  ]) {
    await expect(bubble).toContainText(title);
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
  }
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/);
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);
});

test('filters and selects the Academy namespace in timed mode', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/k8s/all-namespaces/core~v1~Pod');
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) === 'true') await workloads.click();
  await page.goto('/academy/lessons/academy-portal-namespace-filter-timed/start');

  const bubble = page.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');
  await expect(bubble).toContainText('Open Pods across all projects', { timeout: 8_000 });
  await expect(bubble).toContainText('Open the project selector', { timeout: 8_000 });
  await expect(bubble).toContainText('Filter for Academy namespaces', { timeout: 8_000 });
  await expect(bubble).toContainText('Select dcs-academy-portal', { timeout: 8_000 });
  await expect(bubble).toContainText('Open the Academy database pod', { timeout: 8_000 });
  await expect(bubble).toContainText('Inspect the logs', { timeout: 8_000 });
  await expect(bubble).toContainText('Open the container terminal', { timeout: 8_000 });
  await expect(page).toHaveURL(/\/pods\/dcs-academy-portal-db-1\/terminal$/, { timeout: 8_000 });
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);
});
