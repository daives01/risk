import path from "path"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..")
  const env = loadEnv(mode, envDir, "")

  return {
    envDir,
    define: {
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(
        env.VITE_CONVEX_URL ?? env.CONVEX_URL,
      ),
      "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify(
        env.VITE_CONVEX_SITE_URL ?? env.CONVEX_SITE_URL,
      ),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@backend": path.resolve(__dirname, "../convex"),
      },
    },
  }
})
