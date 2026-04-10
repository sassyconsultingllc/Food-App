#!/usr/bin/env node

/**
 * Production Build Script
 * 
 * Builds the server code with obfuscation for distribution.
 * 
 * Usage:
 *   node scripts/build-protected.js [--profile production|development|server]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const obfuscatorConfig = require('../obfuscator.config.js');

// ============================================================================
// Configuration
// ============================================================================

const PROFILES = ['production', 'development', 'server'];
const DEFAULT_PROFILE = 'production';

const BUILD_CONFIG = {
  // Source files to build
  serverEntry: 'server/_core/index.ts',
  
  // Output directories
  distDir: 'dist',
  protectedDir: 'dist/protected',
  
  // Files to obfuscate
  obfuscatePatterns: [
    'dist/**/*.js',
    '!dist/**/node_modules/**',
  ],
  
  // Files to never obfuscate
  excludePatterns: [
    '**/package.json',
    '**/*.map',
    '**/*.d.ts',
  ],
};

// ============================================================================
// Helpers
// ============================================================================

function log(message, type = 'info') {
  const prefix = {
    info: '\x1b[36mℹ\x1b[0m',
    success: '\x1b[32m✓\x1b[0m',
    warning: '\x1b[33m⚠\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFiles(dir, pattern = '.js') {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getFiles(fullPath, pattern));
    } else if (item.name.endsWith(pattern)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// ============================================================================
// Build Steps
// ============================================================================

async function cleanDist() {
  log('Cleaning dist directory...');
  if (fs.existsSync(BUILD_CONFIG.distDir)) {
    fs.rmSync(BUILD_CONFIG.distDir, { recursive: true });
  }
  ensureDir(BUILD_CONFIG.distDir);
  ensureDir(BUILD_CONFIG.protectedDir);
}

async function buildTypeScript() {
  log('Building TypeScript with esbuild...');
  
  try {
    execSync(
      `npx esbuild ${BUILD_CONFIG.serverEntry} ` +
      `--platform=node ` +
      `--packages=external ` +
      `--bundle ` +
      `--format=esm ` +
      `--outdir=${BUILD_CONFIG.distDir}`,
      { stdio: 'inherit' }
    );
    log('TypeScript build complete', 'success');
  } catch (error) {
    log('TypeScript build failed', 'error');
    throw error;
  }
}

async function obfuscateFiles(profile) {
  log(`Obfuscating with profile: ${profile}...`);
  
  const config = obfuscatorConfig[profile];
  if (!config) {
    throw new Error(`Unknown profile: ${profile}`);
  }
  
  const files = getFiles(BUILD_CONFIG.distDir);
  let obfuscatedCount = 0;
  
  for (const file of files) {
    const relativePath = path.relative(BUILD_CONFIG.distDir, file);
    
    // Skip excluded files
    if (BUILD_CONFIG.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(relativePath);
    })) {
      log(`Skipping: ${relativePath}`, 'warning');
      continue;
    }
    
    try {
      const code = fs.readFileSync(file, 'utf8');
      const startTime = Date.now();
      
      const obfuscated = JavaScriptObfuscator.obfuscate(code, {
        ...config,
        inputFileName: path.basename(file),
        sourceMapFileName: `${path.basename(file)}.map`,
      });
      
      const outputPath = path.join(BUILD_CONFIG.protectedDir, relativePath);
      ensureDir(path.dirname(outputPath));
      
      fs.writeFileSync(outputPath, obfuscated.getObfuscatedCode());
      
      if (config.sourceMap && obfuscated.getSourceMap()) {
        fs.writeFileSync(`${outputPath}.map`, obfuscated.getSourceMap());
      }
      
      const elapsed = Date.now() - startTime;
      const originalSize = (code.length / 1024).toFixed(1);
      const obfuscatedSize = (obfuscated.getObfuscatedCode().length / 1024).toFixed(1);
      
      log(`Obfuscated: ${relativePath} (${originalSize}KB → ${obfuscatedSize}KB, ${elapsed}ms)`, 'success');
      obfuscatedCount++;
      
    } catch (error) {
      log(`Failed to obfuscate ${relativePath}: ${error.message}`, 'error');
    }
  }
  
  log(`Obfuscated ${obfuscatedCount} files`, 'success');
}

