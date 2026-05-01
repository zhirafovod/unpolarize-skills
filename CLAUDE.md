# CLAUDE.md

This is an MCP server that exposes the Unpolarize API as tools for Claude CLI.

## Setup

```bash
npm install
claude mcp add unpolarize-skills node $(pwd)/src/index.js -e UNPOLARIZE_TOKEN=<token>
```

## Architecture

- `src/index.js` — Single-file MCP server using `@modelcontextprotocol/sdk`
- Communicates over stdio (StdioServerTransport)
- All tools are thin wrappers around REST API calls to the Unpolarize backend
- Auth via Bearer token in `UNPOLARIZE_TOKEN` env var

## Commit conventions

- Do not add `Co-Authored-By` trailers to commit messages.
