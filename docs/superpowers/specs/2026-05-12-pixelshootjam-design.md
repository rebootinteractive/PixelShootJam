# PixelShootJam — v1 Design (locked 2026-05-12)

A drag-and-drop placement puzzle. Shooters inside an arena auto-fire at a colored
pixel wall surrounding them. You re-arrange shooters so their lines of sight find
the right targets before the timer runs out.

## The fantasy
You're a placement strategist. A colored pixel wall surrounds an arena full of
shooters. Each shooter shoots its own color of pixel. Your job: drag shooters
into spots where they can actually see what they need to shoot — before the
timer runs out.

## The board
- A 2D grid (≈ 8×10 for v1 starter levels, but per-level configurable in the editor).
- Each cell is one of:
  - **void** — outside the level shape, dark background.
  - **arena** — playable cell, may host a shooter.
  - **pixel** — a wall pixel; has a color.
- Arena and wall shapes can be irregular (L-shapes, staircases, holes — like
  the AI concept art).

## Shooters
- Each shooter has a **color**, a **shootsPerSecond** rate, and an **ammo count**
  printed on top.
- **Idle = auto-fire.** While not being dragged, shooters fire continuously at their rate.
- **Held = paused.** While dragged, the held shooter doesn't fire, but its current
  hover cell still blocks LOS for other shooters (so the player sees in real time
  how the board will react before they drop).
- **Targeting (per fire tick):**
  1. For each of the 4 cardinal directions, look from the shooter's cell along
     that direction's 1-cell-wide channel (column for up/down, row for left/right):
     - If the channel hits another shooter cell first → direction is **blocked**.
     - Otherwise it hits the inside edge of the wall: count the consecutive
       same-color-as-the-shooter pixels starting at that first pixel cell,
       walking outward through the wall, stopping at any non-matching color
       or void/end of grid. That's the **matching run** for this direction.
  2. **Sticky targeting**: if the shooter already has a current direction with a
     matching run > 0, keep firing it.
  3. Otherwise, among directions with run > 0, pick the one with the **smallest**
     run (clear small piles first). Ties broken by fixed order (up < right < down < left).
  4. Fire 1 bullet in that direction → clears the innermost matching pixel in
     the wall channel. Ammo -= 1.
  5. If ammo hits 0, the shooter pops off the board (its cell becomes free).
- **Zero-sum invariant:** for each color, total ammo across all shooters of that
  color equals total wall pixels of that color. A perfectly played level just
  barely empties everything.
- **One bullet = one pixel**, always.

## Connections (welds — Tetris-feel)
- Levels can pre-bake **welds** between any two adjacent shooters, fusing them
  into one rigid group.
- A welded group drags as one unit; every cell of the group must fit on the
  destination (all targeted cells must be 'arena' and empty).
- When any member of a group is depleted and pops, **its welds break**. This may
  split the group into smaller subgroups or fully free everyone.

## Win / lose
- **Win**: all wall pixels cleared.
- **Lose**: per-level time limit (`timeLimit` seconds) expires.

## v1 scope
- Main menu → Level Select → Play.
- **3 starter levels**:
  1. **Tutorial** — one shooter, single-color wall, open arena, generous time.
  2. **Crossfire** — two colors, basic LOS-blocking puzzle (one shooter sits on
     another's preferred line; you must move it).
  3. **Welded** — connection-heavy: two welded groups; depletion-breaks-welds
     is the critical insight for solving.
- **In-app level editor** with tools: paint pixel (color picker), place shooter
  (color, ammo, rate), draw weld (between adjacent shooters), erase. Bottom-bar
  fields for name, cols, rows, time limit. Buttons: Test, Save, Download JSON, Copy.
- **HUD**: timer (top), restart button, win/lose modals.
- **Visual**: pure 2D top-down, orthographic camera, flat-colored geometry,
  phone-portrait viewport (393×852).

## Out of scope for v1
Audio, particle systems beyond a simple pixel-clear flash, animated shooter
faces, stars/scoring, monetization, multi-cell shooters that aren't welded
groups, gravity / movement physics.
