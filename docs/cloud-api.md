# Neat cloud API

The deployed implementation and current route list live in ../cloud. The public website is a separate Vite project under cloud/frontend; it is not part of the ESP web image. The Node API is under cloud/api.

## Identity and ownership

An event creator receives a random host token. It is stored only in that browser and sent in X-Host-Token for private host operations.

Each guest browser creates a random guest token and sends it in X-Guest-Token. A guest can remove only requests and queue entries created with the same token. Display names are not authorization.

A machine is linked to an event by a six-digit, single-use code that expires after 15 minutes. A normal operator creates that code on the host dashboard and enters it under Guest queue on the machine. Cloud URLs remain in Developer settings only for development overrides.

## Planning and live flow

Planning uses /api/events/{slug}/requests. The full catalog remains visible before a machine is present. When the machine is paired and the event switches to live mode, /api/events/{slug}/queue adds a request to that machine's queue.

The machine polls /v1/machines/{machineId}/queue and also listens to /v1/machines/{machineId}/events. It sends a heartbeat so the public page can show whether it is actually online.

## Offline flow

GET /api/events/{slug}/export returns a .neatpack.json with event metadata, guest requests, matching recipe definitions and public image URLs. This can be downloaded before travelling to a location without internet.

The current ESP firmware has no bulk recipe-and-media import route. The export is therefore real and portable, but automatic flash import remains deliberately unimplemented until the firmware exposes a safe endpoint. Existing local drinks keep working without cloud access.

For the exact implemented routes, local startup and deployment layout, see ../cloud/README.md.
