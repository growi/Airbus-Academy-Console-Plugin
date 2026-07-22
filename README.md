# Academy Guidance Console Plugin PoC

This is a multi-target OpenShift dynamic console plugin that demonstrates guidance behavior
which cannot be expressed by a native `ConsoleQuickStart`:

- unconditional highlighting of console elements carrying `data-quickstart-id`;
- an anchored guidance bubble for step instructions and presentation controls;
- a stable workflow panel for progress, console state, and stopping the lesson;
- opening console pages through the router;
- switching route-backed resource tabs;
- reading the current route, perspective, namespace, active tab, target availability,
  and live module-defined resource phase.
- running a persistent route-aware lesson that advances when the user opens Workloads,
  the known database pod, Logs, and Terminal.

## Tour catalog

The Academy guidance page renders every registered module from `trainingModuleCatalog`. Its
responsive list shows the module title, short description, inferred guidance mode, step count, and
an explicit Start action. Users can search titles and descriptions or filter by Assisted,
Continue, and Timed mode. Adding a module to `src/modules/catalog.ts` automatically adds it to this
page; no separate page configuration is required.

## Training modules

Training content is separate from the engine under `src/modules/`. A module defines its title,
purpose, completion text, and ordered steps. Each step provides:

- a short title;
- explanatory guidance describing what to do, why it matters, and how to proceed;
- a trusted highlight target: a Quick Start ID, exact console link, or target-adapter element;
- a completion transaction containing an operation, optional presentation policy, and independent
  verification condition.

`module.schema.json` documents the authoring contract and enables editor validation. Add a module
JSON file and register it in `src/modules/catalog.ts`; arbitrary selectors are not accepted from
URLs.

The renderer deliberately separates transient step guidance from persistent workflow state. The
spotlight and guidance bubble share one target measurement observer, while the workflow panel
remains fixed during console navigation. If a target temporarily disappears, the bubble is hidden
and the workflow panel reports that it is waiting for the console element.

### Build a new module

1. Copy `src/modules/academy-portal-container-access.json` to a new file in `src/modules/`.
2. Give the module a unique lowercase `id` containing only letters, numbers, and hyphens.
3. Write the module-level `title`, `description`, and `completionText`.
4. Define `context.primaryResource` and its entry in `context.resources`. The engine uses its
   Kubernetes identity for the live watch and its console paths for resource navigation controls.
5. Define the ordered `steps`. Each description should tell the learner what to do, why the
   action matters, and how to recognize or perform it.
6. Import and register the module in `src/modules/catalog.ts`.
7. Build every supported target with `bin/pluginctl build ocp-4.20` and
   `bin/pluginctl build ocp-4.22`.
8. Deploy the new image and test both the guidance page and external launch URL.

Minimal module example:

```json
{
  "$schema": "./module.schema.json",
  "id": "inspect-example-pod",
  "title": "Inspect an example pod",
  "description": "Learn how to find and inspect a running pod.",
  "completionText": "Lesson complete.",
  "context": {
    "primaryResource": "examplePod",
    "resources": {
      "examplePod": {
        "apiVersion": "v1",
        "kind": "Pod",
        "label": "Example pod",
        "listPath": "/k8s/ns/example/core~v1~Pod",
        "name": "example-pod",
        "namespace": "example",
        "consolePath": "/k8s/ns/example/pods/example-pod",
        "tabs": {
          "logs": "/k8s/ns/example/pods/example-pod/logs",
          "terminal": "/k8s/ns/example/pods/example-pod/terminal"
        }
      }
    }
  },
  "steps": [
    {
      "id": "open-workloads",
      "title": "Open Workloads",
      "description": "Expand Workloads to access the resource pages used to inspect running applications.",
      "target": {
        "type": "quickStartId",
        "value": "qs-nav-workloads"
      },
      "complete": {
        "operation": { "type": "activateTarget" },
        "verify": {
          "type": "targetAttribute",
          "attribute": "aria-expanded",
          "value": "true"
        }
      }
    },
    {
      "id": "open-pods",
      "title": "Open Pods",
      "description": "Open the Pods page to view the workload instances running in the selected project.",
      "target": {
        "type": "href",
        "value": "/k8s/ns/example/core~v1~Pod"
      },
      "complete": {
        "operation": {
          "type": "navigate",
          "path": "/k8s/ns/example/core~v1~Pod"
        },
        "presentation": { "initiator": "continue" },
        "verify": {
          "type": "route",
          "path": "/k8s/ns/example/core~v1~Pod"
        }
      }
    }
  ]
}
```

