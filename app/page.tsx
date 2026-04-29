'use client'

import { useEffect, useRef } from 'react'

// ── Core constants (unchanged) ─────────────────────────────────────────────────
const ROT     = 2.8
const THRUST  = 220
const MAX_V   = 480
const B_SPD   = 540
const B_LIFE  = 1.1
const FIRE_CD = 0.22
const INVULN  = 3.0
const INIT    = 4

const PTS = { large: 20,  medium: 50,  small: 100 } as const
const RAD = { large: 48,  medium: 26,  small: 13  } as const
const SPD = { large: 55,  medium: 100, small: 155 } as const
type Size = keyof typeof PTS

// ── Power-up registry ──────────────────────────────────────────────────────────
// To add or remove a power-up, edit this array only.
// tier 1 = defensive, tier 2 = offensive (mutually exclusive), tier 3 = risky
// duration 0 = instant pickup or inventory item
const PUPS = [
  { id: 'shield',     sym: 'S',   tier: 1, weight: 3, duration: 0  },
  { id: 'extralife',  sym: '1UP', tier: 1, weight: 1, duration: 0  },
  { id: 'hyperspace', sym: 'H',   tier: 1, weight: 2, duration: 0  },
  { id: 'triple',     sym: '3',   tier: 2, weight: 3, duration: 12 },
  { id: 'rapid',      sym: 'R',   tier: 2, weight: 3, duration: 12 },
  { id: 'piercing',   sym: 'P',   tier: 2, weight: 2, duration: 12 },
  { id: 'ricochet',   sym: 'B',   tier: 2, weight: 2, duration: 12 },
  { id: 'bomb',       sym: '*',   tier: 3, weight: 1, duration: 0  },
  { id: 'timeslow',   sym: 'T',   tier: 3, weight: 2, duration: 6  },
  { id: 'multx2',     sym: '2x',  tier: 3, weight: 2, duration: 10 },
] as const
type PupId = typeof PUPS[number]['id']

const PUP_WEIGHT_TOTAL = PUPS.reduce((s, p) => s + p.weight, 0)
function rollPup(): PupId {
  let r = Math.random() * PUP_WEIGHT_TOTAL
  for (const p of PUPS) { r -= p.weight; if (r <= 0) return p.id }
  return PUPS[PUPS.length - 1].id
}

// Drop chance by asteroid size: large never drops, medium 4%, small 8%
const DROP_CHANCE = { large: 0, medium: 0.04, small: 0.08 } as const

