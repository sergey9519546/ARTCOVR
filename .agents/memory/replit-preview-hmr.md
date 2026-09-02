---
name: Replit preview HMR proxy
description: The development WebSocket endpoint used by Vite through the local Replit preview proxy
---

When a Vite web artifact is served through the Replit preview proxy, configure the development HMR client to use the proxy's port 80 instead of the artifact's internal service port.

**Why:** The browser-visible preview is routed through `http://127.0.0.1:80`; using the internal Vite port causes the client to attempt a direct WebSocket connection that the preview cannot reach. Using port 443 is also incorrect for this local HTTP preview and produces a connection-refused error.

**How to apply:** Keep the Vite server listening on the artifact-provided `PORT`, and set `server.hmr.clientPort` to 80 only for the managed preview workflow. Leave local direct-server defaults and production/static serving unchanged.