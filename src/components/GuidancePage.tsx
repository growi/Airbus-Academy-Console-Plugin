import { DocumentTitle, ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
import { Button, Card, CardBody, CardTitle, Content, PageSection } from '@patternfly/react-core';
import type { FC } from 'react';

import { useGuidance } from '../guidance/GuidanceContext';
import { trainingModules } from '../modules/catalog';

const GuidancePage: FC = () => {
  const guidance = useGuidance();

  return (
    <>
      <DocumentTitle>Academy guidance</DocumentTitle>
      <ListPageHeader title="Academy guidance PoC" />
      <PageSection>
        <Content component="p">
          This dynamic plugin demonstrates guidance capabilities that the native Quick Start
          renderer does not provide. Start the lesson, then follow the highlighted console
          elements. The lesson observes each page and tab you open and advances automatically.
        </Content>
        {trainingModules.map((module) => (
          <Button key={module.id} variant="primary" onClick={() => guidance.startModule(module.id)}>
            Start {module.title}
          </Button>
        ))}{' '}
        <Button variant="secondary" onClick={() => guidance.highlight('qs-nav-workloads')}>
          Highlight Workloads now
        </Button>{' '}
        <Button variant="link" onClick={guidance.clearHighlight}>Clear highlight</Button>
      </PageSection>
      <PageSection>
        <Card>
          <CardTitle>Navigation controls</CardTitle>
          <CardBody>
            <Button
              onClick={() => guidance.primaryResource &&
                guidance.openPage(guidance.primaryResource.listPath)}
            >
              Open resource list
            </Button>{' '}
            <Button onClick={() => guidance.openResourceTab('details')}>Open resource details</Button>{' '}
            <Button onClick={() => guidance.openResourceTab('logs')}>Switch to Logs</Button>{' '}
            <Button onClick={() => guidance.openResourceTab('terminal')}>Switch to Terminal</Button>
          </CardBody>
        </Card>
      </PageSection>
      <PageSection>
        <Card>
          <CardTitle>Current console state</CardTitle>
          <CardBody>
            <dl>
              <dt>Path</dt><dd><code>{guidance.path || '/'}</code></dd>
              <dt>Perspective</dt><dd>{guidance.perspective || 'unknown'}</dd>
              <dt>Namespace</dt><dd>{guidance.currentNamespace || 'none'}</dd>
              <dt>Active route tab</dt><dd>{guidance.activeTab || 'none'}</dd>
              <dt>Active module</dt><dd>{guidance.activeModule?.id || 'none'}</dd>
              <dt>{guidance.primaryResource?.label ?? 'Primary resource'}</dt>
              <dd>{guidance.resourcePhase}</dd>
              <dt>Highlight target</dt><dd>{guidance.highlightId || 'none'}</dd>
              <dt>Target found</dt><dd>{String(guidance.highlightTargetFound)}</dd>
            </dl>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};

export default GuidancePage;
