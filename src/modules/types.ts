export type TrainingTarget =
  | { type: 'quickStartId'; value: string }
  | { type: 'href'; value: string };

export type CompletionCondition =
  | { type: 'targetAttribute'; attribute: string; value: string }
  | { type: 'route'; value: string };

export type TrainingStep = {
  id: string;
  title: string;
  description: string;
  target: TrainingTarget;
  completeWhen: CompletionCondition;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string;
  completionText: string;
  steps: TrainingStep[];
};
