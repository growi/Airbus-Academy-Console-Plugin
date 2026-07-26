import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Walks EVERY hidden lab end to end, driven by the lab's own ConsoleLab CR.
 *
 * The other specs pin one lab each (lab-u01, tour-console-areas) and spell its steps out
 * inline, so a new lab ships with no coverage at all. This spec instead reads each lab
 * from the cluster through the console's Kubernetes proxy and performs the learner action
 * for every step: it asserts the highlighted target actually exists on the page the
 * previous step left behind, and that the lab advances **without pressing Continue** —
 * the two failure modes that strand a learner and that reviewing YAML cannot catch.
 *
 * Add a lab CR, list it in ACADEMY_HIDDEN_LABS, and it is covered.
 *
 *   CONSOLE_URL=https://console-openshift-console.apps-crc.testing \
 *   CONSOLE_PASSWORD=<kubeadmin> \
 *   npx playwright test specs/hidden-labs.spec.ts
 *
 * Env:
 *   ACADEMY_HIDDEN_LABS   comma-separated lab names (default: the core-track u-series)
 *   ACADEMY_NS_SUFFIX     session-namespace suffix (default `-01`, the portal-less convention)
 */
const LABS = (process.env.ACADEMY_HIDDEN_LABS ??
  [
    'lab-u01-container-access',
    'lab-u02-namespace-scope',
    'lab-u03-deployments-rollouts',
    'lab-u04-config-and-secrets',
    'lab-u05-services-and-routes',
    'lab-u06-storage-claims',
    'lab-u07-diagnose-a-pod'
  ].join(',')
)
  .split(',')
  .map((lab) => lab.trim())
  .filter(Boolean);

const NS_SUFFIX = process.env.ACADEMY_NS_SUFFIX ?? '-01';

/** Launch parameters besides `ns`, as the paired Workshop's console-lab-params declares them. */
const LAB_PARAMS: Record<string, (namespace: string) => Record<string, string>> = {
  'lab-u01-container-access': () => ({ podName: process.env.ACADEMY_POD ?? 'lab-app' }),
  'lab-u02-namespace-scope': (namespace) => ({ secondNamespace: `${namespace}-two` })
};

type Target = { type: string; id?: string; value?: string };
type Step = {
  id: string;
  title: string;
  target?: Target;
  complete?: {
    operation?: { type: string; path?: string; value?: string };
    verify?: { type: string };
  };
};
type Lab = { spec: { title: string; completionText?: string; steps: Step[] } };

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

/** The lab content as the cluster holds it — the same CR the plugin reads. */
const fetchLab = async (page: Page, name: string): Promise<Lab> => {
  const response = await page.request.get(
    `/api/kubernetes/apis/academy.dcs/v1alpha1/consolelabs/${name}`
  );
  expect(response.ok(), `ConsoleLab ${name} is not in the cluster (${response.status()})`).toBe(
    true
  );
  return response.json();
};

const substituter = (namespace: string, params: Record<string, string>) => (value?: string) => {
  let out = (value ?? '').replaceAll('<<namespace>>', namespace);
  for (const [key, replacement] of Object.entries(params)) {
    out = out.replaceAll(`<<${key}>>`, replacement);
  }
  return out;
};

