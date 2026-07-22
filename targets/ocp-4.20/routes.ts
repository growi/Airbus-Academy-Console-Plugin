export const resolveConsolePath = (path: string) => path;

export const resolveConsoleTargetPaths = (path: string) => {
  const namespacedListRoute = path.match(/^\/k8s\/ns\/[^/]+\/([^/]+)$/);
  if (!namespacedListRoute) return [path];
  return [path, `/k8s/all-namespaces/${namespacedListRoute[1]}`];
};
