import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const workerDestination = resolve(projectRoot, 'public/pdf.worker.min.mjs');

mkdirSync(dirname(workerDestination), { recursive: true });
copyFileSync(workerSource, workerDestination);
