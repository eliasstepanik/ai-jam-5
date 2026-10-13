import { defineConfig } from 'vite'

// base './' so dist/ works from any path (itch.io serves it in an iframe subpath).
export default defineConfig({ base: './' })
