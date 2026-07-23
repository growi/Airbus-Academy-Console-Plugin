import academyPortalContainerAccess from './academy-portal-container-access.json';
import academyPortalContainerAccessManual from './academy-portal-container-access-manual.json';
import academyPortalContainerAccessTimed from './academy-portal-container-access-timed.json';
import academyPortalNamespaceFilter from './academy-portal-namespace-filter.json';
import educatesSessionPods from './educates-session-pods.json';
import labA06NamespaceIsolation from './lab-a06-namespace-isolation.json';
import labA08OpenShiftConsole from './lab-a08-openshift-console.json';
import type { TrainingMode, TrainingModule, TrainingModuleCatalogEntry } from './types';
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

const a08Module = labA08OpenShiftConsole as TrainingModule;
const a08Manual = createPresentationVariant(
  a08Module,
  {
    id: 'lab-a08-openshift-console-manual',
    title: 'A08 — The OpenShift Console (presentation: Continue)',
    description: 'Review each console area and press Continue to navigate through the live resources.'
  },
  { initiator: 'continue' }
);
const a08Timed = createPresentationVariant(
  a08Module,
  {
    id: 'lab-a08-openshift-console-timed',
    title: 'A08 — The OpenShift Console (presentation: timed)',
    description: 'Watch a guided presentation of the main OpenShift console resource areas.'
  },
  { initiator: 'timer', delay: '5s' }
);

const a06Module = labA06NamespaceIsolation as TrainingModule;
const a06Manual = createPresentationVariant(
  a06Module,
  {
    id: 'lab-a06-namespace-isolation-manual',
    title: 'A06 — Namespace isolation (presentation: Continue)',
    description: 'Press Continue to compare same-named resources across two OpenShift projects.'
  },
  { initiator: 'continue' }
);
const a06Timed = createPresentationVariant(
  a06Module,
  {
    id: 'lab-a06-namespace-isolation-timed',
    title: 'A06 — Namespace isolation (presentation: timed)',
    description: 'Watch the console change namespace scope while the resource name remains the same.'
  },
  { initiator: 'timer', delay: '5s' }
);

const modules = [
  academyPortalContainerAccess as TrainingModule,
  academyPortalContainerAccessManual as TrainingModule,
  academyPortalContainerAccessTimed as TrainingModule,
  namespaceFilterModule,
  namespaceFilterManual,
  namespaceFilterTimed,
  a08Module,
  a08Manual,
  a08Timed,
  a06Module,
  a06Manual,
  a06Timed,
  educatesSessionPods as TrainingModule
];

export const trainingModules = Object.freeze(modules);

const getTrainingMode = (module: TrainingModule): TrainingMode => {
  const initiator = module.steps[0]?.complete.presentation?.initiator;
  return initiator === 'timer' ? 'timed' : initiator ?? 'assisted';
};

export const trainingModuleCatalog: readonly TrainingModuleCatalogEntry[] = Object.freeze(
  trainingModules.map((module) => ({ module, mode: getTrainingMode(module) }))
);

export const defaultTrainingModule = trainingModules[0];

export const getTrainingModule = (moduleId: string) =>
  trainingModules.find((module) => module.id === moduleId);
