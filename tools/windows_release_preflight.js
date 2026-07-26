const fs = require('fs');
const path = require('path');

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildWindowsReleaseReadiness(projectRoot, options = {}) {
  const requireBridgeExe = !!options.requireBridgeExe;
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = readJson(packageJsonPath);
  const extraResources = packageJson.build?.extraResources || [];
  const scripts = packageJson.scripts || {};

  const workflowPaths = [
    '.github/workflows/build-windows.yml',
    '.github/workflows/quality.yml',
    '.github/workflows/release.yml',
  ].map((relativePath) => path.join(projectRoot, relativePath));

  const bridgePyPath = path.join(projectRoot, 'bridges', 'mt5_readonly_sync.py');
  const bridgeExePath = path.join(projectRoot, 'bridges', 'mt5_readonly_sync.exe');
  const docsRequired = [
    'docs/WINDOWS_EXE_RUNTIME_READINESS.md',
    'docs/WINDOWS_LIVE_VALIDATION_CHECKLIST.md',
    'docs/INVESTOR_PASS_BRIDGE_SETUP.md',
  ].map((relativePath) => path.join(projectRoot, relativePath));

  const checks = {
    hasBuildBridgeScript: !!scripts['build:bridge:win'],
    hasDistWinScript: !!scripts['dist:win'],
    packagesDocsResources: extraResources.some((entry) => entry.from === 'docs' && entry.to === 'docs'),
    packagesBridgeResources: extraResources.some((entry) => entry.from === 'bridges' && entry.to === 'bridges'),
    bridgePythonSourceExists: exists(bridgePyPath),
    bridgeExeExists: exists(bridgeExePath),
    docsPresent: docsRequired.every(exists),
    workflowsMentionBridgeBuild: workflowPaths.every((filePath) => exists(filePath) && fs.readFileSync(filePath, 'utf8').includes('build:bridge:win')),
  };

  const errors = [];
  if (!checks.hasBuildBridgeScript) errors.push('Missing npm script: build:bridge:win');
  if (!checks.hasDistWinScript) errors.push('Missing npm script: dist:win');
  if (!checks.packagesDocsResources) errors.push('package.json build.extraResources does not include docs');
  if (!checks.packagesBridgeResources) errors.push('package.json build.extraResources does not include bridges');
  if (!checks.bridgePythonSourceExists) errors.push('bridges/mt5_readonly_sync.py is missing');
  if (!checks.docsPresent) errors.push('Required Windows runtime docs are missing');
  if (!checks.workflowsMentionBridgeBuild) errors.push('One or more GitHub workflows do not build the MT5 bridge');
  if (requireBridgeExe && !checks.bridgeExeExists) errors.push('bridges/mt5_readonly_sync.exe is missing but required for EXE-ready validation');

  return {
    ok: errors.length === 0,
    requireBridgeExe,
    checks,
    errors,
    paths: {
      packageJsonPath,
      bridgePyPath,
      bridgeExePath,
    },
  };
}

function runCli() {
  const projectRoot = process.cwd();
  const requireBridgeExe = process.argv.includes('--require-bridge-exe');
  const result = buildWindowsReleaseReadiness(projectRoot, { requireBridgeExe });

  if (result.ok) {
    console.log('Windows Release Preflight: PASS');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error('Windows Release Preflight: FAIL');
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

if (require.main === module) runCli();

module.exports = {
  buildWindowsReleaseReadiness,
};
