describe("Phase 10 AI service", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
  });

  it("serves health, draft guidance, vendor suggestions, and spend summaries", async () => {
    const aiService = require("../services/ai-service");
    server = await aiService.startServer(0);
    const port = server.address().port;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const draft = await fetch(`http://127.0.0.1:${port}/draft-justification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Laptop refresh",
        items: [
          { description: "Developer laptop", quantity: 2, unitPrice: 1800 },
        ],
        requester: "Alicia",
      }),
    });

    const draftBody = await draft.json();
    expect(draft.status).toBe(200);
    expect(draftBody.justification).toMatch(/laptop|project|team/i);
    expect(draftBody.summary.total).toBeGreaterThan(0);

    const recommendation = await fetch(
      `http://127.0.0.1:${port}/vendor-recommendation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Laptop refresh",
          items: [
            { description: "Developer laptop", quantity: 2, unitPrice: 1800 },
          ],
        }),
      },
    );

    const recommendationBody = await recommendation.json();
    expect(recommendation.status).toBe(200);
    expect(Array.isArray(recommendationBody.vendors)).toBe(true);
    expect(recommendationBody.vendors.length).toBeGreaterThan(0);

    const summary = await fetch(`http://127.0.0.1:${port}/spend-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spend: [
          { category: "Hardware", amount: 3600 },
          { category: "Software", amount: 540 },
        ],
      }),
    });

    const summaryBody = await summary.json();
    expect(summary.status).toBe(200);
    expect(summaryBody.total).toBe(4140);
    expect(summaryBody.highestCategory).toBe("Hardware");
  });

  it("fails safely when the tenant cap is exhausted", async () => {
    const aiService = require("../services/ai-service");
    const interactions = { write: jest.fn(), accept: jest.fn() };
    server = await aiService.startServer(0, {
      usage: { reserve: jest.fn().mockResolvedValue(false) },
      interactions,
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/draft-justification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Laptop refresh", items: [{ description: "Laptop", quantity: 1, unitPrice: 1800 }] }),
    });
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("TOKEN_CAP_EXCEEDED");
    expect(interactions.write).toHaveBeenCalledWith(expect.objectContaining({ status: "CAP_EXCEEDED" }));
  });

  it("rejects malformed model output instead of presenting it to a user", async () => {
    const aiService = require("../services/ai-service");
    server = await aiService.startServer(0, {
      provider: { generate: jest.fn().mockResolvedValue({ unexpected: true }) },
      interactions: { write: jest.fn(), accept: jest.fn() },
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/draft-justification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Laptop refresh", items: [{ description: "Laptop", quantity: 1, unitPrice: 1800 }] }),
    });
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("MALFORMED_OUTPUT");
  });

  it("times out and leaves manual entry available", async () => {
    const aiService = require("../services/ai-service");
    const oldTimeout = process.env.AI_TIMEOUT_MS;
    const oldAttempts = process.env.AI_RETRY_ATTEMPTS;
    process.env.AI_TIMEOUT_MS = "10";
    process.env.AI_RETRY_ATTEMPTS = "1";
    server = await aiService.startServer(0, {
      provider: { generate: jest.fn((_feature, _payload, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "AbortError" }))))) },
      interactions: { write: jest.fn(), accept: jest.fn() },
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/draft-justification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Laptop refresh", items: [{ description: "Laptop", quantity: 1, unitPrice: 1800 }] }),
    });
    if (oldTimeout === undefined) delete process.env.AI_TIMEOUT_MS; else process.env.AI_TIMEOUT_MS = oldTimeout;
    if (oldAttempts === undefined) delete process.env.AI_RETRY_ATTEMPTS; else process.env.AI_RETRY_ATTEMPTS = oldAttempts;
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
  });
});
