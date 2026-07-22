const exactText = (selector: string, value?: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.textContent?.trim() === value
  ) ?? null;

export const resolveConsoleElement = (id: string, value?: string) => {
  switch (id) {
    case 'namespaceSelector':
      return document.querySelector<HTMLElement>('.co-namespace-dropdown__menu-toggle');
    case 'namespaceFilter':
      return document.querySelector<HTMLElement>('[data-test="dropdown-text-filter"]');
    case 'namespaceOption':
      return exactText('[data-test="dropdown-menu-item-link"] [role="menuitem"]', value);
    case 'navigationLink':
      return exactText('a', value);
    case 'resourceSearch':
      return document.querySelector<HTMLElement>('[placeholder="Search by name..."]');
    default:
      return null;
  }
};
