import {
  type K8sResourceCommon,
  useK8sWatchResource
} from '@openshift-console/dynamic-plugin-sdk';
import { useMemo } from 'react';

import type { AcademySettings, ConsoleLabResource } from './types';

export {
  activeNamespaceParameters,
  isAllowedReturnUrl,
  portalCatalogUrl,
  resolveLab,
  sanitizeLabParameters,
  type ResolvedLab
} from './labContent';

export const consoleLabGroupVersionKind = {
  group: 'academy.dcs',
  version: 'v1alpha1',
  kind: 'ConsoleLab'
};

const academySettingsGroupVersionKind = {
  group: 'academy.dcs',
  version: 'v1alpha1',
  kind: 'AcademySettings'
};

export const useConsoleLabs = () => {
  const [labs, loaded, error] = useK8sWatchResource<ConsoleLabResource[]>({
    groupVersionKind: consoleLabGroupVersionKind,
    isList: true
  });
  return {
    error,
    labs: useMemo(() => (Array.isArray(labs) ? labs : []), [labs]),
    loaded
  };
};

type AcademySettingsResource = K8sResourceCommon & { spec?: Partial<AcademySettings> };

export const useAcademySettings = (): AcademySettings => {
  const [settings] = useK8sWatchResource<AcademySettingsResource>({
    groupVersionKind: academySettingsGroupVersionKind,
    name: 'cluster'
  });
  return {
    portalUrl: settings?.spec?.portalUrl ?? '',
    portalLinkText:
      settings?.spec?.portalLinkText ?? 'Want more labs? Check out the DCS Academy'
  };
};
