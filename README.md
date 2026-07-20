# Academy Guidance Console Plugin PoC

This is an OpenShift 4.22 dynamic console plugin that demonstrates guidance behavior
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
6. Run `npm run typecheck` and `npm run build`.
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
        "type": "click"
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

- `click` advances when the learner clicks the highlighted target.
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

## Compatibility boundary

Navigation and Kubernetes state use supported console SDK APIs. Unconditional highlighting
uses the console's `data-quickstart-id` DOM attributes because the SDK does not expose a
programmatic spotlight API. That part is intentionally isolated in `GuidanceContext.tsx`
and must be regression-tested for every OpenShift minor release. It does not modify core
console code, but it is coupled to rendered console markup.

The PoC pins `@openshift-console/dynamic-plugin-sdk` to `4.22-latest` and declares a
minimum console plugin API of 4.22.

## Build and deploy

From the repository root:

```bash
npm install
npm run typecheck
npm run build

oc apply -k deploy
oc start-build academy-guidance \
  -n academy-console-plugin --from-dir=. --follow
oc rollout status deployment/academy-guidance \
  -n academy-console-plugin --timeout=5m
```

The deployment has an ImageStream trigger, so a successful build automatically rolls out
the newly published image.

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
oc delete -k deploy
```

The removal command assumes the PoC is the first enabled plugin. For a shared cluster,
remove the array element matching `academy-guidance` instead of using a fixed index.
