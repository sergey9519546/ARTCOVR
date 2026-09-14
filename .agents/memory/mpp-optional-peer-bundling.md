---
name: MPP optional peer bundling
description: Build behavior for using mppx HTTP server support without MCP.
---

When bundling an HTTP-only mppx server, externalize `@modelcontextprotocol/sdk/*` in the server bundler instead of installing the optional MCP peer solely to satisfy esbuild.

**Why:** mppx contains a dynamic MCP import that esbuild resolves during bundling even when the application never creates an MCP transport; bundling the unused optional peer adds unnecessary dependency weight.

**How to apply:** Keep the HTTP MPP methods configured explicitly and verify the production server bundle after dependency changes. Install the MCP SDK only if MCP transport support is later added.