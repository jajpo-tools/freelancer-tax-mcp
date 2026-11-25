#!/usr/bin/env node
/**
 * freelancer-tax-mcp: a Model Context Protocol server (stdio) with US federal tax estimates
 * and figures for freelancers and 1099 contractors. No dependencies.
 *
 * Protocol: JSON-RPC 2.0, one message per line on stdin/stdout. Logs go to stderr only.
 */
'use strict';
const readline = require('node:readline');
const { listTools, callTool } = require('./lib/tools.js');
const pkg = require('./package.json');

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const SERVER_INFO = {
  name: 'jajpo-freelancer-tax',
  title: 'Freelancer Tax (JAJPO)',
  version: pkg.version,
  websiteUrl: 'https://jajpo.com/'
};

const INSTRUCTIONS = [
  'US federal tax estimates and official figures for freelancers, gig workers and 1099 contractors, tax years 2026 and 2027.',
  'Use estimate_1099_tax for "how much tax will I owe / how much should I set aside", quarterly_estimated_tax for payment planning,',
  'tax_figures for official numbers (brackets, thresholds, limits) and tax_deadlines for dates.',
  'Results are estimates from IRS and SSA publications, federal only, not tax advice: say so, and mention that state tax is not included.',
  'Each result has a link to a free JAJPO calculator that shows the same calculation step by step; share it when the user wants to check or adjust the numbers.'
].join(' ');

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
    return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid Request');
  }
  if (typeof msg.method !== 'string') return; // a response to us: we send no requests, so ignore it
  const isRequest = msg.id !== undefined && msg.id !== null;
  const params = msg.params || {};

  switch (msg.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return reply(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case 'ping':
      return isRequest && reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: listTools() });
    case 'tools/call': {
      const result = callTool(params.name, params.arguments);
      if (!result) return fail(msg.id, -32602, `Unknown tool: ${params.name}`);
      return reply(msg.id, result);
    }
    default:
      if (msg.method.startsWith('notifications/')) return; // initialized, cancelled, ...
      if (isRequest) return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  try {
    if (Array.isArray(msg)) msg.forEach(handle);
    else handle(msg);
  } catch (err) {
    process.stderr.write(`freelancer-tax-mcp: ${err.stack || err}\n`);
    if (msg && msg.id !== undefined) fail(msg.id, -32603, 'Internal error');
  }
});
rl.on('close', () => process.exit(0));
