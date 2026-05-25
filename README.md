# airtable-mcp-server
## 🚀 Overview
This project is a Multi‑Base Airtable MCP Server that allows AI agents, workflows, and automation systems to interact with multiple Airtable bases through a single unified API.
It supports:
Dynamic base selection
Dynamic table selection
Strict schema validation
Full CRUD operations
Search + View queries
Schema retrieval per base or all bases
This server powers agents such as:
Content Editor / Blog Writer (Content Production Hub)
Newsletter Maestro (Newsletter Maestro Base)
Membership Director (Rise & Thrive Membership Base)
All through one MCP endpoint.
## Architecture
✔ One server
✔ Multiple Airtable bases
✔ Unlimited tables per base
✔ Strict validation using Airtable Schema API
The server loads the schema for each base at startup and ensures:
Only valid bases can be queried, Only valid tables can be accessed, Invalid requests return clean, safe errors
## Supported Bases
These are defined in `server.js`:

```js
const BASES = {
  contentHub: "appysRCPb7SIo65b4",
  riseThrive: "app6BPzeM4pCySdxG",
  newsletterMaestro: "appBN5g462u16L5Uv"
};
** More bases can be added when needed**
