import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkspaceHistory, navigateWorkspaceTool, toolFromUrl } from './workspace-navigation.ts';

function fakeBrowser(href = 'https://example.test/?view=dashboard') {
  const entries = [href];
  const listeners = new Set();
  let index = 0;
  const state = { existing: 'preserved' };
  const host = {
    location: { href },
    history: {
      state,
      pushState(nextState, title, url) {
        assert.equal(nextState, state);
        entries.splice(index + 1);
        entries.push(new URL(url, host.location.href).href);
        host.location.href = entries[++index];
      },
      replaceState(nextState, title, url) {
        assert.equal(nextState, state);
        entries[index] = new URL(url, host.location.href).href;
        host.location.href = entries[index];
      },
    },
    addEventListener(type, callback) { if (type === 'popstate') listeners.add(callback); },
    removeEventListener(type, callback) { if (type === 'popstate') listeners.delete(callback); },
    go(delta) {
      const next = index + delta;
      if (next < 0 || next >= entries.length) return;
      index = next;
      host.location.href = entries[index];
      for (const callback of listeners) callback();
    },
    get length() { return entries.length; },
  };
  return host;
}

test('Back and Forward restore visited tools instead of replacing the whole visit', () => {
  const host = fakeBrowser();
  let visibleTool = toolFromUrl(host.location.href);
  bindWorkspaceHistory(host, (tool) => { visibleTool = tool; });
  for (const tool of ['Manual Trader', 'Bulk Trader', 'Analysis Tools']) {
    assert.equal(navigateWorkspaceTool(host, tool), true);
    visibleTool = tool;
  }
  assert.equal(host.length, 4);
  host.go(-1);
  assert.equal(visibleTool, 'Bulk Trader');
  host.go(-1);
  assert.equal(visibleTool, 'Manual Trader');
  host.go(-1);
  assert.equal(visibleTool, 'Dashboard');
  host.go(1);
  assert.equal(visibleTool, 'Manual Trader');
  assert.equal(host.length, 4);
});

test('clicking the selected tool does not add duplicate history entries', () => {
  const host = fakeBrowser();
  bindWorkspaceHistory(host, () => {});
  navigateWorkspaceTool(host, 'Dashboard');
  navigateWorkspaceTool(host, 'Manual Trader');
  navigateWorkspaceTool(host, 'Manual Trader');
  assert.equal(host.length, 2);
});

test('a new selection after Back replaces only the forward branch', () => {
  const host = fakeBrowser();
  bindWorkspaceHistory(host, () => {});
  navigateWorkspaceTool(host, 'Manual Trader');
  navigateWorkspaceTool(host, 'Bulk Trader');
  host.go(-1);
  navigateWorkspaceTool(host, 'Copy Trader');
  host.go(-1);
  assert.equal(toolFromUrl(host.location.href), 'Manual Trader');
  host.go(1);
  assert.equal(toolFromUrl(host.location.href), 'Copy Trader');
  assert.equal(host.length, 3);
});

test('normalizes legacy views and preserves artifact paths, other query parameters, and anchors', () => {
  const host = fakeBrowser('https://example.test/fx/?view=premium-ai-bots&connected=1#results');
  bindWorkspaceHistory(host, () => {});
  assert.equal(toolFromUrl(host.location.href), 'Deriv Pro Bots');
  assert.match(host.location.href, /view=deriv-pro-bots/);
  navigateWorkspaceTool(host, 'Free Bots');
  assert.equal(host.location.href, 'https://example.test/fx/?view=free-bots&connected=1#results');
});

test('invalid tool names cannot create navigation entries and listeners are cleaned up', () => {
  const host = fakeBrowser();
  let calls = 0;
  const cleanup = bindWorkspaceHistory(host, () => calls++);
  assert.equal(navigateWorkspaceTool(host, 'Not a tool'), false);
  assert.equal(host.length, 1);
  navigateWorkspaceTool(host, 'Bulk Trader');
  cleanup();
  host.go(-1);
  assert.equal(calls, 0);
});

test('unknown or prototype-like URL values safely select the dashboard', () => {
  for (const value of ['unknown', '__proto__', 'constructor']) {
    assert.equal(toolFromUrl(`https://example.test/?view=${value}`), 'Dashboard');
  }
});
