#!/usr/bin/env node
/**
 * Injects build timestamp into the service worker for cache versioning.
 * Run this after vite build completes.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = join(import.meta.dirname, '..', 'dist');
const swPath = join(distDir, 'sw.js');

if (!existsSync(swPath)) {
  console.error('sw.js not found in dist/');
  process.exit(1);
}

const timestamp = Date.now().toString(36); // Compact timestamp
const swContent = readFileSync(swPath, 'utf-8');
const updated = swContent.replace('__BUILD_TIMESTAMP__', timestamp);

writeFileSync(swPath, updated);
console.log(`✓ Service worker versioned: ${timestamp}`);
