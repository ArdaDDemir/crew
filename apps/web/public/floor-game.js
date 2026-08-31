// Crew office floor — a small isometric canvas game.
// Rendering + input only. Pure math lives in floor-iso.js.

import {
  COLS,
  ROWS,
  TILE_W,
  TILE_H,
  ORIGIN_X,
  ORIGIN_Y,
  assignDesks,
  buildBlocked,
  clampZoom,
  deskSlot,
  doorSlots,
  findPath,
  inRoom,
  iso,
  screenToTile,
  tableSlot,
  walkDuration,
} from "./floor-iso.js";

const SKINS = {
  light: { base: "#f0c49a", shade: "#d3a377" },
  mid: { base: "#c98d5e", shade: "#a8703f" },
  dark: { base: "#8d5a3b", shade: "#6e4229" },
};
const HAIR = {
  short: { c: "#3a2e28" },
  ponytail: { c: "#6b4a2f" },
  buzz: { c: "#2c2622" },
  curly: { c: "#201b18" },
  none: { c: null },
};
const TOPS = {
  hoodie: { c: "#4a6fa5", dark: "#3a5780" },
  tee: { c: "#cdd6df", dark: "#a8b3bf" },
  polo: { c: "#5b8c5a", dark: "#477046" },
  sweater: { c: "#a5676f", dark: "#84525a" },
};
const PANTS = "#2c3140";
const SHOES = "#191c24";
const OUTLINE = "rgba(15,16,22,0.85)";

const POSE_COLORS = {
  thinking: "#b48be0",
  working: "#5aa9e6",
  writing: "#e0a458",
  idle: "#8c8c93",
};

const SPRITE_W = 12;
const SPRITE_H = 19;
const SCALE = 3;

function lookColors(look) {
  const l = look || {};
  return {
    skin: SKINS[l.skin] || SKINS.mid,
    hair: HAIR[l.hair] || HAIR.short,
    top: TOPS[l.top] || TOPS.tee,
  };
}

function poseOf(activity) {
  const a = String(activity || "").toLowerCase();
  if (!a || a === "online") return "idle";
  if (a.includes("thinking") || a.includes("reasoning")) return "thinking";
  if (a.includes("call") || a.includes("model")) return "thinking";
  if (a.includes("writ") || a.includes("account")) return "writing";
  return "working";
}

