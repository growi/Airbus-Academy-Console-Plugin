import {
  DocumentTitle,
  ListPageHeader,
  useActiveNamespace
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Content,
  DataList,
  DataListAction,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  PageSection,
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem
} from '@patternfly/react-core';
import { type FC, useMemo, useState } from 'react';

import { useGuidance } from '../guidance/GuidanceContext';
import { activeNamespaceParameters, resolveLab, useConsoleLabs } from '../modules/labs';
import './GuidancePage.css';

const GuidancePage: FC = () => {
  const guidance = useGuidance();
  const { labs, loaded, error } = useConsoleLabs();
  const [activeNamespace] = useActiveNamespace();
  const [search, setSearch] = useState('');

  const parameters = useMemo(() => activeNamespaceParameters(activeNamespace), [activeNamespace]);

  const visibleLabs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return labs
      .map((lab) => ({ lab, ...resolveLab(lab, parameters) }))
      .filter(({ lab, module, missingParameters }) => {
        const visibility = module?.visibility ?? lab.spec?.visibility ?? 'default';
        if (visibility !== 'default') return false;
        // A default lab that still needs a parameter is listed, but cannot start until the
        // learner selects a project — hiding it would look like the catalog lost a lab.
        const title = module?.title ?? lab.spec?.title ?? '';
        const description = module?.description ?? lab.spec?.description ?? '';
        return (
          (module || missingParameters.length) &&
          (!query || `${title} ${description}`.toLocaleLowerCase().includes(query))
        );
      });
  }, [labs, parameters, search]);

  return (
    <>
      <DocumentTitle>Academy labs</DocumentTitle>
      <ListPageHeader title="Academy labs" />
      <PageSection>
        <Content component="p">
          Choose a guided tour of the OpenShift console. The tour waits for your actions and
          verifies them; Continue always moves you on, and Back repeats a step.
        </Content>
      </PageSection>
      <PageSection padding={{ default: 'noPadding' }}>
        {error ? (
          <Alert
            variant="warning"
            isInline
            title="Lab content could not be read from the cluster (ConsoleLab resources)."
          />
        ) : null}
        <Toolbar className="academy-tour-catalog__toolbar" clearAllFilters={() => setSearch('')}>
          <ToolbarContent>
            <ToolbarItem className="academy-tour-catalog__search">
              <SearchInput
                aria-label="Search labs"
                placeholder="Search labs"
                value={search}
                onChange={(_event, value) => setSearch(value)}
                onClear={() => setSearch('')}
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {visibleLabs.length ? (
          <DataList aria-label="Academy labs" isCompact>
            {visibleLabs.map(({ lab, module, missingParameters }) => {
              const id = lab.metadata?.name ?? '';
              const startable = Boolean(module);
              return (
                <DataListItem key={id} aria-labelledby={`${id}-title`}>
                  <DataListItemRow>
                    <DataListItemCells
                      dataListCells={[
                        <DataListCell key="lab" width={3}>
                          <strong id={`${id}-title`}>{module?.title ?? lab.spec?.title}</strong>
                          <p className="academy-tour-catalog__description">
                            {module?.description ?? lab.spec?.description}
                          </p>
                          {startable ? null : (
                            <p className="academy-tour-catalog__description">
                              Select a project first — this lab needs{' '}
                              {missingParameters.join(', ')}.
                            </p>
                          )}
                        </DataListCell>,
                        <DataListCell key="steps" width={1}>
                          {(module?.steps ?? lab.spec?.steps ?? []).length} steps
                        </DataListCell>
                      ]}
                    />
                    <DataListAction
                      aria-label={`Actions for ${module?.title ?? id}`}
                      aria-labelledby={`${id}-title ${id}-start`}
                      id={`${id}-start`}
                    >
                      <Button
                        aria-label={`Start ${module?.title ?? id}`}
                        variant="primary"
                        isDisabled={!startable}
                        onClick={() => guidance.startLab(id, { parameters })}
                      >
                        Start lab
                      </Button>
                      <Button
                        aria-label={`Watch ${module?.title ?? id}`}
                        variant="secondary"
                        isDisabled={!startable}
                        onClick={() => guidance.startLab(id, { mode: 'timed', parameters })}
                      >
                        Watch demo
                      </Button>
                    </DataListAction>
                  </DataListItemRow>
                </DataListItem>
              );
            })}
          </DataList>
        ) : (
          <div className="academy-tour-catalog__empty">
            <strong>{loaded ? 'No matching labs' : 'Loading labs…'}</strong>
            {loaded ? (
              <p>
                {search
                  ? 'Adjust the search text.'
                  : 'No ConsoleLab resources are published on this cluster yet.'}
              </p>
            ) : null}
          </div>
        )}
      </PageSection>
      {guidance.settings.portalUrl ? (
        <PageSection>
          <Content component="p" className="academy-tour-catalog__portal">
            <a href={guidance.settings.portalUrl} rel="noreferrer noopener" target="_blank">
              {guidance.settings.portalLinkText}
            </a>
          </Content>
        </PageSection>
      ) : null}
    </>
  );
};

export default GuidancePage;
