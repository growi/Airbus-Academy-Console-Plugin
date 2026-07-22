import academyPortalContainerAccess from './academy-portal-container-access.json';
import academyPortalContainerAccessManual from './academy-portal-container-access-manual.json';
import academyPortalContainerAccessTimed from './academy-portal-container-access-timed.json';
import type { TrainingModule } from './types';

const modules = [
  academyPortalContainerAccess as TrainingModule,
  academyPortalContainerAccessManual as TrainingModule,
  academyPortalContainerAccessTimed as TrainingModule
];

export const trainingModules = Object.freeze(modules);

export const defaultTrainingModule = trainingModules[0];

export const getTrainingModule = (moduleId: string) =>
  trainingModules.find((module) => module.id === moduleId);
