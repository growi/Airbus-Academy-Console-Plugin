# Academy Tour Candidates

The live Academy installation currently exposes 22 Educates workshops across the Core,
Developer, and Security tracks. Console tours can either replace console-native instruction or
support an Educates exercise by explaining and verifying the resources created in its terminal.

## Recommended Delivery Order

| Priority | Workshop | Tour role | Recommended scope |
| --- | --- | --- | --- |
| 1 | A08 — OpenShift Console | Complete substitute | Workloads, Networking, Storage, configuration, and console/CLI parity |
| 2 | A06 — Namespaces and Tenancy | Strong companion | Select namespaces and compare independently scoped, same-named resources |
| 3 | A03 — Configure and Troubleshoot | Companion | ConfigMaps, Secrets, rollout status, logs, events, and recovery |
| 4 | A05 — Storage | Companion | PVC, StorageClass, pod mount, replacement pod, and persistence |
| 5 | B07 — Scaling and Health | Companion | Replicas, quota, events, probes, pod deletion, and reconciliation |
| 6 | B08 — Operators | Presentation or companion | OperatorHub, installed operators, CRDs, custom resources, and status |

## Secondary Candidates

- **A00 — Workshop Environment:** replace only the OpenShift console segment; Educates owns its
  terminal, editor, and feedback UI.
- **A02 — Deploy First App:** inspect Deployment to ReplicaSet to Pod relationships and rollout.
- **A04 — Expose App:** follow Deployment to Service to Route and open the application.
- **B01 — Docker to Kubernetes:** visually map Deployment, Pod, ConfigMap, and Service concepts.
- **B02 — BuildConfigs:** inspect BuildConfig, Build Pod, logs, ImageStream, and Deployment.
- **B05 — RBAC:** trace RoleBinding to Role rules and inspect ResourceQuota.
- **B06 — DEV versus PROD:** compare namespaces, policy events, and Route admission.
- **C02 — Pod Security:** inspect admission rejection, security context, and SCC annotation.
- **C03 — Secrets:** trace Secret references through a Deployment without revealing values.

## Poor Fits

- **A01** is primarily conceptual plus terminal commands.
- **A07** leaves OpenShift for the external ITSM console.
- **B03** primarily uses OpenShift Dev Spaces.
- **B04** and **C01** primarily use Harbor and scan-report exercises.
- **C04** is terminal-oriented digest, provenance, and signature work.
- **C05** focuses on governance, classification, RACI, and exception reasoning.

## Production TODOs

- [ ] Pass trusted workshop context to a registered module without accepting arbitrary selectors or
  executable behavior from external URLs.
- [ ] Resolve generated learner namespaces and resource names from session context.
- [ ] Discover resources by kind and labels when names are not stable.
- [ ] Add semantic operations for selects, number inputs, confirmation dialogs, and safe YAML
  editors.
- [ ] Verify Kubernetes state through SDK watches: existence, replica counts, readiness, rollout
  conditions, and resource relationships.
- [ ] Add module prerequisites and availability checks so the catalog can disable tours whose
  target resources are absent.
- [ ] Link Educates lesson pages directly to their supporting registered tour IDs.
- [ ] Add target-version E2E scenarios for each production tour.

## Initial PoC Modules

- `lab-a08-openshift-console` replaces the rough screenshot-based A08 console walkthrough with a
  live tour of the deployed Academy portal resources.
- `lab-a06-namespace-isolation` supports A06 by showing the same `kube-root-ca.crt` ConfigMap in two
  namespaces. The PoC uses stable lab namespaces; production must substitute the learner's
  generated `app-a` and `app-b` namespaces.
