import http from "http";

const PORT = process.env.PORT || 3000;

// Basic MCP-style server placeholder
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      message: "Airtable MCP server is running",
    })
  );
});

server.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
});
