import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPwa } from './lib/pwa';
import { startTheme } from './lib/theme';
import { initAnalytics } from './lib/analytics';
import { preloadLikelyLocale } from './lib/i18n';
import './stylesheets';

// The dictionary first: it is the longest download the first screen waits on.
preloadLikelyLocale();
startTheme();
startPwa();
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
