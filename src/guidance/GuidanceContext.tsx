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

import { isAllowedReturnUrl, resolveLab, useAcademySettings, useConsoleLabs } from '../modules/labs';
import type {
  AcademySettings,
  CompletionVerification,
  LabParameters,
  TrainingMode,
  TrainingModule,
  TrainingResource,
  TrainingStep,
  TrainingTarget
} from '../modules/types';
import { resolveConsoleElement } from '../platform/elements';
import { useConsoleNavigation } from '../platform/navigation';
import { resolveConsolePath, resolveConsoleTargetPaths } from '../platform/routes';
import './guidance.css';
import { pathsMatch, pathVariants } from './paths';

const SESSION_KEY = 'academy-guidance.active-lab';

export type LabLaunchOptions = {
  parameters: LabParameters;
  mode?: TrainingMode;
  returnUrl?: string;
};

type StoredLesson = {
  labId: string;
  step: number;
  parameters: LabParameters;
  mode?: TrainingMode;
  returnUrl?: string;
};

type GuidanceSnapshot = {
  active: boolean;
  activeModule?: TrainingModule;
  activeTab: string;
  completed: boolean;
  currentStep?: TrainingStep;
  currentNamespace: string;
  highlightId: string;
  highlightTarget?: TrainingTarget;
  highlightTargetFound: boolean;
  labsLoaded: boolean;
  path: string;
  perspective: string;
  primaryResource?: TrainingResource;
  resourcePhase: string;
  returnUrl: string;
  settings: AcademySettings;
  step: number;
  timerRemainingSeconds?: number;
};

type WatchedResource = K8sResourceCommon & {
  status?: { phase?: string };
};

type GuidanceValue = GuidanceSnapshot & {
  goBack: () => void;
  performCurrentStep: () => void;
  reportHighlightTarget: (targetKey: string, found: boolean) => void;
  startLab: (labId: string, options: LabLaunchOptions) => boolean;
  stop: () => void;
};

const defaultValue: GuidanceValue = {
  active: false,
  activeModule: undefined,
  activeTab: '',
  completed: false,
  currentStep: undefined,
  currentNamespace: '',
  goBack: () => undefined,
  highlightId: '',
  highlightTarget: undefined,
  highlightTargetFound: false,
  labsLoaded: false,
  path: '',
  performCurrentStep: () => undefined,
  perspective: '',
  primaryResource: undefined,
  resourcePhase: '',
  reportHighlightTarget: () => undefined,
  returnUrl: '',
  settings: { portalUrl: '', portalLinkText: '' },
  startLab: () => false,
  step: 0,
  stop: () => undefined,
  timerRemainingSeconds: undefined
};

const GuidanceContext = createContext<GuidanceValue>(defaultValue);

const parseNamespace = (path: string) =>
  decodeURIComponent(path.match(/\/k8s\/ns\/([^/]+)/)?.[1] ?? '');

const parseTab = (path: string, resource?: TrainingResource) => {
  const tab = path.match(/\/(details|logs|terminal)$/)?.[1];
  return tab ?? (resource && pathsMatch(path, resource.consolePath) ? 'details' : '');
};

const parseApiVersion = (apiVersion: string) => {
  const [group, version] = apiVersion.includes('/')
    ? apiVersion.split('/', 2)
    : [undefined, apiVersion];
  return { group, version };
};

const targetKey = (target?: TrainingTarget) => (target ? JSON.stringify(target) : '');

const hrefSelector = (path: string) =>
  [resolveConsolePath(path), ...resolveConsoleTargetPaths(path), ...pathVariants(path)]
    .filter((candidate) => candidate.startsWith('/'))
    .map((candidate) => `a[href="${candidate}"]`)
    .join(', ');

const findTarget = (target?: TrainingTarget) => {
  if (!target) return null;
  if (target.type === 'quickStartId') {
    return document.querySelector<HTMLElement>(`[data-quickstart-id="${target.value}"]`);
  }
  if (target.type === 'consoleElement') {
    return resolveConsoleElement(target.id, target.value);
  }
  return document.querySelector<HTMLElement>(hrefSelector(target.value));
};

const routeMatches = (pathname: string, path: string) => {
  const expected = resolveConsolePath(path);
  return (
    pathsMatch(pathname, expected) ||
    resolveConsoleTargetPaths(expected).some((candidate) => pathsMatch(pathname, candidate))
  );
};