/** Lab targets name console text verbatim — "…Secrets (envFrom)" is not a capture group. */
const exactly = (value: string) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** The element the step highlights, resolved the way targets/ocp-4.2x/elements.ts resolves it. */
const targetLocator = (page: Page, target: Target, subst: (v?: string) => string): Locator => {
  if (target.type === 'quickStartId') {
    return page.locator(`[data-quickstart-id="${target.value}"]`);
  }
  if (target.type === 'href') {
    return page.locator(`a[href="${subst(target.value)}"]`).first();
  }
  switch (target.id) {
    case 'navigationLink':
      return page.getByRole('link', { name: target.value ?? '', exact: true }).first();
    case 'namespaceSelector':
      return page
        .locator('.co-namespace-dropdown__menu-toggle, [data-test="namespace-bar-dropdown"] button')
        .first();
    case 'namespaceFilter':
      return page.locator('[data-test="dropdown-text-filter"], .co-namespace-dropdown input').first();
    case 'namespaceOption':
    case 'menuItem':
      return page
        .locator('[data-test="dropdown-menu-item-link"], [role="menuitem"], [role="option"]')
        .filter({ hasText: exactly(subst(target.value)) })
        .first();
    case 'actionsMenu':
      return page.locator('[data-test="actions-menu-button"], [data-test-id="actions-menu-button"]').first();
    case 'revealSecretValues':
      return page.locator('[data-test="reveal-values"], [data-test-id="reveal-values"]').first();
    case 'detailsSection':
      // The engine highlights the block, but the heading is what identifies it — and a Secret's
      // Data heading carries the Reveal values button, so match on the start of the text.
      return page
        .locator('h2.co-section-heading, h2, h3')
        .filter({ hasText: new RegExp(`^${subst(target.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
        .first();
    case 'pageContent':
      return page
        .locator('[role="grid"], .pf-v6-c-table, .co-sysevent-stream, .yaml-editor, .co-m-pane__body')
        .first();
    case 'resourceSearch':
      return page.locator('[data-test="name-filter-input"], .co-text-filter input').first();
    default:
      throw new Error(`unknown consoleElement id: ${target.id}`);
  }
};

/** Do what the learner would do to this element, not what the engine would do for them. */
const act = async (
  page: Page,
  locator: Locator,
  step: Step,
  subst: (v?: string) => string
) => {
  // A read-this step has no console action; Next in the guidance box IS the learner action.
  if (step.complete?.verify?.type === 'acknowledge') {
    await page.getByRole('button', { name: 'Next', exact: true }).first().click();
    return;
  }
  const operation = step.complete?.operation;
  if (operation?.type === 'fillTarget') {
    await locator.fill(subst(operation.value));
    return;
  }
  // A navigation accordion is a toggle: clicking an already-open section closes it, which
  // would hide the next step's link instead of revealing it.
  const expanded = await locator.getAttribute('aria-expanded').catch(() => null);
  if (expanded === 'true') return;
  await locator.click();
};

for (const lab of LABS) {
  test(`${lab} advances through every step from the learner's own actions`, async ({ page }) => {
    const namespace = `${lab}${NS_SUFFIX}`;
    const params = LAB_PARAMS[lab]?.(namespace) ?? {};
    const subst = substituter(namespace, params);

    await login(page);
    const { spec } = await fetchLab(page, lab);

    // Start from an unrelated project, as a portal launch does: the launcher must move the
    // console to the lab's namespace rather than run in whatever was selected.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/k8s/ns/dcs-academy-portal/core~v1~ConfigMap');

    const query = new URLSearchParams({ ns: namespace, ...params }).toString();
    await page.goto(`/academy/lessons/${lab}/start?${query}`);

    const panel = page.locator('.academy-guidance__controller');
    const bubble = page.locator('.academy-guidance__bubble');
    await expect(panel).toBeVisible();

    for (const [index, step] of spec.steps.entries()) {
      // The step is announced in the bubble, or in the panel when its target cannot be
      // measured — either is fine, both must name THIS step.
      await expect(page.getByText(step.title, { exact: true }).first()).toBeVisible();
      expect(step.target, `${lab}/${step.id} has no target`).toBeTruthy();

      const locator = targetLocator(page, step.target!, subst);
      // The strand-the-learner assertion: the highlighted control has to exist on the page
      // the previous step left behind.
      await expect(
        locator,
        `${lab}/${step.id}: target not on the page the previous step ended on`
      ).toBeVisible();
      // Being in the DOM is not enough — a section below the fold is "visible" to Playwright
      // while the engine cannot measure it, and the learner is told to press Continue. The
      // anchored bubble only renders once the target really was measured.
      await expect(
        bubble,
        `${lab}/${step.id}: target found but not measurable — no anchored guidance`
      ).toBeVisible();

      await act(page, locator, step, subst);

      const next = spec.steps[index + 1];
      if (next) {
        await expect(
          page.getByText(next.title, { exact: true }).first(),
          `${lab}/${step.id}: did not advance on its own — Continue would be required`
        ).toBeVisible();
      }
    }

    if (spec.completionText) {
      // Match a distinctive fragment: the CR wraps the text, so whitespace differs.
      const fragment = spec.completionText.split(/\s+/).slice(0, 6).join(' ');
      await expect(panel).toContainText(fragment);
    }

    // Finish ends the portal session, so the completion screen must not be a one-way door:
    // a learner who wants to re-read the last step has to be able to get back to it.
    await page.getByRole('button', { name: 'Back to the last step' }).click();
    const lastStep = spec.steps[spec.steps.length - 1];
    await expect(page.getByText(lastStep.title, { exact: true }).first()).toBeVisible();

    // Continue exists as a failsafe, but this walkthrough must never have needed it.
    await page.getByRole('button', { name: /^(Finish|Stop)/ }).first().click();
  });
}
