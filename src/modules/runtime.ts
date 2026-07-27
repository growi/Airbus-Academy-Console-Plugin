import type {
  TrainingModule,
  TrainingModuleParameter,
  TrainingModuleParameters
} from './types';

const namespacePattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const isValidParameter = (name: TrainingModuleParameter, value?: string) => {
  if (!value) return false;
  if (name === 'namespace') return value.length <= 63 && namespacePattern.test(value);
  if (name === 'redirectUri') {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

const substituteParameters = (
  value: unknown,
  parameters: TrainingModuleParameters
): unknown => {
  if (typeof value === 'string') {
    return value.replace(/\$\{(namespace)\}/g, (_, name: TrainingModuleParameter) =>
      parameters[name] ?? `\${${name}}`
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteParameters(item, parameters));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        substituteParameters(item, parameters)
      ])
    );
  }
  return value;
};

export const instantiateTrainingModule = (
  module: TrainingModule,
  parameters: TrainingModuleParameters = {}
) => {
  if (!(module.parameters ?? []).every((name) => isValidParameter(name, parameters[name]))) {
    return undefined;
  }
  return substituteParameters(module, parameters) as TrainingModule;
};
