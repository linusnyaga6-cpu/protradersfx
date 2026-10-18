import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { LanguageProvider } from './lib/language-context';

import './index.css';
import './reference-redesign.css';
import './footer-layout.css';
import './bulk-trader-theme.css';
import './workspace-navigation.css';
import './scrolling.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <LanguageProvider><App /></LanguageProvider>
  </ErrorBoundary>,
);
