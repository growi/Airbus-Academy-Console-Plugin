import academyPortalContainerAccess from './academy-portal-container-access.json';
import type { TrainingModule } from './types';

const modules = [academyPortalContainerAccess as TrainingModule];

export const trainingModules = Object.freeze(modules);

export const defaultTrainingModule = trainingModules[0];

export const getTrainingModule = (moduleId: string) =>
  trainingModules.find((module) => module.id === moduleId);
