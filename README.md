# Academy Guidance Console Plugin PoC

This is a multi-target OpenShift dynamic console plugin that demonstrates guidance behavior
which cannot be expressed by a native `ConsoleQuickStart`:

- unconditional highlighting of console elements carrying `data-quickstart-id`;
- opening console pages through the router;
- switching route-backed resource tabs;
- reading the current route, perspective, namespace, active tab, target availability,
  and live Academy database pod phase.
- running a persistent route-aware lesson that advances when the user opens Workloads,
  the known database pod, Logs, and Terminal.

## Training modules

Training content is separate from the engine under `src/modules/`. A module defines its title,
purpose, completion text, and ordered steps. Each step provides:

- a short title;
- explanatory guidance describing what to do, why it matters, and how to proceed;
- a trusted highlight target, currently a Quick Start ID or exact console link;
- a click or route completion condition.

`module.schema.json` documents the authoring contract and enables editor validation. Add a module
JSON file and register it in `src/modules/catalog.ts`; arbitrary selectors are not accepted from
URLs.

### Build a new module

1. Copy `src/modules/academy-portal-container-access.json` to a new file in `src/modules/`.
2. Give the module a unique lowercase `id` containing only letters, numbers, and hyphens.
3. Write the module-level `title`, `description`, and `completionText`.
4. Define the ordered `steps`. Each description should tell the learner what to do, why the
   action matters, and how to recognize or perform it.
5. Import and register the module in `src/modules/catalog.ts`.
6. Build every supported target with `bin/pluginctl build ocp-4.20` and
   `bin/pluginctl build ocp-4.22`.
7. Deploy the new image and test both the guidance page and external launch URL.

Minimal module example:

```json
{
  "$schema": "./module.schema.json",
  "id": "inspect-example-pod",
  "title": "Inspect an example pod",
  "description": "Learn how to find and inspect a running pod.",
  "completionText": "Lesson complete.",
  "steps": [
    {
      "id": "open-workloads",
      "title": "Open Workloads",
      "description": "Expand Workloads to access the resource pages used to inspect running applications.",
      "target": {
        "type": "quickStartId",
        "value": "qs-nav-workloads"
      },
      "completeWhen": {
        "type": "targetAttribute",
        "attribute": "aria-expanded",
        "value": "true"
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
      "completeWhen": {
        "type": "route",
        "value": "/k8s/ns/example/core~v1~Pod"
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

Supported completion conditions:

- `targetAttribute` advances only when the highlighted target has the configured attribute value.
  Use this for controls such as expandable navigation sections, where a click alone does not prove
  that the required state was reached.
- `route` advances when the browser reaches the configured exact path.

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
manifests and the small router adapter live under `targets/<target>/`. Deployment overlays under
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
uses the console's `data-quickstart-id` DOM attributes because the SDK does not expose a
programmatic spotlight API. That part is intentionally isolated in `GuidanceContext.tsx`
and must be regression-tested for every OpenShift minor release. It does not modify core
console code, but it is coupled to rendered console markup.

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
