# Neat Cloud

This directory is the public Neat website and event service. It is separate from ../frontend, which is the compact UI embedded in ESP32 firmware.

## Projects

- frontend/: marketing site, event creation, guest survey/live queue and host dashboard.
- api/: event, guest ownership, machine pairing, WebSocket and offline export API.
- docker-compose.yml: deployment behind the existing Coolify Traefik proxy.

## Local development

In cloud/api run npm install and npm run dev. In cloud/frontend run npm install and npm run dev, then open http://localhost:5173. Vite proxies API and WebSocket calls to port 8080.

## User flow

1. The organizer creates an event at /new.
2. A private host token stays in that browser.
3. The organizer shares /e/{slug}. Guests need no account.
4. Each browser gets its own guest token and can delete only its own choices.
5. When Neat is online, the host creates a six-digit pairing code. On the machine, open Settings > Network > Online connection and enter the code.
6. The host switches the event to live. New choices enter the machine queue.
7. Without an event, guests scan the QR code on Neat and open /m/{machineId}.
8. Without internet, the host downloads a .neatpack.json before leaving.

The offline pack is a portable export containing requests, matching recipes and embedded base64 image data. Built-in recipes map directly to the firmware catalog; importing arbitrary new cloud recipes into ESP flash still needs a matching firmware import endpoint.

## API routes

Guest ownership uses X-Guest-Token. Private host calls use X-Host-Token. Pairing codes expire after 15 minutes and are single-use.

- POST /api/events
- GET /api/events/{slug}
- GET /api/events/{slug}/mine
- POST /api/events/{slug}/requests
- DELETE /api/events/{slug}/requests/{id}
- POST /api/events/{slug}/queue
- DELETE /api/events/{slug}/queue/{id}
- GET /api/events/{slug}/host
- PUT /api/events/{slug}/shopping
- PUT /api/events/{slug}/mode
- POST /api/events/{slug}/pairing
- GET /api/events/{slug}/export
- POST /api/pairings/{code}/claim
- GET /api/machines/{machineId}/public
- GET /api/machines/{machineId}/mine
- POST /api/machines/{machineId}/queue
- DELETE /api/machines/{machineId}/queue/{id}
- GET /v1/machines/{machineId}
- GET /v1/machines/{machineId}/recipes
- GET /v1/machines/{machineId}/queue
- POST /v1/machines/{machineId}/queue/{entryId}/claim
- POST /v1/machines/{machineId}/heartbeat
- POST /v1/machines/{machineId}/sync
- WS /v1/machines/{machineId}/events

## Production

The compose file expects the external Docker network coolify. It routes neat.apps.thiering.org to the web container and api.neat.apps.thiering.org to the API container. Data is persisted in the neat-data Docker volume.
