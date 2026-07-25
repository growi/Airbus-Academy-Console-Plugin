# Academy Guidance Console Plugin PoC

This is a multi-target OpenShift dynamic console plugin that delivers guided labs which cannot be
expressed by a native `ConsoleQuickStart`:

- unconditional highlighting of console elements carrying `data-quickstart-id`;
- an anchored guidance bubble for step instructions, with Back and Continue on every step;
- a stable workflow panel for progress, console state, and stopping the lab;
- opening console pages through the router and switching route-backed resource tabs;
- reading the current route, perspective, namespace, active tab, target availability, and the
  live phase of a lab-defined resource;
- running a persistent route-aware lab that advances as the user navigates the console.

Lab content is **not** part of the plugin image. Labs are `ConsoleLab` custom resources, authored
in `labs/` and synced by ArgoCD, so publishing or editing a lab is a `git push`.

## Lab catalog

**Home → Academy labs** lists every `ConsoleLab` with `spec.visibility: default`. The list shows
title, description, and step count, with **Start lab** (assisted) and **Watch demo** (timed)
actions. Hidden labs never appear here — they are reachable only through a launch URL.

The bottom of the page links to the DCS Academy portal when `AcademySettings.spec.portalUrl` is
configured (see [deploy/academysettings-example.yaml](deploy/academysettings-example.yaml)).

The Academy workshop candidate assessment, recommended delivery order, and production
prerequisites are tracked in [docs/academy-tour-candidates.md](docs/academy-tour-candidates.md).

## Lab content: the ConsoleLab CRD

`ConsoleLab` is cluster-scoped, operator-free catalog data — the same pattern as the Academy
portal's `Track` CRD. The plugin watches it with the logged-in user's own credentials; the
`academy-lab-reader` ClusterRole grants every authenticated user read access to lab content and
plugin settings, and nothing else.

```bash
oc get consolelabs
oc apply -k labs/                  # publish content without touching the plugin
```

A lab defines its title, description, completion text, visibility, mode, and ordered steps:

| Field | Meaning |
| --- | --- |
| `spec.visibility` | `default` (listed in the catalog for anyone) or `hidden` (launch URL only). |
| `spec.mode` | `assisted` (the learner acts, the engine verifies) or `timed` (the engine performs each step). The launch URL and the catalog buttons can override it. |
| `spec.timerDelay` | Countdown before a timed step performs itself, e.g. `5s` or `500ms`. |
| `spec.context` | Optional. Declares the resource whose live phase the workflow panel shows. |
| `spec.steps` | Ordered steps. Each has an `id`, `title`, `description`, `target`, and `complete`. |

Each step provides a short title, guidance describing what to do and why it matters, a trusted
highlight target, and a completion transaction of one operation plus one independent
verification condition.

### Template parameters

Any `{{parameter}}` in the spec is substituted from the launch URL query string when the lab
starts; `ns` is accepted as an alias for `namespace`. A lab that still has an unresolved
parameter does not start — the launcher names what is missing, and the catalog disables its Start
button until a project is selected.

```text
/academy/lessons/lab-container-access/start?ns=lab-user-17&podName=web-1
```

Parameter values are restricted to characters that can appear in a Kubernetes name or console
path; anything else is dropped rather than substituted into a path.

When no `ns` parameter is given, `{{namespace}}` falls back to the project the console is
currently scoped to, which is what makes a default lab usable by any learner in their own
project.

### Default and hidden labs

- **Default** labs teach the console itself and must work for any authenticated user: either use
  no namespaced paths at all (`tour-console-basics`) or template `{{namespace}}`
  (`tour-console-areas`).
- **Hidden** labs run against resources somebody provisioned for the learner. The Academy portal
  creates a namespace, fills it with the lab's fixtures, and links to the lab with the matching
  parameters. `visibility: hidden` keeps them out of the catalog; the actual access boundary is
  namespace RBAC — lab instructions are not secret, and a hidden lab is useless without access to
  the namespace it points at.

### Returning to the portal