const PUP_LABELS: Record<PupId, string> = {
  shield: 'SHIELD!', extralife: 'EXTRA LIFE!', hyperspace: 'HYPERSPACE+',
  triple: 'TRIPLE SHOT!', rapid: 'RAPID FIRE!', piercing: 'PIERCING!', ricochet: 'RICOCHET!',
  bomb: 'BOMB+', timeslow: 'TIME SLOW!', multx2: '2X SCORE!',
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Ship {
  x: number; y: number; vx: number; vy: number
  angle: number; thrusting: boolean; invuln: number; cooldown: number
}
interface Bullet {
  x: number; y: number; vx: number; vy: number; life: number
  piercing: boolean  // piercing shot: bullet survives asteroid hit
  bounces: number    // ricochet: reflections left; -1 = normal wrapping bullet
}
interface Rock {
  x: number; y: number; vx: number; vy: number
  rot: number; drot: number; size: Size; r: number; verts: [number, number][]
}
interface Drop {
  id: PupId; x: number; y: number; vx: number; vy: number; rot: number; life: number
}
interface FloatText { x: number; y: number; text: string; life: number }
interface G {
  ship: Ship; bullets: Bullet[]; rocks: Rock[]
  drops: Drop[]
  fx: Map<PupId, number>  // active timed effects → seconds remaining
  shield: number          // energy pool 0–10 s
  shieldOn: boolean       // Shift held & shield draining this frame
  bombs: number           // inventory: smart bombs, max 2
  hyper: number           // inventory: hyperspace charges, max 3
  floats: FloatText[]
  score: number; best: number; lives: number; wave: number
  over: boolean; started: boolean
}

// ── Utilities ──────────────────────────────────────────────────────────────────
const rnd  = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (v: number, m: number) => ((v % m) + m) % m
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const scoreMult = (g: G) => g.fx.has('multx2') ? 2 : 1

function makeVerts(r: number): [number, number][] {
  const n = 10 + Math.floor(Math.random() * 4)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [Math.cos(a) * r * rnd(0.65, 1.15), Math.sin(a) * r * rnd(0.65, 1.15)] as [number, number]
  })
}
function makeRock(x: number, y: number, size: Size): Rock {
  const a = Math.random() * Math.PI * 2, s = SPD[size]
  return {
    x, y,
    vx: Math.cos(a) * rnd(s * 0.6, s), vy: Math.sin(a) * rnd(s * 0.6, s),
    rot: 0, drot: rnd(-1.2, 1.2), size, r: RAD[size], verts: makeVerts(RAD[size]),
  }
}
function spawnWave(wave: number, W: number, H: number): Rock[] {
  return Array.from({ length: INIT + wave - 1 }, () => {
    let x = 0, y = 0
    do { x = Math.random() * W; y = Math.random() * H } while (dist(x, y, W / 2, H / 2) < 160)
    return makeRock(x, y, 'large')
  })
}
function newShip(W: number, H: number): Ship {
  return { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrusting: false, invuln: INVULN, cooldown: 0 }
}
function newGame(W: number, H: number, best = 0): G {
  return {
    ship: newShip(W, H), bullets: [], rocks: spawnWave(1, W, H),
    drops: [], fx: new Map(), shield: 0, shieldOn: false, bombs: 0, hyper: 0, floats: [],
    score: 0, best, lives: 3, wave: 1, over: false, started: false,
  }
}

// Apply a collected drop to game state.
// Tier 2 effects cancel each other; tier 1 & 3 stack freely.
function applyPup(g: G, id: PupId) {
  const cfg = PUPS.find(p => p.id === id)!
  g.floats.push({ x: g.ship.x, y: g.ship.y - 30, text: PUP_LABELS[id], life: 1.5 })
  if (id === 'extralife')  { g.lives++;                           return }
  if (id === 'shield')     { g.shield = Math.min(g.shield + 10, 10); return }
  if (id === 'hyperspace') { g.hyper  = Math.min(g.hyper  + 1, 3);  return }
  if (id === 'bomb')       { g.bombs  = Math.min(g.bombs  + 1, 2);  return }
  // Tier 2: cancel any other active tier-2 effect before applying new one
  if (cfg.tier === 2) for (const p of PUPS) if (p.tier === 2) g.fx.delete(p.id)
  g.fx.set(id, cfg.duration)
}

