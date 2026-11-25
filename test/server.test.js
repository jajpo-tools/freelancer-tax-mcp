// Starts the server over stdio and talks MCP to it, the way a client does.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function session(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', () => {
      try {
        const replies = out.trim() ? out.trim().split('\n').map((l) => JSON.parse(l)) : [];
        resolve({ replies, byId: Object.fromEntries(replies.filter((r) => r.id !== undefined).map((r) => [r.id, r])), stderr: err });
      } catch (e) { reject(e); }
    });
    for (const m of messages) child.stdin.write((typeof m === 'string' ? m : JSON.stringify(m)) + '\n');
    child.stdin.end();
  });
}

const init = (version = '2025-06-18') => ({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('initialize negotiates the protocol version and lists tools', async () => {
  const { byId } = await session([init('2025-06-18'), { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
  assert.equal(byId[0].result.protocolVersion, '2025-06-18');
  assert.equal(byId[0].result.serverInfo.name, 'jajpo-freelancer-tax');
  assert.ok(byId[0].result.capabilities.tools);
  assert.match(byId[0].result.instructions, /not tax advice/);
  const names = byId[1].result.tools.map((t) => t.name);
  assert.deepEqual(names, ['estimate_1099_tax', 'quarterly_estimated_tax', 'self_employment_tax', 'tax_figures', 'tax_deadlines']);
  for (const t of byId[1].result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 40);
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.run, undefined);
  }
  assert.deepEqual(byId[2].result, {});
});

test('an unknown protocol version gets the newest one we support', async () => {
  const { byId } = await session([init('1999-01-01')]);
  assert.equal(byId[0].result.protocolVersion, '2025-11-25');
});

test('estimate_1099_tax: $60,000 of 1099 income, $8,000 of expenses, single, 2026', async () => {
  const { byId } = await session([init(), call(1, 'estimate_1099_tax', { year: 2026, grossIncome: 60000, businessExpenses: 8000 })]);
  const r = byId[1].result;
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.selfEmploymentTax, 7347.37);
  assert.equal(r.structuredContent.incomeTax, 2845.73);
  assert.equal(r.structuredContent.totalFederalTax, 10193.09);
  assert.equal(r.structuredContent.setAsideRate, 0.1699);
  assert.match(r.content[0].text, /Total federal tax: \$10,193/);
  assert.match(r.content[0].text, /https:\/\/jajpo\.com\/taxes\/1099-tax-calculator\//);
  assert.match(r.content[0].text, /not tax advice/);
  assert.ok(r.structuredContent.sources.every((s) => /^https:\/\//.test(s.url)));
});

test('quarterly_estimated_tax uses the prior-year safe harbor and flags missed installments', async () => {
  const { byId } = await session([init(), call(1, 'quarterly_estimated_tax', { year: 2026, grossIncome: 60000, businessExpenses: 8000, priorYearTax: 8000, priorYearAgi: 45000, asOf: '2026-03-01' }),
    call(2, 'quarterly_estimated_tax', { year: 2026, grossIncome: 60000, businessExpenses: 8000, priorYearTax: 8000, asOf: '2026-11-25' })]);
  const a = byId[1].result.structuredContent;
  assert.equal(a.safeHarborBasis, 'prior');
  assert.equal(a.requiredAnnualPayment, 8000);
  assert.equal(a.nextDueDate, '2026-04-15');
  assert.equal(a.nextMinimumPayment, 2000);
  const b = byId[2].result;
  assert.equal(b.structuredContent.pastShortfall, 6000);
  assert.match(b.content[0].text, /underpayment-penalty-calculator/);
});

test('self_employment_tax: none under $400 of net earnings; wage base shared with W-2 wages', async () => {
  const { byId } = await session([init(), call(1, 'self_employment_tax', { netProfit: 433, year: 2026 }), call(2, 'self_employment_tax', { netProfit: 100000, w2Wages: 150000, year: 2026 })]);
  assert.equal(byId[1].result.structuredContent.total, 0);
  assert.equal(byId[2].result.structuredContent.socialSecurity, 4278); // $34,500 × 12.4%
});

test('tax_figures returns sourced figures and a related tool', async () => {
  const { byId } = await session([init(), call(1, 'tax_figures', { topic: '1099_thresholds', year: 2027 }), call(2, 'tax_figures', { topic: 'retirement', year: 2026 })]);
  const a = byId[1].result.structuredContent;
  assert.equal(a.figures.form1099NEC.threshold, 2100);
  assert.match(a.relatedTool.url, /1099-nec-checker/);
  const b = byId[2].result.structuredContent;
  assert.equal(b.figures.definedContributionLimit, 72000);
  assert.ok(b.figures.sources.length > 0);
});

test('tax_deadlines lists upcoming dates in order', async () => {
  const { byId } = await session([init(), call(1, 'tax_deadlines', { from: '2026-11-25', limit: 4 })]);
  const d = byId[1].result.structuredContent.deadlines;
  assert.equal(d.length, 4);
  assert.equal(d[0].date, '2027-01-15');
  for (let i = 1; i < d.length; i++) assert.ok(d[i].date >= d[i - 1].date);
});

test('errors: bad input is a tool error; unknown tools, methods and bad JSON are protocol errors', async () => {
  const { byId, replies } = await session([init(), call(1, 'estimate_1099_tax', { grossIncome: 50000, filingStatus: 'widow' }), call(2, 'no_such_tool', {}),
    { jsonrpc: '2.0', id: 3, method: 'resources/list' }, 'not json']);
  assert.equal(byId[1].result.isError, true);
  assert.match(byId[1].result.content[0].text, /Unknown filing status/);
  assert.equal(byId[2].error.code, -32602);
  assert.equal(byId[3].error.code, -32601);
  assert.ok(replies.some((r) => r.id === null && r.error.code === -32700));
});

test('nothing but JSON-RPC goes to stdout', async () => {
  const { replies } = await session([init(), call(1, 'tax_figures', { topic: 'all', year: 2026 })]);
  for (const r of replies) assert.equal(r.jsonrpc, '2.0');
});