function hashFrame(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function createFloor(canvas, handlers = {}) {
  const ctx = canvas.getContext("2d");
  const S = {
    members: [],
    doors: [],
    furniture: [],
    you: { id: "you", look: {}, tile: { x: 5, y: 3 }, path: null, t0: 0, from: null },
    roomLabel: "",
    hold: "",
    hover: null,
    cam: { x: iso(COLS / 2, ROWS / 2).x, y: iso(COLS / 2, ROWS / 2).y - 40, z: 1 },
    bubbles: new Map(),
    t: 0,
    dragging: null,
    mouse: { x: 0, y: 0, over: null },
  };
  const sprites = new Map();

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 220;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function charSprite(look, pose, dir, frame) {
    const c = lookColors(look);
    const key = `${look.skin}|${look.hair}|${look.top}|${pose}|${dir}|${frame}`;
    let cv = sprites.get(key);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = SPRITE_W * SCALE;
    cv.height = SPRITE_H * SCALE;
    const g = cv.getContext("2d");
    const px = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
    };
    const sitting = pose === "sit" || pose === "type" || pose === "sit-type";
    const bob = frame === 1 ? 1 : 0;
    const legLift = pose === "walk" ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
    const bodyY = sitting ? 7 : 6 + bob * 0;
    const bodyH = sitting ? 7 : 6;
    const hairC = c.hair.c;
    // hair cap
    if (hairC) px(3, 1, 6, 2, hairC);
    if (look.hair === "ponytail" && dir !== "back") px(9, 2, 1, 4, hairC);
    if (look.hair === "curly") px(2, 1, 8, 2, hairC);
    // face
    const faceY = 3;
    if (dir === "back") {
      px(3, faceY, 6, 3, hairC || c.skin.base);
    } else {
      px(3, faceY, 6, 3, c.skin.base);
      px(3, faceY + 2, 6, 1, c.skin.shade);
      if (dir === "front") {
        px(4, faceY + 1, 1, 1, "#23262e");
        px(7, faceY + 1, 1, 1, "#23262e");
      } else if (dir === "side") {
        px(7, faceY + 1, 1, 1, "#23262e");
      }
    }
    // body / top
    px(3, bodyY, 6, bodyH, c.top.c);
    px(3, bodyY + bodyH - 1, 6, 1, c.top.dark);
    // arms
    const armY = bodyY + (pose === "type" ? 1 : 2) + (pose === "walk" ? (frame % 2 === 0 ? 0 : 1) : 0);
    px(2, armY, 1, sitting ? 3 : 4, c.top.dark);
    px(9, armY, 1, sitting ? 3 : 4, c.top.dark);
    if (!sitting) {
      px(2, armY + 4, 1, 1, c.skin.base);
      px(9, armY + 4, 1, 1, c.skin.base);
    } else if (pose === "type") {
      px(2, armY + 3, 1, 1, c.skin.base);
      px(9, armY + 3, 1, 1, c.skin.base);
    }
    // legs + shoes (standing poses only)
    if (!sitting) {
      const legY = bodyY + bodyH + 1;
      const lift = legLift > 0 ? 1 : 0;
      px(4, legY + (legLift < 0 ? -lift : 0), 2, 4 - lift, PANTS);
      px(6, legY + lift, 2, 4 - lift, PANTS);
      px(4, legY + 4, 2, 1, SHOES);
      px(6, legY + 4, 2, 1, SHOES);
    }
    // outline pass: dark rim around silhouette
    g.globalCompositeOperation = "source-atop";
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    g.globalCompositeOperation = "source-over";
    sprites.set(key, cv);
    return cv;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawShadow(g, sx, sy, w) {
    g.fillStyle = "rgba(10,12,18,0.30)";
    g.beginPath();
    g.ellipse(sx, sy, w, w * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawTileFloor(g) {
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        const { x: sx, y: sy } = iso(x, y);
        const even = (x + y) % 2 === 0;
        g.fillStyle = even ? "#232833" : "#1f242e";
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
        g.lineTo(sx, sy + TILE_H);
        g.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.03)";
        g.stroke();
      }
    }
  }

  function drawWalls(g, doors) {
    // back wall along y=0 (up-right edge) and left wall along x=0 (up-left edge)
    const wallH = 54;
    const base0 = iso(0, 0);
    // back wall (to the right)
    const rightEnd = iso(COLS, 0);
    g.fillStyle = "#141720";
    g.beginPath();
    g.moveTo(base0.x - TILE_W / 2, base0.y - 6);
    g.lineTo(rightEnd.x + TILE_W / 2, rightEnd.y - 6);
    g.lineTo(rightEnd.x + TILE_W / 2, rightEnd.y - wallH);
    g.lineTo(base0.x - TILE_W / 2, base0.y - wallH);
    g.closePath();
    g.fill();
    g.fillStyle = "#1a1f2b";
    g.fillRect(base0.x - TILE_W / 2, base0.y - wallH, rightEnd.x - base0.x + TILE_W, 5);
    // left wall (down-left)
    const leftEnd = iso(0, ROWS);
    g.fillStyle = "#10131b";
    g.beginPath();
    g.moveTo(base0.x - TILE_W / 2, base0.y - 6);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y + 10);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y + 10 - wallH);
    g.lineTo(base0.x - TILE_W / 2, base0.y - wallH);
    g.closePath();
    g.fill();
    // window on left wall
    g.fillStyle = "#2b3d52";
    const wx = base0.x - TILE_W / 2 + 10;
    g.fillRect(wx, base0.y - 44, 46, 22);
    g.fillStyle = "#3f5d7d";
    g.fillRect(wx + 3, base0.y - 41, 18, 16);
    g.fillRect(wx + 25, base0.y - 41, 18, 16);
    // doors on back wall
    doors.forEach((d, i) => {
      const slot = doorSlots(doors.length)[i] || { x: 2 + i * 2 };
      const p = iso(slot.x, 0);
      const dx = p.x - 2;
      const top = p.y - 8;
      const hover = S.hover?.kind === "door" && S.hover.id === d.id;
      g.fillStyle = hover ? "#3d4a63" : "#232b3d";
      g.fillRect(dx, top - wallH + 12, 44, wallH - 10);
      g.strokeStyle = hover ? "#8fb0ff" : "#39445c";
      g.strokeRect(dx + 0.5, top - wallH + 12.5, 43, wallH - 11);
      g.fillStyle = hover ? "#cfe0ff" : "#8c96ad";
      g.font = "10px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillText(`#${d.label}`, dx + 22, top - wallH + 34);
      const light = d.recent ? "rgba(122,162,255,0.5)" : "rgba(122,162,255,0.12)";
      g.fillStyle = light;
      g.fillRect(dx + 4, top - wallH + 40, 36, 2);
    });
  }

  function drawDesk(g, sx, sy, opts = {}) {
    const w = 46;
    // desk body
    g.fillStyle = "#2b3140";
    g.fillRect(sx - w / 2, sy - 12, w, 7);
    g.fillStyle = "#39415a";
    g.fillRect(sx - w / 2, sy - 14, w, 3);
    g.fillStyle = "#20252f";
    g.fillRect(sx - w / 2 + 3, sy - 5, 4, 6);
    g.fillRect(sx + w / 2 - 7, sy - 5, 4, 6);
    if (opts.monitor) {
      g.fillStyle = "#12151c";
      g.fillRect(sx - 9, sy - 28, 18, 13);
      g.fillStyle = opts.lit ? "#9fd1ff" : "#26314a";
      g.fillRect(sx - 7, sy - 26, 14, 9);
      if (opts.lit) {
        g.fillStyle = "rgba(140,190,255,0.14)";
        g.fillRect(sx - 12, sy - 30, 24, 17);
      }
      g.fillStyle = "#12151c";
      g.fillRect(sx - 2, sy - 15, 4, 3);
    }
    if (opts.laptop) {
      g.fillStyle = "#1b202b";
      g.fillRect(sx - 8, sy - 18, 16, 10);
      g.fillStyle = opts.lit ? "#ffd9a0" : "#2b3348";
      g.fillRect(sx - 6, sy - 16, 12, 7);
    }
  }

  function drawChair(g, sx, sy) {
    g.fillStyle = "#23293a";
    g.fillRect(sx - 7, sy - 8, 14, 4);
    g.fillStyle = "#191e2b";
    g.fillRect(sx - 6, sy - 4, 3, 6);
    g.fillRect(sx + 3, sy - 4, 3, 6);
  }

  function drawTable(g) {
    const spots = [tableSlot(0), tableSlot(1), tableSlot(2)];
    const a = iso(spots[0].x - 0.5, spots[0].y);
    const b = iso(spots[1].x + 1.5, spots[1].y);
    const topY = Math.min(a.y, b.y) - 6;
    g.fillStyle = "rgba(122,162,255,0.06)";
    g.beginPath();
    g.moveTo(a.x - TILE_W / 2, a.y + 6);
    g.lineTo(b.x + TILE_W / 2, b.y - TILE_H / 2 + 6);
    g.lineTo(b.x + TILE_W / 2 + 10, b.y - TILE_H / 2 + 26);
    g.lineTo(a.x - TILE_W / 2 + 10, a.y + 26);
    g.closePath();
    g.fill();
    // glass table top
    g.fillStyle = "rgba(150,190,255,0.10)";
    g.strokeStyle = "rgba(150,190,255,0.35)";
    roundRect(g, a.x - 20, topY - 4, b.x - a.x + 76, 20, 6);
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(160,200,255,0.18)";
    g.fillRect(a.x - 12, topY + 16, 4, 8);
    g.fillRect(b.x + 52, topY + 16, 4, 8);
  }

  function drawFurniture(g, f, sx, sy, hover) {
    const k = f.kind;
    if (k === "rug") {
      g.fillStyle = hover ? "rgba(224,164,88,0.28)" : "rgba(165,103,111,0.22)";
      g.beginPath();
      g.ellipse(sx, sy, 34, 17, 0, 0, Math.PI * 2);
      g.fill();
      return;
    }
    drawShadow(g, sx, sy, 12);
    if (k === "plant") {
      g.fillStyle = "#7a4a2e";
      g.fillRect(sx - 5, sy - 10, 10, 10);
      g.fillStyle = "#3f7a4a";
      g.fillRect(sx - 7, sy - 20, 6, 11);
      g.fillRect(sx + 1, sy - 22, 6, 13);
      g.fillRect(sx - 2, sy - 25, 4, 16);
      g.fillStyle = "#57a05e";
      g.fillRect(sx - 6, sy - 18, 3, 6);
      g.fillRect(sx + 2, sy - 20, 3, 7);
    } else if (k === "lamp") {
      g.fillStyle = "#39415a";
      g.fillRect(sx - 1, sy - 24, 2, 24);
      g.fillStyle = hover ? "#ffd9a0" : "#e8d9b0";
      g.fillRect(sx - 6, sy - 30, 12, 7);
      g.fillStyle = "rgba(255,217,160,0.16)";
      g.beginPath();
      g.ellipse(sx, sy - 2, 16, 7, 0, 0, Math.PI * 2);
      g.fill();
    } else if (k === "sofa") {
      g.fillStyle = "#5d4a6e";
      roundRect(g, sx - 22, sy - 16, 44, 15, 5);
      g.fill();
      g.fillStyle = "#6e597f";
      roundRect(g, sx - 22, sy - 20, 44, 8, 4);
      g.fill();
      g.fillStyle = "#4a3a58";
      g.fillRect(sx - 22, sy - 12, 3, 11);
      g.fillRect(sx + 19, sy - 12, 3, 11);
    } else if (k === "shelf") {
      g.fillStyle = "#4a3a2e";
      g.fillRect(sx - 14, sy - 26, 28, 26);
      g.fillStyle = "#5d4a3a";
      g.fillRect(sx - 12, sy - 24, 24, 3);
      g.fillRect(sx - 12, sy - 16, 24, 3);
      g.fillRect(sx - 12, sy - 8, 24, 3);
      g.fillStyle = "#8c96ad";
      g.fillRect(sx - 9, sy - 22, 3, 5);
      g.fillRect(sx - 2, sy - 22, 4, 5);
      g.fillRect(sx + 5, sy - 14, 5, 5);
    }
  }

  function drawBubble(g, sx, sy, text, opts = {}) {
    if (!text) return;
    const lines = [];
    let cur = "";
    for (const word of String(text).split(/\s+/)) {
      if ((cur + " " + word).trim().length > 26) {
        lines.push(cur.trim());
        cur = word;
      } else cur += " " + word;
      if (lines.length === 3) break;
    }
    if (lines.length < 3 && cur.trim()) lines.push(cur.trim());
    const shown = opts.typed != null ? opts.typed : 1e9;
    let used = 0;
    const out = [];
    for (const line of lines) {
      if (used >= shown) break;
      out.push(line.slice(0, Math.max(0, shown - used)));
      used += line.length + 1;
    }
    g.font = "11px ui-monospace, monospace";
    const w = Math.min(210, Math.max(30, ...out.map((l) => g.measureText(l).width)) + 16);
    const h = 8 + out.length * 14;
    const bx = sx - w / 2;
    const by = sy - h - 26;
    g.fillStyle = "rgba(238,240,246,0.96)";
    roundRect(g, bx, by, w, h, 7);
    g.fill();
    g.beginPath();
    g.moveTo(sx - 4, by + h);
    g.lineTo(sx + 4, by + h);
    g.lineTo(sx, by + h + 6);
    g.closePath();
    g.fill();
    g.fillStyle = "#191c24";
    g.textAlign = "left";
    out.forEach((line, i) => g.fillText(line, bx + 8, by + 15 + i * 14));
  }

  function entityAt(px, py) {
    // screen px (already camera-space) → nearest member/door hit
    let best = null;
    let bestD = 26 * 26;
    for (const m of S.members) {
      const p = iso(m.at.x, m.at.y);
      const dx = p.x - px;
      const dy = p.y - 20 - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { kind: "person", id: m.id, member: m };
      }
    }
    for (const d of S.doors) {
      const slot = d.slot;
      const p = iso(slot.x, 0);
      const dx = p.x - px;
      const dy = p.y - 30 - py;
      const dist = dx * dx + dy * dy;
      if (dist < 34 * 34 && (!best || dist < bestD)) {
        bestD = dist;
        best = { kind: "door", id: d.id };
      }
    }
    if (!best && !S.hold) {
      for (const f of S.furniture) {
        const p = iso(f.x, f.y);
        const dx = p.x - px;
        const dy = p.y - 10 - py;
        if (dx * dx + dy * dy < 22 * 22) return { kind: "furniture", id: f.id, item: f };
      }
    }
    return best;
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function worldFromScreen(px, py) {
    return { x: (px - canvas.clientWidth / 2) / S.cam.z + S.cam.x, y: (py - canvas.clientHeight / 2) / S.cam.z + S.cam.y };
  }

  function tick(now) {
    S.t = now;
    resizeIfNeeded();
    const g = ctx;
    g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    // background
    g.fillStyle = "#0d0f15";
    g.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    g.save();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    g.translate(cx, cy);
    g.scale(S.cam.z, S.cam.z);
    g.translate(-S.cam.x, -S.cam.y);

    drawTileFloor(g);
    drawWalls(g, S.doors);
    drawTable(g);

    // hover tile highlight
    if (S.hover?.kind === "tile") {
      const p = iso(S.hover.x, S.hover.y);
      g.fillStyle = S.hold ? "rgba(224,164,88,0.22)" : "rgba(140,190,255,0.16)";
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      g.lineTo(p.x, p.y + TILE_H);
      g.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      g.closePath();
      g.fill();
    }
    // hold ghost
    if (S.hold && S.hover?.kind === "tile") {
      const p = iso(S.hover.x, S.hover.y);
      g.globalAlpha = 0.55;
      drawFurniture(g, { kind: S.hold }, p.x, p.y + TILE_H / 2, true);
      g.globalAlpha = 1;
    }

    // depth-sorted drawables
    const drawables = [];
    for (const f of S.furniture) {
      const p = iso(f.x, f.y);
      drawables.push({ depth: f.x + f.y, draw: () => drawFurniture(g, f, p.x, p.y + TILE_H / 2, S.hover?.kind === "furniture" && S.hover.id === f.id) });
    }
    for (const m of S.members) {
      drawables.push({ depth: m.at.x + m.at.y + 0.1, draw: () => drawMember(g, m, now) });
    }
    drawables.push({ depth: S.you.at.x + S.you.at.y + 0.2, draw: () => drawYou(g, now) });
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.draw();

    g.restore();

    // bubbles + tags in screen space (crisp)
    g.save();
    g.translate(cx, cy);
    g.scale(S.cam.z, S.cam.z);
    g.translate(-S.cam.x, -S.cam.y);
    for (const m of S.members) {
      const p = iso(m.at.x, m.at.y);
      const b = S.bubbles.get(m.id);
      if (b && b.text) {
        const age = now - b.t0;
        const typed = Math.floor((age / 1000) * 28);
        if (age < b.keepMs) drawBubble(g, p.x, p.y - 34, b.text, { typed });
      } else if (m.pose !== "idle" && m.activityShort) {
        drawBubble(g, p.x, p.y - 34, m.activityShort, { typed: 1e9 });
      }
      // name tag
      g.font = "9px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillStyle = m.lead ? "#ffd9a0" : "rgba(200,208,224,0.75)";
      g.fillText(`${m.lead ? "\u2605 " : "@${m.name}"}`, p.x, p.y + 6);
    }
    const yp = iso(S.you.at.x, S.you.at.y);
    g.font = "9px ui-monospace, monospace";
    g.fillStyle = "#9fd1ff";
    g.textAlign = "center";
    g.fillText("you", yp.x, yp.y + 6);
    g.restore();

    requestAnimationFrame(tick);
  }

  function drawMember(g, m, now) {
    const p = iso(m.at.x, m.at.y);
    const sit = m.pose !== "idle";
    const pose = sit ? (m.atDesk ? "type" : "sit") : "idle";
    const frame = Math.floor(now / (m.pose === "idle" ? 520 : 200) + hashFrame(m.id)) % (pose === "type" ? 2 : 4);
    const dir = m.atDesk ? "back" : "front";
    drawShadow(g, p.x, p.y + 2, 10);
    if (m.desk && m.pose !== "idle") {
      drawChair(g, p.x, p.y - 2);
    }
    const spr = charSprite(m.look, pose, dir, frame);
    g.drawImage(spr, p.x - (SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 6);
    if (m.desk) {
      const busy = m.pose === "working" || m.pose === "thinking";
      drawDesk(g, m.atDesk ? p.x + 4 : m.deskPx.x, m.atDesk ? p.y - 8 : m.deskPx.y, {
        monitor: !m.atDesk,
        laptop: m.atDesk,
        lit: busy,
      });
    }
    if (m.pose !== "idle") {
      const c = POSE_COLORS[m.pose] || POSE_COLORS.working;
      g.fillStyle = c;
      g.beginPath();
      g.arc(p.x + 14, p.y - SPRITE_H * SCALE + 10, 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawYou(g, now) {
    const y = S.you;
    let at = y.at;
    if (y.path && y.path.length) {
      const total = y.path.length;
      const dur = walkDuration(total);
      const k = Math.min(1, (now - y.t0) / dur);
      const seg = k * total;
      const i = Math.min(total - 1, Math.floor(seg));
      const f = seg - i;
      const a = i === 0 ? y.from : y.path[i - 1];
      const b2 = y.path[i];
      at = { x: a.x + (b2.x - a.x) * f, y: a.y + (b2.y - a.y) * f };
      if (k >= 1) {
        y.at = y.path.at(-1);
        y.path = null;
      } else {
        y.at = at;
      }
    }
    const walking = Boolean(y.path);
    const pose = walking ? "walk" : "idle";
    const dir = walking
      ? Math.abs(y.dirX) > Math.abs(y.dirY)
        ? "side"
        : y.dirY > 0
          ? "front"
          : "back"
      : y.face || "front";
    const frame = walking ? (Math.floor(now / 140) % 4) : Math.floor(now / 520) % 2;
    const p = iso(at.x, at.y);
    drawShadow(g, p.x, p.y + 2, 10);
    const spr = charSprite(y.look, pose, dir, frame);
    const flip = dir === "side" && y.dirX < 0;
    g.save();
    if (flip) {
      g.translate(p.x, 0);
      g.scale(-1, 1);
      g.drawImage(spr, -(SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 6);
      g.restore();
    } else {
      g.restore();
      g.drawImage(spr, p.x - (SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 6);
    }
  }

  function resizeIfNeeded() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * Math.min(2, window.devicePixelRatio || 1))) resize();
    else if (canvas.height !== Math.round(h * Math.min(2, window.devicePixelRatio || 1))) resize();
  }

  // ---------- input ----------
  canvas.addEventListener("pointerdown", (e) => {
    const pt = toCanvas(e);
    S.dragging = { x0: pt.x, y0: pt.y, camx: S.cam.x, camy: S.cam.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const pt = toCanvas(e);
    S.mouse = pt;
    if (S.dragging) {
      const dx = pt.x - S.dragging.x0;
      const dy = pt.y - S.dragging.y0;
      if (Math.abs(dx) + Math.abs(dy) > 6) S.dragging.moved = true;
      if (S.dragging.moved) {
        S.cam.x = S.dragging.camx - dx / S.cam.z;
        S.cam.y = S.dragging.camy - dy / S.cam.z;
      }
      return;
    }
    const w = worldFromScreen(pt.x, pt.y);
    const t = screenToTile(w.x, w.y);
    S.hover = entityAt(w.x, w.y);
    if (!S.hover && inRoom(t.x, t.y)) S.hover = { kind: "tile", x: t.x, y: t.y };
    canvas.style.cursor = S.hover?.kind === "person" || S.hover?.kind === "door" ? "pointer" : S.hold ? "copy" : "default";
  });
  canvas.addEventListener("pointerup", (e) => {
    const drag = S.dragging;
    S.dragging = null;
    if (!drag || drag.moved) return;
    const pt = toCanvas(e);
    const w = worldFromScreen(pt.x, pt.y);
    const hit = entityAt(w.x, w.y);
    if (hit?.kind === "person") {
      handlers.onPersonClick?.(hit.id);
      return;
    }
    if (hit?.kind === "door") {
      handlers.onDoorClick?.(hit.id);
      return;
    }
    if (hit?.kind === "furniture") {
      if (!S.hold) handlers.onFurnitureClick?.(hit.id);
      return;
    }
    const t = screenToTile(w.x, w.y);
    if (inRoom(t.x, t.y)) {
      if (S.hold) handlers.onPlace?.({ x: t.x, y: t.y });
      else handlers.onTileClick?.(t);
    }
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = worldFromScreen(e.offsetX, e.offsetY);
    S.cam.z = clampZoom(S.cam.z * (e.deltaY < 0 ? 1.12 : 0.89));
    const after = worldFromScreen(e.offsetX, e.offsetY);
    S.cam.x += before.x - after.x;
    S.cam.y += before.y - after.y;
  }, { passive: false });
  canvas.addEventListener("pointerleave", () => {
    S.hover = null;
  });

  resize();
  requestAnimationFrame(tick);
  window.addEventListener("resize", resizeIfNeeded);

  // ---------- public api ----------
  return {
    setState(next) {
      const memberIds = (next.members ?? []).map((m) => m.id);
      const desks = assignDesks(memberIds);
      let tableI = 0;
      S.members = (next.members ?? []).map((m) => {
        const desk = desks.find((d) => d.id === m.id)?.desk ?? deskSlot(0);
        const busy = m.pose && m.pose !== "idle";
        const seat = busy ? tableSlot(tableI++) : null;
        return {
          ...m,
          desk,
          seat,
          atDesk: busy,
          at: seat ?? { x: desk.x + 0.6, y: desk.y - 1.1 },
          deskPx: (() => {
            const p = iso(desk.x, desk.y);
            return { x: p.x + 14, y: p.y - 2 };
          })(),
          activityShort: (m.activity || "").length > 30 ? `${m.activity.slice(0, 28)}…` : m.activity || "",
        };
      });
      S.doors = (next.doors ?? []).map((d, i) => ({ ...d, slot: doorSlots(next.doors.length)[i] }));
      S.furniture = next.furniture ?? [];
      if (next.you) {
        const moved = !S.you.look || JSON.stringify(next.you.look) !== JSON.stringify(S.you.look);
        S.you.look = next.you.look || {};
        if (next.you.home && !S.you.path) {
          const target = next.you.home;
          if (S.you.at.x !== target.x || S.you.at.y !== target.y) {
            this.walkTo(target, true);
          }
        }
        if (moved) S.you.face = "front";
      }
      S.roomLabel = next.roomLabel ?? S.roomLabel;
    },
    walkTo(tile, instant) {
      if (!inRoom(tile.x, tile.y)) return;
      const from = { x: Math.round(S.you.at.x), y: Math.round(S.you.at.y) };
      const blocked = buildBlocked({
        members: S.members.flatMap((m) => [m.desk ? { x: m.desk.x, y: m.desk.y } : null, m.seat ?? null].filter(Boolean)),
        furniture: S.furniture,
        doors: S.doors.map((d) => d.slot),
      });
      const path = findPath(from, tile, blocked);
      if (!path || path.length < 2) return;
      S.you.dirX = tile.x - from.x;
      S.you.dirY = tile.y - from.y;
      if (S.you.dirX) S.you.face = "side";
      else if (S.you.dirY > 0) S.you.face = "front";
      else if (S.you.dirY < 0) S.you.face = "back";
      S.you.from = { ...S.you.at };
      S.you.path = instant ? [tile] : path;
      S.you.t0 = performance.now();
    },
    sitAt(tile) {
      this.walkTo(tile, false);
    },
    say(id, text) {
      if (!text) return;
      S.bubbles.set(id, { text: String(text).replace(/\s+/g, " ").trim().slice(0, 140), t0: performance.now(), keepMs: 7000 });
    },
    setHold(kind) {
      S.hold = kind || "";
    },
    focus() {
      S.cam.x = iso(COLS / 2, ROWS / 2).x;
      S.cam.y = iso(COLS / 2, ROWS / 2).y - 30;
      S.cam.z = 1;
    },
  };
}