A launch URL may carry `returnUrl`. On completion the workflow panel offers **Return to the
Academy**, but only when that URL's origin matches `AcademySettings.spec.portalUrl` — otherwise
any page could hand the console a link that sends learners elsewhere.

```text
/academy/lessons/lab-container-access/start?ns=lab-user-17&podName=web-1&returnUrl=https://academy.apps.example.com/labs/console
```

### Write a new lab

1. Copy a file in `labs/` and give it a new `metadata.name` — that name is the lab ID used in
   launch URLs.
2. Write `spec.title`, `spec.description`, `spec.completionText`, and pick `visibility`/`mode`.
3. Use `{{namespace}}` (and any further parameters) instead of hardcoded namespaces.
4. Define `spec.context` if the workflow panel should watch a resource.
5. Define the ordered `spec.steps`. Each description should tell the learner what to do, why the
   action matters, and how to recognize or perform it.
6. Add the file to `labs/kustomization.yaml` and apply it: `oc apply -k labs/`. No rebuild.

Supported targets:

- `quickStartId` highlights an element carrying the corresponding `data-quickstart-id`.
- `href` highlights an anchor with a matching console-relative URL.
- `consoleElement` resolves a named semantic console control through the selected OpenShift
  target adapter: `namespaceSelector`, `namespaceFilter`, `namespaceOption` (exact option text in
  `value`), `navigationLink` (exact sidebar link name), and `resourceSearch`.

Supported operations:

- `activateTarget` activates the highlighted console control.
- `navigate` opens the configured console-relative path through the target router adapter.
- `fillTarget` enters its configured `value` into the highlighted input using the browser's
  native input contract.

Supported verification conditions:

- `targetAttribute` advances only when the target has the configured attribute value. Use this
  for controls such as expandable navigation sections, where a click alone does not prove that
  the required state was reached.
- `route` advances when the browser reaches a URL equivalent to the configured path.
- `targetValue` advances when the highlighted input contains the configured exact value.
- `namespace` advances when the current console route is scoped to the configured namespace.

Do not put CSS selectors or executable behavior in a launch URL. The launcher accepts only a lab
name plus template parameters and resolves all behavior from the cluster's lab content.

## Assisted labs and the Continue failsafe

Verification is continuous in every mode: the engine watches routes, DOM attributes, and input
values, and advances as soon as the desired state is reached. Because that detection is coupled
to console markup, every step also has explicit controls:

- **Continue** performs the step's operation if the console is not already in the desired state,
  then advances **regardless** of whether verification fired. A detector broken by a console
  update costs one click instead of the whole lab.
- **Back** returns to the previous step and holds it there — auto-advance stays off for that step
  until the learner leaves its desired state, so Back cannot immediately bounce forward.

Both controls sit in the anchored bubble. When a target cannot be measured (the element is
missing, hidden, or scrolled out of a collapsed menu), the persistent workflow panel shows the
same step text and the same controls, so a lab is never stuck behind an element the engine cannot
find.

URL equivalence is shared across targets in `src/guidance/paths.ts`: a list page declared as
`apps~v1~Deployment` also matches the console's legacy `deployments` URL and the same list in
another scope. Assert a specific project with a `namespace` verification, not with a path.

## External lab links

Any trusted application can start a lab by linking to:

```text
https://<console-host>/academy/lessons/<lab-name>/start[?ns=<namespace>&<param>=<value>&mode=timed&returnUrl=<portal-url>]
```

After console authentication, the launcher resolves the lab, substitutes the parameters, starts
it, and stores progress in `sessionStorage`. The persistent guidance controller stays active as
the user leaves the launcher and navigates the console. Progress is isolated to the browser tab.

The implementation does not fork or patch the OpenShift console. A `console.context-provider`
keeps the guidance engine and floating controller mounted while the user navigates. The plugin is
independently built, served, registered through a `ConsolePlugin`, and enabled in
`Console.operator.openshift.io/cluster`.

## Target structure

