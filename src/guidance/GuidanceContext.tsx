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
import type { TrainingModule, TrainingStep, TrainingTarget } from '../modules/types';
import { useConsoleNavigation } from '../platform/navigation';
import './guidance.css';

const NAMESPACE = 'dcs-academy-portal';
const POD_NAME = 'dcs-academy-portal-db-1';
const POD_PATH = `/k8s/ns/${NAMESPACE}/pods/${POD_NAME}`;
const SESSION_KEY = 'academy-guidance.active-module';

type GuidanceSnapshot = {
  active: boolean;
  activeModule?: TrainingModule;
  activeTab: string;
  completed: boolean;
  currentStep?: TrainingStep;
  currentNamespace: string;
  highlightId: string;
  highlightTargetFound: boolean;
  path: string;
  perspective: string;
  podPhase: string;
  step: number;
};

type PodResource = K8sResourceCommon & {
  status?: { phase?: string };
};

type GuidanceValue = GuidanceSnapshot & {
  clearHighlight: () => void;
  highlight: (targetId: string) => void;
  openPage: (path: string) => void;
  reportHighlightTarget: (found: boolean) => void;
  start: () => void;
  startModule: (moduleId: string) => boolean;
  stop: () => void;
  switchPodTab: (tab: 'details' | 'logs' | 'terminal') => void;
};

const defaultValue: GuidanceValue = {
  active: false,
  activeModule: undefined,
  activeTab: '',
  clearHighlight: () => undefined,
  completed: false,
  currentStep: undefined,
  currentNamespace: '',
  highlight: () => undefined,
  highlightId: '',
  highlightTargetFound: false,
  openPage: () => undefined,
  path: '',
  perspective: '',
  podPhase: '',
  reportHighlightTarget: () => undefined,
  start: () => undefined,
  startModule: () => false,
  step: 0,
  stop: () => undefined,
  switchPodTab: () => undefined
};

const GuidanceContext = createContext<GuidanceValue>(defaultValue);

const parseNamespace = (path: string) =>
  decodeURIComponent(path.match(/\/k8s\/ns\/([^/]+)/)?.[1] ?? '');

const parseTab = (path: string) => {
  const tab = path.match(/\/(details|logs|terminal)$/)?.[1];
  return tab ?? (path.includes(`/pods/${POD_NAME}`) ? 'details' : '');
};

const selectorForTarget = (target?: TrainingTarget) => {
  if (!target) return '';
  if (target.type === 'quickStartId') {
    return `[data-quickstart-id="${target.value}"]`;
  }
  return `a[href="${target.value}"]`;
};

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
  const [highlightId, setHighlightId] = useState('');
  const [highlightTargetFound, setHighlightTargetFound] = useState(false);
  const [pod, podLoaded, podError] = useK8sWatchResource<PodResource>({
    groupVersionKind: { version: 'v1', kind: 'Pod' },
    name: POD_NAME,
    namespace: NAMESPACE
  });
  const activeModule = getTrainingModule(activeModuleId);
  const currentStep = activeModule?.steps[step];
  const completed = Boolean(active && activeModule && step >= activeModule.steps.length);

  const openPage = useCallback((path: string) => navigate(path), [navigate]);
  const highlight = useCallback(
    (targetId: string) => setHighlightId(`[data-quickstart-id="${targetId}"]`),
    []
  );
  const clearHighlight = useCallback(() => setHighlightId(''), []);
  const reportHighlightTarget = useCallback((found: boolean) => setHighlightTargetFound(found), []);
  const switchPodTab = useCallback(
    (tab: 'details' | 'logs' | 'terminal') =>
      navigate(tab === 'details' ? POD_PATH : `${POD_PATH}/${tab}`),
    [navigate]
  );
  const startModule = useCallback((moduleId: string) => {
    const module = getTrainingModule(moduleId);
    if (!module) return false;
    setActive(true);
    setActiveModuleId(module.id);
    setStep(0);
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
    setHighlightId('');
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    setHighlightId(active ? selectorForTarget(currentStep?.target) : '');
  }, [active, currentStep]);

  useEffect(() => {
    if (!active || !currentStep || currentStep.completeWhen.type !== 'route') return;
    if (location.pathname === currentStep.completeWhen.value) {
      setStep((current) => current + 1);
    }
  }, [active, currentStep, location.pathname]);

  useEffect(() => {
    if (!active || !currentStep || currentStep.completeWhen.type !== 'targetAttribute') {
      return undefined;
    }
    const completionCondition = currentStep.completeWhen;
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
  }, [active, currentStep]);

  useEffect(() => {
    if (!active || !activeModule) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ moduleId: activeModule.id, step }));
  }, [active, activeModule, step]);

  return useMemo(
    () => ({
      active,
      activeModule,
      activeTab: parseTab(location.pathname),
      clearHighlight,
      completed,
      currentStep,
      currentNamespace: parseNamespace(location.pathname),
      highlight,
      highlightId,
      highlightTargetFound,
      openPage,
      path: location.pathname,
      perspective,
      podPhase: podError ? 'unavailable' : podLoaded ? String(pod?.status?.phase ?? 'unknown') : 'loading',
      reportHighlightTarget,
      start,
      startModule,
      step,
      stop,
      switchPodTab
    }),
    [
      active,
      activeModule,
      clearHighlight,
      completed,
      currentStep,
      highlight,
      highlightId,
      highlightTargetFound,
      location.pathname,
      openPage,
      perspective,
      pod,
      podError,
      podLoaded,
      reportHighlightTarget,
      start,
      startModule,
      step,
      stop,
      switchPodTab
    ]
  );
};

type OverlayProps = {
  targetSelector: string;
  onTargetState: (found: boolean) => void;
};

const GuidanceOverlay: FC<OverlayProps> = ({ targetSelector, onTargetState }) => {
  const [style, setStyle] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!targetSelector) {
      onTargetState(false);
      setStyle({});
      return undefined;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.querySelector(targetSelector);
        onTargetState(Boolean(target));
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
        </>
      )}
      <dl>
        <dt>Perspective</dt><dd>{value.perspective || 'unknown'}</dd>
        <dt>Namespace</dt><dd>{value.currentNamespace || 'none'}</dd>
        <dt>Tab</dt><dd>{value.activeTab || 'none'}</dd>
        <dt>Pod</dt><dd>{value.podPhase}</dd>
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
