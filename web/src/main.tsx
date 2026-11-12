import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPwa } from './lib/pwa';
import { startTheme } from './lib/theme';
import './styles.css';
import './reports.css';
import './motion.css';

startTheme();
startPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
