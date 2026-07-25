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

/**
 * Every URL form that addresses the same console page. List pages also yield a scope-agnostic
 * `list:<plural>` token, so a step that declares one scope still completes when the console
 * shows that list in another one — assert the scope with a `namespace` verification instead.
 */
export const pathVariants = (path: string): string[] => {
  const normalized = stripTrailingSlash(path);
  const variants = new Set([normalized]);
  const match = normalized.match(RESOURCE_PATH);
  if (!match) return Array.from(variants);

  const [, scope, , , kind, plural, rest = ''] = match;
  const resource = plural ?? pluralize(kind);
  variants.add(`/k8s/${scope}/${resource}${rest}`);
  if (!rest) variants.add(`list:${resource}`);
  return Array.from(variants);
};

export const pathsMatch = (actual: string, expected: string) => {
  const expectedVariants = new Set(pathVariants(expected));
  return pathVariants(actual).some((variant) => expectedVariants.has(variant));
};
