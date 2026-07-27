import {
  type K8sResourceCommon,
  useActivePerspective,
  useK8sWatchResource
} from '@openshift-console/dynamic-plugin-sdk';
import {
  type CSSProperties,
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
import { instantiateTrainingModule } from '../modules/runtime';
import type {
  CompletionVerification,
  TrainingModule,
  TrainingModuleParameters,
  TrainingResource,
  TrainingStep,
  TrainingTarget
} from '../modules/types';
import { resolveConsoleElement } from '../platform/elements';
import { useConsoleNavigation } from '../platform/navigation';
import { resolveConsolePath, resolveConsoleTargetPaths } from '../platform/routes';
import './guidance.css';

const SESSION_KEY = 'academy-guidance.active-module';

type GuidanceSnapshot = {
  active: boolean;
  activeModule?: TrainingModule;
  activeTab: string;
  canCompleteModule: boolean;
  canPerformCurrentStep: boolean;
  completed: boolean;
  currentStep?: TrainingStep;
  currentNamespace: string;
  highlightId: string;
  highlightTarget?: TrainingTarget;
  highlightTargetFound: boolean;
  path: string;
  perspective: string;
  primaryResource?: TrainingResource;
  resourcePhase: string;
  step: number;
  timerRemainingSeconds?: number;
};

type WatchedResource = K8sResourceCommon & {
  status?: { phase?: string };
};

type GuidanceValue = GuidanceSnapshot & {
  clearHighlight: () => void;
  completeModule: () => void;
  highlight: (targetId: string) => void;
  openPage: (path: string) => void;
  performCurrentStep: () => void;
  reportHighlightTarget: (targetKey: string, found: boolean) => void;
  start: () => void;
  startModule: (moduleId: string, parameters?: TrainingModuleParameters) => boolean;
  stop: () => void;
  openResourceTab: (tab: string) => void;
};

const defaultValue: GuidanceValue = {
  active: false,
  activeModule: undefined,
  activeTab: '',
  canCompleteModule: false,
  canPerformCurrentStep: false,
  clearHighlight: () => undefined,
  completeModule: () => undefined,
  completed: false,
  currentStep: undefined,
  currentNamespace: '',
  highlight: () => undefined,
  highlightId: '',
  highlightTarget: undefined,
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
  timerRemainingSeconds: undefined,
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

const targetKey = (target?: TrainingTarget) => target ? JSON.stringify(target) : '';

const findTarget = (target?: TrainingTarget) => {
  if (!target) return null;
  if (target.type === 'quickStartId') {
    return document.querySelector<HTMLElement>(`[data-quickstart-id="${target.value}"]`);
  }
  if (target.type === 'consoleElement') {
    return resolveConsoleElement(target.id, target.value);
  }
  const selector = resolveConsoleTargetPaths(target.value)
    .map((path) => `a[href="${path}"]`)
    .join(', ');
  return document.querySelector<HTMLElement>(selector);
};

const routeMatches = (pathname: string, path: string) => {
  const expectedPath = resolveConsolePath(path);
  const expectedPaths = new Set([expectedPath, ...resolveConsoleTargetPaths(expectedPath)]);
  return [pathname, ...resolveConsoleTargetPaths(pathname)].some((candidate) =>
    expectedPaths.has(candidate)
  );
};

const verificationSatisfied = (
  verification: CompletionVerification,
  target: HTMLElement | null,
  pathname: string
) => {
  switch (verification.type) {
    case 'route':
      return routeMatches(pathname, verification.path);
    case 'namespace':
      return parseNamespace(pathname) === verification.value;
    case 'targetValue':
      return target instanceof HTMLInputElement && target.value === verification.value;
    case 'targetAttribute':
      return target?.getAttribute(verification.attribute) === verification.value;
  }
};

const loadStoredLesson = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as {
      moduleId?: string;
      parameters?: TrainingModuleParameters;
      step?: number;
    } | null;
    if (!stored?.moduleId || !getTrainingModule(stored.moduleId)) return null;
    return {
      moduleId: stored.moduleId,
      parameters: stored.parameters ?? {},
      step: Math.max(0, stored.step ?? 0)
    };
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
  const [activeModuleParameters, setActiveModuleParameters] =
    useState<TrainingModuleParameters>(storedLesson?.parameters ?? {});
  const [step, setStep] = useState(storedLesson?.step ?? 0);
  const [performedStep, setPerformedStep] = useState(-1);
  const [highlightTarget, setHighlightTarget] = useState<TrainingTarget>();
  const [resolvedHighlightId, setResolvedHighlightId] = useState('');
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>();
  const activeModule = useMemo(() => {
    const module = getTrainingModule(activeModuleId);
    return module ? instantiateTrainingModule(module, activeModuleParameters) : undefined;
  }, [activeModuleId, activeModuleParameters]);
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
  const completion = activeModule?.onComplete;
  const canCompleteModule = Boolean(completed && (
    (
      completion?.action === 'returnToOpener' &&
      window.opener &&
      !window.opener.closed
    ) ||
    (
      completion?.action === 'redirect' &&
      activeModuleParameters[completion.parameter]
    )
  ));
  const highlightId = targetKey(highlightTarget);
  const highlightTargetFound = Boolean(highlightId && resolvedHighlightId === highlightId);
  const canPerformCurrentStep = Boolean(
    active && currentStep?.complete.presentation && highlightTargetFound
  );

  const openPage = useCallback((path: string) => navigate(resolveConsolePath(path)), [navigate]);
  const highlight = useCallback(
    (targetId: string) => setHighlightTarget({ type: 'quickStartId', value: targetId }),
    []
  );
  const clearHighlight = useCallback(() => setHighlightTarget(undefined), []);
  const reportHighlightTarget = useCallback((resolvedTargetKey: string, found: boolean) => {
    setResolvedHighlightId(found ? resolvedTargetKey : '');
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
  const startModule = useCallback((
    moduleId: string,
    parameters: TrainingModuleParameters = {}
  ) => {
    const module = getTrainingModule(moduleId);
    if (!module || !instantiateTrainingModule(module, parameters)) return false;
    setActive(true);
    setActiveModuleId(module.id);
    setActiveModuleParameters(parameters);
    setStep(0);
    setPerformedStep(-1);
    setHighlightTarget(module.steps[0]?.target);
    return true;
  }, []);
  const start = useCallback(() => {
    startModule(defaultTrainingModule.id);
  }, [startModule]);
  const stop = useCallback(() => {
    setActive(false);
    setActiveModuleId('');
    setActiveModuleParameters({});
    setStep(0);
    setPerformedStep(-1);
    setHighlightTarget(undefined);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);
  const completeModule = useCallback(() => {
    const moduleCompletion = activeModule?.onComplete;
    if (moduleCompletion?.action === 'returnToOpener') {
      if (!window.opener || window.opener.closed) return;
      window.opener.focus();
      window.setTimeout(() => window.close(), 0);
      return;
    }
    if (moduleCompletion?.action === 'redirect') {
      const redirectUri = activeModuleParameters[moduleCompletion.parameter];
      if (redirectUri) window.location.assign(redirectUri);
    }
  }, [activeModule, activeModuleParameters]);
  const performCurrentStep = useCallback(() => {
    if (!canPerformCurrentStep || !currentStep?.complete.presentation) return;
    const verification = currentStep.complete.verify;
    const target = findTarget(currentStep.target);
    const verificationAlreadySatisfied = verificationSatisfied(
      verification,
      target,
      location.pathname
    );
    if (verificationAlreadySatisfied) {
      setStep((current) => (current === step ? current + 1 : current));
      return;
    }
    setPerformedStep(step);
  }, [canPerformCurrentStep, currentStep, location.pathname, step]);

  useEffect(() => {
    setHighlightTarget(active ? currentStep?.target : undefined);
    if (!active || !currentStep?.complete.presentation) return undefined;
    const frame = requestAnimationFrame(() => {
      findTarget(currentStep.target)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, currentStep]);

  useEffect(() => {
    const verification = currentStep?.complete.verify;
    if (
      !active ||
      !currentStep ||
      !verification ||
      !['namespace', 'route'].includes(verification.type) ||
      (currentStep.complete.presentation && performedStep !== step)
    ) return;
    if (verificationSatisfied(verification, findTarget(currentStep.target), location.pathname)) {
      if (verification.type === 'route') {
        const canonicalPath = resolveConsolePath(verification.path);
        if (location.pathname !== canonicalPath) navigate(canonicalPath);
      }
      setStep((current) => current + 1);
    }
  }, [active, currentStep, location.pathname, navigate, performedStep, step]);

  useEffect(() => {
    const verification = currentStep?.complete.verify;
    if (
      !active ||
      !currentStep ||
      !verification ||
      !['targetAttribute', 'targetValue'].includes(verification.type) ||
      (currentStep.complete.presentation && performedStep !== step)
    ) {
      return undefined;
    }
    let completedStep = false;
    const verifyDesiredState = () => {
      const desiredStateReached = verificationSatisfied(
        verification,
        findTarget(currentStep.target),
        location.pathname
      );
      if (!completedStep && desiredStateReached) {
        completedStep = true;
        setStep((current) => current + 1);
      }
    };

    const observer = new MutationObserver(verifyDesiredState);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    document.addEventListener('input', verifyDesiredState, true);
    document.addEventListener('change', verifyDesiredState, true);
    verifyDesiredState();
    return () => {
      observer.disconnect();
      document.removeEventListener('input', verifyDesiredState, true);
      document.removeEventListener('change', verifyDesiredState, true);
    };
  }, [active, currentStep, location.pathname, performedStep, step]);

  useEffect(() => {
    if (!active || !currentStep?.complete.presentation || performedStep !== step) return;
    const operation = currentStep.complete.operation;
    const target = findTarget(currentStep.target);
    if (verificationSatisfied(currentStep.complete.verify, target, location.pathname)) return;
    if (operation.type === 'navigate') {
      navigate(resolveConsolePath(operation.path));
      return;
    }
    if (operation.type === 'fillTarget') {
      if (target instanceof HTMLInputElement) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        valueSetter?.call(target, operation.value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    target?.click();
  }, [active, currentStep, location.pathname, navigate, performedStep, step]);

  useEffect(() => {
    const presentation = currentStep?.complete.presentation;
    if (
      !active ||
      !canPerformCurrentStep ||
      !presentation ||
      presentation.initiator !== 'timer'
    ) {
      setTimerRemainingSeconds(undefined);
      return undefined;
    }
    const match = presentation.delay.match(/^(\d+)(ms|s)$/);
    if (!match) return undefined;
    const duration = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    const deadline = Date.now() + duration;
    const updateCountdown = () => {
      setTimerRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateCountdown();
    const countdown = window.setInterval(updateCountdown, 250);
    const timer = window.setTimeout(performCurrentStep, duration);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [active, canPerformCurrentStep, currentStep, performCurrentStep]);

  useEffect(() => {
    if (!active || !activeModule || step === 0) return undefined;
    const previousStep = activeModule.steps[step - 1];
    if (previousStep.complete.verify.type !== 'targetAttribute') return undefined;

    const previousCondition = previousStep.complete.verify;
    let rolledBack = false;
    const verifyPrerequisite = () => {
      if (rolledBack || findTarget(currentStep?.target)) return;
      const previousTarget = findTarget(previousStep.target);
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
    if (completed && !activeModule.onComplete) {
      stop();
      return;
    }
    if (completed) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      moduleId: activeModule.id,
      parameters: activeModuleParameters,
      step
    }));
  }, [active, activeModule, activeModuleParameters, completed, step, stop]);

  return useMemo(
    () => ({
      active,
      activeModule,
      activeTab: parseTab(location.pathname, primaryResource),
      canCompleteModule,
      canPerformCurrentStep,
      clearHighlight,
      completeModule,
      completed,
      currentStep,
      currentNamespace: parseNamespace(location.pathname),
      highlight,
      highlightId,
      highlightTarget,
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
      timerRemainingSeconds,
      openResourceTab
    }),
    [
      active,
      activeModule,
      canCompleteModule,
      canPerformCurrentStep,
      clearHighlight,
      completeModule,
      completed,
      currentStep,
      highlight,
      highlightId,
      highlightTarget,
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
      stop,
      timerRemainingSeconds
    ]
  );
};

type TargetRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type TargetProps = {
  target?: TrainingTarget;
  onTargetState: (targetKey: string, found: boolean) => void;
};

const useTargetRect = ({ target, onTargetState }: TargetProps) => {
  const [targetRect, setTargetRect] = useState<TargetRect>();
  const resolvedTargetKey = targetKey(target);

  useEffect(() => {
    if (!target) {
      onTargetState('', false);
      setTargetRect(undefined);
      return undefined;
    }

    let frame = 0;
    let layoutFrame = 0;
    let layoutDeadline = 0;
    const measure = () => {
      const targetElement = findTarget(target);
      if (!targetElement) {
        onTargetState(resolvedTargetKey, false);
        setTargetRect(undefined);
        return;
      }
      const rect = targetElement.getBoundingClientRect();
      let visibleBottom = Math.min(rect.bottom, window.innerHeight);
      let visibleLeft = Math.max(rect.left, 0);
      let visibleRight = Math.min(rect.right, window.innerWidth);
      let visibleTop = Math.max(rect.top, 0);
      let ancestor = targetElement.parentElement;
      while (ancestor) {
        const style = window.getComputedStyle(ancestor);
        const ancestorRect = ancestor.getBoundingClientRect();
        if (['auto', 'clip', 'hidden', 'scroll'].includes(style.overflowX)) {
          visibleLeft = Math.max(visibleLeft, ancestorRect.left);
          visibleRight = Math.min(visibleRight, ancestorRect.right);
        }
        if (['auto', 'clip', 'hidden', 'scroll'].includes(style.overflowY)) {
          visibleTop = Math.max(visibleTop, ancestorRect.top);
          visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
        }
        ancestor = ancestor.parentElement;
      }
      const visible = targetElement.getClientRects().length > 0 &&
        visibleRight > visibleLeft &&
        visibleBottom > visibleTop;
      onTargetState(resolvedTargetKey, visible);
      if (!visible) {
        setTargetRect(undefined);
        return;
      }
      const nextRect = {
        bottom: visibleBottom,
        height: visibleBottom - visibleTop,
        left: visibleLeft,
        right: visibleRight,
        top: visibleTop,
        width: visibleRight - visibleLeft
      };
      setTargetRect((current) =>
        current && Object.keys(nextRect).every(
          (key) => current[key as keyof TargetRect] === nextRect[key as keyof TargetRect]
        ) ? current : nextRect
      );
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const trackLayoutTransition = () => {
      layoutDeadline = performance.now() + 400;
      if (layoutFrame) return;
      const track = () => {
        measure();
        layoutFrame = performance.now() < layoutDeadline
          ? requestAnimationFrame(track)
          : 0;
      };
      layoutFrame = requestAnimationFrame(track);
    };

    const observer = new MutationObserver((records) => {
      update();
      if (records.some((record) => record.type === 'attributes')) trackLayoutTransition();
    });
    observer.observe(document.body, {
      attributeFilter: ['aria-expanded', 'hidden'],
      attributes: true,
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(layoutFrame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [onTargetState, resolvedTargetKey, target]);

  return targetRect;
};

type BubblePlacement = 'above' | 'below' | 'left' | 'right';

const positionBubble = (rect: TargetRect) => {
  const gap = 16;
  const margin = 12;
  const width = Math.min(360, window.innerWidth - margin * 2);
  const estimatedHeight = 220;
  let placement: BubblePlacement = 'right';
  let left = rect.right + gap;
  let top = rect.top + rect.height / 2 - estimatedHeight / 2;

  if (window.innerWidth - rect.right < width + gap) {
    if (rect.left >= width + gap) {
      placement = 'left';
      left = rect.left - width - gap;
    } else if (window.innerHeight - rect.bottom >= estimatedHeight + gap) {
      placement = 'below';
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + gap;
    } else {
      placement = 'above';
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - estimatedHeight - gap;
    }
  }

  return {
    placement,
    style: {
      left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
      maxWidth: width,
      top: Math.max(margin, Math.min(top, window.innerHeight - estimatedHeight - margin)),
      width
    } satisfies CSSProperties
  };
};

const GuidanceTarget: FC<{ value: GuidanceValue }> = ({ value }) => {
  const targetRect = useTargetRect({
    target: value.highlightTarget,
    onTargetState: value.reportHighlightTarget
  });

  if (!targetRect) return null;
  const bubble = positionBubble(targetRect);

  return (
    <>
      <div
        className="academy-guidance__spotlight"
        style={{
          height: targetRect.height,
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width
        }}
      />
      {value.active && !value.completed && value.currentStep ? (
        <aside
          className={`academy-guidance__bubble academy-guidance__bubble--${bubble.placement}`}
          style={bubble.style}
          aria-live="polite"
        >
          <strong>{value.currentStep.title}</strong>
          <p>{value.currentStep.description}</p>
          {value.currentStep.complete.presentation?.initiator === 'continue' ? (
            <button
              type="button"
              disabled={!value.canPerformCurrentStep}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                value.performCurrentStep();
              }}
            >
              Continue
            </button>
          ) : null}
          {value.currentStep.complete.presentation?.initiator === 'timer' &&
          value.timerRemainingSeconds !== undefined ? (
            <small>Continuing in {value.timerRemainingSeconds}s</small>
          ) : null}
        </aside>
      ) : null}
    </>
  );
};

const GuidanceController: FC<{ value: GuidanceValue }> = ({ value }) =>
  value.active ? (
    <aside className="academy-guidance__controller" aria-live="polite">
      <strong>{value.activeModule?.title ?? 'Academy guidance'}</strong>
      {value.completed ? (
        <>
          <p>{value.activeModule?.completionText}</p>
          {value.activeModule?.onComplete ? (
            value.canCompleteModule ? (
              <button type="button" onClick={value.completeModule}>
                {value.activeModule.onComplete.label ?? 'Return to lesson'}
              </button>
            ) : (
              <p><small>The lesson return destination is unavailable.</small></p>
            )
          ) : null}
        </>
      ) : (
        <>
          <p>Step {value.step + 1} of {value.activeModule?.steps.length}</p>
          <p><small>{value.highlightTargetFound ? 'Target ready' : 'Waiting for the console element…'}</small></p>
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
    <GuidanceTarget value={value} />
    <GuidanceController value={value} />
  </GuidanceContext.Provider>
);

export const useGuidance = () => useContext(GuidanceContext);