async function generateLicenseBootstrap() {
  log('Generating license bootstrap...');
  
  const bootstrapCode = `
/**
 * License Bootstrap
 * This file is injected at runtime to verify licensing.
 * DO NOT MODIFY - tampering will invalidate the license.
 */
(function() {
  const LICENSE_CHECK_INTERVAL = 3600000; // 1 hour
  const LICENSE_SERVER = process.env.LICENSE_SERVER_URL || 'https://license.yourdomain.com';
  
  async function checkLicense() {
    try {
      const response = await fetch(LICENSE_SERVER + '/api/license/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: 'foodie-finder',
          instanceId: process.env.INSTANCE_ID || 'unknown',
          timestamp: Date.now(),
        }),
      });
      
      if (!response.ok) {
        console.error('[License] Validation failed');
        process.exit(1);
      }
    } catch (error) {
      console.warn('[License] Could not reach license server, running in offline mode');
    }
  }
  
  // Initial check
  checkLicense();
  
  // Periodic checks
  setInterval(checkLicense, LICENSE_CHECK_INTERVAL);
})();
`;

  fs.writeFileSync(
    path.join(BUILD_CONFIG.protectedDir, 'license-bootstrap.js'),
    bootstrapCode
  );
  
  log('License bootstrap generated', 'success');
}

async function createPackageJson() {
  log('Creating distribution package.json...');
  
  const originalPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  const distPkg = {
    name: originalPkg.name,
    version: originalPkg.version,
    type: 'module',
    main: 'index.js',
    scripts: {
      start: 'node --import ./license-bootstrap.js index.js',
    },
    dependencies: originalPkg.dependencies,
    engines: {
      node: '>=18.0.0',
    },
    license: 'UNLICENSED',
    private: true,
  };
  
  fs.writeFileSync(
    path.join(BUILD_CONFIG.protectedDir, 'package.json'),
    JSON.stringify(distPkg, null, 2)
  );
  
  log('Distribution package.json created', 'success');
}

async function createEnvTemplate() {
  log('Creating environment template...');
  
  const envTemplate = `# Foodie Finder Server Configuration
# Copy this file to .env and fill in values

# License Configuration
LICENSE_SERVER_URL=https://license.yourdomain.com
LICENSE_KEY=YOUR_LICENSE_KEY_HERE
INSTANCE_ID=

# Database
DATABASE_URL=mysql://user:password@localhost:3306/foodie_finder

# Server
PORT=3000
NODE_ENV=production

# OAuth (if using)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
`;

  fs.writeFileSync(
    path.join(BUILD_CONFIG.protectedDir, '.env.template'),
    envTemplate
  );
  
  log('Environment template created', 'success');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const profileArg = args.find(arg => arg.startsWith('--profile='));
  const profile = profileArg ? profileArg.split('=')[1] : DEFAULT_PROFILE;
  
  if (!PROFILES.includes(profile)) {
    log(`Invalid profile: ${profile}. Valid profiles: ${PROFILES.join(', ')}`, 'error');
    process.exit(1);
  }
  
  console.log('\n🔒 Building Protected Distribution\n');
  console.log(`   Profile: ${profile}`);
  console.log(`   Output:  ${BUILD_CONFIG.protectedDir}\n`);
  
  const startTime = Date.now();
  
  try {
    await cleanDist();
    await buildTypeScript();
    await obfuscateFiles(profile);
    await generateLicenseBootstrap();
    await createPackageJson();
    await createEnvTemplate();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Build complete in ${elapsed}s`);
    console.log(`   Output: ${path.resolve(BUILD_CONFIG.protectedDir)}\n`);
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
