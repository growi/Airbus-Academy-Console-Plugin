// Run with: node --test 'tests/unit/*.test.ts'
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeNamespaceParameters,
  isAllowedReturnUrl,
  portalCatalogUrl,
  resolveLab,
  sanitizeLabParameters
} from '../../src/modules/labContent.ts';
import type { ConsoleLabResource } from '../../src/modules/types.ts';

const lab = (spec: Partial<ConsoleLabResource['spec']> = {}): ConsoleLabResource => ({
  metadata: { name: 'demo-lab' },
  spec: {
    title: 'Demo',
    description: 'Demo lab',
    steps: [
      {
        id: 'open',
        title: 'Open the pod',
        description: 'Open <<podName>>',
        target: { type: 'href', value: '/k8s/ns/<<namespace>>/pods/<<podName>>' },
        complete: {
          operation: { type: 'navigate', path: '/k8s/ns/<<namespace>>/pods/<<podName>>' },
          verify: { type: 'route', path: '/k8s/ns/<<namespace>>/pods/<<podName>>' }
        }
      }
    ],
    ...spec
  }
});

test('substitutes every template parameter and applies spec defaults', () => {
  const { module, missingParameters } = resolveLab(lab(), {
    namespace: 'lab-user-17',
    podName: 'web-1'
  });
  assert.deepEqual(missingParameters, []);
  assert.equal(module?.id, 'demo-lab');
  assert.equal(module?.visibility, 'default');
  assert.equal(module?.mode, 'assisted');
  assert.equal(module?.timerDelay, '5s');
  assert.equal(module?.completionText, 'Lesson complete.');
  assert.equal(module?.steps[0].description, 'Open web-1');
  assert.equal(
    module?.steps[0].complete.verify.type === 'route' && module.steps[0].complete.verify.path,
    '/k8s/ns/lab-user-17/pods/web-1'
  );
});

test('a lab with an unsupplied parameter does not resolve', () => {
  const { module, missingParameters } = resolveLab(lab(), { namespace: 'demo' });
  assert.equal(module, undefined);
  assert.deepEqual(missingParameters, ['podName']);

  assert.deepEqual(resolveLab(undefined, {}), { missingParameters: [] });
  assert.deepEqual(resolveLab(lab({ steps: [] }), {}), { missingParameters: [] });
});

test('launch parameters are validated, aliased, and reserved keys are ignored', () => {
  assert.deepEqual(sanitizeLabParameters('?ns=lab-user-17&podName=web-1'), {
    namespace: 'lab-user-17',
    podName: 'web-1'
  });
  // Reserved engine keys never become template parameters.
  assert.deepEqual(
    sanitizeLabParameters('?mode=timed&returnUrl=https://academy.example.com/x'),
    {}
  );
  // Values that could break out of a path or the lab JSON are dropped, not substituted.
  for (const search of [
    '?ns=bad"value',
    '?ns=bad\\value',
    '?ns=<script>',
    '?ns=with space',
    '?ns=' // empty
  ]) {
    assert.deepEqual(sanitizeLabParameters(search), {}, search);
  }
  assert.deepEqual(sanitizeLabParameters('?1bad=x&also-bad=y'), {});
});

test('the active project is only used when it is a namespace name', () => {
  assert.deepEqual(activeNamespaceParameters('demo-ns'), { namespace: 'demo-ns' });
  assert.deepEqual(activeNamespaceParameters('#ALL_NS#'), {});
  assert.deepEqual(activeNamespaceParameters(''), {});
  assert.deepEqual(activeNamespaceParameters(undefined), {});
});

test('returnUrl is honoured only for the configured portal origin', () => {
  const portal = 'https://academy.apps.example.com';
  assert.ok(isAllowedReturnUrl(`${portal}/labs/console`, portal));
  assert.ok(isAllowedReturnUrl(`${portal}:443/labs`, portal)); // :443 is the same https origin
  assert.ok(!isAllowedReturnUrl(`${portal}:8443/labs`, portal)); // a different port is not
  assert.ok(!isAllowedReturnUrl('https://evil.example.com/labs', portal));
  assert.ok(!isAllowedReturnUrl('javascript:alert(1)', portal));
  assert.ok(!isAllowedReturnUrl('//evil.example.com', portal));
  assert.ok(!isAllowedReturnUrl(`${portal}/labs`, '')); // no portal configured
  assert.ok(!isAllowedReturnUrl('', portal));
});

test('the catalog link preselects the portal filter for console labs', () => {
  assert.equal(
    portalCatalogUrl('https://academy.apps.example.com'),
    'https://academy.apps.example.com/?format=console'
  );
  // An existing query string is kept; an existing format is replaced, not duplicated.
  assert.equal(
    portalCatalogUrl('https://academy.example.com/?track=console&format=terminal'),
    'https://academy.example.com/?track=console&format=console'
  );
  // A portalUrl the settings got wrong still yields a usable link.
  assert.equal(portalCatalogUrl('not a url'), 'not a url');
  assert.equal(portalCatalogUrl(''), '');
});