The lab engine, content loader, and UI are shared under `src/`. Version-specific dependency
manifests plus route, navigation, and semantic-element adapters live under `targets/<target>/`.
Deployment overlays under `deploy/overlays/<target>/` select an explicitly versioned image tag
for the same target.

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

Navigation and Kubernetes state use supported console SDK APIs. Unconditional highlighting uses
console DOM attributes because the SDK does not expose a programmatic spotlight API.
Version-specific selectors are isolated in `targets/<target>/elements.ts`, where each control
lists several candidate selectors so a renamed class degrades to the next candidate. The shared
measurement and workflow behavior stays in `GuidanceContext.tsx`. These adapters must be
regression-tested for every OpenShift minor release. They do not modify core console code, but
are coupled to rendered console markup — which is exactly why Continue exists.

Each target pins the matching `@openshift-console/dynamic-plugin-sdk` generation and declares a
bounded console plugin API range. Add a new target only when a console release requires different
dependencies or adapter behavior; keep lab functionality in shared source.

## Build and deploy

Build either target from the repository root. The command creates a fresh isolated context, runs
`npm ci`, type checking, and the production build:

```bash
bin/pluginctl build ocp-4.20
bin/pluginctl build ocp-4.22
```

Build explicitly tagged local container images with Podman:

```bash
bin/pluginctl container-build ocp-4.22
```

Inspect the generated cluster resources without applying them:

```bash
bin/pluginctl render ocp-4.22
```

Deploy the one target matching the cluster version:

```bash
bin/pluginctl deploy ocp-4.22
```

The deploy command applies the target overlay (including the CRDs and reader RBAC), assembles its
isolated binary build context, starts the OpenShift build, and waits for the deployment rollout.
The deployment has an ImageStream trigger, so the explicitly tagged successful build
automatically rolls out.

Publish lab content and the portal link:

```bash
oc apply -k labs/
oc apply -f deploy/academysettings-example.yaml   # after setting your portal URL
```

For continuous content delivery, apply the ArgoCD application instead of `oc apply -k labs/`:

```bash
oc apply -f deploy/argocd/academy-console-labs.yaml
```

Enable the plugin without replacing any existing plugins:

```bash
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

After the console rollout completes, refresh the browser and open **Home → Academy labs**.

## Tests

Console URL equivalence is pure logic and has a dependency-free unit test (Node strips the types
itself):

```bash
node --test 'tests/unit/*.test.ts'
```

`tests/e2e/` is an isolated Playwright project that exercises complete labs against a live
OpenShift console: catalog rendering, the Continue failsafe, Back, assisted navigation through
resource pages, a timed run, hidden-lab launch parameters, completion, and guards against
excessive DOM mutation or long browser tasks.

Install the test dependencies and managed Firefox once:

```bash
cd tests/e2e
npm ci
npx playwright install firefox
```

The suite needs the lab content applied (`oc apply -k labs/`) and a test account that can read
the target namespace:

```bash
CONSOLE_URL='https://console-openshift-console.apps.example.com' \
CONSOLE_USERNAME='kubeadmin' \
CONSOLE_PASSWORD='<password>' \
ACADEMY_NAMESPACE='dcs-academy-portal' \
npm test
```

`CONSOLE_USERNAME` defaults to `kubeadmin` and `ACADEMY_NAMESPACE` to `dcs-academy-portal`. Use
`npm run test:headed` for an interactive browser. The suite accepts the cluster's development
certificate, but Firefox may still report expected CRC WebSocket connection errors; unexpected
console errors and all uncaught page errors fail the test.

## Remove

Disable the plugin before deleting its backend:

```bash
oc patch console.operator.openshift.io cluster --type=json \
  -p='[{"op":"remove","path":"/spec/plugins/0"}]'
oc delete -k labs/
oc delete -k deploy/overlays/ocp-4.22
```

The removal command assumes the PoC is the first enabled plugin. For a shared cluster, remove the
array element matching `academy-guidance` instead of using a fixed index. Deleting the overlay
also removes the `ConsoleLab` CRD and every lab object with it.
