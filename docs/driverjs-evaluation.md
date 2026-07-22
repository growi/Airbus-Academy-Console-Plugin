# Driver.js evaluation

## Recommendation

Do not use Driver.js as the presentation layer for Academy guidance in the OpenShift console.
The experiment is preserved on branch `experiment/driverjs`, but the primary implementation
should retain its own state-driven workflow and lightweight presentation.

Driver.js is designed to own a product tour: it controls the overlay, target interaction,
navigation buttons, progression, and lifecycle. Academy guidance instead needs the OpenShift
console to remain fully interactive while the plugin independently verifies routes and rendered
state. We therefore disabled or bypassed most of Driver.js's core behavior and used it primarily
for spotlight geometry and popover positioning.

## Concrete console breakage

### Workloads navigation became non-interactive

When Driver.js highlighted the real Workloads navigation element, its overlay and global pointer
handling prevented the PatternFly navigation control from behaving normally. The user could not
reliably expand Workloads and reach Pods, so the lesson could not progress through the actual
console interaction.

Making this work required global `.driver-active` pointer-event overrides and a synthetic,
non-interactive proxy rectangle positioned over the real target. Driver.js then highlighted the
proxy while clicks passed through to OpenShift. This workaround bypassed Driver.js target
interaction rather than integrating with it.

### DOM observation caused severe browser slowdown

The first integration observed broad DOM attribute changes to locate targets and verify state.
Driver.js continuously changed overlay, style, and accessibility attributes while rendering and
refreshing its highlight. Those changes retriggered the observer and presentation lifecycle,
creating enough repeated work to freeze the console UI and make Firefox report that the page was
slowing down the browser.

Stopping the loop required restricting observation, ignoring unchanged target identities, and
separating the real console element from Driver.js through the proxy. This was integration
complexity needed only because the presentation library mutates the same document being observed.

### Tour lifecycle conflicted with persistent lessons

When a target was temporarily unavailable during console navigation, Driver.js could render a
detached popover without a usable highlighted element. During the experiment this produced a
lesson starting at step two with no visible target and no reliable way to advance or stop it; the
persisted lesson state made the broken presentation survive a hard reload.

The resolution was to move progression, persistence, target availability, completion, rollback,
and stopping entirely into the Academy engine. At that point Driver.js no longer managed the tour
and had become only an expensive renderer.

## Preferred direction

Keep the declarative modules, verified completion conditions, prerequisite rollback,
version-specific route adapters, external launcher, and Playwright tests. Render the guidance with
a small plugin-owned spotlight plus a PatternFly popover or similarly focused positioning utility.
The presentation must not mutate or intercept the highlighted OpenShift element, and lesson state
must remain independent of presentation lifecycle.
