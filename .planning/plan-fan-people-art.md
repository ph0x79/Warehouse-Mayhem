# Plan — fan realism, enemy variety, heat stress bug, downdraft

**Status: all six shipped, 2026-09-16.** Each went in on its own branch and merged to `main`;
the commits carry the detail. A seventh, `fix/leaderboard-gate`, shipped alongside them. Every
item is covered by a headless check in `tests/run.sh`, which grew from 5 tests to 9.

Four items from Will, 2026-09-15. Reference photos: Powerfoil X4 product shots, two warehouse
installs, a Keychron full-size keyboard, a security guard. Four branches, shippable independently.

Baseline constraint for every art item: enemy frames stay **16×34 with the planted foot on row 31**.
`tests/floor.test.mjs` pins that against `floor-baseline.json`; break it and floor placement moves.

---

## 1. `fix/fan-charge` — Heat Stress counts nuke points (bug)

**Root cause — two defects, not one.**

`nukeAllEnemies()` (`index.html:1894`) snapshots the next threshold *before* awarding the kills:

```js
this.fanNextThresh = this.score + C.FAN_THRESHOLD;   // :1894  snapshot
...
this.addScore(enemy.points || 100, ...)              // :1897  score rises after
```

Every point the explosion awards lands after the snapshot, so it counts toward the next charge.
A full-screen nuke is 8–10 enemies at 100–500 each, so the bar can read 40%+ the instant the
lockout ends. That is the reported symptom.

Second defect: the threshold is bumped **twice** per nuke — once at `:1894`, again at `:1823`
when the spin-down completes (`this.fanNextThresh += C.FAN_THRESHOLD`). The two errors partly
mask each other, which is why the bar looks erratic rather than simply wrong.

**Fix — replace the absolute threshold with an accumulator.** `fanNextThresh` cannot express
"ignore points earned during a window"; it can only offset, and offsetting is what produced both
bugs. An accumulator states the rule directly.

| Site | Change |
|---|---|
| `setupFan()` `:1778` | `this.fanCharge = 0;` replaces `this.fanNextThresh` |
| `addScore()` `:1729` | `if (!this.fanSpinning && this.time.now >= this.fanLockoutUntil) this.fanCharge += pts;` |
| `updateFan()` `:1789` | spin when `this.fanCharge >= C.FAN_THRESHOLD` (drop the `score >=` test) |
| `updateFan()` `:1823` | `this.fanCharge = 0;` replaces the `+=` bump |
| `updateFan()` `:1829` | `frac = this.fanCharge / C.FAN_THRESHOLD`; delete the `prev` line |
| `nukeAllEnemies()` `:1894` | delete the snapshot line; keep `fanLockoutUntil` |

`addScore` is the single choke point — kill scoring (`:1543`), the nuke (`:1897`) and the boss
(`:2179`) all route through it, so one guard covers every path. `fanLockoutUntil` is unchanged and
now does the whole job of suppressing charge during the 10s cooldown.

**Pacing side effect — state it, don't hide it.** Removing the double bump drops the post-nuke
recharge from ~2000 gross points to 1000 net. The fan will come back noticeably sooner. Knob if
that is too fast: `C.FAN_THRESHOLD` (`index.html:64`).

**Verify.** New case in `tests/` — set score past the threshold, let the fan spin, trigger the nuke,
assert `fanCharge === 0` immediately after and that the HUD reads `HEAT STRESS 0%` once the lockout
expires. Then `bash tests/run.sh`.

---

## 2. `feat/fan-downdraft` — spinning fan slows every projectile 25%

**Key fact: `lob()` is scale-invariant in `spd`.** With `t = dist/spd` and
`vy = (dy/dist)·spd − 0.5·G·(dist/spd)`, substituting gives `y(t) = oy + dy` for *any* `spd`.
So scaling `spd` keeps the shot landing exactly on the cursor — it just flies slower on a loftier
arc. Scale `spd`, never the solved velocity.

This removes the obvious trap: a naive 25% velocity cut would make the player's own poop undershoot
the fan, which is the one shot that matters while the fan is spinning.

| Site | Change |
|---|---|
| `setupFan()` | `this.fanWind = 1;` |
| `lob()` first line | `spd *= this.fanWind;` |
| `startFanSpin()` | `this.fanWind = 0.75;` |
| spin-down complete | `this.fanWind = 1;` |

Applied **at spawn only**. Rescaling bodies already in flight would break their solved arcs, and
spawn-only means no restore pass and no bookkeeping. All four throwers (poop, dart, clipboard, boss
keyboard) go through `lob`, so one line covers them.

Polish, optional: faint vertical dust streaks under the fan while `fanSpinning`, to show the air
moving rather than just implying it.

