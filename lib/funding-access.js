const FUNDING_ACCESS_MODES = {
  NONE: 'none',
  INVESTOR_PASS: 'investor_pass',
  SHARED_URL: 'shared_url',
};

function resolveFundingAccessMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === FUNDING_ACCESS_MODES.INVESTOR_PASS) return FUNDING_ACCESS_MODES.INVESTOR_PASS;
  if (normalized === FUNDING_ACCESS_MODES.SHARED_URL) return FUNDING_ACCESS_MODES.SHARED_URL;
  return FUNDING_ACCESS_MODES.NONE;
}

function validateSharedUrl(url) {
  if (!url) return { valid: true };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { valid: false, code: 'httpsOnly' };
    return { valid: true };
  } catch {
    return { valid: false, code: 'httpsOnly' };
  }
}

function validateFundingAccess(payload = {}) {
  const mode = resolveFundingAccessMode(payload.mode);
  const investorLogin = String(payload.investorLogin || '').trim();
  const investorServer = String(payload.investorServer || '').trim();
  const investorPassword = String(payload.investorPassword || '').trim();
  const sharedDashboardUrl = String(payload.sharedDashboardUrl || '').trim();

  if (mode === FUNDING_ACCESS_MODES.SHARED_URL) {
    const validation = validateSharedUrl(sharedDashboardUrl);
    if (!validation.valid) return { valid: false, code: validation.code, mode };
    return { valid: true, mode };
  }

  if (mode === FUNDING_ACCESS_MODES.INVESTOR_PASS) {
    if (!investorLogin) return { valid: false, code: 'investorLoginRequired', mode };
    if (!investorServer) return { valid: false, code: 'investorServerRequired', mode };
    if (!investorPassword && !payload.hasStoredPassword) return { valid: false, code: 'investorPasswordRequired', mode };
    return { valid: true, mode };
  }

  return { valid: true, mode };
}

function buildFundingAccessView(account = {}, options = {}) {
  const mode = resolveFundingAccessMode(account.fundingAccessMode);
  const hasStoredPassword = !!options.hasStoredPassword;
  const sharedDashboardUrl = account.sharedDashboardUrl || '';

  const configured = mode === FUNDING_ACCESS_MODES.SHARED_URL
    ? !!sharedDashboardUrl
    : mode === FUNDING_ACCESS_MODES.INVESTOR_PASS
      ? !!(account.investorLogin && account.investorServer && hasStoredPassword)
      : false;

  return {
    mode,
    configured,
    sharedDashboardUrl,
    investorLogin: account.investorLogin || '',
    investorServer: account.investorServer || '',
    hasStoredPassword,
    syncScope: account.fundingSyncScope || 'full_readonly',
  };
}

module.exports = {
  FUNDING_ACCESS_MODES,
  resolveFundingAccessMode,
  validateSharedUrl,
  validateFundingAccess,
  buildFundingAccessView,
};
