import type { CompletionPresentation, TrainingModule } from './types';

type VariantMetadata = {
  id: string;
  title: string;
  description: string;
};

export const createPresentationVariant = (
  module: TrainingModule,
  metadata: VariantMetadata,
  presentation: CompletionPresentation
): TrainingModule => ({
  ...module,
  ...metadata,
  steps: module.steps.map((step) => ({
    ...step,
    complete: { ...step.complete, presentation }
  }))
});
