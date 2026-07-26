import { expect, type Page, test } from '@playwright/test';

// Reproduces a portal launch: the console is already scoped to an unrelated project
// (a leftover selection from another tab), and the lab must move it to its own
// session namespace before guiding the learner.
const SESSION_NS = process.env.ACADEMY_NAMESPACE ?? 'lab-u01-container-access-01';
const POD = process.env.ACADEMY_POD ?? 'lab-app';
const OTHER_NS = process.env.ACADEMY_OTHER_NAMESPACE ?? 'dcs-academy-portal';
const PORTAL = 'https://academy.apps-crc.testing';

const login = async (page: Page) => {
  const password = process.env.CONSOLE_PASSWORD;
  if (!password) throw new Error('CONSOLE_PASSWORD is required');
  await page.goto('/academy/guidance');
  const provider = page.getByText('kube:admin', { exact: false });
  if (await provider.isVisible().catch(() => false)) await provider.click();
  const usernameInput = page.getByRole('textbox', { name: 'Username' });
  const visible = await usernameInput
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await usernameInput.fill(process.env.CONSOLE_USERNAME ?? 'kubeadmin');
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL(/\/academy\/guidance/);
};

test('a portal launch scopes the console to the lab namespace and returns on Finish', async ({
  page
}) => {
  await login(page);
  await page.evaluate(() => sessionStorage.clear());

  // Select a DIFFERENT project first — this is the reported bug: the lab ran in
  // whatever project the console was already scoped to.
  await page.goto(`/k8s/ns/${OTHER_NS}/core~v1~ConfigMap`);
  await expect(page).toHaveURL(new RegExp(`/k8s/ns/${OTHER_NS}/`));

  const returnUrl = `${PORTAL}/lab/lab-u01-container-access/complete?session=lab-u01-container-access-01`;
  await page.goto(
    `/academy/lessons/lab-u01-container-access/start?ns=${SESSION_NS}&podName=${POD}` +
      `&returnUrl=${encodeURIComponent(returnUrl)}`
  );
  await expect(page.getByText('Lab started')).toBeVisible();

  // Continue, or Next on a read-this step — the same button, relabelled.
  const continueButton = page.getByRole('button', { name: /^(Continue|Next)$/ }).first();
  await continueButton.click();                       // Open Workloads
  await continueButton.click();                       // Open Pods

  // The list must be the LAB's namespace, not the previously selected one.
  await expect(page).toHaveURL(new RegExp(`/k8s/ns/${SESSION_NS}/(core~v1~Pod|pods)`));
  await expect(page).not.toHaveURL(new RegExp(`/k8s/ns/${OTHER_NS}/`));

  // Through the rest of the lab: the pod list, the pod, its containers, logs and terminal,
  // each navigation step followed by the step that explains what it opened.
  for (let step = 0; step < 7; step += 1) await continueButton.click();
  await expect(page).toHaveURL(new RegExp(`/k8s/ns/${SESSION_NS}/pods/${POD}/terminal`));

  const panel = page.locator('.academy-guidance__controller');
  await expect(panel).toContainText('a shell in its container');

  // Finish must hand control back to the portal, not just dismiss the panel.
  const finish = page.getByRole('button', { name: 'Finish and return to the Academy' });
  await expect(finish).toBeVisible();

  // Assert on the navigation the plugin performs. The portal has no session for this
  // test browser and answers with an OAuth redirect that keeps `next` server-side, so
  // the final URL no longer names the completion route — the request does.
  const completion = page.waitForRequest(
    (request) => request.url().includes('/lab/lab-u01-container-access/complete'),
    { timeout: 15_000 }
  );
  await finish.click();
  const request = await completion;
  expect(request.url()).toContain('session=lab-u01-container-access-01');
  expect(new URL(request.url()).host).toBe('academy.apps-crc.testing');
  await page.waitForURL((url) => !url.host.startsWith('console-'), { timeout: 15_000 });
});
