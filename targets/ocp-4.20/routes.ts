const NAMESPACED_PODS_PATH = '/k8s/ns/dcs-academy-portal/core~v1~Pod';

export const resolveConsolePath = (path: string) => path;

export const resolveConsoleTargetPath = (path: string) =>
  path === NAMESPACED_PODS_PATH ? '/k8s/all-namespaces/core~v1~Pod' : path;
