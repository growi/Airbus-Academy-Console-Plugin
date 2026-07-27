# Airbus Academy Console Plugin — repo guide

An OpenShift **dynamic console plugin** that runs guided labs inside the real OpenShift web
console. It is one half of the DCS Academy: the other half is the Educates-based academy in
[`../Airbus-Educates`](../Airbus-Educates) (portal, workshops, tracks). Read that repo's
`CLAUDE.md` too — lab *content* lives there, this repo holds the *engine*.

## Why this exists

The DCS Academy teaches Airbus Defence and Space's on-prem, air-gapped OpenShift platform.
Terminal labs teach the concepts (`oc` on a real cluster, instructions beside a terminal). But
most DCS users will drive the platform through the **OpenShift web console**, and the console
cannot be taught inside Educates:

- the real console **refuses to be framed** (`x-frame-options: DENY`, `frame-ancestors 'none'`),
  so Educates' Console tab is the Kubernetes Dashboard, not OpenShift's console
  (see `../Airbus-Educates/HANDOVER-console-openshift.md`);
- a native `ConsoleQuickStart` cannot highlight elements, verify that the learner reached a
  state, or drive navigation.

So the guidance runs **as a console plugin**, in the console itself. Division of labour:

| | Terminal lab (Educates) | Console lab (this plugin) |
|---|---|---|
| Teaches | the concept — what a Deployment is, why | where that concept lives in the GUI |
| Medium | instructions + terminal + editor | highlight + one step box on the live console |
| Length | 20–60 min | 5–15 min |
| Prereq | — | the terminal lab that taught the concept |

**Console labs never introduce a concept.** They apply what a terminal lab already taught, and
name the CLI equivalent of each screen.

## Architecture

```
console-extensions.json   context-provider (engine mounted everywhere) + 2 pages + nav item
src/guidance/
  GuidanceContext.tsx     the engine: state machine, spotlight measurement, bubble, panel
  paths.ts                console URL equivalence (GVK ↔ legacy plural, scope rules)
src/modules/
  labContent.ts           pure logic: parameter substitution, validation, returnUrl checking
  labs.ts                 watches ConsoleLab + AcademySettings CRs
src/components/           GuidancePage (catalog), LessonLauncherPage (launch URL)
src/platform/*.d.ts       adapter interface, implemented per target
targets/ocp-4.20|4.22/    per-version deps + route/navigation/element adapters
deploy/helm/academy-console-plugin/
                          the whole deployment: CRDs (ConsoleLab, AcademySettings), reader
                          RBAC, runtime, optional in-cluster build, optional AcademySettings,
                          post-install hook that enables the plugin in the console operator
deploy/argocd/            standalone Application syncing that chart (plugin only, not labs)
tests/unit/               node --test, no deps (Node strips the types)
tests/e2e/                Playwright against a live console
```

`bin/pluginctl <build|deploy|render|container-build> <target>` assembles an isolated build
context in `.build/<target>/` from shared `src/` + the target's adapters. `deploy`/`render` are
`helm upgrade --install` / `helm template` on that one chart with `image.tag=<target tag>` and
`build.enabled=true`; extra arguments pass through to `helm`. There is no kustomize any more.

The **CRD contract with a full worked `ConsoleLab` example** is in
[README.md](README.md#example-a-complete-consolelab) — read it before touching
`deploy/helm/academy-console-plugin/templates/crds.yaml`, `src/modules/types.ts`, or a lab, and
keep those three in sync.

### Lab content is NOT in this repo

Labs are `ConsoleLab` CRs authored in the workshops monorepo at
`../Airbus-Educates/workshops-monorepo/tracks/<track>/<lab>/resources/consolelab.yaml`, emitted
by that chart (`templates/consolelabs.yaml`) and applied by the **existing** ArgoCD app. This
repo owns the CRD, the RBAC, and the engine. Publishing a lab is a `git push` in the other repo —
no image rebuild.

**Placeholders are `<<name>>`, not `{{name}}`.** Lab files are rendered by Helm (`tpl`) at deploy
time, so `{{ }}` belongs to Helm and `$( )` to Educates; only a third delimiter survives to the
browser, where the plugin substitutes it from the launch URL.

## Two kinds of lab

- **default** (`spec.visibility: default`) — listed under **Home → Academy labs** for anyone.
  Must work for a learner with only their own project: no namespaced paths, or `<<namespace>>`
  which falls back to the currently selected project.
- **hidden** — never listed; launched by the portal with `?ns=<session namespace>&<params>`.
  `hidden` is **not** a security control: lab text is not secret and the real boundary is
  namespace RBAC. It means "useless without a provisioned environment".

## Integration with the academy portal

The portal (`../Airbus-Educates/images/dcs-academy-portal`, Flask) launches hidden labs:

1. Workshop CR carries `academy.dcs/lab-format: console`, `academy.dcs/console-lab: <name>`,
   `academy.dcs/console-lab-params: k=v`, and `academy.dcs/orphaned: "0s"`.
2. The portal allocates a **normal Educates session** — namespace, quota, `session.objects`,
   capacity and the reaper all unchanged. Only the final redirect differs.
3. Educates exposes **no data variable carrying the human's identity** (the session runs as its
   ServiceAccount), so `session.objects` cannot grant the learner anything. The portal therefore
   creates a RoleBinding for the signed-in user for the `academy-console-lab-user` ClusterRole in
   that namespace. Its SA may bind **that role and no other** (RBAC `bind` + `resourceNames`), so
   the API server itself refuses an attempt to bind `edit` or `cluster-admin`.
