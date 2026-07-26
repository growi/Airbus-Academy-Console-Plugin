/**
 * Semantic console controls for OpenShift 4.22-4.23.
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

/**
 * The block a section heading introduces: keep climbing while the ancestor still contains this
 * heading and no other. A details page wraps each section in its own element, so this reaches
 * the heading plus its content; a form or a tab body holds every heading in one section, so the
 * climb stops at the one block that belongs to this heading. Highlighting the heading alone
 * points at the label instead of at the thing the step is about.
 */
const headingBlock = (heading: HTMLElement | null) => {
  let block = heading;
  while (
    block?.parentElement &&
    block.parentElement !== document.body &&
    block.parentElement.querySelectorAll('h1, h2, h3').length === 1
  ) {
    block = block.parentElement;
  }
  return block;
};

/** A heading may carry a control of its own — a Secret's Data heading holds Reveal values. */
const headingText = (heading: HTMLElement) => {
  const withoutControls = heading.cloneNode(true) as HTMLElement;
  withoutControls.querySelectorAll('button, a').forEach((control) => control.remove());
  return withoutControls.textContent?.trim() ?? '';
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
    // An entry of any open PatternFly menu — the project selector's options and the
    // per-object Actions menu are the same markup.
    case 'namespaceOption':
    case 'menuItem':
      return exactText(
        [
          '[data-test="dropdown-menu-item-link"]',
          '[role="menuitem"]',
          '[role="option"]',
          '.pf-v6-c-menu__item'
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
    case 'actionsMenu':
      // The per-object Actions toggle on any details page.
      return firstElement([
        '[data-test="actions-menu-button"]',
        '[data-test-id="actions-menu-button"]',
        '.co-actions button[aria-expanded]'
      ]);
    case 'detailsSection': {
      // A block of a details page addressed by its own heading ("Data", "Environment
      // Variables"). The console gives these no test id, so the heading is the handle — but
      // what gets highlighted is the whole block, heading and content together.
      if (!value) return null;
      const heading = Array.from(
        document.querySelectorAll<HTMLElement>('h2.co-section-heading, h2, h3')
      ).find((candidate) => headingText(candidate) === value);
      return headingBlock(heading ?? null);
    }
    case 'pageContent':
      // What a tab actually put on screen: the table, the event stream, the YAML editor. A
      // step explaining what the learner is looking at needs to point at it, and these bodies
      // carry no heading to address them by.
      return firstElement([
        '[role="grid"]',
        '.pf-v6-c-table',
        '.co-sysevent-stream',
        '.yaml-editor',
        '.ocs-yaml-editor',
        '.co-m-pane__body'
      ]);
    case 'revealSecretValues':
      // Toggles between "Reveal values" and "Hide values"; the label is the only state it
      // reports, hence the targetText verification.
      return firstElement([
        '[data-test="reveal-values"]',
        '[data-test-id="reveal-values"]'
      ]);
    default:
      return null;
  }
};