Register it in `src/modules/catalog.ts`:

```ts
import inspectExamplePod from './inspect-example-pod.json';

const modules = [
  academyPortalContainerAccess as TrainingModule,
  inspectExamplePod as TrainingModule
];
```

Supported targets:

- `quickStartId` highlights an element carrying the corresponding `data-quickstart-id`.
- `href` highlights an anchor with the exact console-relative URL.
- `consoleElement` resolves a named semantic console control through the selected OpenShift target
  adapter. The current adapters provide `namespaceSelector`, `namespaceFilter`, and
  `namespaceOption`; the latter takes the exact option text in `value`.

Supported operations:

- `activateTarget` activates the highlighted console control.
- `navigate` opens the configured console-relative path through the target router adapter.
- `fillTarget` enters its configured `value` into the highlighted input using the browser's native
  input contract.

If `presentation` is omitted, the learner performs the operation and the engine only verifies it.
`initiator: continue` shows a Continue button and `initiator: timer` performs the operation after a
validated duration such as `500ms` or `5s`, with a visible countdown. Every workflow stops and
clears its persisted session automatically when its final verification succeeds.

Supported verification conditions:

- `targetAttribute` advances only when the highlighted target has the configured attribute value.
  Use this for controls such as expandable navigation sections, where a click alone does not prove
  that the required state was reached.
- `route` advances when the browser reaches the configured exact path.
- `targetValue` advances when the highlighted input contains the configured exact value.
- `namespace` advances when the current console route is scoped to the configured namespace.

The three Academy portal examples demonstrate the supported policies:

- `academy-portal-container-access` is assisted.
- `academy-portal-container-access-manual` performs each operation after Continue.
- `academy-portal-container-access-timed` performs each operation after five seconds.

The namespace-selector examples add semantic console controls and non-click input operations:

- `academy-portal-namespace-filter` is assisted.
- `academy-portal-namespace-filter-manual` performs each operation after Continue.
- `academy-portal-namespace-filter-timed` performs each operation after five seconds.

Presentation variants can share the assisted module definition. Use
`createPresentationVariant` from `src/modules/variants.ts` to add a Continue or timed presentation
policy to every step while keeping targets, operations, verification, and guidance text together.

Do not put CSS selectors or executable behavior in external links. The launcher accepts only a
registered module ID and resolves all behavior from the trusted module catalog.

## External lesson links

Any trusted application can start a registered module by linking to:

```text
https://<console-host>/academy/lessons/<module-id>/start
```

For this PoC:

```text
https://<console-host>/academy/lessons/academy-portal-container-access/start
```

After console authentication, the launcher resolves the module ID, starts the lesson, and stores
progress in `sessionStorage`. The persistent guidance controller remains active as the user leaves
the launcher and navigates through the console. Progress is isolated to the current browser tab.

The implementation does not fork or patch the OpenShift console. A
`console.context-provider` keeps the guidance engine and floating controller mounted while
the user navigates. The plugin is independently built, served, registered through a
`ConsolePlugin`, and enabled in `Console.operator.openshift.io/cluster`.

## Target structure

The lesson engine, module catalog, and UI are shared under `src/`. Version-specific dependency
manifests plus route, navigation, and semantic-element adapters live under `targets/<target>/`. Deployment overlays under
`deploy/overlays/<target>/` select an explicitly versioned image tag for the same target.

| Target | OpenShift versions | React/router generation | Image tag |
| --- | --- | --- | --- |
| `ocp-4.20` | 4.20-4.21 | React 17 / Router 5 | `academy-guidance:0.1.0-ocp4.20` |
| `ocp-4.22` | 4.22-4.23 | React 18 / Router 7 | `academy-guidance:0.1.0-ocp4.22` |