/**
 * Console markup nests the element that actually carries the state inside (or around) the
 * element a target resolves to — the aria-expanded lives on the toggle button, the value on
 * the input inside the wrapper. Verification looks in both directions so a markup change
 * between console releases degrades into a Continue click rather than a stuck step.
 */
const elementWithAttribute = (target: HTMLElement | null, attribute: string) => {
  if (!target) return null;
  if (target.hasAttribute(attribute)) return target;
  return target.closest<HTMLElement>(`[${attribute}]`) ??
    target.querySelector<HTMLElement>(`[${attribute}]`);
};

const inputForTarget = (target: HTMLElement | null) => {
  if (target instanceof HTMLInputElement) return target;
  return target?.querySelector<HTMLInputElement>('input') ?? null;
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
      return inputForTarget(target)?.value === verification.value;
    case 'targetAttribute':
      return (
        elementWithAttribute(target, verification.attribute)?.getAttribute(
          verification.attribute
        ) === verification.value
      );
  }
};

const fillInput = (target: HTMLElement | null, value: string) => {
  const input = inputForTarget(target);
  if (!input) return;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const loadStoredLesson = (): StoredLesson | null => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as StoredLesson | null;
    if (!stored?.labId) return null;
    return {
      labId: stored.labId,
      mode: stored.mode,
      parameters: stored.parameters ?? {},
      returnUrl: stored.returnUrl,
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
  const { labs, loaded: labsLoaded } = useConsoleLabs();
  const settings = useAcademySettings();
  const [lesson, setLesson] = useState<StoredLesson | null>(loadStoredLesson);
  /** Step the learner returned to with Back; auto-advance stays off until they leave it. */
  const [heldStep, setHeldStep] = useState(-1);
  const [resolvedHighlightId, setResolvedHighlightId] = useState('');
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>();

  const activeModule = useMemo(() => {
    if (!lesson) return undefined;
    const { module } = resolveLab(
      labs.find((lab) => lab.metadata?.name === lesson.labId),
      lesson.parameters
    );
    return module && lesson.mode ? { ...module, mode: lesson.mode } : module;
  }, [labs, lesson]);

  const step = lesson?.step ?? 0;
  const completed = Boolean(activeModule && step >= activeModule.steps.length);
  const currentStep = completed ? undefined : activeModule?.steps[step];
  const highlightTarget = currentStep?.target;
  const highlightId = targetKey(highlightTarget);
  const highlightTargetFound = Boolean(highlightId && resolvedHighlightId === highlightId);

  const primaryResource = activeModule?.context?.resources[activeModule.context.primaryResource];
  const resourceApi = primaryResource ? parseApiVersion(primaryResource.apiVersion) : undefined;
  const [resource, resourceLoaded, resourceError] = useK8sWatchResource<WatchedResource>(
    primaryResource && resourceApi
      ? {
          groupVersionKind: {
            ...(resourceApi.group ? { group: resourceApi.group } : {}),
            version: resourceApi.version,
            kind: primaryResource.kind
          },
          name: primaryResource.name,
          namespace: primaryResource.namespace
        }
      : null
  );

  const advanceFrom = useCallback((completedStep: number) => {
    setLesson((current) =>
      current && current.step === completedStep
        ? { ...current, step: completedStep + 1 }
        : current
    );
  }, []);

  const reportHighlightTarget = useCallback((resolvedTargetKey: string, found: boolean) => {
    setResolvedHighlightId(found ? resolvedTargetKey : '');
  }, []);

  const stop = useCallback(() => {
    setLesson(null);
    setHeldStep(-1);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const startLab = useCallback(
    (labId: string, options: LabLaunchOptions) => {
      const lab = labs.find((candidate) => candidate.metadata?.name === labId);
      const { module } = resolveLab(lab, options.parameters);
      if (!module) return false;
      setHeldStep(-1);
      setLesson({
        labId,
        mode: options.mode,
        parameters: options.parameters,
        returnUrl: options.returnUrl,
        step: 0
      });
      return true;
    },
    [labs]
  );

  /**
   * Continue is the failsafe: it performs the step's operation when the console is not already
   * in the desired state and then advances regardless of whether verification ever fires, so a
   * detector that breaks on a console update costs one click instead of the whole lab.
   */
  const performCurrentStep = useCallback(() => {
    if (!currentStep) return;
    setHeldStep(-1);
    const target = findTarget(currentStep.target);
    if (!verificationSatisfied(currentStep.complete.verify, target, location.pathname)) {
      const operation = currentStep.complete.operation;
      if (operation.type === 'navigate') navigate(resolveConsolePath(operation.path));
      else if (operation.type === 'fillTarget') fillInput(target, operation.value);
      else target?.click();
    }
    advanceFrom(step);
  }, [advanceFrom, currentStep, location.pathname, navigate, step]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setHeldStep(step - 1);
    setLesson((current) =>
      current && current.step === step ? { ...current, step: step - 1 } : current
    );
  }, [step]);

  useEffect(() => {
    if (!currentStep) return undefined;
    const frame = requestAnimationFrame(() => {
      findTarget(currentStep.target)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentStep]);

  useEffect(() => {
    const verification = currentStep?.complete.verify;
    if (!verification || !['namespace', 'route'].includes(verification.type)) return;
    const satisfied = verificationSatisfied(
      verification,
      findTarget(currentStep.target),
      location.pathname
    );
    if (!satisfied) {
      if (heldStep === step) setHeldStep(-1);
      return;
    }
    if (heldStep !== step) advanceFrom(step);
  }, [advanceFrom, currentStep, heldStep, location.pathname, step]);

  useEffect(() => {
    const verification = currentStep?.complete.verify;
    if (!verification || !['targetAttribute', 'targetValue'].includes(verification.type)) {
      return undefined;
    }
    let advanced = false;
    const verifyDesiredState = () => {
      const desiredStateReached = verificationSatisfied(
        verification,
        findTarget(currentStep.target),
        location.pathname
      );
      if (!desiredStateReached) {
        if (heldStep === step) setHeldStep(-1);
        return;
      }
      if (!advanced && heldStep !== step) {
        advanced = true;
        advanceFrom(step);
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
  }, [advanceFrom, currentStep, heldStep, location.pathname, step]);

  useEffect(() => {
    // Deliberately not gated on the target being found: a demo that waits forever for an element
    // the current page never renders is worse than one that performs the step and moves on.
    if (activeModule?.mode !== 'timed' || !currentStep || heldStep === step) {
      setTimerRemainingSeconds(undefined);
      return undefined;
    }
    const match = activeModule.timerDelay.match(/^(\d+)(ms|s)$/);
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
  }, [activeModule, currentStep, heldStep, performCurrentStep, step]);

  useEffect(() => {
    if (!activeModule || !currentStep || step === 0) return undefined;
    const previousStep = activeModule.steps[step - 1];
    if (previousStep.complete.verify.type !== 'targetAttribute') return undefined;

    const previousCondition = previousStep.complete.verify;
    let rolledBack = false;
    const verifyPrerequisite = () => {
      if (rolledBack || findTarget(currentStep.target)) return;
      const previousTarget = elementWithAttribute(
        findTarget(previousStep.target),
        previousCondition.attribute
      );
      const prerequisiteStillMet =
        previousTarget?.getAttribute(previousCondition.attribute) === previousCondition.value;
      if (!prerequisiteStillMet) {
        rolledBack = true;
        setLesson((current) =>
          current && current.step === step ? { ...current, step: step - 1 } : current
        );
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
  }, [activeModule, currentStep, step]);

  // A lesson whose lab was deleted, renamed, or is missing a launch parameter cannot run.
  useEffect(() => {
    if (lesson && labsLoaded && !activeModule) stop();
  }, [activeModule, labsLoaded, lesson, stop]);

  useEffect(() => {
    if (!lesson) return;
    if (completed) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lesson));
  }, [completed, lesson]);

  const returnUrl =
    lesson?.returnUrl && isAllowedReturnUrl(lesson.returnUrl, settings.portalUrl)
      ? lesson.returnUrl
      : '';

  return useMemo(
    () => ({
      active: Boolean(lesson),
      activeModule,
      activeTab: parseTab(location.pathname, primaryResource),
      completed,
      currentStep,
      currentNamespace: parseNamespace(location.pathname),
      goBack,
      highlightId,
      highlightTarget,
      highlightTargetFound,
      labsLoaded,
      path: location.pathname,
      performCurrentStep,
      perspective,
      primaryResource,
      resourcePhase: resourceError
        ? 'unavailable'
        : !primaryResource
          ? 'none'
          : resourceLoaded
            ? String(resource?.status?.phase ?? 'unknown')
            : 'loading',
      reportHighlightTarget,
      returnUrl,
      settings,
      startLab,
      step,
      stop,
      timerRemainingSeconds
    }),
    [
      activeModule,
      completed,
      currentStep,
      goBack,
      highlightId,
      highlightTarget,
      highlightTargetFound,
      labsLoaded,
      lesson,
      location.pathname,
      performCurrentStep,
      perspective,
      primaryResource,
      reportHighlightTarget,
      resource,
      resourceError,
      resourceLoaded,
      returnUrl,
      settings,
      startLab,
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

const StepControls: FC<{ value: GuidanceValue }> = ({ value }) => (
  <div className="academy-guidance__actions">
    <button
      type="button"
      className="academy-guidance__secondary"
      disabled={value.step === 0}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        value.goBack();
      }}
    >
      Back
    </button>
    <button
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        value.performCurrentStep();
      }}
    >
      Continue
    </button>
    {value.timerRemainingSeconds !== undefined ? (
      <small>Continuing in {value.timerRemainingSeconds}s</small>
    ) : null}
  </div>
);

const GuidanceTarget: FC<{ value: GuidanceValue }> = ({ value }) => {
  const targetRect = useTargetRect({
    target: value.highlightTarget,
    onTargetState: value.reportHighlightTarget
  });

  // The measured rect belongs to the previous step for one render after the step changes.
  // Gating on highlightTargetFound keeps the bubble and the panel's fallback step block
  // mutually exclusive, so a step never shows two Continue buttons.
  if (!targetRect || !value.highlightTargetFound) return null;
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
      {value.currentStep ? (
        <aside
          className={`academy-guidance__bubble academy-guidance__bubble--${bubble.placement}`}
          style={bubble.style}
          aria-live="polite"
        >
          <strong>{value.currentStep.title}</strong>
          <p>{value.currentStep.description}</p>
          <StepControls value={value} />
        </aside>
      ) : null}
    </>
  );
};

const GuidanceController: FC<{ value: GuidanceValue }> = ({ value }) => {
  if (!value.active) return null;
  if (!value.activeModule) {
    return (
      <aside className="academy-guidance__controller" aria-live="polite">
        <strong>Academy guidance</strong>
        <p><small>Loading lab…</small></p>
      </aside>
    );
  }

  return (
    <aside className="academy-guidance__controller" aria-live="polite">
      <strong>{value.activeModule.title}</strong>
      {value.completed ? (
        <p>{value.activeModule.completionText}</p>
      ) : (
        <>
          <p>Step {value.step + 1} of {value.activeModule.steps.length}</p>
          <p>
            <small>
              {value.highlightTargetFound
                ? 'Target ready'
                : 'Waiting for the console element — use Continue to move on.'}
            </small>
          </p>
          {/* The anchored bubble is gone whenever its target cannot be measured, so the
              persistent panel carries the same step and controls. */}
          {value.highlightTargetFound ? null : (
            <div className="academy-guidance__step">
              <strong>{value.currentStep?.title}</strong>
              <p>{value.currentStep?.description}</p>
              <StepControls value={value} />
            </div>
          )}
        </>
      )}
      <dl>
        <dt>Perspective</dt><dd>{value.perspective || 'unknown'}</dd>
        <dt>Namespace</dt><dd>{value.currentNamespace || 'none'}</dd>
        <dt>Tab</dt><dd>{value.activeTab || 'none'}</dd>
        <dt>{value.primaryResource?.label ?? 'Resource'}</dt><dd>{value.resourcePhase}</dd>
      </dl>
      <div className="academy-guidance__actions">
        <button type="button" className="academy-guidance__secondary" onClick={value.stop}>
          {value.completed ? 'Finish' : 'Stop'}
        </button>
        {value.completed && value.returnUrl ? (
          <a className="academy-guidance__return" href={value.returnUrl}>
            Return to the Academy
          </a>
        ) : null}
      </div>
    </aside>
  );
};

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
