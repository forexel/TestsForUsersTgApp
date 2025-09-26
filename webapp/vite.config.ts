import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: true,
      port: Number(env.VITE_PORT ?? 5173)
    },
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"),
      __BOT_USERNAME__: JSON.stringify(env.VITE_BOT_USERNAME ?? "")
    }
  };
});
