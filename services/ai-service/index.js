const http = require("node:http");

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function buildDraftJustification(payload = {}) {
  const title = payload.title || "Procurement request";
  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const requester = payload.requester || "the requester";

  return {
    justification: `This request for ${title} supports operational continuity for ${requester}. The requested items total $${total.toLocaleString()} and are required to keep the team productive, reduce downtime, and meet delivery commitments without disrupting current workflows.`,
    summary: {
      total,
      itemCount: items.length,
      title,
    },
  };
}

function buildVendorRecommendations(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const vendors = [
    {
      name: "Northwind Supply",
      score: 0.96,
      rationale:
        "Strong delivery track record and competitive pricing for office and IT hardware.",
    },
    {
      name: "Summit Procurement",
      score: 0.91,
      rationale:
        "Reliable enterprise support and favourable contract terms for recurring purchases.",
    },
    {
      name: "BluePeak Commerce",
      score: 0.88,
      rationale:
        "Good fit for mid-volume procurement with flexible fulfilment schedules.",
    },
  ].map((vendor, index) => ({
    ...vendor,
    recommendedOrder: index + 1,
    estimatedSpend: total,
  }));

  return { title: payload.title || "Procurement request", vendors };
}

function buildSpendSummary(payload = {}) {
  const spend = Array.isArray(payload.spend) ? payload.spend : [];
  const totals = spend.map((entry) => ({
    category: entry.category || "Unspecified",
    amount: Number(entry.amount || 0),
  }));

  const total = totals.reduce((sum, entry) => sum + entry.amount, 0);
  const highestCategory = totals.reduce((best, current) => {
    if (!best || current.amount > best.amount) return current;
    return best;
  }, null);

  return {
    total,
    highestCategory: highestCategory ? highestCategory.category : null,
    categories: totals,
  };
}

function createAiHandler() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", service: "ai-service", ready: true }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/draft-justification") {
      try {
        const payload = await parseJsonBody(req);
        const draft = buildDraftJustification(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(draft));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "INVALID_JSON", message: error.message },
          }),
        );
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/vendor-recommendation") {
      try {
        const payload = await parseJsonBody(req);
        const result = buildVendorRecommendations(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "INVALID_JSON", message: error.message },
          }),
        );
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/spend-summary") {
      try {
        const payload = await parseJsonBody(req);
        const result = buildSpendSummary(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "INVALID_JSON", message: error.message },
          }),
        );
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        service: "ai-service",
        status: "ready",
        endpoints: [
          "/health",
          "/draft-justification",
          "/vendor-recommendation",
          "/spend-summary",
        ],
      }),
    );
  });
}

function startServer(port = Number(process.env.AI_SERVICE_PORT || 4010)) {
  const server = createAiHandler();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      console.log(`ai-service: listening on :${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.AI_SERVICE_PORT || 4010);
  const server = createAiHandler();

  server.listen(port, () => {
    console.log(`ai-service: listening on :${port}`);
  });

  function shutdown(signal) {
    console.log(`ai-service: shutting down (${signal})`);
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = {
  startServer,
  createAiHandler,
  buildDraftJustification,
  buildVendorRecommendations,
  buildSpendSummary,
};
