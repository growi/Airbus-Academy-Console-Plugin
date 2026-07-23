import { DocumentTitle, ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
import {
  Button,
  Content,
  DataList,
  DataListAction,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  FormSelect,
  FormSelectOption,
  Label,
  PageSection,
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem
} from '@patternfly/react-core';
import { type FC, useMemo, useState } from 'react';

import { useGuidance } from '../guidance/GuidanceContext';
import { trainingModuleCatalog } from '../modules/catalog';
import type { TrainingMode } from '../modules/types';
import './GuidancePage.css';

type ModeFilter = 'all' | TrainingMode;

const modeLabels: Record<TrainingMode, string> = {
  assisted: 'Assisted',
  continue: 'Continue',
  timed: 'Timed'
};

const modeColors: Record<TrainingMode, 'blue' | 'purple' | 'orange'> = {
  assisted: 'blue',
  continue: 'purple',
  timed: 'orange'
};

const GuidancePage: FC = () => {
  const guidance = useGuidance();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const visibleTours = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return trainingModuleCatalog.filter(({ module, mode: moduleMode }) =>
      (mode === 'all' || moduleMode === mode) &&
      (!query || `${module.title} ${module.description}`.toLocaleLowerCase().includes(query))
    );
  }, [mode, search]);

  return (
    <>
      <DocumentTitle>Academy guidance</DocumentTitle>
      <ListPageHeader title="Academy tours" />
      <PageSection>
        <Content component="p">
          Choose a guided tour of the OpenShift console. Assisted tours wait for your actions;
          presentation tours perform each explained action after Continue or a countdown.
        </Content>
      </PageSection>
      <PageSection padding={{ default: 'noPadding' }}>
        <Toolbar className="academy-tour-catalog__toolbar" clearAllFilters={() => {
          setSearch('');
          setMode('all');
        }}>
          <ToolbarContent>
            <ToolbarItem className="academy-tour-catalog__search">
              <SearchInput
                aria-label="Search tours"
                placeholder="Search tours"
                value={search}
                onChange={(_event, value) => setSearch(value)}
                onClear={() => setSearch('')}
              />
            </ToolbarItem>
            <ToolbarItem>
              <FormSelect
                aria-label="Filter tours by mode"
                value={mode}
                onChange={(_event, value) => setMode(value as ModeFilter)}
              >
                <FormSelectOption value="all" label="All modes" />
                <FormSelectOption value="assisted" label="Assisted" />
                <FormSelectOption value="continue" label="Continue" />
                <FormSelectOption value="timed" label="Timed" />
              </FormSelect>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {visibleTours.length ? (
          <DataList aria-label="Academy tours" isCompact>
            {visibleTours.map(({ module, mode: moduleMode }) => {
              const requiresParameters = Boolean(module.parameters?.length);
              return (
              <DataListItem key={module.id} aria-labelledby={`${module.id}-title`}>
                <DataListItemRow>
                  <DataListItemCells
                    dataListCells={[
                      <DataListCell key="tour" width={3}>
                        <strong id={`${module.id}-title`}>{module.title}</strong>
                        <p className="academy-tour-catalog__description">{module.description}</p>
                      </DataListCell>,
                      <DataListCell key="mode" width={1}>
                        <Label color={modeColors[moduleMode]}>{modeLabels[moduleMode]}</Label>
                      </DataListCell>,
                      <DataListCell key="steps" width={1}>
                        {module.steps.length} steps
                      </DataListCell>
                    ]}
                  />
                  <DataListAction
                    aria-label={`Actions for ${module.title}`}
                    aria-labelledby={`${module.id}-title ${module.id}-start`}
                    id={`${module.id}-start`}
                  >
                    <Button
                      aria-label={requiresParameters
                        ? `${module.title} requires an external lesson link`
                        : `Start ${module.title}`}
                      isDisabled={requiresParameters}
                      variant="primary"
                      onClick={() => guidance.startModule(module.id)}
                    >
                      {requiresParameters ? 'Start from lesson' : 'Start tour'}
                    </Button>
                  </DataListAction>
                </DataListItemRow>
              </DataListItem>
              );
            })}
          </DataList>
        ) : (
          <div className="academy-tour-catalog__empty">
            <strong>No matching tours</strong>
            <p>Adjust the search text or selected mode.</p>
          </div>
        )}
      </PageSection>
    </>
  );
};

export default GuidancePage;
