import academyPortalContainerAccess from './academy-portal-container-access.json';
import academyPortalContainerAccessManual from './academy-portal-container-access-manual.json';
import academyPortalContainerAccessTimed from './academy-portal-container-access-timed.json';
import academyPortalNamespaceFilter from './academy-portal-namespace-filter.json';
import type { TrainingModule } from './types';
import { createPresentationVariant } from './variants';

const namespaceFilterModule = academyPortalNamespaceFilter as TrainingModule;
const namespaceFilterManual = createPresentationVariant(
  namespaceFilterModule,
  {
    id: 'academy-portal-namespace-filter-manual',
    title: 'Select the Academy namespace (presentation: Continue)',
    description: 'Review each namespace-selection action and press Continue to perform it.'
  },
  { initiator: 'continue' }
);
const namespaceFilterTimed = createPresentationVariant(
  namespaceFilterModule,
  {
    id: 'academy-portal-namespace-filter-timed',
    title: 'Select the Academy namespace (presentation: timed)',
    description: 'Watch the console filter and select the Academy namespace automatically.'
  },
  { initiator: 'timer', delay: '5s' }
);

const modules = [
  academyPortalContainerAccess as TrainingModule,
  academyPortalContainerAccessManual as TrainingModule,
  academyPortalContainerAccessTimed as TrainingModule,
  namespaceFilterModule,
  namespaceFilterManual,
  namespaceFilterTimed
];

export const trainingModules = Object.freeze(modules);

export const defaultTrainingModule = trainingModules[0];

export const getTrainingModule = (moduleId: string) =>
  trainingModules.find((module) => module.id === moduleId);