`bin/pluginctl` creates an ignored `.build/<target>/` directory by combining the shared source,
the selected target adapter, and that target's locked dependency manifests. This keeps generated
build contexts and installed dependencies out of the source tree.

List the supported targets and their image tags:

```bash
bin/pluginctl list
```

## Compatibility boundary

Navigation and Kubernetes state use supported console SDK APIs. Unconditional highlighting
uses console DOM attributes because the SDK does not expose a programmatic spotlight API.
Version-specific selectors are isolated in `targets/<target>/elements.ts`, while the shared
measurement and workflow behavior remains in `GuidanceContext.tsx`. These adapters must be
regression-tested for every OpenShift minor release. They do not modify core console code, but are
coupled to rendered console markup.

Each target pins the matching `@openshift-console/dynamic-plugin-sdk` generation and declares a
bounded console plugin API range. Add a new target only when a console release requires different
dependencies or adapter behavior; keep lesson functionality in shared source.

## Build and deploy

Build either target from the repository root. The command creates a fresh isolated context, runs
`npm ci`, type checking, and the production build:

```bash
bin/pluginctl build ocp-4.20
bin/pluginctl build ocp-4.22
```

Build explicitly tagged local container images with Podman:

```bash
bin/pluginctl container-build ocp-4.20
bin/pluginctl container-build ocp-4.22
```

Inspect the generated cluster resources without applying them:

```bash
bin/pluginctl render ocp-4.20
bin/pluginctl render ocp-4.22
```

Deploy the one target matching the cluster version:

```bash
bin/pluginctl deploy ocp-4.20
# or
bin/pluginctl deploy ocp-4.22
```

The deploy command applies the target overlay, assembles its isolated binary build context, starts
the OpenShift build, and waits for the deployment rollout. The deployment has an ImageStream
trigger, so the explicitly tagged successful build automatically rolls out.

Enable the plugin without replacing any existing plugins:

```bash
current=$(oc get console.operator.openshift.io cluster \
  -o jsonpath='{.spec.plugins}' | tr -d '[],' || true)
if ! oc get console.operator.openshift.io cluster \
  -o jsonpath='{.spec.plugins}' | grep -q 'academy-guidance'; then
  oc patch console.operator.openshift.io cluster --type=json \
    -p='[{"op":"add","path":"/spec/plugins/-","value":"academy-guidance"}]'
fi
```

If `/spec/plugins` does not exist yet, initialize it instead:

```bash
oc patch console.operator.openshift.io cluster --type=merge \
  -p='{"spec":{"plugins":["academy-guidance"]}}'
```

After the console rollout completes, refresh the browser and open
**Home → Academy guidance**.

## End-to-end tests

`tests/e2e/` is an isolated Playwright project that exercises the complete lesson against a live
OpenShift console. It verifies desired-state rollback for the Workloads menu, navigation through
Pods, pod details, Logs, and Terminal, lesson completion and stopping, and guards against excessive
DOM mutation or long browser tasks.

Install the test dependencies and managed Firefox once:

```bash
cd tests/e2e
npm ci
npx playwright install firefox
```

Run the suite with a test account that can read the Academy pod and open its terminal:

```bash
CONSOLE_URL='https://console-openshift-console.apps.example.com' \
CONSOLE_USERNAME='kubeadmin' \
CONSOLE_PASSWORD='<password>' \
npm test
```

`CONSOLE_USERNAME` defaults to `kubeadmin`. Use `npm run test:headed` for an interactive browser.
The suite accepts the cluster's development certificate, but Firefox may still report expected
CRC WebSocket connection errors; unexpected console errors and all uncaught page errors fail the
test.

## Remove

Disable the plugin before deleting its backend:

```bash
oc patch console.operator.openshift.io cluster --type=json \
  -p='[{"op":"remove","path":"/spec/plugins/0"}]'
oc delete -k deploy/overlays/ocp-4.20
# or
oc delete -k deploy/overlays/ocp-4.22
```

The removal command assumes the PoC is the first enabled plugin. For a shared cluster,
remove the array element matching `academy-guidance` instead of using a fixed index.
