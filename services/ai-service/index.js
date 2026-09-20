const http = require("node:http");

const port = Number(process.env.AI_SERVICE_PORT || 4010);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "ai-service",
        mode: "placeholder",
      }),
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      service: "ai-service",
      status: "ready",
      message:
        "AI service placeholder. Prompt orchestration and LLM client work will be added in Phase 10.",
    }),
  );
});

server.listen(port, () => {
  console.log(`ai-service: listening on :${port}`);
});

function shutdown(signal) {
  console.log(`ai-service: shutting down (${signal})`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
