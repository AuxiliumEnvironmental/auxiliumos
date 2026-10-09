import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpatialWorkspace } from './ui/SpatialWorkspace';
createRoot(document.getElementById('root')!).render(<StrictMode><SpatialWorkspace /></StrictMode>);
