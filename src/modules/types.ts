import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export type TrainingTarget =
  | { type: 'quickStartId'; value: string }
  | { type: 'href'; value: string }
  | { type: 'consoleElement'; id: string; value?: string };

export type CompletionOperation =
  | { type: 'activateTarget' }
  | { type: 'fillTarget'; value: string }
  | { type: 'navigate'; path: string };

export type CompletionVerification =
  | { type: 'targetAttribute'; attribute: string; value: string }
  | { type: 'targetValue'; value: string }
  | { type: 'namespace'; value: string }
  | { type: 'route'; path: string };

export type StepCompletion = {
  operation: CompletionOperation;
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

/** default labs are listed in the catalog; hidden labs are launch-URL only. */
export type LabVisibility = 'default' | 'hidden';

/** assisted: the learner acts. timed: the engine performs each step itself. */
export type TrainingMode = 'assisted' | 'timed';

export type ConsoleLabSpec = {
  title: string;
  description: string;
  completionText?: string;
  visibility?: LabVisibility;
  mode?: TrainingMode;
  timerDelay?: string;
  context?: TrainingContext;
  steps: TrainingStep[];
};

export type ConsoleLabResource = K8sResourceCommon & { spec?: ConsoleLabSpec };

/** A lab with every `{{parameter}}` resolved, ready for the engine to run. */
export type TrainingModule = {
  id: string;
  title: string;
  description: string;
  completionText: string;
  visibility: LabVisibility;
  mode: TrainingMode;
  timerDelay: string;
  context?: TrainingContext;
  steps: TrainingStep[];
};

export type LabParameters = Record<string, string>;

export type AcademySettings = {
  portalUrl: string;
  portalLinkText: string;
};
