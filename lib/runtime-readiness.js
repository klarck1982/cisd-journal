const fs = require('fs');
const { resolveMt5BridgeCandidates } = require('./mt5-bridge');

function resolveMt5BridgeReadiness({ app, isPackaged, currentDirname, platform = process.platform }) {
  const plan = resolveMt5BridgeCandidates({
    app,
    isPackaged,
    currentDirname,
    platform,
    preferExecutable: true,
  });

  return {
    executablePath: plan.exePath,
    pythonPath: plan.pyPath,
    packagedExecutableExists: fs.existsSync(plan.exePath),
    pythonBridgeExists: fs.existsSync(plan.pyPath),
    candidates: plan.candidates.map((candidate) => ({
      kind: candidate.kind,
      command: candidate.command,
      args: candidate.args,
    })),
  };
}

function buildRuntimeReadinessSnapshot({ app, isPackaged, currentDirname, platform = process.platform }) {
  const mt5Bridge = resolveMt5BridgeReadiness({ app, isPackaged, currentDirname, platform });

  return {
    platform,
    packaged: !!isPackaged,
    mt5Bridge,
    readyForBundledInvestorPass: mt5Bridge.packagedExecutableExists,
  };
}

module.exports = {
  resolveMt5BridgeReadiness,
  buildRuntimeReadinessSnapshot,
};
