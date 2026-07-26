import {
  DocumentTitle,
  ListPageHeader,
  useActiveNamespace
} from '@openshift-console/dynamic-plugin-sdk';
import { Alert, Content, PageSection } from '@patternfly/react-core';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';

import { type LabLaunchOptions, useGuidance } from '../guidance/GuidanceContext';
import {
  activeNamespaceParameters,
  resolveLab,
  sanitizeLabParameters,
  useConsoleLabs
} from '../modules/labs';
import type { TrainingMode } from '../modules/types';

const LessonLauncherPage: FC = () => {
  const location = useLocation();
  const routeParams = useParams() as { labId?: string; moduleId?: string };
  const labId = routeParams.labId ?? routeParams.moduleId ??
    decodeURIComponent(location.pathname.match(/^\/academy\/lessons\/([^/]+)\/start$/)?.[1] ?? '');
  const guidance = useGuidance();
  const { labs, loaded } = useConsoleLabs();
  const [activeNamespace, setActiveNamespace] = useActiveNamespace();
  const [launched, setLaunched] = useState(false);

  const launch = useMemo<LabLaunchOptions>(() => {
    const query = new URLSearchParams(location.search);
    const requestedMode = query.get('mode');
    const namespace = activeNamespace ?? '';
    return {
      mode: requestedMode === 'timed' || requestedMode === 'assisted'
        ? (requestedMode as TrainingMode)
        : undefined,
      // The launch URL wins; the active project is only a fallback for labs opened by hand.
      parameters: {
        ...activeNamespaceParameters(namespace),
        ...sanitizeLabParameters(location.search)
      },
      returnUrl: query.get('returnUrl') ?? undefined
    };
  }, [activeNamespace, location.search]);

  const lab = labs.find((candidate) => candidate.metadata?.name === labId);
  const { module, missingParameters } = resolveLab(lab, launch.parameters);

  useEffect(() => {
    if (launched || !loaded || !module) return;
    // Scope the console to the lab's namespace before starting. The active project is
    // console-wide state that survives from whatever the user last opened in another
    // tab, and every sidebar link is built from it — without this the learner is
    // walked through the right steps in the wrong project.
    const labNamespace = launch.parameters.namespace;
    if (labNamespace && labNamespace !== activeNamespace) setActiveNamespace(labNamespace);
    setLaunched(guidance.startLab(labId, launch));
  }, [activeNamespace, guidance.startLab, labId, launch, launched, loaded, module,
      setActiveNamespace]);

  const title = module?.title ?? (loaded ? 'Academy lab unavailable' : 'Starting the lab…');

  return (
    <>
      <DocumentTitle>{title}</DocumentTitle>
      <ListPageHeader title={title} />
      <PageSection>
        {module ? (
          <>
            <Alert variant="success" isInline title="Lab started" />
            <Content component="p">
              {module.description} Follow the highlighted console element and the guidance box.
              You can leave this page; the lab stays active in this browser tab.
            </Content>
          </>
        ) : null}
        {!module && loaded && !lab ? (
          <Alert variant="danger" isInline title={`Lab '${labId}' was not found on this cluster`} />
        ) : null}
        {!module && loaded && lab ? (
          <Alert
            variant="danger"
            isInline
            title={`Lab '${labId}' needs launch parameters: ${missingParameters.join(', ')}`}
          >
            <Content component="p">
              This lab runs against resources that the Academy portal provisions. Start it from
              the portal, or add the missing parameters to the launch URL
              (for example <code>?ns=my-project</code>).
            </Content>
          </Alert>
        ) : null}
      </PageSection>
    </>
  );
};

export default LessonLauncherPage;
