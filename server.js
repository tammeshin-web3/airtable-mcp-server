import http from "http";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;

// Your variable names EXACTLY as you want them
const AIRTABLE_API_KEY = process.env.Airtable_API_KEY;
const BASE_ID = process.env.Airtable_BASE_ID;
const TABLE_NAME = process.env.Airtable_TABLE_NAME;

/* -------------------------------------------------------
   JSON BODY PARSER (REQUIRED FOR POST/PATCH/DELETE)
------------------------------------------------------- */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/* -------------------------------------------------------
   HELPER FUNCTIONS (GLOBAL)
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
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const path = urlObj.pathname;

  /* -------------------------
     GET /list
  ------------------------- */
  if (path === "/list" && req.method === "GET") {
    try {
      const records = await listRecords();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(records));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  /* -------------------------
     GET /get?id=xxx
  ------------------------- */
  if (path === "/get" && req.method === "GET") {
    const id = urlObj.searchParams.get("id");
    const data = await getRecord(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  /* -------------------------
     POST /create
  ------------------------- */
  if (path === "/create" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const data = await createRecord(body.fields);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  /* -------------------------
     PATCH /update?id=xxx
  ------------------------- */
  if (path === "/update" && req.method === "PATCH") {
    try {
      const id = urlObj.searchParams.get("id");
      const body = await parseBody(req);
      const data = await updateRecord(id, body.fields);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  /* -------------------------
     DELETE /delete?id=xxx
  ------------------------- */
  if (path === "/delete" && req.method === "DELETE") {
    try {
      const id = urlObj.searchParams.get("id");
      const data = await deleteRecord(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  /* -------------------------
     GET /search?field=Title&value=Sacred
  ------------------------- */
  if (path === "/search" && req.method === "GET") {
    const field = urlObj.searchParams.get("field");
    const value = urlObj.searchParams.get("value");
    const data = await searchRecords(field, value);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  /* -------------------------
     GET /view?name=Bot View: Writer Queue
  ------------------------- */
  if (path === "/view" && req.method === "GET") {
    const view = urlObj.searchParams.get("name");
    const data = await listByView(view);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  /* -------------------------
     GET /schema
  ------------------------- */
  if (path === "/schema" && req.method === "GET") {
    const data = await getSchema();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  }

  /* -------------------------
     DEFAULT RESPONSE
  ------------------------- */
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", message: "Airtable MCP server is running" }));
});

/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server running on port ${PORT}`);
});
