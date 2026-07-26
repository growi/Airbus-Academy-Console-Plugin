// Route adapter for OpenShift 4.22-4.23. Console URLs match the paths labs declare, and the
// equivalences that hold for every console release (legacy plural aliases, list scope) live in
// src/guidance/paths.ts. Add a rewrite here only for a difference specific to this release.
export const resolveConsolePath = (path: string) => path;

export const resolveConsoleTargetPaths = (path: string) => [path];
