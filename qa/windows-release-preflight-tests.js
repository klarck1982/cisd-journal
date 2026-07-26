const assert = require('assert');
const path = require('path');
const { buildWindowsReleaseReadiness } = require('../tools/windows_release_preflight');

const projectRoot = path.join(__dirname, '..');
const result = buildWindowsReleaseReadiness(projectRoot, { requireBridgeExe: false });
assert.equal(result.ok, true);
assert.equal(result.checks.hasBuildBridgeScript, true);
assert.equal(result.checks.packagesBridgeResources, true);
assert.equal(result.checks.bridgePythonSourceExists, true);
assert.equal(result.checks.docsPresent, true);
assert.equal(result.checks.workflowsMentionBridgeBuild, true);

console.log('Windows Release Preflight QA: PASS (EXE-first packaging contract)');