// ── Tick — physics + game logic ───────────────────────────────────────────────
function tick(g: G, dt: number, W: number, H: number, keys: Set<string>) {
  if (!g.started || g.over) return
  const sh = g.ship

  // Time-slow scales asteroid dt only; ship and bullets are unaffected
  const slow = g.fx.has('timeslow') ? 0.4 : 1.0

  // Rotate & thrust (unchanged from original)
  if (keys.has('ArrowLeft')  || keys.has('KeyA')) sh.angle -= ROT * dt
  if (keys.has('ArrowRight') || keys.has('KeyD')) sh.angle += ROT * dt

  sh.thrusting = keys.has('ArrowUp') || keys.has('KeyW')
  if (sh.thrusting) {
    sh.vx += Math.cos(sh.angle) * THRUST * dt
    sh.vy += Math.sin(sh.angle) * THRUST * dt
    const spd = Math.hypot(sh.vx, sh.vy)
    if (spd > MAX_V) { sh.vx = sh.vx / spd * MAX_V; sh.vy = sh.vy / spd * MAX_V }
  }

  sh.x        = wrap(sh.x + sh.vx * dt, W)
  sh.y        = wrap(sh.y + sh.vy * dt, H)
  sh.invuln   = Math.max(0, sh.invuln   - dt)
  sh.cooldown = Math.max(0, sh.cooldown - dt)

  // Shield: hold Shift to activate; suppresses firing (the trade-off)
  g.shieldOn = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && g.shield > 0
  if (g.shieldOn) g.shield = Math.max(0, g.shield - dt)

  // Fire — blocked while shield is active
  if (keys.has('Space') && sh.cooldown === 0 && !g.shieldOn) {
    sh.cooldown = g.fx.has('rapid') ? FIRE_CD / 2 : FIRE_CD
    const makeBullet = (off: number): Bullet => ({
      x:  sh.x + Math.cos(sh.angle + off) * 20,
      y:  sh.y + Math.sin(sh.angle + off) * 20,
      vx: sh.vx + Math.cos(sh.angle + off) * B_SPD,
      vy: sh.vy + Math.sin(sh.angle + off) * B_SPD,
      life: B_LIFE,
      piercing: g.fx.has('piercing'),
      bounces:  g.fx.has('ricochet') ? 3 : -1,
    })
    g.bullets.push(makeBullet(0))
    if (g.fx.has('triple')) {
      g.bullets.push(makeBullet(-Math.PI / 6), makeBullet(Math.PI / 6))
    }
  }

  // Tick active effect timers
  for (const [id, t] of g.fx) {
    const next = t - dt
    if (next <= 0) g.fx.delete(id)
    else g.fx.set(id, next)
  }

  // Move bullets — ricochet reflects off edges; normal bullets wrap
  for (const b of g.bullets) {
    b.life -= dt
    if (b.bounces >= 0) {
      // Ricochet: reflect velocity component at each edge crossed
      let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt
      if (nx < 0)  { b.vx =  Math.abs(b.vx); nx = 0; b.bounces-- }
      if (nx > W)  { b.vx = -Math.abs(b.vx); nx = W; b.bounces-- }
      if (ny < 0)  { b.vy =  Math.abs(b.vy); ny = 0; b.bounces-- }
      if (ny > H)  { b.vy = -Math.abs(b.vy); ny = H; b.bounces-- }
      b.x = nx; b.y = ny
      if (b.bounces < 0) b.life = 0
    } else {
      b.x = wrap(b.x + b.vx * dt, W)
      b.y = wrap(b.y + b.vy * dt, H)
    }
  }
  g.bullets = g.bullets.filter(b => b.life > 0)

  // Move rocks — time-slow multiplier applied here only
  for (const r of g.rocks) {
    r.x   = wrap(r.x + r.vx * dt * slow, W)
    r.y   = wrap(r.y + r.vy * dt * slow, H)
    r.rot += r.drot * dt * slow
  }

  // Move drops
  for (const d of g.drops) {
    d.x   = wrap(d.x + d.vx * dt, W)
    d.y   = wrap(d.y + d.vy * dt, H)
    d.rot += 1.5 * dt
    d.life -= dt
  }
  g.drops = g.drops.filter(d => d.life > 0)

  // Bullet ↔ rock collision
  // Piercing bullets are NOT consumed on hit — they continue through.
  // Drop roll happens here; skipped during player invuln to avoid instant stealth pickup.
  const deadB = new Set<Bullet>()
  const keepR: Rock[] = []
  for (const r of g.rocks) {
    const hit = g.bullets.find(b => !deadB.has(b) && dist(b.x, b.y, r.x, r.y) < r.r)
    if (hit) {
      if (!hit.piercing) deadB.add(hit)
      g.score += PTS[r.size] * scoreMult(g)
      if (r.size === 'large')  keepR.push(makeRock(r.x, r.y, 'medium'), makeRock(r.x, r.y, 'medium'))
      if (r.size === 'medium') keepR.push(makeRock(r.x, r.y, 'small'),  makeRock(r.x, r.y, 'small'))
      if (sh.invuln === 0 && Math.random() < DROP_CHANCE[r.size]) {
        const a = Math.random() * Math.PI * 2
        g.drops.push({ id: rollPup(), x: r.x, y: r.y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, rot: 0, life: 10 })
      }
    } else {
      keepR.push(r)
    }
  }
  g.rocks   = keepR
  g.bullets = g.bullets.filter(b => !deadB.has(b))

  // Ship ↔ drop pickup
  g.drops = g.drops.filter(d => {
    if (dist(sh.x, sh.y, d.x, d.y) < 22) { applyPup(g, d.id); return false }
    return true
  })

  // Ship ↔ rock collision (unchanged logic, but shield can absorb the hit)
  if (sh.invuln === 0) {
    for (const r of g.rocks) {
      if (dist(sh.x, sh.y, r.x, r.y) < r.r + 10) {
        if (g.shieldOn && g.shield > 0) {
          g.shield = Math.max(0, g.shield - 2)  // impact drains 2 extra seconds of energy
          break
        }
        g.lives--
        if (g.lives <= 0) { g.over = true; g.best = Math.max(g.best, g.score) }
        else Object.assign(sh, newShip(W, H))
        break
      }
    }
  }

  // Float texts drift upward and fade
  for (const f of g.floats) { f.y -= 40 * dt; f.life -= dt }
  g.floats = g.floats.filter(f => f.life > 0)

  if (g.rocks.length === 0) { g.wave++; g.rocks = spawnWave(g.wave, W, H) }
}

