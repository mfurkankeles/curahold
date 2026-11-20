// The shared stylesheets first: a screen's own stylesheet imported by a module of this first chunk then
// lands after them, so its rules win ties over the shared ones, as they do when a screen loads later.
import './stylesheets';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPwa } from './lib/pwa';
import { startTooltips } from './lib/tooltips';
import { startTheme } from './lib/theme';
import { initAnalytics } from './lib/analytics';
import { preloadLikelyLocale } from './lib/i18n';

// The dictionary first: it is the longest download the first screen waits on.
preloadLikelyLocale();
startTheme();
startPwa();
startTooltips();
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
