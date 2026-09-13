# Neat frontend

React + TypeScript + Vite. Start with `npm install` and `npm run dev`; verify with `npm run lint` and `npm run build`.

## ESP32 integration

`src/services/api.ts` is the single REST boundary. `USE_MOCK_API = true` keeps this build in demo mode. All editing is in memory and resets when the page reloads. Demo drinks run for 20 seconds, cleaning for 15 seconds, and calibration for the selected duration. No hardware commands are sent in this mode.

Set `USE_MOCK_API = false` when the firmware implements the contracts below. Relative `/api/...` URLs work when the ESP serves the built frontend. For Vite development against a device, add a `/api` proxy in `vite.config.ts` pointing at its address.

Implemented calls:

- Health, status and device: `GET /api/health`, `/api/status`, `/api/device`; `POST /api/device/restart`.
- Recipes: list/read/create/update/delete at `/api/recipes`; start at `/api/recipes/{id}/start` with `{ overrides: [{ ingredientId, amountMl }] }`.
- Ingredients: list/create/update/delete at `/api/ingredients`, writes contain `{ name }`.
- Pumps: list/create/update/delete at `/api/pumps`; ingredient assignment uses `PUT /api/pumps/{id}/ingredient` with a numeric ID or null.
- Cleaning: `POST /api/cleaning/start` or `/api/cleaning/pumps/{id}/start`.
- Calibration: `POST /api/calibration/start` with `{ pumpId, durationMs }`; `/api/calibration/finish` with `{ measuredMl }`.
- Stop: `POST /api/operation/stop`.
- Network: `GET /api/network/status`, `POST /api/network/scan`, `POST /api/network/connect` with `{ ssid, password }`.

The supplied endpoint sketch does not define all response bodies. The assumed responses are explicitly typed in `src/types/device.ts`: bare arrays for lists, recipes `{ id, name, items }`, ingredients `{ id, name }`, pumps `{ id, ingredientId, mlPerSec, output: { type: 0, channel } }`. GPIO retains enum value 0. Update the adapter to match actual firmware responses before enabling live mode.

The status adapter expects `{ state: 'idle' | 'running' | 'finished' | 'stopped', kind?: 'drink' | 'cleaning' | 'calibration', progress: 0..100, recipeId?, label? }`. Terminal drink status must identify the recipe so the active screen can clear correctly. A finished calibration stays pending until its measurement is saved or discarded. Status polling is shared by all screens. Dispensing steps in demo mode are illustrative; the endpoint sketch has no per-ingredient progress contract yet.

Device responses use `{ name, model, version }`; network responses use `{ connected, ssid, accessPoint, address, networks: [{ ssid, secured, rssi }] }`. A scan is followed by a status refresh. Empty successful mutation responses (including HTTP 204) are accepted; failures surface in the UI.

The current firmware RecipeConfig only carries a name and ingredient amounts. Images, descriptions, garnish and alcohol classification are presentation metadata in the demo. Their editing controls are hidden in live mode; they are not silently added to firmware JSON. Recipes without artwork use the built-in glass placeholder. Strength options appear only when alcohol classification exists; unknown ingredients are never guessed from their names. Provide this metadata in the REST adapter later to enable the richer live presentation.

`src/services/websocket.ts` is an unwired integration point for `/ws`. Once an event contract exists, use incoming operation events to update TanStack Query's `['status']` data. Do not keep a second, independent progress state.

## Images

Each drink uses its own transparent image, referenced in `src/data/mockCocktails.ts`:

- `public/drinks/*.webp`: compact, 448 px production assets, preserving transparency.
- `artwork/drinks/*.png`: full-resolution editable originals, excluded from the flash image.
- `artwork/drinks/generation-prompts.json`: generation prompts and source references.

Replace one image at a time; there is no sprite or nine-image crop. Both cards and the detail screen use the same `CocktailImage` component with `object-fit: contain`. Missing and failed image URLs fall back gracefully. Whiskey Sour is explicitly egg-free in its mock recipe and artwork.

## Layout and behavior

A single persistent header keeps the Neat wordmark fixed across screens. Only content regions scroll; settings content resets on page changes. The active drink remains accessible while browsing and can be stopped. Completion returns the preparation screen to browsing and removes the active drink bar; it does not leave a collect-drink banner behind.

Radix provides accessible dialogs and progress semantics. Touch controls are at least 48 px, with a 62 px main action. No gradients, fades or box shadows are used. Fullscreen is available under Settings / Display. The manifest supports standalone Home Screen launch; Safari may require that path instead of the Fullscreen API.

## Build and flash assets

Run `npm run build` before `idf.py build`. The existing IDF build packages `frontend/dist` into `build/web.bin`; it does not run Vite itself. The editable PNG originals are not packaged. No ESP firmware, repository or partition changes are required by this frontend update.
