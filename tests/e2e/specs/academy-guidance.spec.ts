import { expect, type Locator, type Page, test } from '@playwright/test';

// Lab content lives in the cluster (oc apply -k labs/), so the suite is parameterized by the
// namespace it runs against rather than by a lab that hardcodes one.
const NAMESPACE = process.env.ACADEMY_NAMESPACE ?? 'dcs-academy-portal';
const POD = process.env.ACADEMY_POD ?? 'dcs-academy-portal-db-1';
const SESSION_KEY = 'academy-guidance.active-lab';

const AREA_STEPS = [
  'Open Workloads',
  'Open Deployments',
  'Open Networking',
  'Open Services',
  'Open Storage',
  'Open PersistentVolumeClaims',
  'Open ConfigMaps'
];

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

/** Starts a lesson from a clean session with the console scoped to the lab namespace. */
const startLab = async (page: Page, path: string) => {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/k8s/ns/${NAMESPACE}/core~v1~ConfigMap`);
  await page.goto(path);
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

const storedStep = (page: Page) =>
  page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}').step, SESSION_KEY);

test('lists the default labs, searches them, and links to the Academy portal', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/academy/guidance');

  const labs = page.getByRole('list', { name: 'Academy labs' });
  await expect(labs.getByRole('listitem')).toHaveCount(2);
  // Hidden labs exist in the cluster but must never be listed.
  await expect(labs).not.toContainText('Inspect and enter a running container');
  await expect(labs).not.toContainText('See the namespace boundary');

  const search = page.getByRole('textbox', { name: 'Search labs' });
  await search.fill('resource areas');
  await expect(labs.getByRole('listitem')).toHaveCount(1);
  await search.fill('does not exist');
  await expect(page.getByText('No matching labs', { exact: true })).toBeVisible();
  await search.fill('');

  await expect(
    page.getByRole('link', { name: /Want more labs\? Check out the DCS Academy/ })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start Find your way around the console' }).click();
  await expect(page.locator('.academy-guidance__controller')).toContainText('Step 1 of 5');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('advances an assisted lab from the learner\'s own console clicks', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installPerformanceProbe(page);
  await login(page);
  await startLab(page, `/academy/lessons/tour-console-areas/start?ns=${NAMESPACE}`);

  const panel = page.locator('.academy-guidance__controller');
  const bubble = page.locator('.academy-guidance__bubble');
  await expect(panel).toBeVisible();
  await expect(bubble).toContainText('Open Workloads');

  // The guard below is about the running lab, not about console boot: a page load that races a
  // plugin rollout logs manifest/Bad Gateway errors for every enabled plugin. The lab is proven
  // loaded by the assertion above, so start counting from here.
  consoleErrors.length = 0;

  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) === 'true') await workloads.click();
  await workloads.click();
  await expect(bubble).toContainText('Open Deployments');

  // The reported bug: the console navigates to its legacy /deployments URL while the lab
  // declares apps~v1~Deployment, so a literal path comparison never completed this step.
  await page.getByRole('link', { name: 'Deployments', exact: true }).click();
  await expect(bubble).toContainText('Open Networking');

  const networking = page.locator('[data-quickstart-id="qs-nav-networking"]');
  if ((await networking.getAttribute('aria-expanded')) !== 'true') await networking.click();
  await page.getByRole('link', { name: 'Services', exact: true }).click();
  await expect(bubble).toContainText('Open Storage');

  const storage = page.locator('[data-quickstart-id="qs-nav-storage"]');
  if ((await storage.getAttribute('aria-expanded')) !== 'true') await storage.click();
  await page.getByRole('link', { name: 'PersistentVolumeClaims', exact: true }).click();
  await expect(bubble).toContainText('Open ConfigMaps');

  await page.getByRole('link', { name: 'ConfigMaps', exact: true }).click();
  await expect(panel).toContainText('you located the main resource areas');
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY))
    .toBeNull();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(panel).toHaveCount(0);

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
        // Monitoring is disabled on CRC, so the console's Prometheus polling 502s.
        'Unable to fetch pod metrics',
        'Error polling URL: e: Bad Gateway'
      ].some((knownError) => message.includes(knownError))
  );
  expect(unexpectedConsoleErrors).toEqual([]);
});

test('Continue completes every step of an assisted lab without learner navigation', async ({
  page
}) => {
  await login(page);
  await startLab(page, `/academy/lessons/tour-console-areas/start?ns=${NAMESPACE}`);

  const panel = page.locator('.academy-guidance__controller');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (const title of AREA_STEPS) {
    // The step shows in the bubble, or in the panel when its target cannot be measured.
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    // Continue is never disabled — that is the point of the failsafe.
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
  }
  await expect(panel).toContainText('you located the main resource areas');
  // The console appends its own list query parameters (?page=1&perPage=50).
  await expect(page).toHaveURL(
    new RegExp(`/k8s/ns/${NAMESPACE}/(core~v1~ConfigMap|configmaps)(\\?|$)`)
  );
});

test('Back returns to the previous step and does not bounce forward', async ({ page }) => {
  await login(page);
  await startLab(page, `/academy/lessons/tour-console-areas/start?ns=${NAMESPACE}`);

  const bubble = page.locator('.academy-guidance__bubble');
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await expect(bubble).toContainText('Open Workloads');
  await expect(back).toBeDisabled();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(bubble).toContainText('Open Deployments');
  await expect(back).toBeEnabled();

  await back.click();
  await expect(bubble).toContainText('Open Workloads');
  await expect.poll(() => storedStep(page)).toBe(0);
  // Workloads is still expanded, so naive auto-advance would immediately skip forward again.
  await page.waitForTimeout(1_500);
  await expect(bubble).toContainText('Open Workloads');
  expect(await storedStep(page)).toBe(0);
});

test('a timed run performs each step itself and counts down', async ({ page }) => {
  await login(page);
  await startLab(page, '/academy/lessons/tour-console-basics/start?mode=timed');

  const bubble = page.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');
  await expect(bubble).toContainText(/Continuing in \d+s/);
  const initialCountdown = Number(
    (await bubble.textContent())?.match(/Continuing in (\d+)s/)?.[1]
  );
  await expect.poll(async () => Number(
    (await bubble.textContent())?.match(/Continuing in (\d+)s/)?.[1]
  )).toBeLessThan(initialCountdown);

  for (const title of ['Open Networking', 'Open Storage', 'Open Home', 'Open your projects']) {
    await expect(bubble).toContainText(title, { timeout: 12_000 });
  }
  await expect(page.locator('.academy-guidance__controller'))
    .toContainText('find any resource group', { timeout: 12_000 });
});

test('a hidden lab needs its launch parameters and is not listed', async ({ page }) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());

  // No project selected and no ns parameter: the launcher must refuse and say what is missing.
  await page.goto('/k8s/all-namespaces/core~v1~ConfigMap');
  await page.goto('/academy/lessons/lab-container-access/start');
  await expect(page.getByText(/needs launch parameters/)).toContainText('podName');
  await expect(page.locator('.academy-guidance__controller')).toHaveCount(0);

  await page.goto('/academy/lessons/does-not-exist/start');
  await expect(page.getByText(/was not found on this cluster/)).toBeVisible();

  await page.goto(
    `/academy/lessons/lab-container-access/start?ns=${NAMESPACE}&podName=${POD}`
  );
  await expect(page.getByText('Lab started')).toBeVisible();
  const bubble = page.locator('.academy-guidance__bubble');
  await expect(bubble).toContainText('Open Workloads');

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (const title of [
    'Open Workloads',
    'Open Pods',
    'Open the lab pod',
    'Inspect the logs',
    'Open the container terminal'
  ]) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await continueButton.click();
  }
  await expect(page).toHaveURL(new RegExp(`/pods/${POD}/terminal$`));
  await expect(page.locator('.academy-guidance__controller'))
    .toContainText('the pod terminal is open');
});

test('offers a return link only for the configured portal origin', async ({ page }) => {
  await login(page);
  const portalUrl = await page.evaluate(async () => {
    const response = await fetch(
      '/api/kubernetes/apis/academy.dcs/v1alpha1/academysettings/cluster',
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return '';
    return (await response.json())?.spec?.portalUrl ?? '';
  });
  test.skip(!portalUrl, 'AcademySettings/cluster has no portalUrl on this cluster');

  await startLab(
    page,
    `/academy/lessons/tour-console-basics/start?returnUrl=${encodeURIComponent(portalUrl)}/labs`
  );
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  for (let step = 0; step < 5; step += 1) await continueButton.click();
  const panel = page.locator('.academy-guidance__controller');
  await expect(panel.getByRole('link', { name: 'Return to the Academy' })).toHaveAttribute(
    'href',
    `${portalUrl}/labs`
  );
  await page.getByRole('button', { name: 'Finish', exact: true }).click();

  // A returnUrl on another origin is ignored.
  await startLab(
    page,
    '/academy/lessons/tour-console-basics/start?returnUrl=https://example.invalid/steal'
  );
  for (let step = 0; step < 5; step += 1) await continueButton.click();
  await expect(panel.getByRole('link', { name: 'Return to the Academy' })).toHaveCount(0);
});

test('keeps the spotlight aligned while navigation menus move or hide its target', async ({
  page
}) => {
  await login(page);
  await startLab(page, `/academy/lessons/tour-console-areas/start?ns=${NAMESPACE}`);

  const spotlight = page.locator('.academy-guidance__spotlight');
  const bubble = page.locator('.academy-guidance__bubble');
  const workloads = page.locator('[data-quickstart-id="qs-nav-workloads"]');
  if ((await workloads.getAttribute('aria-expanded')) !== 'true') await workloads.click();
  // Drive the lab to the Services step by step; measuring a spotlight mid-transition is what
  // makes this assertion flaky under load.
  await expect(bubble).toContainText('Open Deployments');
  await page.getByRole('link', { name: 'Deployments', exact: true }).click();
  await expect(bubble).toContainText('Open Networking');

  const networking = page.locator('[data-quickstart-id="qs-nav-networking"]');
  if ((await networking.getAttribute('aria-expanded')) !== 'true') await networking.click();
  await expect(bubble).toContainText('Open Services');
  const services = page.getByRole('link', { name: 'Services', exact: true });
  await expectSpotlightOn(spotlight, services);

  await networking.click();
  await expect(spotlight).toHaveCount(0);
  // With no measurable target the workflow panel carries the step and its controls.
  await expect(page.locator('.academy-guidance__controller')).toContainText('Open Services');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();

  await networking.click();
  await expectSpotlightOn(spotlight, services);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});
