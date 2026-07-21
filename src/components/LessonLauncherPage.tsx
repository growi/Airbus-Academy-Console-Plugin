import { DocumentTitle, ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, Content, PageSection } from '@patternfly/react-core';
import type { FC } from 'react';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useGuidance } from '../guidance/GuidanceContext';
import { getTrainingModule } from '../modules/catalog';

const LessonLauncherPage: FC = () => {
  const { moduleId = '' } = useParams() as { moduleId?: string };
  const guidance = useGuidance();
  const module = getTrainingModule(moduleId);

  useEffect(() => {
    if (module) guidance.startModule(module.id);
  }, [guidance.startModule, module]);

  return (
    <>
      <DocumentTitle>{module?.title ?? 'Unknown Academy lesson'}</DocumentTitle>
      <ListPageHeader title={module?.title ?? 'Unknown Academy lesson'} />
      <PageSection>
        {module ? (
          <>
            <Alert variant="success" isInline title="Lesson started" />
            <Content component="p">
              {module.description} Follow the highlighted console element and the persistent
              guidance box. You can now leave this page; the lesson remains active in this tab.
            </Content>
          </>
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