4. It redirects to `/academy/lessons/<lab>/start?ns=…&<params>&returnUrl=…`.
5. **Finish** → `<portal>/lab/<name>/complete?session=…`, which records the completion and
   terminates the session.

Portal-side code: `portal/consolelab.py`, `k8sclient.ensure_lab_access`, `app.py` (`/launch`,
`/lab/<name>/complete`, `_portal_base`), chart `templates/02-console-lab-rbac.yaml`.

## Engine behaviour worth knowing

- **Continue is a failsafe, not a mode.** Detection is continuous in every mode; Continue
  performs the step's operation if the console is not already in the desired state and then
  advances *regardless*. A detector broken by a console upgrade costs one click, not the lab.
  **Back** holds its step so auto-advance cannot bounce the learner forward.
- **The launcher sets the active project.** The console's selected project is global state that
  survives from another tab; without setting it, a lab runs in the wrong namespace.
- **Path matching** accepts the console's alternative URLs for one page (`apps~v1~Deployment` ↔
  `deployments`; a project-scoped list ↔ all-namespaces) but **never** two different namespaces.
- **returnUrl is origin-checked** against `AcademySettings.spec.portalUrl`. A mismatch is
  refused and logged with both origins.
- The spotlight re-measures on every mutation type plus `transitionend`/`animationend` — a nav
  section inserts its items and *then* animates them, so measuring at mutation time leaves the
  spotlight permanently offset.

## Hard-won gotchas

| Symptom | Cause |
|---|---|
| Assisted nav step never completes | console uses its legacy plural URL (`/deployments`) while the lab declares `apps~v1~Deployment` → `paths.ts` equivalence |
| Lab runs in the wrong project | launcher must `setActiveNamespace()`; and list-path matching must not treat two namespaces as equal |
| Timed demo stalls forever | the timer must not wait for a target that this page never renders |
| Two Continue buttons | bubble and panel both rendered during a step transition; both now gate on `highlightTargetFound` |
| Finish does nothing | `returnUrl` origin mismatch — the portal route is **edge**-terminated and Flask has no `ProxyFix`, so `request.url_root` said `http://`. Portal now derives its public origin from `TrainingPortal.status` |
| Session vanishes mid-lab | `academy.dcs/orphaned` not `"0s"` — orphan detection watches a dashboard nobody opens |
| ArgoCD "expected string, got 0" | `expires`/`orphaned` must match `^\d+(s|m|h)$` **and** be quoted; a unitless value breaks the diff for the whole app |
| Helm fails on a lab file | `{{ }}` in the lab (use `<<>>`) — including inside a YAML comment |
| Pod path never resolves | a Deployment's pod name has a generated suffix; hidden labs create a bare Pod with a fixed name |
| `BuildPodEvicted` on an in-cluster build | CRC's VM disk is near full — prune images or use `./build.sh`, which builds on the workstation |
| Image pushed but the pod cannot pull it | single-architecture push to a cluster of the other architecture (`no image found in image index`); `build.sh` pushes both unless `PLATFORMS` says otherwise |

## Working here

```bash
./build.sh --rollout                   # build ocp-4.22 locally, push to ghcr, restart the plugin
bin/pluginctl deploy ocp-4.22          # same thing built in-cluster (needs node disk headroom)
node --test 'tests/unit/*.test.ts'     # pure logic, no cluster, no deps
cd tests/e2e && CONSOLE_URL=… CONSOLE_PASSWORD=… npx playwright test --workers=1
```

- CRC runs 4.22 → target `ocp-4.22`. Keep both targets building; adapters are the only
  version-coupled code.
- ArgoCD (`prune + selfHeal`) owns the portal chart on CRC: manual `oc apply` of chart resources
  is reverted within seconds. Apply-and-test in one command, or push.
- Monitoring is disabled on CRC, so the console logs `Error polling URL: e: Bad Gateway` — known
  noise, allowlisted in the e2e console-error guard.
- The e2e suite is parameterized by `ACADEMY_NAMESPACE` / `ACADEMY_POD`; `portal-launch.spec.ts`
  reproduces a real portal launch (wrong project selected first → Finish returns to the portal).
- `hidden-labs.spec.ts` covers EVERY hidden lab generically: it reads each ConsoleLab CR from the
  cluster through the console's k8s proxy and performs the learner action for every step, so a
  new lab needs no new spec — add its name to `ACADEMY_HIDDEN_LABS` (default: the console-track
  u-series). It asserts each target exists on the page the previous step ended on and that the
  lab advances without Continue. Needs the labs' namespaces to exist (`<lab>-01`, the
  portal-less deploy convention — override with `ACADEMY_NS_SUFFIX`).

## Authoring labs

Use the **`airbus-educates-console-tour-authoring`** skill in the Airbus-Educates repo. It
carries the naming conventions, the voice, the CRD contract, the portal pairing, and the step
depth rule: every step gives the job, the reason, and the CLI equivalent — never a bare
"click here". Reference implementation:
`../Airbus-Educates/workshops-monorepo/tracks/console-track/lab-u01-container-access/`.
