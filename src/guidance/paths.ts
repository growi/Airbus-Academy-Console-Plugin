/**
 * Console URL equivalence, shared by every target.
 *
 * The console reaches the same page through more than one URL: a resource list is addressed
 * both as `apps~v1~Deployment` and as the legacy plural `deployments`, and the sidebar link
 * lands on whichever scope is currently selected (`/k8s/ns/<ns>/…` or `/k8s/all-namespaces/…`).
 * A step that compares the browser path to its declared path literally therefore never
 * completes, which is what made assisted navigation steps hang.
 *
 * Version-specific route differences stay in `targets/<target>/routes.ts`; this file only
 * expresses equivalences that hold for every supported console.
 */

/** ponytail: covers every Kind the console navigates to; extend if a Kind pluralizes oddly. */
const pluralize = (kind: string) => {
  const lower = kind.toLowerCase();
  if (/(s|x|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
};

const RESOURCE_PATH =
  /^\/k8s\/(ns\/[^/]+|all-namespaces|cluster)\/(?:([^/~]+)~([^/~]+)~([^/]+)|([a-z][a-z0-9.-]*))(\/.*)?$/;

const stripTrailingSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Every URL form that addresses the same console page. */
export const pathVariants = (path: string): string[] => {
  const normalized = stripTrailingSlash(path);
  const variants = new Set([normalized]);
  const match = normalized.match(RESOURCE_PATH);
  if (!match) return Array.from(variants);

  const [, scope, , , kind, plural, rest = ''] = match;
  variants.add(`/k8s/${scope}/${plural ?? pluralize(kind)}${rest}`);
  return Array.from(variants);
};

type ResourceList = { scope: string; resource: string };

/** A resource LIST page (no trailing name/tab), or null for anything else. */
const asList = (path: string): ResourceList | null => {
  const match = stripTrailingSlash(path).match(RESOURCE_PATH);
  if (!match) return null;
  const [, scope, , , kind, plural, rest = ''] = match;
  return rest ? null : { resource: plural ?? pluralize(kind), scope };
};

export const pathsMatch = (actual: string, expected: string) => {
  const expectedVariants = new Set(pathVariants(expected));
  if (pathVariants(actual).some((variant) => expectedVariants.has(variant))) return true;

  // The same list is reachable in a narrower or wider scope: the sidebar link lands on
  // all-namespaces when no project is selected, and a lab may declare either form. But a
  // list in a DIFFERENT namespace is a different page — treating those as equal let a
  // portal-launched lab advance through the steps in whatever project the console
  // happened to be scoped to, which is exactly the failure this guards against.
  const actualList = asList(actual);
  const expectedList = asList(expected);
  return Boolean(
    actualList &&
      expectedList &&
      actualList.resource === expectedList.resource &&
      [actualList.scope, expectedList.scope].some((scope) => !scope.startsWith('ns/'))
  );
};
