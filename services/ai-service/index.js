const crypto = require("node:crypto");
const http = require("node:http");
const Redis = require("ioredis");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { aiContracts } = require("../../packages/contracts");
const AiInteraction = require("../../src/modules/ai/interaction.model");

const PROMPT_VERSION = "2026-09-01";
const routes = { "/draft-justification": "draftJustification", "/vendor-recommendation": "vendorRecommendation", "/spend-summary": "spendSummary" };

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (chunk) => { size += chunk.length; if (size > 1_000_000) { reject(new Error("Request body is too large")); req.destroy(); } else chunks.push(chunk); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("Invalid JSON body")); } });
    req.on("error", reject);
  });
}

function totalItems(items = []) { return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0); }
function buildDraftJustification(payload = {}) {
  const title = payload.title || "Procurement request"; const items = Array.isArray(payload.items) ? payload.items : []; const total = totalItems(items); const requester = payload.requester || "the requester";
  return { justification: `This request for ${title} supports operational continuity for ${requester}. The requested items total $${total.toLocaleString()} and are required to keep the team productive, reduce downtime, and meet delivery commitments without disrupting current workflows.`, summary: { total, itemCount: items.length, title } };
}
function buildVendorRecommendations(payload = {}) {
  const total = totalItems(Array.isArray(payload.items) ? payload.items : []);
  const vendors = [{ name: "Northwind Supply", score: 0.96, rationale: "Strong delivery track record and competitive pricing for office and IT hardware." }, { name: "Summit Procurement", score: 0.91, rationale: "Reliable enterprise support and favourable contract terms for recurring purchases." }, { name: "BluePeak Commerce", score: 0.88, rationale: "Good fit for mid-volume procurement with flexible fulfilment schedules." }].map((vendor, index) => ({ ...vendor, recommendedOrder: index + 1, estimatedSpend: total }));
  return { title: payload.title || "Procurement request", vendors };
}
function buildSpendSummary(payload = {}) {
  const categories = (Array.isArray(payload.spend) ? payload.spend : []).map((entry) => ({ category: entry.category || "Unspecified", amount: Number(entry.amount || 0) }));
  const total = categories.reduce((sum, entry) => sum + entry.amount, 0); const highest = categories.reduce((best, current) => (!best || current.amount > best.amount ? current : best), null);
  return { total, highestCategory: highest?.category || null, categories, narrative: highest ? `${highest.category} is the largest spend category, contributing $${highest.amount.toLocaleString()} of $${total.toLocaleString()} total spend.` : "No spend was recorded for this period." };
}

const localProvider = { async generate(feature, payload) { if (feature === "draftJustification") return buildDraftJustification(payload); if (feature === "vendorRecommendation") return buildVendorRecommendations(payload); return buildSpendSummary(payload); } };
function promptFor(feature, payload) { return `Prompt version ${PROMPT_VERSION}. You are a procurement assistant. Return JSON only. Task: ${feature}. Never make a purchasing decision; provide a suggestion for human review. Input: ${JSON.stringify(payload)}`; }
function openAiProvider() {
  return { async generate(feature, payload, signal) {
    const response = await fetch(process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions", { method: "POST", signal, headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.AI_MODEL || "gpt-5-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content: promptFor(feature, payload) }] }) });
    if (!response.ok) throw new Error(`LLM provider returned ${response.status}`);
    const body = await response.json(); return JSON.parse(body.choices?.[0]?.message?.content || "");
  } };
}
function defaultProvider() { return process.env.AI_API_KEY ? openAiProvider() : localProvider; }
function validOutput(feature, value) { if (!value || typeof value !== "object") return false; if (feature === "draftJustification") return typeof value.justification === "string" && value.justification.length > 20; if (feature === "vendorRecommendation") return Array.isArray(value.vendors); return Number.isFinite(value.total) && Array.isArray(value.categories); }
function tokenEstimate(value) { return Math.max(1, Math.ceil(JSON.stringify(value).length / 4)); }
let aiRedis;
function redisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!aiRedis) { aiRedis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 500, lazyConnect: true }); aiRedis.on("error", () => {}); aiRedis.connect().catch(() => {}); }
  return aiRedis;
}
function createUsageStore() {
  const memory = new Map();
  return { async reserve(tenantId, tokens, cap) {
    const month = new Date().toISOString().slice(0, 7); const key = `ai:usage:${tenantId}:${month}`;
    try {
      const redis = redisClient();
      if (redis?.status === "ready") { const used = await redis.incrby(key, tokens); if (used === tokens) await redis.expire(key, 35 * 24 * 60 * 60); if (used > cap) { await redis.decrby(key, tokens); return false; } return true; }
    } catch { /* fall back to the process-local development counter */ }
    const used = memory.get(key) || 0; if (used + tokens > cap) return false; memory.set(key, used + tokens); return true;
  } };
}
function createInteractionLogger() {
  return {
    async write(entry) { try { if (process.env.MONGODB_URL && mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 1000 }); if (mongoose.connection.readyState === 1) await AiInteraction.create(entry); else console.info(JSON.stringify({ type: "ai_interaction", ...entry })); } catch { console.info(JSON.stringify({ type: "ai_interaction", ...entry })); } },
    async accept(interactionId, tenantId) { try { if (mongoose.connection.readyState !== 1) return false; await AiInteraction.updateOne({ interactionId, tenantId }, { $set: { accepted: true, acceptedAt: new Date() } }); return true; } catch { return false; } },
  };
}
function identity(req) {
  const header = req.headers.authorization || ""; const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token && process.env.NODE_ENV === "test") return { tid: 1, sub: "test" };
  if (!token) return null;
  try { const payload = jwt.verify(token, process.env.SERVICE_JWT_SECRET || process.env.JWT_SECRET || "test-secret"); return payload.tid ? payload : null; } catch { return null; }
}
async function generateWithRetry(provider, feature, payload) {
  const attempts = Math.max(1, Number(process.env.AI_RETRY_ATTEMPTS || 2)); const timeoutMs = Math.max(10, Number(process.env.AI_TIMEOUT_MS || 8000)); let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await provider.generate(feature, payload, controller.signal); } catch (error) { lastError = error; } finally { clearTimeout(timeout); } }
  throw lastError;
}
function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(body === undefined ? "" : JSON.stringify(body)); }

