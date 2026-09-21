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

Workflow trong `.github/workflows/deploy.yml` sẽ tự build và triển khai mỗi lần bạn push lên nhánh `main`. Sau khoảng 1 phút, game sẽ chạy tại:

```
https://<TÊN-GITHUB>.github.io/<TÊN-REPO>/
```

**Chạy thử trên máy (không bắt buộc):**

```bash
npm install
npm run dev      # chế độ phát triển
npm run build    # tạo bản production vào thư mục dist/
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

## Modes

- FFA: every organism is an opponent.
- Teams: three color-coded teams; teammates cannot eat each other.
- Experimental: mother cells consume small cells and produce pellets.
- Spectate: follow bots and switch targets with Tab or the on-screen button.

## Implementation

- `src/App.tsx`: lobby, HUD, settings, skins, results, input, and browser persistence.
- `src/agar/engine.ts`: simulation, bot AI, collisions, food spatial index, splitting, merging, viruses, and scoring.
- `src/agar/renderer.ts`: procedural canvas art, skins, camera, arena, and minimap.
- `src/agar/sound.ts`: gesture-activated Web Audio effects.
- `src/index.css`: responsive layout and reduced-motion support.

Nickname, appearance, settings, and the best score are stored in localStorage. A running round is not persisted. Legacy artwork from the previous game is not loaded by this implementation.

## Verification

The production bundle is checked with the project's build tool. Browser input, touch behavior, and long-running gameplay still benefit from manual testing on the target devices.
