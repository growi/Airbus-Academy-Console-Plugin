import {
  type K8sResourceCommon,
  useActivePerspective,
  useK8sWatchResource
} from '@openshift-console/dynamic-plugin-sdk';
import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useLocation } from 'react-router';

import { defaultTrainingModule, getTrainingModule } from '../modules/catalog';
import type {
  TrainingModule,
  TrainingResource,
  TrainingStep,
  TrainingTarget
} from '../modules/types';
import { useConsoleNavigation } from '../platform/navigation';
import { resolveConsolePath, resolveConsoleTargetPaths } from '../platform/routes';
import './guidance.css';

const SESSION_KEY = 'academy-guidance.active-module';

type GuidanceSnapshot = {
  active: boolean;
  activeModule?: TrainingModule;
  activeTab: string;
  canPerformCurrentStep: boolean;
  completed: boolean;
  currentStep?: TrainingStep;
  currentNamespace: string;
  highlightId: string;
  highlightTargetFound: boolean;
  path: string;
  perspective: string;
  primaryResource?: TrainingResource;
  resourcePhase: string;
  step: number;
};

type WatchedResource = K8sResourceCommon & {
  status?: { phase?: string };
};

type GuidanceValue = GuidanceSnapshot & {
  clearHighlight: () => void;
  highlight: (targetId: string) => void;
  openPage: (path: string) => void;
  performCurrentStep: () => void;
  reportHighlightTarget: (targetSelector: string, found: boolean) => void;
  start: () => void;
  startModule: (moduleId: string) => boolean;
  stop: () => void;
  openResourceTab: (tab: string) => void;
};

const defaultValue: GuidanceValue = {
  active: false,
  activeModule: undefined,
  activeTab: '',
  canPerformCurrentStep: false,
  clearHighlight: () => undefined,
  completed: false,
  currentStep: undefined,
  currentNamespace: '',
  highlight: () => undefined,
  highlightId: '',
  highlightTargetFound: false,
  openPage: () => undefined,
  performCurrentStep: () => undefined,
  path: '',
  perspective: '',
  primaryResource: undefined,
  resourcePhase: '',
  reportHighlightTarget: () => undefined,
  start: () => undefined,
  startModule: () => false,
  step: 0,
  stop: () => undefined,
  openResourceTab: () => undefined
};

const GuidanceContext = createContext<GuidanceValue>(defaultValue);

const parseNamespace = (path: string) =>
  decodeURIComponent(path.match(/\/k8s\/ns\/([^/]+)/)?.[1] ?? '');

const parseTab = (path: string, resource?: TrainingResource) => {
  const tab = path.match(/\/(details|logs|terminal)$/)?.[1];
  return tab ?? (resource && path === resource.consolePath ? 'details' : '');
};

const parseApiVersion = (apiVersion: string) => {
  const [group, version] = apiVersion.includes('/')
    ? apiVersion.split('/', 2)
    : [undefined, apiVersion];
  return { group, version };
};

const selectorForTarget = (target?: TrainingTarget) => {
  if (!target) return '';
  if (target.type === 'quickStartId') {
    return `[data-quickstart-id="${target.value}"]`;
  }
  return resolveConsoleTargetPaths(target.value)
    .map((path) => `a[href="${path}"]`)
    .join(', ');
};

const routeMatches = (pathname: string, path: string) =>
  [resolveConsolePath(path), ...resolveConsoleTargetPaths(path)].includes(pathname);

const loadStoredLesson = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as {
      moduleId?: string;
      step?: number;
    } | null;
    if (!stored?.moduleId || !getTrainingModule(stored.moduleId)) return null;
    return { moduleId: stored.moduleId, step: Math.max(0, stored.step ?? 0) };
  } catch {
    return null;
  }
};

