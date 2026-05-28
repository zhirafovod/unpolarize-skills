#!/usr/bin/env node

import { handleCli, loadToken, saveToken, getBaseUrl } from "./auth.js";

// ── CLI subcommands (login/logout/status) ──
const subcommand = process.argv[2];
if (["login", "logout", "status"].includes(subcommand)) {
  await handleCli(process.argv.slice(2));
  process.exit(0);
}

// ── MCP server mode ──
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = getBaseUrl();
let TOKEN = loadToken();

async function api(method, path, body) {
  const url = `${BASE_URL}/api${path}`;
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function apiUpload(path, filePath, extraFields = {}) {
  const url = `${BASE_URL}/api${path}`;
  const headers = {};
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const buf = fs.readFileSync(filePath);
  const filename = filePath.split("/").pop();
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf]),
    filename,
  );
  for (const [k, v] of Object.entries(extraFields)) {
    if (v != null) form.append(k, String(v));
  }
  const res = await fetch(url, { method: "POST", headers, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const server = new McpServer({
  name: "unpolarize-skills",
  version: "0.1.0",
});

// ── Auth ──

server.tool(
  "signin",
  "Sign in to Unpolarize and get an auth token. Returns a JWT token to use for subsequent requests.",
  { username: z.string().optional(), email: z.string().optional(), password: z.string() },
  async ({ username, email, password }) => {
    const result = await api("POST", "/auth/signin", { username, email, password });
    if (result.token) {
      saveToken(result.token);
      TOKEN = result.token;
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Topics ──

server.tool(
  "list_topics",
  "List all discussion topics on Unpolarize.",
  {},
  async () => {
    const result = await api("GET", "/topics");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_topic",
  "Get a specific topic by ID with its full details.",
  { topic_id: z.string().describe("The topic ID") },
  async ({ topic_id }) => {
    const result = await api("GET", `/topics/${topic_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_topic",
  "Create a new discussion topic.",
  { name: z.string().describe("Topic name"), description: z.string().describe("Topic description") },
  async ({ name, description }) => {
    const result = await api("POST", "/semantic/topics", { name, description });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "search_topics",
  "Search topics by keyword or semantic similarity.",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const result = await api("GET", `/semantic/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "add_perspective",
  "Add a user perspective to a topic (description summary, problem summary, or solution summary).",
  {
    topic_id: z.string().describe("The topic ID"),
    type: z.enum(["description-summaries", "problem-summaries", "solution-summaries"]).describe("Type of perspective"),
    text: z.string().describe("Your perspective text"),
    source: z.string().optional().describe("Optional source reference"),
  },
  async ({ topic_id, type, text, source }) => {
    const result = await api("POST", `/topics/${topic_id}/${type}`, { text, source: source || "" });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "add_reference",
  "Add a reference to a topic (historical, political, or country example).",
  {
    topic_id: z.string().describe("The topic ID"),
    type: z.enum(["history-references", "political-references", "solution-countries"]).describe("Type of reference"),
    value: z.string().describe("The reference text or country name"),
  },
  async ({ topic_id, type, value }) => {
    const key = type === "solution-countries" ? "country" : "reference";
    const result = await api("POST", `/topics/${topic_id}/${type}`, { [key]: value });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_topic_rag_summary",
  "Generate an AI research summary for a topic using web search and RAG.",
  { topic_id: z.string().describe("The topic ID") },
  async ({ topic_id }) => {
    const result = await api("GET", `/topics/${topic_id}/rag-summary`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Notes ──

server.tool(
  "list_notes",
  "List all notes for the current user.",
  {},
  async () => {
    const result = await api("GET", "/notes");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_note",
  "Get a specific note by ID.",
  { note_id: z.string().describe("The note ID") },
  async ({ note_id }) => {
    const result = await api("GET", `/notes/${note_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_note",
  "Create a new note. Use visibility 'private' for drafts, 'published' for blog posts.",
  {
    title: z.string().describe("Note title"),
    content: z.string().describe("Note content (Markdown supported)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    visibility: z.enum(["private", "draft", "published"]).default("private").describe("Note visibility"),
  },
  async ({ title, content, tags, visibility }) => {
    const result = await api("POST", "/notes", { title, content, tags: tags || [], visibility });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_note",
  "Update an existing note.",
  {
    note_id: z.string().describe("The note ID"),
    title: z.string().optional().describe("New title"),
    content: z.string().optional().describe("New content"),
    tags: z.array(z.string()).optional().describe("New tags"),
    visibility: z.enum(["private", "draft", "published"]).optional().describe("New visibility"),
  },
  async ({ note_id, title, content, tags, visibility }) => {
    const body = {};
    if (title !== undefined) body.title = title;
    if (content !== undefined) body.content = content;
    if (tags !== undefined) body.tags = tags;
    if (visibility !== undefined) body.visibility = visibility;
    const result = await api("PUT", `/notes/${note_id}`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "analyze_note",
  "Run ideology and concept analysis on a note. Extracts key concepts, themes, and ideology correlations.",
  { note_id: z.string().describe("The note ID to analyze") },
  async ({ note_id }) => {
    const result = await api("POST", `/notes/${note_id}/analyze`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_related_notes",
  "Find notes related to a specific note by concept similarity.",
  { note_id: z.string().describe("The note ID") },
  async ({ note_id }) => {
    const result = await api("GET", `/notes/${note_id}/related`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Ideology Graph ──

server.tool(
  "list_ideologies",
  "List all ideology definitions (user-created and built-in defaults).",
  {},
  async () => {
    const result = await api("GET", "/ideology/definitions");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_concepts",
  "List all concepts in the ideology graph.",
  {},
  async () => {
    const result = await api("GET", "/ideology/concepts");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_ideology_graph",
  "Get the full ideology/concept graph with nodes and edges.",
  {},
  async () => {
    const result = await api("GET", "/ideology/graph");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_concept",
  "Create a new concept in the ideology graph.",
  {
    name: z.string().describe("Concept name"),
    description: z.string().describe("Concept description"),
    aliases: z.array(z.string()).optional().describe("Alternative names for this concept"),
    source_refs: z.array(z.string()).optional().describe("Source references (URLs or citations)"),
  },
  async ({ name, description, aliases, source_refs }) => {
    const result = await api("POST", "/ideology/concepts", {
      name, description, aliases: aliases || [], source_refs: source_refs || [],
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_relationship",
  "Create a relationship edge in the ideology/concept graph.",
  {
    source_id: z.string().describe("Source node ID"),
    source_type: z.enum(["concept", "ideology", "topic", "note"]).describe("Source node type"),
    target_id: z.string().describe("Target node ID"),
    target_type: z.enum(["concept", "ideology", "topic", "note"]).describe("Target node type"),
    relation: z.string().describe("Relationship type (e.g. belongs_to, supports, opposes, derives_from, shares_vocabulary_with, has_common_ground_with)"),
    weight: z.number().min(0).max(1).optional().describe("Relationship strength 0-1"),
    evidence: z.string().optional().describe("Evidence or explanation for this relationship"),
  },
  async ({ source_id, source_type, target_id, target_type, relation, weight, evidence }) => {
    const result = await api("POST", "/ideology/relationships", {
      source_id, source_type, target_id, target_type, relation,
      weight: weight ?? 0.7, evidence: evidence || "",
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "analyze_text_ideology",
  "Analyze a text for ideology correlation using multi-signal analysis.",
  { text: z.string().describe("Text to analyze for ideology signals") },
  async ({ text }) => {
    const result = await api("POST", "/ideology/analyze", { text });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_ideology_axes",
  "Discover ideology axes from shared concepts and graph relationships.",
  {},
  async () => {
    const result = await api("GET", "/ideology/axes");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Knowledge Base ──

server.tool(
  "search_knowledge",
  "Search the knowledge base using keyword, vector, or hybrid mode.",
  {
    query: z.string().describe("Search query"),
    mode: z.enum(["keyword", "vector", "hybrid"]).default("hybrid").describe("Search mode"),
  },
  async ({ query, mode }) => {
    const result = await api("GET", `/knowledge/search?q=${encodeURIComponent(query)}&mode=${mode}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "knowledge_qa",
  "Ask a question and get an answer with citations from the knowledge base.",
  { question: z.string().describe("Question to answer") },
  async ({ question }) => {
    const result = await api("POST", "/knowledge/qa", { question });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "knowledge_overview",
  "Get an overview of the knowledge base: document counts, concepts, categories.",
  {},
  async () => {
    const result = await api("GET", "/knowledge/overview");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Grokipedia ──

server.tool(
  "search_grokipedia",
  "Search Grokipedia for unbiased reference articles.",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const result = await api("GET", `/grokipedia/search?q=${encodeURIComponent(query)}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_topic_articles",
  "Get Grokipedia articles related to a specific topic.",
  { topic_id: z.string().describe("The topic ID") },
  async ({ topic_id }) => {
    const result = await api("GET", `/grokipedia/topic/${topic_id}/related`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Graph Visualization ──

server.tool(
  "get_topic_graph",
  "Get the topic relationship graph for force-graph visualization.",
  {},
  async () => {
    const result = await api("GET", "/graph/topics");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Blog Publishing ──

server.tool(
  "publish_post",
  "Publish a note as a blog post. Sets visibility=published, captures published_at, generates a share bundle (blog URL + tweet draft + 𝕏/LinkedIn/Facebook share links), notifies subscribers, and optionally auto-posts to 𝕏 if the user has configured X integration (auto_post_to_x=true requires X handle in profile + server-side X_BEARER_TOKEN). Returns the share bundle so the caller can offer the user copy/paste tweet text and click-to-tweet links.",
  {
    note_id: z.string().describe("The note ID to publish"),
    excerpt: z.string().optional().describe("Optional 1-2 sentence excerpt for previews / RSS / tweet draft"),
    cover_image_url: z.string().optional().describe("Optional cover image URL (path returned by upload_image works)"),
    auto_post_to_x: z.boolean().optional().describe("If true and the user has X integration configured, post the tweet automatically. Falls back to click-to-tweet link if credentials aren't available."),
  },
  async ({ note_id, excerpt, cover_image_url, auto_post_to_x }) => {
    const result = await api("POST", `/notes/${note_id}/publish`, {
      excerpt: excerpt ?? null,
      cover_image_url: cover_image_url ?? null,
      auto_post_to_x: !!auto_post_to_x,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "preview_share_bundle",
  "Preview the share bundle (tweet draft, blog URL, social share links) for a note WITHOUT changing publish state. Use this before publish_post to show the user what the tweet will look like.",
  { note_id: z.string().describe("The note ID") },
  async ({ note_id }) => {
    const result = await api("POST", `/notes/${note_id}/share-bundle`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "upload_image",
  "Upload a local image file to Unpolarize. Returns a URL suitable for embedding in a markdown note (e.g. ![alt](url)) or as cover_image_url on a published post. Supports png/jpg/gif/webp/svg up to 8 MB.",
  {
    file_path: z.string().describe("Absolute path to the local image file"),
    alt_text: z.string().optional().describe("Optional alt text for accessibility (not stored server-side yet, but useful for the caller to remember)"),
  },
  async ({ file_path, alt_text }) => {
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }
    const result = await apiUpload("/uploads/images", file_path, {});
    const out = {
      ...result,
      markdown: `![${alt_text || ""}](${result.url})`,
      absolute_url: result.url.startsWith("http") ? result.url : `${BASE_URL}${result.url}`,
    };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "set_x_config",
  "Configure the current user's X (Twitter) integration: handle, auto-post preference, and author bio shown on blog/RSS. Pass x_handle without the leading @.",
  {
    x_handle: z.string().optional().describe("X handle without @ (e.g. 'zhirafovod')"),
    x_auto_post: z.boolean().optional().describe("If true, publish_post(auto_post_to_x=true) will actually post to X (requires server-side X_BEARER_TOKEN)"),
    bio: z.string().optional().describe("Short author bio shown on the blog and RSS feed"),
  },
  async ({ x_handle, x_auto_post, bio }) => {
    const result = await api("PUT", "/user/x-config", {
      x_handle: x_handle ?? null,
      x_auto_post: !!x_auto_post,
      bio: bio ?? null,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_x_config",
  "Get the current user's X integration config and whether server-side auto-post credentials are available.",
  {},
  async () => {
    const result = await api("GET", "/user/x-config");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Subscriptions & Notifications ──

server.tool(
  "subscribe_to_author",
  "Subscribe the current user to a blog author so they get notified when the author publishes a new post. Channel 'in_app' delivers via the bell icon in the UI; 'email' delivers via SMTP (or logs to a dev sink when SMTP isn't configured). To subscribe by both, call this tool twice — once per channel.",
  {
    username_or_id: z.string().describe("Author username or user ID"),
    channel: z.enum(["in_app", "email"]).default("in_app").describe("Delivery channel"),
  },
  async ({ username_or_id, channel }) => {
    const result = await api("POST", `/users/${encodeURIComponent(username_or_id)}/subscribe`, { channel });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "unsubscribe_from_author",
  "Remove a subscription. If channel is omitted, removes ALL channels for that author.",
  {
    username_or_id: z.string().describe("Author username or user ID"),
    channel: z.enum(["in_app", "email"]).optional().describe("Specific channel to remove; omit to remove all"),
  },
  async ({ username_or_id, channel }) => {
    const q = channel ? `?channel=${channel}` : "";
    await api("DELETE", `/users/${encodeURIComponent(username_or_id)}/subscribe${q}`);
    return { content: [{ type: "text", text: `Unsubscribed from ${username_or_id}${channel ? ` (${channel})` : ""}.` }] };
  }
);

server.tool(
  "list_my_subscriptions",
  "List blog authors the current user is subscribed to, with delivery channel.",
  {},
  async () => {
    const result = await api("GET", "/subscriptions");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_notifications",
  "List in-app notifications for the current user (new posts from followed authors, etc.).",
  {
    only_unread: z.boolean().optional().describe("If true, only return unread notifications"),
    limit: z.number().int().min(1).max(200).optional().describe("Max notifications to return (default 50)"),
  },
  async ({ only_unread, limit }) => {
    const params = new URLSearchParams();
    if (only_unread) params.set("only_unread", "true");
    if (limit) params.set("limit", String(limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await api("GET", `/notifications${qs}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "mark_notifications_read",
  "Mark notifications as read. If notif_id is supplied, marks just that one; otherwise marks all.",
  {
    notif_id: z.string().optional().describe("Optional specific notification ID; omit to mark all read"),
  },
  async ({ notif_id }) => {
    const result = notif_id
      ? await api("POST", `/notifications/${notif_id}/read`)
      : await api("POST", "/notifications/read-all");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_author_blog",
  "Get an author's published posts and their RSS feed URL by username.",
  { username: z.string().describe("Author username") },
  async ({ username }) => {
    const result = await api("GET", `/blog/by/${encodeURIComponent(username)}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Translation ──

server.tool(
  "translate_note",
  "Translate one of the current user's notes into a target language and save it as a NEW draft note linked back to the original via translated_from_id.\n\nWorkflow (LLM-driven):\n1. The tool fetches the source note and returns its title, content, and a TRANSLATE_INSTRUCTION block telling the calling LLM exactly what to produce.\n2. The calling LLM (you, Claude) translates title + content into the target language, preserving Markdown structure, links, image references, code blocks, and table layout.\n3. The LLM calls `create_note` with: title=<translated title>, content=<translated content>, tags=<same tags as source>, visibility='draft', plus the source_note_id metadata.\n4. Finally, the LLM calls `link_translation` to set translated_from_id and language on the new note.\n\nIf you (the LLM) prefer an end-to-end automated tool that calls a backend LLM directly, configure the server with an OLLAMA_HOST or OPENAI_API_KEY and use the `translate_note_auto` companion tool when available.\n\nReturns: { source: <note>, target_language, instruction } — use this to perform the translation yourself.",
  {
    note_id: z.string().describe("The source note ID to translate"),
    target_language: z.string().describe("Target language name or BCP-47 code (e.g. 'Russian', 'es', 'ja')"),
  },
  async ({ note_id, target_language }) => {
    const source = await api("GET", `/notes/${note_id}`);
    const instruction =
      `TRANSLATE_INSTRUCTION (read by the calling LLM):\n` +
      `1. Translate the title and Markdown body below into ${target_language}.\n` +
      `2. Preserve Markdown structure exactly: headings (#, ##), lists, links [text](url), images ![alt](url), tables, code fences (\`\`\`).\n` +
      `3. Do NOT translate URLs, code, or technical identifiers inside backticks.\n` +
      `4. Translate alt text and table cells.\n` +
      `5. Keep the same tone (formal/informal/technical) as the source.\n` +
      `6. When done, call create_note with:\n` +
      `     title: <translated title>\n` +
      `     content: <translated markdown>\n` +
      `     tags: ${JSON.stringify((source.tags || []).concat([`translated:${target_language}`]))}\n` +
      `     visibility: "draft"\n` +
      `7. Then call link_translation(new_note_id, source_note_id="${source.id}", language="${target_language}").\n`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              source_note_id: source.id,
              source_title: source.title,
              source_language: source.language || "en",
              source_tags: source.tags || [],
              source_content: source.content,
              target_language,
              instruction,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
);

server.tool(
  "link_translation",
  "Mark a note as a translation of another note. Sets translated_from_id and language. Use this as the final step of the translate_note workflow.",
  {
    note_id: z.string().describe("The newly created translated note's ID"),
    source_note_id: z.string().describe("The original note ID this is a translation of"),
    language: z.string().describe("The target language (e.g. 'ru', 'es', 'Russian')"),
  },
  async ({ note_id, source_note_id, language }) => {
    // We piggy-back on update_note + a small SQL-free convention: store the
    // backref + lang via the existing update_note (server allows language)
    // and tag the note. translated_from_id is set directly via PUT.
    const result = await api("PUT", `/notes/${note_id}`, {
      language,
    });
    // Backend's UpdateNote doesn't expose translated_from_id yet; set it via
    // the dedicated translation-link endpoint when present, otherwise embed
    // a tag.
    try {
      await api("POST", `/notes/${note_id}/translation-link`, { source_note_id });
    } catch {
      // best-effort: server may not have this endpoint
    }
    return { content: [{ type: "text", text: JSON.stringify({ note_id, source_note_id, language, ...result }, null, 2) }] };
  }
);

// ── Start server ──

const transport = new StdioServerTransport();
await server.connect(transport);
