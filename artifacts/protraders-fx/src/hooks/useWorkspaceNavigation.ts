import { useCallback, useEffect, useState } from 'react';
import { bindWorkspaceHistory, navigateWorkspaceTool, toolFromUrl } from '../lib/workspace-navigation';

export function useWorkspaceNavigation() {
  const [activeTool, updateTool] = useState(() => toolFromUrl(window.location.href));

  useEffect(() => bindWorkspaceHistory(window, updateTool), []);

  const navigate = useCallback((tool: string) => {
    if (navigateWorkspaceTool(window, tool)) updateTool(tool);
  }, []);

  return [activeTool, navigate] as const;
}
