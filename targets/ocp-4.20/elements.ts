/**
 * Semantic console controls for OpenShift 4.20-4.21.
 *
 * Each control lists several candidate selectors, current markup first. A console release that
 * renames a class or moves a data-test attribute then degrades to the next candidate instead of
 * leaving a step with no target at all.
 */
const firstElement = (selectors: string[]) => {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
};

const exactText = (selectors: string[], value?: string) => {
  if (!value) return null;
  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (candidate) => candidate.textContent?.trim() === value
    );
    if (element) return element;
  }
  return null;
};

export const resolveConsoleElement = (id: string, value?: string) => {
  switch (id) {
    case 'namespaceSelector':
      return firstElement([
        '.co-namespace-dropdown__menu-toggle',
        '[data-test="namespace-bar-dropdown"] button',
        '.co-namespace-bar__items button[aria-expanded]'
      ]);
    case 'namespaceFilter':
      return firstElement([
        '[data-test="dropdown-text-filter"]',
        '.co-namespace-dropdown input',
        '[data-test="namespace-bar-dropdown"] input'
      ]);
    case 'namespaceOption':
      return exactText(
        [
          '[data-test="dropdown-menu-item-link"]',
          '[role="menuitem"]',
          '[role="option"]',
          '.pf-v5-c-menu__item'
        ],
        value
      );
    case 'navigationLink':
      // Restricted to the sidebar first so a breadcrumb or table link with the same text
      // cannot win the match.
      return exactText(['#page-sidebar a', 'nav a', 'a'], value);
    case 'resourceSearch':
      return firstElement([
        '[data-test="name-filter-input"]',
        '[placeholder="Search by name..."]',
        '.co-text-filter input'
      ]);
    default:
      return null;
  }
};
