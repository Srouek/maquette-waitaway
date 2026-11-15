import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le build marche servi depuis n'importe quel sous-dossier.
export default defineConfig({
  plugins: [react()],
  base: './',
});
