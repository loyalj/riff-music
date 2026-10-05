import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the build runs from any folder as well as from
  // the root of riff.dblpl.us.
  base: './',
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
})
