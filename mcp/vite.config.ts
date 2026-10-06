import { defineConfig } from 'vite';

// npm run mcp:build: the connector as one file, mcp/dist/server.js, for Node (everything bundled in).
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'mcp/cli.ts',
    outDir: 'mcp/dist',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'server.js' } },
  },
  ssr: { noExternal: true },
});
