# unpolarize-skills

MCP server that exposes the [Unpolarize](https://unpolarize.us) API as tools for Claude CLI.

## Install

### 1. Clone and install dependencies

```bash
git clone git@github.com:zhirafovod/unpolarize-skills.git
cd unpolarize-skills
npm install
```

### 2. Sign in

```bash
npx unpolarize-skills login
```

This opens your browser to the Unpolarize sign-in page. After you log in, the token is saved to `~/.unpolarize/token` automatically.

If you're on a headless machine, use:

```bash
npx unpolarize-skills login --no-browser
```

Check your auth status or log out:

```bash
npx unpolarize-skills status
npx unpolarize-skills logout
```

### 3. Add to Claude CLI

```bash
claude mcp add unpolarize-skills node /path/to/unpolarize-skills/src/index.js
```

Or add manually to `.claude.json` in any project:

```json
{
  "mcpServers": {
    "unpolarize-skills": {
      "command": "node",
      "args": ["/path/to/unpolarize-skills/src/index.js"]
    }
  }
}
```

The server loads the token from `~/.unpolarize/token` automatically. You can also set `UNPOLARIZE_TOKEN` as an env var to override.

## Available Tools

### Topics
- `list_topics` - List all discussion topics
- `get_topic` - Get topic details by ID
- `create_topic` - Create a new topic
- `search_topics` - Search by keyword or semantic similarity
- `add_perspective` - Add description/problem/solution to a topic
- `add_reference` - Add historical/political/country reference
- `get_topic_rag_summary` - Generate AI research summary

### Notes
- `list_notes` - List your notes
- `get_note` - Get a note by ID
- `create_note` - Create a note (private/draft/published)
- `update_note` - Update a note
- `analyze_note` - Run ideology/concept analysis
- `get_related_notes` - Find similar notes

### Ideology Graph
- `list_ideologies` - List ideology definitions
- `list_concepts` - List graph concepts
- `get_ideology_graph` - Get full graph (nodes + edges)
- `create_concept` - Add a concept
- `create_relationship` - Add a graph edge
- `analyze_text_ideology` - Analyze text for ideology signals
- `get_ideology_axes` - Discover ideology axes

### Knowledge Base
- `search_knowledge` - Search docs (keyword/vector/hybrid)
- `knowledge_qa` - Q&A with citations
- `knowledge_overview` - Document counts and stats

### Grokipedia
- `search_grokipedia` - Search reference articles
- `get_topic_articles` - Get articles related to a topic

### Graph
- `get_topic_graph` - Topic relationship graph data

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UNPOLARIZE_API_URL` | `https://unpolarize-652421979088.us-west1.run.app` | API base URL |
| `UNPOLARIZE_TOKEN` | (empty) | JWT auth token |

## Usage Example

Once installed, in Claude CLI:

> "List all topics on Unpolarize and create a note summarizing the most interesting ones"

> "Search the ideology graph for concepts related to free markets and show how they connect to libertarianism"

> "I think immigration policy is mostly about labor economics, not border security. Create a topic and add my perspective."
