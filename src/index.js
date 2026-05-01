#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.UNPOLARIZE_API_URL || "https://unpolarize-652421979088.us-west1.run.app";
const TOKEN = process.env.UNPOLARIZE_TOKEN || "";

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

// ── Start server ──

const transport = new StdioServerTransport();
await server.connect(transport);
