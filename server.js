import http from "http";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;
const AIRTABLE_API_KEY = process.env.Airtable_API_KEY;

// Map of logical base keys → Airtable Base IDs
const BASES = {
  contentHub: "appysRCPb7SIo65b4",          // Content Production Hub
  riseThrive: "app6BPzeM4pCySdxG",          // Rise & Thrive Membership
  newsletterMaestro: "appBN5g462u16L5Uv"    // Newsletter Maestro
};

// In‑memory schema cache: { baseKey: { tables: Set<string>, raw: any } }
const SCHEMA_CACHE = {};

/* -------------------------------------------------------
   JSON BODY PARSER
------------------------------------------------------- */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/* -------------------------------------------------------
   AIRTABLE HELPERS
------------------------------------------------------- */

function getBaseId(baseKey) {
  const baseId = BASES[baseKey];
  if (!baseId) {
    throw new Error(`Unknown base: ${baseKey}`);
  }
  return baseId;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

async function loadBaseSchema(baseKey) {
  const baseId = getBaseId(baseKey);
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const data = await fetchJson(url);

  const tables = new Set();
  for (const t of data.tables || []) {
    if (t.name) tables.add(t.name);
  }

  SCHEMA_CACHE[baseKey] = {
    tables,
    raw: data
  };
}

async function ensureSchemaLoaded(baseKey) {
  if (!SCHEMA_CACHE[baseKey]) {
    await loadBaseSchema(baseKey);
  }
}

async function validateBaseAndTable(baseKey, tableName) {
  if (!baseKey) {
    throw new Error("Missing 'base' query parameter");
  }
  if (!tableName) {
    throw new Error("Missing 'table' query parameter");
  }

  await ensureSchemaLoaded(baseKey);

  const cache = SCHEMA_CACHE[baseKey];
  if (!cache) {
    throw new Error(`Schema not loaded for base: ${baseKey}`);
  }

  if (!cache.tables.has(tableName)) {
    throw new Error(`Table not found in base '${baseKey}': ${tableName}`);
  }

  return getBaseId(baseKey);
}

/* -------------------------------------------------------
   RECORD OPERATIONS (DYNAMIC BASE + TABLE)
------------------------------------------------------- */

async function listRecords(baseKey, tableName) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  return fetchJson(url);
}

async function getRecord(baseKey, tableName, id) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${id}`;
  return fetchJson(url);
}

async function createRecord(baseKey, tableName, fields) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  return fetchJson(url, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

async function updateRecord(baseKey, tableName, id, fields) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${id}`;
  return fetchJson(url, {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });
}

async function deleteRecord(baseKey, tableName, id) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${id}`;
  return fetchJson(url, {
    method: "DELETE"
  });
}

async function searchRecords(baseKey, tableName, field, value) {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const formula = `FIND("${value}", {${field}})`;
  const url =
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}` +
    `?filterByFormula=${encodeURIComponent(formula)}`;
  return fetchJson(url);
}

async function listByView(baseKey, tableName, viewName, filterFormula) {
  const baseId = await validateBaseAndTable(baseKey, tableName);

  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?view=${encodeURIComponent(viewName)}`;

  if (filterFormula) {
    url += `&filterByFormula=${encodeURIComponent(filterFormula)}`;
  }

  return fetchJson(url);
}


/* -------------------------------------------------------
   SERVER + ROUTES
------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const path = urlObj.pathname;

  // Small helper to send JSON
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  try {
    /* -------------------------
       GET /list?base=&table=
    ------------------------- */
    if (path === "/list" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const data = await listRecords(base, table);
      return send(200, data);
    }

    /* -------------------------
       GET /get?base=&table=&id=
    ------------------------- */
    if (path === "/get" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const data = await getRecord(base, table, id);
      return send(200, data);
    }

    /* -------------------------
       POST /create?base=&table=
    ------------------------- */
    if (path === "/create" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);
      const data = await createRecord(base, table, body.fields || {});
      return send(200, data);
    }

    /* -------------------------
       PATCH /update?base=&table=&id=
    ------------------------- */
    if (path === "/update" && req.method === "PATCH") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const body = await parseBody(req);
      const data = await updateRecord(base, table, id, body.fields || {});
      return send(200, data);
    }

    /* -------------------------
       DELETE /delete?base=&table=&id=
    ------------------------- */
    if (path === "/delete" && req.method === "DELETE") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const data = await deleteRecord(base, table, id);
      return send(200, data);
    }

    /* -------------------------
       GET /search?base=&table=&field=&value=
    ------------------------- */
    if (path === "/search" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const field = urlObj.searchParams.get("field");
      const value = urlObj.searchParams.get("value");
      if (!field || !value) {
        throw new Error("Missing 'field' or 'value' query parameter");
      }
      const data = await searchRecords(base, table, field, value);
      return send(200, data);
    }

   /* -------------------------
   GET /view?base=&table=&name=&filter=
------------------------- */
if (path === "/view" && req.method === "GET") {
  try {
    const base = urlObj.searchParams.get("base");
    const table = urlObj.searchParams.get("table");
    const view = urlObj.searchParams.get("name");
    const filter = urlObj.searchParams.get("filter"); // optional

    if (!view) {
      return send(400, { error: "Missing 'name' (view) query parameter" });
    }

    const data = await listByView(base, table, view, filter);

    return send(200, {
      ok: true,
      base,
      table,
      view,
      filter: filter || null,
      records: data.records || []
    });

  } catch (err) {
    return send(400, {
      ok: false,
      error: err.message || "Unknown error in /view route"
    });
  }
}
/*---------------------------------
       GET /schema?base=contentHub|riseThrive|newsletterMaestro
       - If base provided → schema for that base
       - If no base → schemas for all bases (that can be loaded)
    ------------------------- */
    if (path === "/schema" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");

      if (base) {
        await ensureSchemaLoaded(base);
        const cache = SCHEMA_CACHE[base];
        if (!cache) throw new Error(`Schema not available for base: ${base}`);
        return send(200, { base, schema: cache.raw });
      }

      // All bases
      const result = {};
      for (const key of Object.keys(BASES)) {
        await ensureSchemaLoaded(key);
        result[key] = SCHEMA_CACHE[key]?.raw || null;
      }
      return send(200, result);
    }

    /* -------------------------
       DEFAULT RESPONSE
    ------------------------- */
    return send(200, {
      status: "ok",
      message: "Multi-base Airtable MCP server is running",
      bases: Object.keys(BASES)
    });

  } catch (error) {
    console.error("Error handling request:", error.message);
    return send(400, { error: error.message });
  }
});

/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server running on port ${PORT}`);
});
