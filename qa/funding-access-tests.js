const assert = require('assert');
const { FUNDING_ACCESS_MODES, resolveFundingAccessMode, validateFundingAccess, buildFundingAccessView } = require('../lib/funding-access');

assert.equal(resolveFundingAccessMode('investor_pass'), FUNDING_ACCESS_MODES.INVESTOR_PASS);
assert.equal(resolveFundingAccessMode('shared_url'), FUNDING_ACCESS_MODES.SHARED_URL);
assert.equal(resolveFundingAccessMode('unknown'), FUNDING_ACCESS_MODES.NONE);

let result = validateFundingAccess({ mode: 'investor_pass', investorLogin: '12345', investorServer: 'Broker-Server', investorPassword: 'secret' });
assert.equal(result.valid, true);

result = validateFundingAccess({ mode: 'investor_pass', investorLogin: '', investorServer: 'Broker-Server', investorPassword: 'secret' });
assert.equal(result.valid, false);
assert.equal(result.code, 'investorLoginRequired');

result = validateFundingAccess({ mode: 'shared_url', sharedDashboardUrl: 'https://example.com/shared/abc' });
assert.equal(result.valid, true);

result = validateFundingAccess({ mode: 'shared_url', sharedDashboardUrl: 'http://example.com/shared/abc' });
assert.equal(result.valid, false);
assert.equal(result.code, 'httpsOnly');

const view = buildFundingAccessView({
  fundingAccessMode: 'investor_pass',
  investorLogin: '998877',
  investorServer: 'Broker-Server',
  sharedDashboardUrl: '',
  fundingSyncScope: 'full_readonly',
}, { hasStoredPassword: true });
assert.equal(view.configured, true);
assert.equal(view.mode, 'investor_pass');
assert.equal(view.hasStoredPassword, true);

console.log('Funding Access QA: PASS (mode resolution, validation, public view model)');
