# Agar-Style Cell Arena

A self-contained, Vietnamese-language browser game inspired by Agar.io. This is a community recreation, not an official Agar.io client. All opponents are local AI bots; there is no multiplayer server or account system.

## Deploy lên GitHub Pages

Repo này đã được cấu hình sẵn để host miễn phí trên GitHub Pages.

**Bước 1 — Tạo repo và push code:**

```bash
git init
git add .
git commit -m "Agar-style cell arena"
git branch -M main
git remote add origin https://github.com/<TÊN-GITHUB>/<TÊN-REPO>.git
git push -u origin main
```

**Bước 2 — Bật Pages:**

Vào repo trên GitHub → **Settings** → **Pages** → mục **Build and deployment** → **Source** chọn **GitHub Actions**.

Workflow trong `.github/workflows/deploy.yml` sẽ tự build và triển khai mỗi lần bạn push lên nhánh `main`. Workflow chạy typecheck (`npm run check`) và toàn bộ test suite (`npm run test`) trước khi build, nên bản deploy lỗi sẽ không bao giờ lên sóng. Sau khoảng 1 phút, game sẽ chạy tại:

```
https://<TÊN-GITHUB>.github.io/<TÊN-REPO>/
```

**Chạy thử trên máy (không bắt buộc):**

```bash
npm install
npm run dev      # chế độ phát triển
npm run build    # tạo bản production vào thư mục dist/
npm run test     # automated tests (vitest)
npm run check    # typecheck toàn project (tsc --noEmit)
```

## Gameplay

- Move the pointer to steer. Arrow keys also work.
- Eat colored pellets and smaller opponents to gain mass.
- Press Space to split. A cell needs at least 40 mass; each player can have up to 16 cells.
- Hold W to eject mass. Each ejection costs 12 mass and creates a 10-mass pellet.
- Avoid green viruses when large. Feeding a virus seven ejected pellets shoots a new virus.
- Split cells can merge again after their cooldown when brought close together.
- Press Escape to pause. Scroll to adjust zoom.
- On touch devices, drag the arena to steer and use the split/eject buttons.
- Earn 9 achievements (first eat, mass milestones, top 10, rank 1, 5-minute survival, split hunting, pellet marathons).

## Modes

- FFA: every organism is an opponent.
- Teams: three color-coded teams; teammates cannot eat each other.
- Experimental: mother cells consume small cells and produce pellets.
- Spectate: follow bots and switch targets with Tab or the on-screen button.

## Implementation

- `src/App.tsx`: lobby, HUD, settings, skins, results, input, achievements, debug overlay, and browser persistence.
- `src/agar/config.ts`: **single source of balance** — every gameplay number (mass, speed, split, merge, eject, virus, decay, AI, camera) lives here.
- `src/agar/ai.ts`: bot mind. Perception is local, then threat, farm, hunt, flee, split, and virus choices are scored with hysteresis. Nine personalities change priorities, not speed or vision cheats. Physics still owns movement.
- `src/agar/engine.ts`: fixed-substep simulation, deterministic eating resolution, splitting, merging, viruses, scoring, spawn scoring, and invariant validation. Bots only receive an aim point plus an optional split or eject.
- `src/agar/renderer.ts`: procedural canvas art, skins, eat pulses, floating score text, pellet shimmer, camera, arena, and minimap.
- `src/agar/sound.ts`: gesture-activated Web Audio effects (12 presets, master volume, throttling, node cleanup).
- `src/agar/storage.ts`: versioned, validated localStorage saves with legacy migration, nickname sanitizer, and achievement definitions.
- `src/index.css`: responsive layout and reduced-motion support.
- `tests/`: formulas, engine behavior, structural invariants, property/fuzz tests, AI perception and tactics, a 60-second ecosystem probe, save validation, scripted full-session playtests, and a performance budget check.

Nickname, appearance, settings, volume, achievements, and best stats are stored in localStorage (v3 schema, migrates v2 automatically). A running round is not persisted. Legacy artwork from the previous game is not loaded by this implementation.

### Simulation notes

- `update(dt)` clamps wild deltas (background tabs) and runs the sim in fixed 1/60 sub-steps, so eating and collision behave the same at 30–144 FPS.
- Split/merge/eat conserve mass exactly (decay above 180 mass is the only designed sink).
- `engine.validateInvariants()` reports structural violations (NaN, negative mass, duplicate ids, dead cells in play, out-of-bounds entities, over-cap pools) and backs both the test suite and the debug overlay.
- Open the game with `?debug=1` to show FPS, entity counts, camera zoom, invariant violations, and nearby bot strategy vectors.

## Verification

- `npm run check` — strict TypeScript, zero errors.
- `npm run test` — including 5-minute long-run stability, 100 consecutive restarts, eject/split/virus spam, extreme-mass clamping, determinism (same seed → same leaderboard), scripted 90-second play sessions in every mode, and a 60-second bot ecosystem probe.
- `npm run build` — single-file production bundle served from `dist/`.
- Browser input, touch behavior, and long-running gameplay still benefit from manual testing on the target devices.
