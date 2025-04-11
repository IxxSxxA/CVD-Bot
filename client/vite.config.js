// client/vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '..'), // Permetti l'accesso alla cartella genitore
      ],
    },
  },
});