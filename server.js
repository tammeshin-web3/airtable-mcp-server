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

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error ||
      JSON.stringify(data || { status: res.status, statusText: res.statusText });
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

async function listRecords(baseKey, tableName, extraQuery = "") {
  const baseId = await validateBaseAndTable(baseKey, tableName);
  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  if (extraQuery) {
    url += `?${extraQuery}`;
  }
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
 COMPANY OPERATIONS' HELPERS
 -------------------------------------------------------*/
/* Call for outline generation agent */
async function getOutlineQueue() {
  const base = "contentHub";
  const table = "Content Production";
  const filterFormula = `{Status} = "Ready for Outline"`;
  return getReadyImageRecords(base, table, {
    filterFormula,
    maxRecords: 1
  });
}
/* Save outlne results to record for Editorial Brief agent */
/* Save outline results to record and return context for Editorial Brief agent */
async function saveOutlineResult(id, outline = {}) {
  if (!id || typeof id !== "string") {
    throw new Error("save_outline: missing or invalid record id");
  }

  if (!outline || typeof outline !== "object" || Array.isArray(outline)) {
    throw new Error("save_outline: missing or invalid outline object");
  }

  const {
    outline_markdown,
    outline_json,
    content_goal
  } = outline;

  if (
    typeof outline_markdown !== "string" ||
    !outline_markdown.trim()
  ) {
    throw new Error(
      "save_outline: outline_markdown is missing or empty"
    );
  }

  if (
    !Array.isArray(outline_json) ||
    outline_json.length === 0
  ) {
    throw new Error(
      "save_outline: outline_json must be a non-empty array"
    );
  }

  if (
    typeof content_goal !== "string" ||
    !content_goal.trim()
  ) {
    throw new Error(
      "save_outline: content_goal is missing or empty"
    );
  }

  const status = "Outline Ready";
  const lastAgentWorkflow = "Outline Writer";
  const lastAgentTimestamp = new Date().toISOString();

  const fields = {
    "Outline (Readable)": outline_markdown,
    "Content Goal": content_goal,
    "Status": status,
    "Last Agent Workflow": lastAgentWorkflow,
    "Last Agent Timestamp": lastAgentTimestamp
  };

  const updatedRecord = await updateRecord(
    "contentHub",
    "Content Production",
    id,
    fields
  );

  return {
    success: true,
    record_id: id,
    status,
    last_agent_workflow: lastAgentWorkflow,
    last_agent_timestamp: lastAgentTimestamp,

    /* Immediate handoff to Editorial Brief agent */
    outline: {
      content_goal,
      outline_json,
      outline_markdown
    },

    updated_record: updatedRecord
  };
}
/**
 * Log workflow errors into a dedicated table.
 * Query:
 *   base, table (this table is your error log table)
 * Body:
 *   {
 *     "workflowName": "Image Generation",
 *     "recordId": "recXXXX",
 *     "errorMessage": "Something failed",
 *     "payload": {...},
 *     "timestamp": "2026-06-05T20:30:00Z"
 *   }
 */
async function logWorkflowError(baseKey, tableName, payload) {
  const {
    workflowName,
    recordId,
    errorMessage,
    payload: rawPayload,
    timestamp
  } = payload || {};
  const fields = {
    ...(workflowName ? { "Workflow Name": workflowName } : {}),
    ...(recordId ? { "Record ID": recordId } : {}),
    ...(errorMessage ? { "Error Message": errorMessage } : {}),
    ...(timestamp ? { "Timestamp": timestamp } : {}),
    ...(rawPayload
      ? { "Raw Payload": JSON.stringify(rawPayload).slice(0, 50000) }
      : {})
  };
  if (Object.keys(fields).length === 0) {
    throw new Error("No fields to log in logWorkflowError");
  }
  return createRecord(baseKey, tableName, fields);
}

async function getEditorialBriefQueue() {
  const base = "contentHub";
  const table = "Content Production";
  const filterFormula = `{Status} = "Outline Ready"`;
  return getReadyImageRecords(base, table, {
    filterFormula,
    maxRecords: 1
  });
}
async function saveEditorialBrief(id, payload = {}) {
  if (!id) {
    throw new Error("Missing record id");
  }
  const {
    editorialBrief,
    status = "Ready for Draft",
    lastAgentWorkflow = "Editorial Brief Writer",
    lastAgentTimestamp = new Date().toISOString()
  } = payload;

  if (!editorialBrief) {
    throw new Error("Missing editorialBrief");
  }

  const fields = {
    "Editorial Brief": editorialBrief,
    "Status": status,
    "Last Agent Workflow": lastAgentWorkflow,
    "Last Agent Timestamp": lastAgentTimestamp
  };

  return updateRecord(
    "contentHub",
    "Content Production",
    id,
    fields
  );
}
/* Pull records ready for draft and pass to designated agent */
async function getDraftQueue() {
  const base = "contentHub";
  const table = "Content Production";
  const filterFormula = `{Status} = "Ready for Draft"`;

  return getReadyImageRecords(base, table, {
    filterFormula,
    maxRecords: 1
  });
}

async function saveDraftResult(id, payload = {}) {
  if (!id) {
    throw new Error("Missing record id");
  }
  const {
    draftContent,
    excerpt,
    metaDescription,
    aeoDescription,
    status = "Draft Ready"
  } = payload;

  if (!draftContent) {
    throw new Error("Missing draftContent");
  }
  const fields = {
    "Draft Content": draftContent,
    ...(excerpt ? { "Excerpt": excerpt } : {}),
    ...(metaDescription ? { "Meta Description": metaDescription } : {}),
    ...(aeoDescription ? { "AEO Description": aeoDescription } : {}),
    "Status": status
  };
  return updateRecord(
    "contentHub",
    "Content Production",
    id,
    fields
  );
}
/* -------------------------------------------------------
   IMAGE WORKFLOW HELPERS
------------------------------------------------------- */

/**
 * Fetch records that are "ready" for image generation.
 * This stays generic: n8n (or the caller) controls base/table and filter.
 *
 * Query params:
 *   base, table
 * Body:
 *   {
 *     "view": "optional view name",
 *     "filterFormula": "optional Airtable formula",
 *     "maxRecords": 50 (optional)
 *   }
 */
async function getReadyImageRecords(baseKey, tableName, options = {}) {
  const { view, filterFormula, maxRecords } = options;
  const baseId = await validateBaseAndTable(baseKey, tableName);
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (filterFormula) params.set("filterByFormula", filterFormula);
  if (maxRecords) params.set("maxRecords", String(maxRecords));
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${params.toString()}`;
  return fetchJson(url);
}
async function getImageQueue() {
  const base = "contentHub";
  const table = "Content Production";
  const filterFormula = `OR(
    {Workflow Stage} = "Image needed",
    {Workflow Stage} = "Image regenerate"
  )`;
async function getImageContext(id) {
  if (!id) {
    throw new Error("Missing record id");
  }
  return getRecord(
    "contentHub",
    "Content Production",
    id
  );
}
  return getReadyImageRecords(base, table, {
    filterFormula,
    maxRecords: 1
  });
}
/**
 * Update image-related status fields in a single record.
 * Body:
 *   {
 *     "id": "recXXXX",
 *     "fields": {
 *       "Workflow Status": "Image Generated",
 *       "Image Status": "Generated"
 *     }
 *   }
 */
async function updateImageStatus(baseKey, tableName, id, fields) {
  if (!id) throw new Error("Missing 'id' in body for updateImageStatus");
  if (!fields || typeof fields !== "object") {
    throw new Error("Missing or invalid 'fields' in body for updateImageStatus");
  }
  return updateRecord(baseKey, tableName, id, fields);
}
/**
 * Save generated image file metadata on a record.
 * Body:
 *   {
 *     "id": "recXXXX",
 *     "fileIdField": "Image File ID",
 *     "fileId": "abc123",
 *     "fileUrlField": "Image URL",
 *     "fileUrl": "https://...",
 *     "extraFields": {
 *       "Image Status": "Generated",
 *       "Workflow Status": "Image Generated"
 *     }
 *   }
 */
async function saveImageFileId(baseKey, tableName, payload) {
  const {
    id,
    fileIdField,
    fileId,
    fileUrlField,
    fileUrl,
    extraFields = {}
  } = payload || {};

  if (!id) throw new Error("Missing 'id' in body for saveImageFileId");
  if (!fileIdField || !fileId) {
    throw new Error("Missing 'fileIdField' or 'fileId' in body for saveImageFileId");
  }
  const fields = {
    [fileIdField]: fileId,
    ...(fileUrlField && fileUrl ? { [fileUrlField]: fileUrl } : {}),
    ...(extraFields && typeof extraFields === "object" ? extraFields : {})
  };
  return updateRecord(baseKey, tableName, id, fields);
}

/**
 * Save WordPress publish results on a record.
 * Body:
 *   {
 *     "id": "recXXXX",
 *     "wpMediaIdField": "WP Media ID",
 *     "wpMediaId": 123,
 *     "wpMediaUrlField": "WP Media URL",
 *     "wpMediaUrl": "https://...",
 *     "wpPostIdField": "WP Post ID",
 *     "wpPostId": 456,
 *     "extraFields": {
 *       "WP Publish Status": "Success",
 *       "Image Status": "Published"
 *     }
 *   }
 */
async function saveWpPublishResults(baseKey, tableName, payload) {
  const {
    id,
    wpMediaIdField,
    wpMediaId,
    wpMediaUrlField,
    wpMediaUrl,
    wpPostIdField,
    wpPostId,
    extraFields = {}
  } = payload || {};
  if (!id) throw new Error("Missing 'id' in body for saveWpPublishResults");
  const fields = {
    ...(wpMediaIdField && wpMediaId !== undefined
      ? { [wpMediaIdField]: wpMediaId }
      : {}),
    ...(wpMediaUrlField && wpMediaUrl
      ? { [wpMediaUrlField]: wpMediaUrl }
      : {}),
    ...(wpPostIdField && wpPostId !== undefined
      ? { [wpPostIdField]: wpPostId }
      : {}),
    ...(extraFields && typeof extraFields === "object" ? extraFields : {})
  };
  if (Object.keys(fields).length === 0) {
    throw new Error("No fields to update in saveWpPublishResults");
  }
  return updateRecord(baseKey, tableName, id, fields);
}



/* -------------------------------------------------------
   SERVER + ROUTES
------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const path = urlObj.pathname;

  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  try {
    /* -------------------------
       GENERIC CRUD ROUTES
    ------------------------- */

    // GET /list?base=&table=
    if (path === "/list" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const data = await listRecords(base, table);
      return send(200, data);
    }

    // GET /get?base=&table=&id=
    if (path === "/get" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const data = await getRecord(base, table, id);
      return send(200, data);
    }

    // POST /create?base=&table=
    if (path === "/create" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);
      const data = await createRecord(base, table, body.fields || {});
      return send(200, data);
    }

    // PATCH /update?base=&table=&id=
    if (path === "/update" && req.method === "PATCH") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const body = await parseBody(req);
      const data = await updateRecord(base, table, id, body.fields || {});
      return send(200, data);
    }
// PATCH /save_outline_result
if (path === "/save_outline_result" && req.method === "PATCH") {
  const body = await parseBody(req);
  const { id, ...payload } = body || {};
  const data = await saveOutlineResult(id, payload);
  return send(200, {
    ok: true,
    action: "save_outline_result",
    record: data
  });
}
    // DELETE /delete?base=&table=&id=
    if (path === "/delete" && req.method === "DELETE") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const id = urlObj.searchParams.get("id");
      if (!id) throw new Error("Missing 'id' query parameter");
      const data = await deleteRecord(base, table, id);
      return send(200, data);
    }

    // GET /search?base=&table=&field=&value=
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

    // GET /view?base=&table=&name=&filter=
    if (path === "/view" && req.method === "GET") {
      try {
        const base = urlObj.searchParams.get("base");
        const table = urlObj.searchParams.get("table");
        const view = urlObj.searchParams.get("name");
        const filter = urlObj.searchParams.get("filter"); // optional
        if (!view) {
          return send(400, { ok: false, error: "Missing 'name' (view) query parameter" });
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
// GET /get_outline_queue
if (path === "/get_outline_queue" && req.method === "GET") {
  const data = await getOutlineQueue();
  return send(200, {
    ok: true,
    queue: "outline",
    records: data.records || []
  });
}
    // GET /schema?base=...
    if (path === "/schema" && req.method === "GET") {
      const base = urlObj.searchParams.get("base");
      if (base) {
        await ensureSchemaLoaded(base);
        const cache = SCHEMA_CACHE[base];
        if (!cache) throw new Error(`Schema not available for base: ${base}`);
        return send(200, { base, schema: cache.raw });
      }
      const result = {};
      for (const key of Object.keys(BASES)) {
        await ensureSchemaLoaded(key);
        result[key] = SCHEMA_CACHE[key]?.raw || null;
      }
      return send(200, result);
    }
// GET /get_editorial_brief_queue
if (path === "/get_editorial_brief_queue" && req.method === "GET") {
  const data = await getEditorialBriefQueue();

  return send(200, {
    ok: true,
    queue: "editorial_brief",
    records: data.records || []
  });
}

    // PATCH /save_editorial_brief
if (path === "/save_editorial_brief" && req.method === "PATCH") {
  const body = await parseBody(req);
  const { id, ...payload } = body || {};
  const data = await saveEditorialBrief(id, payload);
  return send(200, {
    ok: true,
    action: "save_editorial_brief",
    record: data
  });
}

// GET /get_draft_queue
if (path === "/get_draft_queue" && req.method === "GET") {
  const data = await getDraftQueue();

  return send(200, {
    ok: true,
    queue: "draft",
    records: data.records || []
  });
}
    
    /* ---------------------------------------------------
       IMAGE WORKFLOW ROUTES (MCP-FRIENDLY)
    --------------------------------------------------- */
// GET /get_image_queue
if (path === "/get_image_queue" && req.method === "GET") {
  const data = await getImageQueue();

  return send(200, {
    ok: true,
    queue: "image",
    records: data.records || []
  });
}
  // GET /get_image_context?id=
if (path === "/get_image_context" && req.method === "GET") {

  const id = urlObj.searchParams.get("id");

  const data = await getImageContext(id);

  return send(200, {
    ok: true,
    context: data
  });

}  
    // POST /get_ready_image_records?base=&table=
    // Body: { view?, filterFormula?, maxRecords? }
    if (path === "/get_ready_image_records" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);

      const data = await getReadyImageRecords(base, table, {
        view: body.view,
        filterFormula: body.filterFormula,
        maxRecords: body.maxRecords
      });

      return send(200, {
        ok: true,
        base,
        table,
        records: data.records || []
      });
    }

    // PATCH /update_image_status?base=&table=
    // Body: { id, fields: { ... } }
    if (path === "/update_image_status" && req.method === "PATCH") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);

      const { id, fields } = body || {};
      const data = await updateImageStatus(base, table, id, fields);

      return send(200, {
        ok: true,
        base,
        table,
        record: data
      });
    }

    // POST /save_image_file_id?base=&table=
    // Body: see saveImageFileId helper
    if (path === "/save_image_file_id" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);

      const data = await saveImageFileId(base, table, body);

      return send(200, {
        ok: true,
        base,
        table,
        record: data
      });
    }

    // POST /save_wp_publish_results?base=&table=
    // Body: see saveWpPublishResults helper
    if (path === "/save_wp_publish_results" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);

      const data = await saveWpPublishResults(base, table, body);

      return send(200, {
        ok: true,
        base,
        table,
        record: data
      });
    }

    // POST /log_workflow_error?base=&table=
    // Body: see logWorkflowError helper
    if (path === "/log_workflow_error" && req.method === "POST") {
      const base = urlObj.searchParams.get("base");
      const table = urlObj.searchParams.get("table");
      const body = await parseBody(req);

      const data = await logWorkflowError(base, table, body);

      return send(200, {
        ok: true,
        base,
        table,
        record: data
      });
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
    return send(400, { ok: false, error: error.message });
  }
});

/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server running on port ${PORT}`);
});
