import http from "http";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

async function listRecords() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  const data = await response.json();
  return data;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/list") {
    try {
      const records = await listRecords();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(records));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // Default response
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
