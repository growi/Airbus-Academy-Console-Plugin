// Run with: node --test tests/unit/
// Node strips the types itself; no test dependencies and no build step.
import assert from 'node:assert/strict';
import test from 'node:test';

import { pathsMatch, pathVariants } from '../../src/guidance/paths.ts';

test('a GVK list path matches the console legacy plural form', () => {
  assert.ok(pathsMatch('/k8s/ns/demo/deployments', '/k8s/ns/demo/apps~v1~Deployment'));
  assert.ok(pathsMatch('/k8s/ns/demo/configmaps', '/k8s/ns/demo/core~v1~ConfigMap'));
  assert.ok(
    pathsMatch(
      '/k8s/ns/demo/persistentvolumeclaims',
      '/k8s/ns/demo/core~v1~PersistentVolumeClaim'
    )
  );
  assert.ok(pathsMatch('/k8s/ns/demo/networkpolicies', '/k8s/ns/demo/networking.k8s.io~v1~NetworkPolicy'));
  assert.ok(pathsMatch('/k8s/ns/demo/ingresses', '/k8s/ns/demo/networking.k8s.io~v1~Ingress'));
});

test('a detail path matches the legacy form but keeps its namespace', () => {
  assert.ok(
    pathsMatch('/k8s/ns/demo/deployments/web', '/k8s/ns/demo/apps~v1~Deployment/web')
  );
  assert.ok(!pathsMatch('/k8s/ns/other/deployments/web', '/k8s/ns/demo/apps~v1~Deployment/web'));
  assert.ok(!pathsMatch('/k8s/ns/demo/deployments/api', '/k8s/ns/demo/apps~v1~Deployment/web'));
});

test('a list page matches the same list in a wider scope', () => {
  assert.ok(pathsMatch('/k8s/all-namespaces/core~v1~Pod', '/k8s/ns/demo/core~v1~Pod'));
  assert.ok(pathsMatch('/k8s/ns/demo/pods', '/k8s/all-namespaces/core~v1~Pod'));
  assert.ok(!pathsMatch('/k8s/all-namespaces/core~v1~Secret', '/k8s/ns/demo/core~v1~Pod'));
});

test('a list page does NOT match the same list in a different namespace', () => {
  // A portal-launched lab must not advance while the console is scoped to whatever
  // project the user had open before.
  assert.ok(!pathsMatch('/k8s/ns/other/core~v1~Pod', '/k8s/ns/demo/core~v1~Pod'));
  assert.ok(!pathsMatch('/k8s/ns/other/pods', '/k8s/ns/demo/core~v1~Pod'));
  assert.ok(pathsMatch('/k8s/ns/demo/pods', '/k8s/ns/demo/core~v1~Pod'));
});

test('trailing slashes and unrelated paths', () => {
  assert.ok(pathsMatch('/k8s/ns/demo/pods/web/logs/', '/k8s/ns/demo/pods/web/logs'));
  assert.ok(pathsMatch('/academy/guidance', '/academy/guidance'));
  assert.ok(!pathsMatch('/academy/guidance', '/k8s/ns/demo/pods'));
  assert.deepEqual(pathVariants('/academy/guidance'), ['/academy/guidance']);
});
