export type TrainingTarget =
  | { type: 'quickStartId'; value: string }
  | { type: 'href'; value: string }
  | { type: 'consoleElement'; id: string; value?: string };

export type CompletionOperation =
  | { type: 'activateTarget' }
  | { type: 'fillTarget'; value: string }
  | { type: 'navigate'; path: string };

export type CompletionPresentation =
  | { initiator: 'continue' }
  | { initiator: 'timer'; delay: string };

export type CompletionVerification =
  | { type: 'targetAttribute'; attribute: string; value: string }
  | { type: 'targetValue'; value: string }
  | { type: 'namespace'; value: string }
  | { type: 'route'; path: string };

export type StepCompletion = {
  operation: CompletionOperation;
  presentation?: CompletionPresentation;
  verify: CompletionVerification;
};

export type TrainingStep = {
  id: string;
  title: string;
  description: string;
  target: TrainingTarget;
  complete: StepCompletion;
};

export type TrainingResource = {
  apiVersion: string;
  kind: string;
  label: string;
  listPath: string;
  name: string;
  namespace: string;
  consolePath: string;
  tabs?: Record<string, string>;
};

export type TrainingContext = {
  primaryResource: string;
  resources: Record<string, TrainingResource>;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string;
  completionText: string;
  context: TrainingContext;
  steps: TrainingStep[];
};

export type TrainingMode = 'assisted' | 'continue' | 'timed';

export type TrainingModuleCatalogEntry = {
  mode: TrainingMode;
  module: TrainingModule;
};