function createAiHandler({ provider = defaultProvider(), usage = createUsageStore(), interactions = createInteractionLogger() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/ready")) return json(res, 200, { status: "ok", service: "ai-service", ready: true, provider: process.env.AI_API_KEY ? "configured" : "local-fallback" });
    const actor = identity(req); if (!actor) return json(res, 401, { error: { code: "UNAUTHENTICATED", message: "A valid signed token is required" } });
    const accept = url.pathname.match(/^\/interactions\/([^/]+)\/accept$/);
    if (req.method === "POST" && accept) { const saved = await interactions.accept(accept[1], Number(actor.tid)); return json(res, saved ? 204 : 503, saved ? undefined : { error: { code: "LOG_UNAVAILABLE", message: "Acceptance could not be recorded" } }); }
    const feature = routes[url.pathname]; if (req.method !== "POST" || !feature) return json(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    const interactionId = crypto.randomUUID(); const baseLog = { interactionId, tenantId: Number(actor.tid), actorId: Number(actor.sub) || undefined, feature, promptVersion: PROMPT_VERSION, accepted: false };
    let payload;
    try { payload = aiContracts[feature].parse(await parseJsonBody(req)); } catch (error) { await interactions.write({ ...baseLog, status: "INVALID_INPUT", errorCode: "VALIDATION_ERROR" }); return json(res, 400, { error: { code: "VALIDATION_ERROR", message: error.message } }); }
    const inputTokens = tokenEstimate(payload); const cap = Number(process.env.AI_MONTHLY_TOKEN_CAP || 100000);
    if (!(await usage.reserve(actor.tid, inputTokens, cap))) { await interactions.write({ ...baseLog, status: "CAP_EXCEEDED", inputTokens, errorCode: "TOKEN_CAP_EXCEEDED" }); return json(res, 429, { error: { code: "TOKEN_CAP_EXCEEDED", message: "Monthly AI usage cap reached; continue with manual entry" } }); }
    try {
      const result = await generateWithRetry(provider, feature, payload); if (!validOutput(feature, result)) { await interactions.write({ ...baseLog, status: "MALFORMED_OUTPUT", inputTokens, errorCode: "MALFORMED_OUTPUT" }); return json(res, 502, { error: { code: "MALFORMED_OUTPUT", message: "The AI response was not usable; continue with manual entry" } }); }
      const outputTokens = tokenEstimate(result); await interactions.write({ ...baseLog, status: "SUCCEEDED", inputTokens, outputTokens }); return json(res, 200, { ...result, interactionId, promptVersion: PROMPT_VERSION });
    } catch (error) { const code = error.name === "AbortError" ? "AI_TIMEOUT" : "AI_UNAVAILABLE"; await interactions.write({ ...baseLog, status: "FAILED", inputTokens, errorCode: code }); return json(res, 503, { error: { code, message: "AI assistance is unavailable; continue with manual entry" } }); }
  });
}

function startServer(port = Number(process.env.AI_SERVICE_PORT || 4010), options) { const server = createAiHandler(options); return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, () => { console.log(`ai-service: listening on :${server.address().port}`); resolve(server); }); }); }
if (require.main === module) { const server = createAiHandler(); server.listen(Number(process.env.AI_SERVICE_PORT || 4010), () => console.log(`ai-service: listening on :${process.env.AI_SERVICE_PORT || 4010}`)); const shutdown = (signal) => { console.log(`ai-service: shutting down (${signal})`); server.close(async () => { aiRedis?.disconnect(); await mongoose.disconnect(); process.exit(0); }); }; process.on("SIGINT", () => shutdown("SIGINT")); process.on("SIGTERM", () => shutdown("SIGTERM")); }
module.exports = { startServer, createAiHandler, buildDraftJustification, buildVendorRecommendations, buildSpendSummary, createUsageStore, generateWithRetry, PROMPT_VERSION };