export const useGuidanceValuesForContext = (): GuidanceValue => {
  const location = useLocation();
  const navigate = useConsoleNavigation();
  const [perspective] = useActivePerspective();
  const [storedLesson] = useState(loadStoredLesson);
  const [active, setActive] = useState(Boolean(storedLesson));
  const [activeModuleId, setActiveModuleId] = useState(storedLesson?.moduleId ?? '');
  const [step, setStep] = useState(storedLesson?.step ?? 0);
  const [performedStep, setPerformedStep] = useState(-1);
  const [highlightId, setHighlightId] = useState('');
  const [resolvedHighlightId, setResolvedHighlightId] = useState('');
  const activeModule = getTrainingModule(activeModuleId);
  const resourceModule = activeModule ?? defaultTrainingModule;
  const primaryResource =
    resourceModule.context.resources[resourceModule.context.primaryResource];
  const resourceApi = parseApiVersion(primaryResource.apiVersion);
  const [resource, resourceLoaded, resourceError] = useK8sWatchResource<WatchedResource>({
    groupVersionKind: {
      ...(resourceApi.group ? { group: resourceApi.group } : {}),
      version: resourceApi.version,
      kind: primaryResource.kind
    },
    name: primaryResource.name,
    namespace: primaryResource.namespace
  });
  const currentStep = activeModule?.steps[step];
  const completed = Boolean(active && activeModule && step >= activeModule.steps.length);
  const highlightTargetFound = Boolean(highlightId && resolvedHighlightId === highlightId);
  const canPerformCurrentStep = Boolean(
    active && currentStep?.complete.presentation && highlightTargetFound
  );

  const openPage = useCallback((path: string) => navigate(resolveConsolePath(path)), [navigate]);
  const highlight = useCallback(
    (targetId: string) => setHighlightId(`[data-quickstart-id="${targetId}"]`),
    []
  );
  const clearHighlight = useCallback(() => setHighlightId(''), []);
  const reportHighlightTarget = useCallback((targetSelector: string, found: boolean) => {
    setResolvedHighlightId(found ? targetSelector : '');
  }, []);
  const openResourceTab = useCallback(
    (tab: string) => {
      const path = tab === 'details'
        ? primaryResource.consolePath
        : primaryResource.tabs?.[tab];
      if (path) navigate(resolveConsolePath(path));
    },
    [navigate, primaryResource]
  );
  const startModule = useCallback((moduleId: string) => {
    const module = getTrainingModule(moduleId);
    if (!module) return false;
    setActive(true);
    setActiveModuleId(module.id);
    setStep(0);
    setPerformedStep(-1);
    setHighlightId(selectorForTarget(module.steps[0]?.target));
    return true;
  }, []);
  const start = useCallback(() => {
    startModule(defaultTrainingModule.id);
  }, [startModule]);
  const stop = useCallback(() => {
    setActive(false);
    setActiveModuleId('');
    setStep(0);
    setPerformedStep(-1);
    setHighlightId('');
    sessionStorage.removeItem(SESSION_KEY);
  }, []);
  const performCurrentStep = useCallback(() => {
    if (!canPerformCurrentStep || !currentStep?.complete.presentation) return;
    setPerformedStep(step);
    const operation = currentStep.complete.operation;
    const verification = currentStep.complete.verify;
    const target = document.querySelector<HTMLElement>(selectorForTarget(currentStep.target));
    const verificationAlreadySatisfied = verification.type === 'route'
      ? routeMatches(location.pathname, verification.path)
      : target?.getAttribute(verification.attribute) === verification.value;
    if (verificationAlreadySatisfied) {
      setStep((current) => (current === step ? current + 1 : current));
      return;
    }
    if (operation.type === 'navigate') {
      navigate(resolveConsolePath(operation.path));
      return;
    }
    target?.click();
  }, [canPerformCurrentStep, currentStep, location.pathname, navigate, step]);

  useEffect(() => {
    setHighlightId(active ? selectorForTarget(currentStep?.target) : '');
  }, [active, currentStep]);

  useEffect(() => {
    if (
      !active ||
      !currentStep ||
      currentStep.complete.verify.type !== 'route' ||
      (currentStep.complete.presentation && performedStep !== step)
    ) return;
    const canonicalPath = resolveConsolePath(currentStep.complete.verify.path);
    if (routeMatches(location.pathname, currentStep.complete.verify.path)) {
      if (location.pathname !== canonicalPath) navigate(canonicalPath);
      setStep((current) => current + 1);
    }
  }, [active, currentStep, location.pathname, navigate, performedStep, step]);

  useEffect(() => {
    if (
      !active ||
      !currentStep ||
      currentStep.complete.verify.type !== 'targetAttribute' ||
      (currentStep.complete.presentation && performedStep !== step)
    ) {
      return undefined;
    }
    const completionCondition = currentStep.complete.verify;
    const targetSelector = selectorForTarget(currentStep.target);
    let completedStep = false;
    const verifyDesiredState = () => {
      const target = document.querySelector(targetSelector);
      const desiredStateReached =
        target?.getAttribute(completionCondition.attribute) === completionCondition.value;
      if (!completedStep && desiredStateReached) {
        completedStep = true;
        setStep((current) => current + 1);
      }
    };

    const observer = new MutationObserver(verifyDesiredState);
    observer.observe(document.body, {
      attributeFilter: [completionCondition.attribute],
      attributes: true,
      childList: true,
      subtree: true
    });
    verifyDesiredState();
    return () => observer.disconnect();
  }, [active, currentStep, performedStep, step]);

  useEffect(() => {
    const presentation = currentStep?.complete.presentation;
    if (
      !active ||
      !canPerformCurrentStep ||
      !presentation ||
      presentation.initiator !== 'timer'
    ) return undefined;
    const match = presentation.delay.match(/^(\d+)(ms|s)$/);
    if (!match) return undefined;
    const duration = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    const timer = window.setTimeout(performCurrentStep, duration);
    return () => window.clearTimeout(timer);
  }, [active, canPerformCurrentStep, currentStep, performCurrentStep]);

  useEffect(() => {
    if (!active || !activeModule || step === 0) return undefined;
    const previousStep = activeModule.steps[step - 1];
    if (previousStep.complete.verify.type !== 'targetAttribute') return undefined;

    const previousCondition = previousStep.complete.verify;
    const currentTargetSelector = selectorForTarget(currentStep?.target);
    const previousTargetSelector = selectorForTarget(previousStep.target);
    let rolledBack = false;
    const verifyPrerequisite = () => {
      if (rolledBack || document.querySelector(currentTargetSelector)) return;
      const previousTarget = document.querySelector(previousTargetSelector);
      const prerequisiteStillMet =
        previousTarget?.getAttribute(previousCondition.attribute) === previousCondition.value;
      if (!prerequisiteStillMet) {
        rolledBack = true;
        setStep((current) => (current === step ? current - 1 : current));
      }
    };

    const observer = new MutationObserver(verifyPrerequisite);
    observer.observe(document.body, {
      attributeFilter: [previousCondition.attribute],
      attributes: true,
      childList: true,
      subtree: true
    });
    verifyPrerequisite();
    return () => observer.disconnect();
  }, [active, activeModule, currentStep, step]);

  useEffect(() => {
    if (!active || !activeModule) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ moduleId: activeModule.id, step }));
  }, [active, activeModule, step]);

  return useMemo(
    () => ({
      active,
      activeModule,
      activeTab: parseTab(location.pathname, primaryResource),
      canPerformCurrentStep,
      clearHighlight,
      completed,
      currentStep,
      currentNamespace: parseNamespace(location.pathname),
      highlight,
      highlightId,
      highlightTargetFound,
      openPage,
      performCurrentStep,
      path: location.pathname,
      perspective,
      primaryResource,
      resourcePhase: resourceError
        ? 'unavailable'
        : resourceLoaded
          ? String(resource?.status?.phase ?? 'unknown')
          : 'loading',
      reportHighlightTarget,
      start,
      startModule,
      step,
      stop,
      openResourceTab
    }),
    [
      active,
      activeModule,
      canPerformCurrentStep,
      clearHighlight,
      completed,
      currentStep,
      highlight,
      highlightId,
      highlightTargetFound,
      location.pathname,
      openPage,
      openResourceTab,
      performCurrentStep,
      perspective,
      primaryResource,
      reportHighlightTarget,
      resource,
      resourceError,
      resourceLoaded,
      start,
      startModule,
      step,
      stop
    ]
  );
};