**Verify.** Test: force `fanSpinning`, lob a projectile at a known target, assert body speed is 75%
of the baseline *and* that it still lands at the target x.

---

## 3. `art/fan` — Powerfoil X4 rebuilt in perspective

**Decision taken (Will, 2026-09-15): moderate tilt, squash `k ≈ 0.35`, sweep ~300×55.**

Today the fan is a face-on pinwheel: 8 blades at `setOrigin(0, 0.5)` rotated a full 360° around a
hub at (480, 32), so a blade points straight at the floor four times a revolution. Confirmed in
`tests/out/fancheck-game.png`.

**Rig.** Put the blades in `this.add.container(cx, cy)` with `setScale(2, 2 * 0.35)`. Phaser
propagates the parent matrix to children, so a rotated blade inside a non-uniformly scaled container
renders sheared and foreshortened — the correct elliptical projection, no math.

> Unverified assumption, and it carries the whole approach. Confirm with one snapshot before
> building on it. Fallback: per-blade math — screen angle `atan2(k·sinθ, cosθ)`, `scaleX` from the
> projected length `R·√(cos²θ + k²·sin²θ)`.

**Depth.** The reference puts the motor shroud *above* the blade plane, so blades sit at one depth
below it and a hub cap draws on top. Per-blade near/far sorting only if it reads wrong.

**Textures, from the product shots.**

- `fan_blade` — bright aluminium (`GREY_5`/`GREY_6`), not the current charcoal. Yellow winglet at
  the tip, plus the smaller yellow mid-span winglet the photos show. Tapered root.
- `fan_hub` → `fan_motor` — black shroud (`INK`/`GREY_1`) carrying a yellow bull-logo mark, yellow
  gearbox block beneath, silver drop tube above.
- `fan_mount` — keep the bolted ceiling plate; narrow the drop rod to meet the new motor.
- Spin rate `14` → `~8` deg/frame. An HVLS fan turns slowly; 14 reads like a desk fan.

**Hit test must move with the art.** `updateFan()` `:1799` tests a 130px circle from the hub. The
new sweep is ~300×55, so that circle matches nothing the player can see — they would trigger the
nuke on empty air and miss visible blade tips. Swap to an ellipse, `(dx/rx)² + (dy/ry)² < 1` with
`rx ≈ 170`, `ry ≈ 70`: generous, covers the whole visible sweep plus margin.

**Verify.** `node tests/snapshot.mjs fan fan_blade,fan_motor` with a server on 8731, eyeball the
game shot against the product photos, then `bash tests/run.sh`.

---

## 4. `art/people` — hard hats, enemy variants, guard, keyboard

### Hard hats

`HARD_HAT` (`:523`) is three flat colour bands, which is why it reads flat. No headroom to grow —
rows 0–4 only. Add volume inside those 5 rows:

- a centre ridge highlight down the crown (real hard hats have a rib)
- the right side of the dome shaded, matching the top-left key light used everywhere else
- the brim as a distinct wider row with an ink under-edge, so it reads as projecting past the face
- recolour the plain worker's hat orange (`ORANGE_L`/`ORANGE`/`ORANGE_D`) — every person in the
  warehouse photos wears orange

### Enemy variants

Appearance encodes behaviour today (worker and blade walk, guard fires darts, manager throws
clipboards). Variety must not break that read, so variants stay inside a role's colour family.

| Role | Behaviour | Look |
|---|---|---|
| `worker` | random walk | 3 variants picked at spawn, all orange hat: denim bib overalls over a tan shirt; blue one-piece coveralls with a ponytail under the hat; white button-down with khakis |
| `worker_blade` | random walk | unchanged — orange hi-vis, white hat, carries the blade |
| `guard` | pursues, fires darts | black uniform and cap kept; add sunglasses (ink band, one glint pixel), white collar and black tie, a white mark on the cap for the SECURITY text, darker skin tone |
| `manager` | pursues, throws clipboards | add a hard hat — the photos show everyone wearing one; keeps white shirt, red tie, clipboard |

The ponytail variant is the one that buys a genuinely different silhouette rather than just a
different palette. Add a second darker skin pair (`SKIN_2`/`SKIN_2D`) shared by the guard and one
worker variant.

Shape: an `OUTFITS` array of `{key, KEY}` palettes fed through the existing `build()` path, one
texture per entry, random pick in `spawnEnemy()`. Only two entries need new grid work — the ponytail
and the overall bib straps.

### Keyboard

The boss's `keyboard` is 14×7. The reference is a full-size board: black case, grey caps, one gold
esc, white legends, separate numpad. At 16×8 that becomes readable — black case with a 1px ink edge,
four rows of `GREY_4` caps on `GREY_2` gaps, a single `YEL` pixel top-left for esc, a lighter
spacebar bar across the bottom row, and a 3-column numpad block set off by a gap on the right.

