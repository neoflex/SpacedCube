// Serves dist/ for trying the app locally: npm start, then open the address it prints.
import { startServer } from './server.mjs';
import { DIST } from './helpers.mjs';

const server = await startServer(DIST, null, Number(process.env.PORT) || 8000);
console.log(`SpacedCube at ${server.url} (Ctrl+C to stop)`);
