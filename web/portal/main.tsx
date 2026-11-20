// Entry point of the customer portal bundle (vite.portal.config.ts): mounts PortalApp. The portal is a separate app on
// its own host so a customer contact never loads the company app's code.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalApp } from './Portal';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalApp />
  </StrictMode>,
);
