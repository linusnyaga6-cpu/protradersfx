const viewLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  'bot-builder': 'Bot Builder',
  'volt-ai': 'Volt AI',
  'auto-ai': 'Auto AI',
  'free-bots': 'Free Bots',
  'premium-ai-bots': 'Deriv Pro Bots',
  'deriv-pro-bots': 'Deriv Pro Bots',
  'quick-bot': 'Quick Bot',
  'signal-ai': 'Signal AI',
  'manual-trader': 'Manual Trader',
  'bulk-trader': 'Bulk Trader',
  'apex-bot': 'Apex Bot',
  'copy-trader': 'Copy Trader',
  'analysis-tools': 'Analysis Tools',
  'owner-activity': 'Owner Activity',
};

type NavigationHost = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener'>;

export function toolFromUrl(href: string) {
  const view = new URL(href).searchParams.get('view') ?? '';
  return Object.hasOwn(viewLabels, view) ? viewLabels[view] : 'Dashboard';
}

export function toolUrl(href: string, tool: string) {
  const view = tool.toLowerCase().replace(/\s+/g, '-');
  if (viewLabels[view] !== tool) return null;
  const url = new URL(href);
  url.searchParams.set('view', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function navigateWorkspaceTool(host: NavigationHost, tool: string) {
  const next = toolUrl(host.location.href, tool);
  if (next === null) return false;
  const current = new URL(host.location.href);
  if (next !== `${current.pathname}${current.search}${current.hash}`) {
    // Keep each actual tool change so browser Back/Forward can restore it.
    host.history.pushState(host.history.state, '', next);
  }
  return true;
}

export function bindWorkspaceHistory(host: NavigationHost, onChange: (tool: string) => void) {
  const currentTool = toolFromUrl(host.location.href);
  host.history.replaceState(host.history.state, '', toolUrl(host.location.href, currentTool));
  const restore = () => onChange(toolFromUrl(host.location.href));
  host.addEventListener('popstate', restore);
  return () => host.removeEventListener('popstate', restore);
}
