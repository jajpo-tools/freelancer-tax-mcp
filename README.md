# Freelancer Tax MCP server

[![tests](https://github.com/jajpo-tools/freelancer-tax-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/jajpo-tools/freelancer-tax-mcp/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![freelancer-tax-mcp MCP server](https://glama.ai/mcp/servers/jajpo-tools/freelancer-tax-mcp/badges/score.svg)](https://glama.ai/mcp/servers/jajpo-tools/freelancer-tax-mcp)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants accurate **US federal tax figures and estimates for freelancers, gig workers and 1099 contractors** for tax years 2026 and 2027. Ask Claude, Cursor, VS Code or any MCP client:

- "I made $85,000 freelancing this year with $12,000 of expenses. How much federal tax will I owe?"
- "How much should I pay on January 15 to avoid a penalty? Last year my tax was $9,000."
- "What's the 2027 Form 1099-NEC threshold?"
- "When is my next estimated tax payment due?"

The assistant then works from figures taken from IRS and SSA publications instead of guessing.

- **Self-contained:** zero dependencies, runs locally over stdio, no API key, no network calls. Nothing you ask leaves your machine.
- **Sourced:** every figure comes from an IRS or SSA publication, and the results list their sources.
- **Same answers as the website:** it uses the same engine as JAJPO's free [1099 Tax Calculator](https://jajpo.com/taxes/1099-tax-calculator/), and each result links to the matching calculator so you can check every step.

## Tools

| Tool | What it does |
|---|---|
| `estimate_1099_tax` | Self-employment tax (Schedule SE), income tax after the standard and QBI deductions, Additional Medicare Tax, the share of each payment to set aside, the quarterly amount. Handles a W-2 job on the side, a spouse's wages, losses and qualified tips |
| `quarterly_estimated_tax` | Form 1040-ES planning: the 90% / 100% / 110% safe harbor rules, what to pay on each due date, missed installments, W-2 withholding |
| `self_employment_tax` | Social Security and Medicare tax on a net profit, with the wage base shared with W-2 wages |
| `tax_figures` | Official figures with sources: brackets, standard deduction, SE tax, QBI, 1099-NEC/1099-K thresholds, mileage rate, Solo 401(k)/SEP-IRA limits, home office, premium tax credit and more |
| `tax_deadlines` | Upcoming federal dates: estimated tax, the 1099-NEC deadline, the return due date |

All tools are read-only.

## Install

You need [Node.js](https://nodejs.org/) 18 or newer. `npx` downloads and runs the server from this repository.

**Claude Code**

```bash
claude mcp add --scope user --transport stdio freelancer-tax -- npx -y github:jajpo-tools/freelancer-tax-mcp
```

**Claude Desktop, Cursor, Windsurf and other clients**: add this to the client's MCP config file (for Claude Desktop, `claude_desktop_config.json`; for Cursor, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "freelancer-tax": {
      "command": "npx",
      "args": ["-y", "github:jajpo-tools/freelancer-tax-mcp"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "freelancer-tax": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:jajpo-tools/freelancer-tax-mcp"]
    }
  }
}
```

**Or clone it:** `git clone https://github.com/jajpo-tools/freelancer-tax-mcp`, then point your client at `node /path/to/freelancer-tax-mcp/server.js`.

## Example

Asking *"I'm single, made $60,000 on 1099s in 2026 and spent $8,000 on the business. What do I owe?"* calls `estimate_1099_tax` and returns:

```text
2026 federal tax estimate (single)
- Net profit: $52,000
- Self-employment tax: $7,347 (Social Security $5,955 + Medicare $1,393); half of it, $3,674, is deductible
- Income tax: $2,846 on taxable income of $25,781 (after the $16,100 standard deduction and a $6,445 QBI deduction)
- Total federal tax: $10,193
- Tax added by the self-employment income: $10,193, so set aside about 17% of each payment ($2,548 a quarter)
- State income tax is not included.
- Marginal income tax rate: 12%
Estimated tax due dates: 2026-04-15, 2026-06-15, 2026-09-15, 2027-01-15.
Check every step or change the numbers: https://jajpo.com/taxes/1099-tax-calculator/
```

Each result also returns `structuredContent` (exact figures in cents, sources and links) for clients that use it.

## What it doesn't do

It doesn't cover state tax brackets (only an optional flat rate), credits (child tax credit, EITC and others), capital gains rates, the AMT or S corporation payroll. It gives estimates for planning, not tax advice, and it doesn't file anything.

## Development

```bash
npm test     # starts the server and talks MCP to it over stdio
npm start    # run it by hand (reads JSON-RPC from stdin)
```

The calculations come from [self-employment-tax](https://github.com/jajpo-tools/self-employment-tax) and the figures from [us-tax-data](https://github.com/jajpo-tools/us-tax-data), copied into `lib/`.

## License

MIT. Maintained by [JAJPO](https://jajpo.com/): free tax and invoicing tools for US freelancers.