// ── Render helpers (unchanged) ─────────────────────────────────────────────────
function poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, verts: [number, number][], a: number) {
  ctx.beginPath()
  verts.forEach(([lx, ly], i) => {
    const px = Math.cos(a) * lx - Math.sin(a) * ly + cx
    const py = Math.sin(a) * lx + Math.cos(a) * ly + cy
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.stroke()
}
function polyOpen(ctx: CanvasRenderingContext2D, cx: number, cy: number, verts: [number, number][], a: number) {
  ctx.beginPath()
  verts.forEach(([lx, ly], i) => {
    const px = Math.cos(a) * lx - Math.sin(a) * ly + cx
    const py = Math.sin(a) * lx + Math.cos(a) * ly + cy
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.stroke()
}
function atWrapped(W: number, H: number, ox: number, oy: number, r: number, draw: (x: number, y: number) => void) {
  const xs = [ox]; const ys = [oy]
  if (ox < r)     xs.push(ox + W)
  if (ox > W - r) xs.push(ox - W)
  if (oy < r)     ys.push(oy + H)
  if (oy > H - r) ys.push(oy - H)
  for (const x of xs) for (const y of ys) draw(x, y)
}

// Hexagon template for drop icons (computed once)
const HEX: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.cos(a) * 14, Math.sin(a) * 14] as [number, number]
})

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, thrusting: boolean) {
  if (thrusting) {
    ctx.save()
    ctx.strokeStyle = `hsl(${25 + Math.random() * 20}, 100%, 60%)`
    polyOpen(ctx, x, y, [[-12, 5], [-22 - Math.random() * 10, 0], [-12, -5]], angle)
    ctx.restore()
  }
  poly(ctx, x, y, [[18, 0], [-12, 12], [-7, 0], [-12, -12]], angle)
}

