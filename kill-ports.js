#!/usr/bin/env node

/**
 * Kill processes running on ports 3000 and 5173
 * This runs before starting the dev server to prevent EADDRINUSE errors
 */

const { execSync } = require('child_process');

const PORTS = [3000, 5173];

function killPort(port) {
  try {
    // Find process IDs using the port
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(pid => pid.length > 0);

    if (pids.length > 0) {
      console.log(`🔍 Found ${pids.length} process(es) on port ${port}`);

      // Kill each process
      pids.forEach(pid => {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`✅ Killed process ${pid} on port ${port}`);
        } catch (killError) {
          console.log(`⚠️  Could not kill process ${pid}:`, killError.message);
        }
      });
    } else {
      console.log(`✓ Port ${port} is free`);
    }
  } catch (error) {
    // If lsof returns no results, the port is free
    if (error.status === 1) {
      console.log(`✓ Port ${port} is free`);
    } else {
      console.log(`⚠️  Could not check port ${port}:`, error.message);
    }
  }
}

console.log('🧹 Cleaning up ports...\n');

PORTS.forEach(port => killPort(port));

console.log('\n✨ Port cleanup complete!\n');
