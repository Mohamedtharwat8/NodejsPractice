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
});