### Follow-ups, not in scope

The warehouse photos also show a yellow overhead crane bridge, orange traffic cones and stacked
floor pallets. Worth adding to the background later; filing rather than building.
**Done 2026-09-16** in commit 5ecae98 (merged via `feat/long-runs`).

**Verify.** `node tests/snapshot.mjs people worker,worker_overalls,worker_coveralls,guard,manager,keyboard`,
then `bash tests/run.sh` — `floor.test.mjs` fails any variant that breaks the 16×34 / row-31 baseline.

---

## 5. `fix/music-toggle` — Space and Enter toggle the music; M does nothing

**Root cause: the mute button keeps DOM focus, and a focused `<button>` activates on Space and
Enter.** `#muteBtn` (`index.html:41`) is a real DOM button. `tabindex="-1"` keeps it out of the Tab
order but does not stop a *click* from focusing it. From the first click onward, every Space or
Enter press during play re-fires `toggleMute()`.

Measured in a headless run rather than reasoned about:

```
initial             { muted: true,  focus: 'BODY'    }
after clicking btn  { muted: false, focus: 'muteBtn' }   ← button now holds focus
after Space         { muted: true,  focus: 'muteBtn' }   ← flipped
after Enter         { muted: false, focus: 'muteBtn' }   ← flipped
after KeyW          { muted: false, focus: 'muteBtn' }   ← movement keys are fine
after KeyM          { muted: false, focus: 'muteBtn' }   ← no M handler exists at all
```

This one cause explains both complaints. Music flipping mid-game is the player hitting Space (the
instinctive jump key here is W, so Space gets pressed and does nothing visible *except* flip the
music). "Doesn't stick" is the same flip landing the setting back where it started.

**Fix.**

1. `toggleMute()` ends with `document.getElementById('muteBtn').blur();` — one line, closes the
   focus path for good. This is the actual bug fix; the rest is the feature Will asked for.
2. Add the M shortcut as a single `window` `keydown` listener next to `toggleMute()`, so it works on
   every scene without registering a key in each of the five.
3. **Guard M against the initials screen.** `EnterInitialsScene.handleKey` (`:2472`) accepts
   `/^[a-zA-Z]$/`, so M is a legal initial. Without a guard, typing "MWF" toggles the music.
   Set `window.__typingInitials = true` in that scene's `create` and `false` where it already
   unbinds at `:2494`; the global listener checks the flag.
4. Persistence: store the preference in `localStorage` on toggle, restore it on load. Autoplay
   policy blocks `play()` before a user gesture, so restore the *flag and the button label* on load
   and attempt `play()` on the first pointerdown.

**Verify.** Extend the scratch script already written for this into a kept test: click the button,
press Space and Enter, assert `muted` is unchanged; press M, assert it flips; assert M does nothing
while `EnterInitials` is active.

---

## 6. `feat/hide-cursor` — hide the OS cursor during play

The reticle (`:1918`) tracks the pointer, so the arrow cursor sits on top of it the whole game.

`this.input.setDefaultCursor()` writes to the canvas style, and that persists across scene changes,
so every exit path has to restore it. Pause is the one that bites: `togglePause()` uses
`scene.pause('Game')` + `launch('Pause')`, so GameScene never shuts down and a shutdown-only restore
would leave the cursor hidden on the pause screen.

In `GameScene.create`:

```js
this.input.setDefaultCursor('none');
this.events.on('pause',    () => this.input.setDefaultCursor('default'));
this.events.on('resume',   () => this.input.setDefaultCursor('none'));
this.events.once('shutdown', () => this.input.setDefaultCursor('default'));
```

Plus a restore in `triggerGameOver()` so the cursor returns the moment the player dies rather than
1200ms later when the scene switches. Title, EnterInitials, GameOver and Pause all keep a normal
cursor. `#muteBtn` carries its own `cursor: pointer` (`:35`) and is a DOM element outside the canvas,
so it stays usable throughout.

**Verify.** Test asserting `game.canvas.style.cursor` is `none` in Game, `default` when paused, and
`default` after game over.

---

## Sequence

1. `fix/music-toggle` — one-line root cause, most annoying in play
2. `fix/fan-charge` — bug, no art dependency
3. `feat/hide-cursor` — small, independent
4. `feat/fan-downdraft` — one-line multiplier, independent
5. `art/fan` — verify the container-shear assumption before building
6. `art/people` — largest surface, slowest to review

After each merge to `main`: `curl -s https://warehouse-mayhem.netlify.app/ | grep <a line from the change>`.
Auto-deploy stalled silently for six months once.
