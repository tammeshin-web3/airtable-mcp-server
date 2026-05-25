import http from "http";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;

// Your variable names EXACTLY as you want them
const AIRTABLE_API_KEY = process.env.Airtable_API_KEY;
const BASE_ID = process.env.Airtable_BASE_ID;
const TABLE_NAME = process.env.Airtable_TABLE_NAME;

/* -------------------------------------------------------
   HELPER FUNCTIONS (GLOBAL, NOT NESTED)
------------------------------------------------------- */

async function listRecords() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

async function getRecord(id) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

async function createRecord(fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  return response.json();
}

async function updateRecord(id, fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  return response.json();
}

async function deleteRecord(id) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

async function searchRecords(field, value) {
  const formula = `FIND("${value}", {${field}})`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

async function listByView(viewName) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?view=${encodeURIComponent(viewName)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

async function getSchema() {
  const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  return response.json();
}

/* -------------------------------------------------------
   SERVER + ROUTES
------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  // LIST ALL RECORDS
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

  // GET ONE RECORD
  if (req.url.startsWith("/get")) {
    const id = new URL(req.url, `http://${req.headers.host}`).searchParams.get("id");
    const data = await getRecord(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // CREATE RECORD
  if (req.url === "/create" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      const fields = JSON.parse(body);
      const data = await createRecord(fields);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    });
    return;
  }

  // UPDATE RECORD
  if (req.url.startsWith("/update") && req.method === "PATCH") {
    const id = new URL(req.url, `http://${req.headers.host}`).searchParams.get("id");
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      const fields = JSON.parse(body);
      const data = await updateRecord(id, fields);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    });
    return;
  }

  // DELETE RECORD
  if (req.url.startsWith("/delete") && req.method === "DELETE") {
    const id = new URL(req.url, `http://${req.headers.host}`).searchParams.get("id");
    const data = await deleteRecord(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // SEARCH
  if (req.url.startsWith("/search")) {
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const field = params.get("field");
    const value = params.get("value");
    const data = await searchRecords(field, value);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // LIST BY VIEW
  if (req.url.startsWith("/view")) {
    const view = new URL(req.url, `http://${req.headers.host}`).searchParams.get("name");
    const data = await listByView(view);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // SCHEMA
  if (req.url === "/schema") {
    const data = await getSchema();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  // DEFAULT RESPONSE
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", message: "Airtable MCP server is running" }));
});

/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server running on port ${PORT}`);
});