// Draw a field drop as a rotating cyan hexagon with its symbol inside
function drawDrop(ctx: CanvasRenderingContext2D, d: Drop, t: number) {
  if (d.life < 3 && Math.floor(t * 6) % 2 === 0) return  // flash last 3 s
  const sym = PUPS.find(p => p.id === d.id)!.sym
  ctx.save()
  ctx.strokeStyle = '#0ff'
  ctx.fillStyle   = '#0ff'
  ctx.lineWidth   = 1.5
  poly(ctx, d.x, d.y, HEX, d.rot)
  ctx.font          = sym.length > 1 ? '8px "Courier New"' : '11px "Courier New"'
  ctx.textAlign     = 'center'
  ctx.textBaseline  = 'middle'
  ctx.fillText(sym, d.x, d.y)
  ctx.restore()
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render(ctx: CanvasRenderingContext2D, g: G, W: number, H: number, t: number) {
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)

  // Time-slow: subtle blue vignette to signal the effect
  if (g.fx.has('timeslow')) {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85)
    grad.addColorStop(0, 'transparent')
    grad.addColorStop(1, 'rgba(0,70,180,0.22)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  ctx.strokeStyle = 'white'
  ctx.fillStyle   = 'white'
  ctx.lineWidth   = 1.5
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'

  if (!g.started) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 72px "Courier New", monospace'
    ctx.fillText('ASTEROIDS', W / 2, H / 2 - 130)
    ctx.font = '22px "Courier New", monospace'
    ctx.fillText('PRESS  ENTER  TO  START', W / 2, H / 2 - 30)
    ctx.font = '14px "Courier New", monospace'
    ctx.fillText('← → / A D   ROTATE        ↑ / W   THRUST        SPACE   FIRE', W / 2, H / 2 + 20)
    ctx.fillText('SHIFT   SHIELD        X   HYPERSPACE        C   SMART BOMB', W / 2, H / 2 + 46)
    return
  }

  if (g.over) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 72px "Courier New", monospace'
    ctx.fillText('GAME  OVER', W / 2, H / 2 - 100)
    ctx.font = '28px "Courier New", monospace'
    ctx.fillText(`SCORE  ${g.score}`, W / 2, H / 2 - 20)
    ctx.fillText(`BEST   ${g.best}`,  W / 2, H / 2 + 30)
    ctx.font = '20px "Courier New", monospace'
    ctx.fillText('PRESS  ENTER  TO  RESTART', W / 2, H / 2 + 90)
    return
  }

  // Asteroids
  ctx.strokeStyle = 'white'
  for (const r of g.rocks)
    atWrapped(W, H, r.x, r.y, r.r, (cx, cy) => poly(ctx, cx, cy, r.verts, r.rot))

  // Bullets — color-coded by type
  for (const b of g.bullets) {
    ctx.fillStyle = b.bounces >= 0 ? '#fa6' : b.piercing ? '#d0f' : 'white'
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  // Field drops
  for (const d of g.drops) drawDrop(ctx, d, t)

  // Ship
  ctx.strokeStyle = 'white'
  const blink = g.ship.invuln > 0 && Math.floor(t * 8) % 2 === 0
  if (!blink)
    atWrapped(W, H, g.ship.x, g.ship.y, 24, (cx, cy) =>
      drawShip(ctx, cx, cy, g.ship.angle, g.ship.thrusting))

  // Shield ring: cyan glow around ship, pulses faster when actively held
  if (g.shield > 0) {
    const alpha  = g.shieldOn ? 0.5 + 0.35 * Math.sin(t * 14) : 0.2
    const radius = 26 + (g.shieldOn ? 1.5 * Math.sin(t * 12) : 0)
    ctx.save()
    ctx.strokeStyle = `rgba(80,210,255,${alpha})`
    ctx.lineWidth   = g.shieldOn ? 2.5 : 1
    ctx.beginPath(); ctx.arc(g.ship.x, g.ship.y, radius, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }

  // Floating pickup text
  ctx.font      = '15px "Courier New", monospace'
  ctx.textAlign = 'center'
  for (const f of g.floats) {
    ctx.globalAlpha = Math.min(1, f.life)
    ctx.fillStyle   = '#0ff'
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1

  // ── HUD ─────────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'white'
  ctx.font = '20px "Courier New", monospace'
  ctx.textAlign = 'left';   ctx.fillText(`SCORE  ${g.score}`, 16, 32)
  ctx.textAlign = 'center'; ctx.fillText(`WAVE  ${g.wave}`,   W / 2, 32)
  ctx.textAlign = 'right';  ctx.fillText(`BEST  ${g.best}`,   W - 16, 32)

  // Life icons
  ctx.strokeStyle = 'white'
  for (let i = 0; i < g.lives; i++)
    poly(ctx, 22 + i * 28, 58, [[12, 0], [-8, 8], [-5, 0], [-8, -8]], -Math.PI / 2)

  // Shield energy bar (below life icons)
  if (g.shield > 0) {
    ctx.font      = '12px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = g.shieldOn ? '#0cf' : '#06a'
    ctx.fillText('S', 16, 80)
    ctx.strokeStyle = '#06a'
    ctx.lineWidth   = 1
    ctx.strokeRect(28, 70, 80, 7)
    ctx.fillStyle = g.shieldOn ? '#0cf' : '#068'
    ctx.fillRect(28, 70, 80 * (g.shield / 10), 7)
  }

  // Active timed fx bars — stacked bottom-left, each shows symbol + shrinking bar
  ctx.lineWidth = 1
  let row = 0
  for (const [id, remaining] of g.fx) {
    const cfg  = PUPS.find(p => p.id === id)!
    const barW = 70 * (remaining / cfg.duration)
    const fy   = H - 18 - row * 24
    ctx.font        = '12px "Courier New", monospace'
    ctx.textAlign   = 'left'
    ctx.fillStyle   = '#ff0'
    ctx.fillText(cfg.sym, 16, fy)
    ctx.strokeStyle = '#660'
    ctx.strokeRect(36, fy - 10, 70, 7)
    ctx.fillStyle = '#ff0'
    ctx.fillRect(36, fy - 10, barW, 7)
    row++
  }

  // Inventory: bombs and hyper charges (top-right, below BEST)
  ctx.textAlign = 'right'
  ctx.font = '13px "Courier New", monospace'
  if (g.bombs > 0) {
    ctx.fillStyle = '#f80'
    ctx.fillText(`*  ×${g.bombs}`, W - 16, 56)
  }
  if (g.hyper > 0) {
    ctx.fillStyle = '#8ff'
    ctx.fillText(`H  ×${g.hyper}`, W - 16, g.bombs > 0 ? 74 : 56)
  }

  // 2× multiplier pulse indicator (top-center)
  if (g.fx.has('multx2')) {
    ctx.textAlign = 'center'
    ctx.fillStyle = `hsl(50,100%,${55 + 15 * Math.sin(t * 6)}%)`
    ctx.font = 'bold 15px "Courier New", monospace'
    ctx.fillText('2×', W / 2, 52)
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Asteroids() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx    = canvas.getContext('2d')!
    const keys   = new Set<string>()

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    let g    = newGame(canvas.width, canvas.height)
    let raf  = 0
    let last = 0

    // Main loop: cap dt to 50 ms to prevent spiral-of-death on tab switch
    function loop(t: number) {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      tick(g, dt, canvas.width, canvas.height, keys)
      render(ctx, g, canvas.width, canvas.height, t / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(t => { last = t; raf = requestAnimationFrame(loop) })

    const down = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code))
        e.preventDefault()
      keys.add(e.code)

      // Start / restart handled before gameplay keys
      if (e.code === 'Enter') {
        if (!g.started)  { g.started = true; return }
        if (g.over)      { g = newGame(canvas.width, canvas.height, g.best); return }
      }

      if (!g.started || g.over) return

      // Hyperspace (one-shot per keydown event; held key does not repeat)
      if (e.code === 'KeyX') {
        const sh = g.ship
        if (g.hyper > 0) {
          g.hyper--
          // Safe warp: find a position clear of all asteroids
          let nx = 0, ny = 0, tries = 0
          do {
            nx = rnd(60, canvas.width  - 60)
            ny = rnd(60, canvas.height - 60)
            tries++
          } while (tries < 30 && g.rocks.some(r => dist(nx, ny, r.x, r.y) < 80))
          sh.x = nx; sh.y = ny; sh.vx = 0; sh.vy = 0; sh.invuln = 1.5
          g.floats.push({ x: sh.x, y: sh.y - 30, text: 'HYPERSPACE', life: 1 })
        } else {
          // Risky warp: random position, minimal grace period
          sh.x = Math.random() * canvas.width
          sh.y = Math.random() * canvas.height
          sh.vx = 0; sh.vy = 0; sh.invuln = 0.3
          g.floats.push({ x: sh.x, y: sh.y - 30, text: 'RISKY WARP!', life: 1 })
        }
      }

      // Smart Bomb (one-shot per keydown; scores only smalls to prevent farming)
      if (e.code === 'KeyC' && g.bombs > 0) {
        g.bombs--
        for (const r of g.rocks) {
          if (r.size === 'small') g.score += PTS.small * scoreMult(g)
        }
        g.rocks = []
        g.floats.push({ x: canvas.width / 2, y: canvas.height / 2, text: 'SMART BOMB!', life: 1.5 })
      }
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup',   up)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{ display: 'block', background: 'black', cursor: 'none' }}
    />
  )
}
