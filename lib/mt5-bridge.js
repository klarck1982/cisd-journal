const path = require('path');

function bridgeBaseDir(app, isPackaged, currentDirname) {
  const resourcesRoot = process.resourcesPath || app?.resourcesPath || currentDirname;
  return isPackaged ? path.join(resourcesRoot, 'bridges') : path.join(currentDirname, 'bridges');
}

function resolveMt5BridgeCandidates({
  app,
  isPackaged,
  currentDirname,
  platform = process.platform,
  preferExecutable = true,
}) {
  const baseDir = bridgeBaseDir(app, isPackaged, currentDirname);
  const exePath = path.join(baseDir, 'mt5_readonly_sync.exe');
  const pyPath = path.join(baseDir, 'mt5_readonly_sync.py');

  const candidates = [];

  if (preferExecutable) {
    candidates.push({ kind: 'executable', command: exePath, args: [] });
  }

  if (platform === 'win32') {
    candidates.push({ kind: 'python', command: 'py', args: ['-3', pyPath] });
    candidates.push({ kind: 'python', command: 'python', args: [pyPath] });
  } else {
    candidates.push({ kind: 'python', command: 'python3', args: [pyPath] });
    candidates.push({ kind: 'python', command: 'python', args: [pyPath] });
  }

  return { baseDir, exePath, pyPath, candidates };
}

module.exports = {
  resolveMt5BridgeCandidates,
  bridgeBaseDir,
};
