import { DocumentTitle, ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, Content, PageSection } from '@patternfly/react-core';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';

import { useGuidance } from '../guidance/GuidanceContext';
import { getTrainingModule } from '../modules/catalog';

const LessonLauncherPage: FC = () => {
  const location = useLocation();
  const routeParams = useParams() as { moduleId?: string };
  const moduleId = routeParams.moduleId ??
    decodeURIComponent(location.pathname.match(/^\/academy\/lessons\/([^/]+)\/start$/)?.[1] ?? '');
  const guidance = useGuidance();
  const module = getTrainingModule(moduleId);
  const namespace = new URLSearchParams(location.search).get('namespace') ?? undefined;
  const [started, setStarted] = useState<boolean>();

  useEffect(() => {
    if (module) {
      setStarted(guidance.startModule(
        module.id,
        namespace ? { namespace } : {}
      ));
    }
  }, [guidance.startModule, module, namespace]);

  return (
    <>
      <DocumentTitle>{module?.title ?? 'Unknown Academy lesson'}</DocumentTitle>
      <ListPageHeader title={module?.title ?? 'Unknown Academy lesson'} />
      <PageSection>
        {module && started !== false ? (
          <>
            <Alert variant="success" isInline title="Lesson started" />
            <Content component="p">
              {module.description} Follow the highlighted console element and the persistent
              guidance box. You can now leave this page; the lesson remains active in this tab.
            </Content>
          </>
        ) : module ? (
          <Alert
            variant="danger"
            isInline
            title="The lesson link is missing a valid namespace parameter"
          />
        ) : (
          <Alert
            variant="danger"
            isInline
            title={`Training module '${moduleId}' was not found`}
          />
        )}
      </PageSection>
    </>
  );
};

export default LessonLauncherPage;
