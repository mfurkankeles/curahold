import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPwa } from './lib/pwa';
import { startTheme } from './lib/theme';
import { initAnalytics } from './lib/analytics';
import './stylesheets';

startTheme();
startPwa();
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
