import { main } from './main';

// The built file's starting point (mcp/dist/server.js). A finished setup command sets the exit code.
main(process.argv.slice(2)).then(
  (code) => {
    if (code != null) process.exit(code);
  },
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
