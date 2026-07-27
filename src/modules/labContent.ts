// Pure lab-content logic: launch-parameter validation, template substitution, and returnUrl
// checking. No React and no SDK imports, so tests/unit can run it directly.
import type { ConsoleLabResource, LabParameters, TrainingModule } from './types';

/**
 * Launch parameters are written `<<name>>`, not `{{name}}`.
 *
 * Lab content ships through the workshops Helm chart, which renders every file with `tpl`
 * so a lab can reference chart values. Helm owns `{{ }}` and Educates owns `$( )`; a third
 * placeholder substituted at LAUNCH time — long after both have run — needs a delimiter
 * neither of them claims, or deploying the lab fails while parsing it as a Helm template.
 */
const PARAMETER_PATTERN = /<<\s*([a-zA-Z][a-zA-Z0-9]*)\s*>>/g;

/**
 * Launch parameters arrive in a URL, so they are untrusted. Only characters that can appear in a
 * Kubernetes name or console path are accepted; anything else drops the parameter, which surfaces
 * as a missing parameter instead of being substituted into a path or into the lab JSON.
 */
const PARAMETER_VALUE_PATTERN = /^[A-Za-z0-9._:@/-]{1,253}$/;

/** Launch-URL keys the engine consumes itself; never lab template parameters. */
const RESERVED_PARAMETERS = ['mode', 'returnUrl'];

export const sanitizeLabParameters = (search: string): LabParameters => {
  const parameters: LabParameters = {};
  new URLSearchParams(search).forEach((value, key) => {
    if (RESERVED_PARAMETERS.includes(key)) return;
    const name = key === 'ns' ? 'namespace' : key;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) return;
    if (!PARAMETER_VALUE_PATTERN.test(value)) return;
    parameters[name] = value;
  });
  return parameters;
};

/**
 * The `namespace` parameter every lab template uses, taken from the project the console is scoped
 * to. The console reports `#ALL_NS#` when no single project is selected, which is not a namespace
 * name and therefore yields no parameter.
 */
export const activeNamespaceParameters = (activeNamespace?: string): LabParameters => {
  const parameters: LabParameters = {};
  if (activeNamespace && /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/.test(activeNamespace)) {
    parameters.namespace = activeNamespace;
  }
  return parameters;
};

const parameterNames = (spec: unknown) => {
  const names: string[] = [];
  JSON.stringify(spec ?? null).replace(PARAMETER_PATTERN, (match, name: string) => {
    if (!names.includes(name)) names.push(name);
    return match;
  });
  return names;
};

export type ResolvedLab = {
  module?: TrainingModule;
  /** Parameters the lab templates that the launch URL did not supply. */
  missingParameters: string[];
};

export const resolveLab = (
  lab: ConsoleLabResource | undefined,
  parameters: LabParameters
): ResolvedLab => {
  const spec = lab?.spec;
  const id = lab?.metadata?.name;
  if (!spec?.steps?.length || !id) return { missingParameters: [] };

  const missingParameters = parameterNames(spec).filter((name) => !parameters[name]);
  if (missingParameters.length) return { missingParameters };

  const resolvedSpec = JSON.parse(
    JSON.stringify(spec).replace(PARAMETER_PATTERN, (_match, name: string) => parameters[name])
  ) as typeof spec;

  return {
    missingParameters: [],
    module: {
      id,
      title: resolvedSpec.title,
      description: resolvedSpec.description,
      completionText: resolvedSpec.completionText ?? 'Lesson complete.',
      visibility: resolvedSpec.visibility ?? 'default',
      mode: resolvedSpec.mode ?? 'assisted',
      timerDelay: resolvedSpec.timerDelay ?? '5s',
      context: resolvedSpec.context,
      steps: resolvedSpec.steps
    }
  };
};

/**
 * The catalog link shown under the lab list. The portal's catalog reads `?format=` and
 * preselects its own lab-format filter, so a learner who follows this link from inside the
 * console lands on the console labs rather than on the whole catalogue — the terminal labs
 * are not what someone already in the console is looking for.
 *
 * Anything unparseable is returned unchanged: a bad portalUrl is the settings' problem, and a
 * link that cannot be decorated is still better than no link.
 */
export const portalCatalogUrl = (portalUrl: string, format = 'console') => {
  try {
    const url = new URL(portalUrl);
    url.searchParams.set('format', format);
    return url.toString();
  } catch {
    return portalUrl;
  }
};

/**
 * A returnUrl comes from the launch URL, so it is only honoured when it points at the configured
 * portal origin. Without that check any page could hand the console a link that sends a learner
 * somewhere else at the end of a lab.
 */
export const isAllowedReturnUrl = (returnUrl: string, portalUrl: string) => {
  if (!returnUrl || !portalUrl) return false;
  try {
    const target = new URL(returnUrl);
    return (
      ['http:', 'https:'].includes(target.protocol) &&
      target.origin === new URL(portalUrl).origin
    );
  } catch {
    return false;
  }
};
