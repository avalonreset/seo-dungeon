import { defineConfig } from 'vite';

const appPort = Number(process.env.SEO_DUNGEON_APP_PORT || 3002);
const bridgePort = Number(process.env.SEO_DUNGEON_BRIDGE_PORT || 3003);
const bridgeUrl = process.env.SEO_DUNGEON_BRIDGE_URL || `ws://127.0.0.1:${bridgePort}`;

function runtimeConfigPlugin() {
  return {
    name: 'seo-dungeon-runtime-config',
    configureServer(server) {
      server.middlewares.use('/seo-dungeon-runtime-config.js', (_req, res) => {
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(`window.SEO_DUNGEON_BRIDGE_URL = ${JSON.stringify(bridgeUrl)};\n`);
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [runtimeConfigPlugin()],
  server: {
    port: appPort,
    strictPort: true,
    open: false
  },
  build: {
    outDir: 'dist'
  }
});
