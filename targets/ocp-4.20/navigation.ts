import { useCallback } from 'react';
import { useHistory } from 'react-router';

export const useConsoleNavigation = () => {
  const history = useHistory();
  return useCallback((path: string) => history.push(path), [history]);
};
