const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { firefox } = require('@playwright/test');

const baseURL = process.env.CONSOLE_URL;
const username = process.env.CONSOLE_USERNAME ?? 'kubeadmin';
const password = process.env.CONSOLE_PASSWORD;

if (!baseURL || !password) {
  throw new Error('CONSOLE_URL and CONSOLE_PASSWORD are required');
}

const outputDir = path.resolve(__dirname, '../test-results/interactive-reproduction');
fs.rmSync(outputDir, { force: true, recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const diagnostics = [];

const run = async () => {
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    recordVideo: { dir: outputDir, size: { width: 1440, height: 1000 } },
    viewport: { width: 1440, height: 1000 }
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.exposeBinding('recordAcademyDiagnostic', (_source, entry) => {
    diagnostics.push({ recordedAt: new Date().toISOString(), ...entry });
  });
  await page.addInitScript(() => {
    const selectors = {
      workloads: '[data-quickstart-id="qs-nav-workloads"]',
      pods: 'a[href="/k8s/all-namespaces/core~v1~Pod"]',
      pod: 'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1"]',
      logs: 'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/logs"]',
      terminal: 'a[href="/k8s/ns/dcs-academy-portal/pods/dcs-academy-portal-db-1/terminal"]'
    };
    const rectangle = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { height: box.height, width: box.width, x: box.x, y: box.y };
    };
    let previous = '';
    const sample = () => {
      const controller = document.querySelector('.academy-guidance__controller');
      const continueButton = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Continue'
      );
      const snapshot = {
        kind: 'snapshot',
        controllerText: controller?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
        continueDisabled: continueButton ? continueButton.disabled : null,
        path: location.pathname,
        session: sessionStorage.getItem('academy-guidance.active-module'),
        spotlight: rectangle(document.querySelector('.academy-guidance__spotlight')),
        targets: Object.fromEntries(
          Object.entries(selectors).map(([name, selector]) => {
            const element = document.querySelector(selector);
            return [name, {
              ariaExpanded: element?.getAttribute('aria-expanded') ?? null,
              rectangle: rectangle(element),
              visible: Boolean(element && rectangle(element)?.width && rectangle(element)?.height)
            }];
          })
        )
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized !== previous) {
        previous = serialized;
        window.recordAcademyDiagnostic(snapshot);
      }
    };
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button') : null;
      window.recordAcademyDiagnostic({
        kind: 'click',
        href: target?.getAttribute('href') ?? null,
        path: location.pathname,
        text: target?.textContent?.replace(/\s+/g, ' ').trim() ?? null
      });
    }, true);
    window.setInterval(sample, 100);
    sample();
  });

  await page.goto('/academy/guidance');
  const provider = page.getByText('kube:admin', { exact: false });
  if (await provider.isVisible().catch(() => false)) await provider.click();
  const usernameInput = page.getByRole('textbox', { name: 'Username' });
  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/academy\/guidance/);
  }

  process.stdout.write('\nRecorder ready. Reproduce the issue in Firefox, then return here.\n');
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => input.question('Press Enter to stop recording... ', resolve));
  input.close();

  fs.writeFileSync(
    path.join(outputDir, 'diagnostics.json'),
    `${JSON.stringify(diagnostics, null, 2)}\n`
  );
  await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') });
  await context.close();
  await browser.close();
  process.stdout.write(`Artifacts written to ${outputDir}\n`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