type OverlayProps = {
  targetSelector: string;
  onTargetState: (targetSelector: string, found: boolean) => void;
};

const GuidanceOverlay: FC<OverlayProps> = ({ targetSelector, onTargetState }) => {
  const [style, setStyle] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!targetSelector) {
      onTargetState('', false);
      setStyle({});
      return undefined;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.querySelector(targetSelector);
        onTargetState(targetSelector, Boolean(target));
        if (!target) {
          setStyle({});
          return;
        }
        const rect = target.getBoundingClientRect();
        setStyle({ height: rect.height, left: rect.left, top: rect.top, width: rect.width });
      });
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [onTargetState, targetSelector]);

  return style.width ? <div className="academy-guidance__spotlight" style={style} /> : null;
};

const GuidanceController: FC<{ value: GuidanceValue }> = ({ value }) =>
  value.active ? (
    <aside className="academy-guidance__controller" aria-live="polite">
      <strong>{value.activeModule?.title ?? 'Academy guidance'}</strong>
      {value.completed ? (
        <p>{value.activeModule?.completionText}</p>
      ) : (
        <>
          <p><strong>{value.currentStep?.title}</strong></p>
          <p>{value.currentStep?.description}</p>
          <small>
            Step {value.step + 1} of {value.activeModule?.steps.length}
          </small>
          {value.currentStep?.complete.presentation?.initiator === 'continue' ? (
            <p>
              <button
                type="button"
                disabled={!value.canPerformCurrentStep}
                onClick={value.performCurrentStep}
              >
                Continue
              </button>
            </p>
          ) : null}
          {value.currentStep?.complete.presentation?.initiator === 'timer' ? (
            <p>
              <small>Continuing in {value.currentStep.complete.presentation.delay}</small>
            </p>
          ) : null}
          {value.currentStep?.complete.presentation && !value.canPerformCurrentStep ? (
            <p><small>Waiting for the highlighted console target.</small></p>
          ) : null}
        </>
      )}
      <dl>
        <dt>Perspective</dt><dd>{value.perspective || 'unknown'}</dd>
        <dt>Namespace</dt><dd>{value.currentNamespace || 'none'}</dd>
        <dt>Tab</dt><dd>{value.activeTab || 'none'}</dd>
        <dt>{value.primaryResource?.label ?? 'Resource'}</dt><dd>{value.resourcePhase}</dd>
      </dl>
      <button type="button" className="academy-guidance__secondary" onClick={value.stop}>Stop</button>
    </aside>
  ) : null;

export const GuidanceProvider: FC<PropsWithChildren<{ value: GuidanceValue }>> = ({
  children,
  value
}) => (
  <GuidanceContext.Provider value={value}>
    {children}
    <GuidanceOverlay
      targetSelector={value.highlightId}
      onTargetState={value.reportHighlightTarget}
    />
    <GuidanceController value={value} />
  </GuidanceContext.Provider>
);

export const useGuidance = () => useContext(GuidanceContext);
