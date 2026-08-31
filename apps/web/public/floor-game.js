// Crew office floor — a warm isometric canvas diorama (meeting-room edition).
// Rendering + input only. Pure math lives in floor-iso.js.

import {
  COLS,
  ROWS,
  TILE_W,
  TILE_H,
  buildBlocked,
  clampZoom,
  doorSlots,
  findPath,
  inRoom,
  iso,
  screenToTile,
  walkDuration,
} from "./floor-iso.js";

const SKINS = {
  light: { base: "#f6cba0", shade: "#d9a877" },
  mid: { base: "#d19a6a", shade: "#b07a48" },
  dark: { base: "#9a6642", shade: "#7a4c2e" },
};
const HAIR = {
  short: { c: "#40332b", d: "#2b221d" },
  ponytail: { c: "#7a5433", d: "#5b3d22" },
  buzz: { c: "#332b26", d: "#211c19" },
  curly: { c: "#26201c", d: "#171310" },
  none: { c: null, d: null },
};
const TOPS = {
  hoodie: { c: "#5b84c2", d: "#41659a" },
  tee: { c: "#d8e0e8", d: "#aeb9c4" },
  polo: { c: "#6aa668", d: "#4f8350" },
  sweater: { c: "#b5737c", d: "#93575f" },
};
const PANTS = "#343a4c";
const SHOES = "#1c1f29";

// warm meeting room palette
const FLOOR_BASE = "#b98a5a";
const FLOOR_ALT = "#b08254";
const FLOOR_SEAM = "rgba(92,62,38,0.5)";
const FLOOR_EDGE = "#8a6244";
const WALL_UPPER = "#e3cda4";
const WALL_UPPER_D = "#d3b98e";
const WAINSCOT = "#a86e3e";
const BASEBOARD = "#4a2e1c";
const WALL_SIDE = "#d3b98e";

const POSE_COLORS = {
  thinking: "#b48be0",
  working: "#5aa9e6",
  writing: "#e0a458",
  idle: null,
};

// meeting table occupies these tiles (blocked)
const TABLE_TILES = [
  { x: 9, y: 4 },
  { x: 10, y: 4 },
  { x: 9, y: 5 },
  { x: 10, y: 5 },
];
// seats around the table: [tile, facing]
const SEATS = [
  { x: 9, y: 3, dir: "front" },
  { x: 10, y: 3, dir: "front" },
  { x: 8, y: 4, dir: "side-r" },
  { x: 11, y: 4, dir: "side-l" },
  { x: 8, y: 5, dir: "side-r" },
  { x: 11, y: 5, dir: "side-l" },
];

const SPRITE_W = 14;
const SPRITE_H = 22;
const SCALE = 4;

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

function hash01(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
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
    you: { id: "you", look: {}, at: { x: 5, y: 3 }, path: null, t0: 0, from: null, face: "front", dirX: 0, dirY: 0 },
    roomLabel: "",
    hold: "",
    hover: null,
    cam: { x: iso(COLS / 2, ROWS / 2).x, y: iso(COLS / 2, ROWS / 2).y, z: 1 },
    bubbles: new Map(),
    t: 0,
    dragging: null,
    mode: "channel",
  };
  const sprites = new Map();
  let lastW = -1;
  let lastH = -1;
  let userMoved = false;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 240;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roomBounds() {
    const tl = iso(0, 0);
    const tr = iso(COLS, 0);
    const bl = iso(0, ROWS);
    const br = iso(COLS, ROWS);
    return {
      left: bl.x - TILE_W / 2,
      right: tr.x + TILE_W / 2,
      top: tl.y - 100,
      bottom: br.y + TILE_H + 18,
    };
  }

  function fitFloor(force) {
    if (!force && userMoved) return;
    if (canvas.clientWidth < 40) return;
    const b = roomBounds();
    const z = clampZoom(
      Math.min(canvas.clientWidth / (b.right - b.left), canvas.clientHeight / (b.bottom - b.top)),
    );
    S.cam.z = Math.max(z, 0.55);
    S.cam.x = (b.left + b.right) / 2;
    S.cam.y = (b.top + b.bottom) / 2;
  }

  function resizeIfNeeded() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      resize();
      fitFloor(false);
    }
  }

  // ---------- sprites ----------
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
    const sitting = pose === "sit" || pose === "type";
    const bob = pose === "idle" && frame === 1 ? 1 : 0;
    const step = pose === "walk" ? [0, 1, 0, -1][frame] : 0;
    const bodyY = (sitting ? 8 : 7) + bob;
    const bodyH = sitting ? 8 : 7;
    const hairC = c.hair.c;
    const hairD = c.hair.d;
    if (hairC) {
      px(3, 0, 8, 2, hairC);
      px(2, 1, 10, 2, hairC);
      if (look.hair === "curly") {
        px(1, 2, 2, 2, hairD);
        px(11, 2, 2, 2, hairD);
      }
      if (look.hair === "ponytail" && dir !== "back") px(11, 3, 2, 6, hairD);
      if (look.hair === "ponytail" && dir === "back") px(5, 2, 4, 8, hairD);
    }
    if (dir === "back") {
      if (hairC) px(3, 3, 8, 4, hairD);
      else px(3, 3, 8, 4, c.skin.shade);
    } else {
      px(3, 3, 8, 4, c.skin.base);
      px(3, 6, 8, 1, c.skin.shade);
      if (dir === "front") {
        px(4, 4, 2, 2, "#22252e");
        px(8, 4, 2, 2, "#22252e");
      } else {
        px(8, 4, 2, 2, "#22252e");
      }
    }
    px(3, bodyY, 8, bodyH, c.top.c);
    px(3, bodyY, 2, bodyH, c.top.d);
    px(9, bodyY, 2, bodyH, c.top.d);
    if (pose === "type") {
      px(1, bodyY + 3, 3, 2, c.skin.base);
      px(10, bodyY + 3, 3, 2, c.skin.base);
    } else if (pose === "walk") {
      const arm = frame % 2 === 0 ? 1 : -1;
      px(2, bodyY + 2 + (arm > 0 ? 0 : 1), 2, 4, c.skin.base);
      px(10, bodyY + 2 + (arm > 0 ? 1 : 0), 2, 4, c.skin.base);
    } else if (!sitting) {
      px(2, bodyY + 2, 2, 4, c.skin.base);
      px(10, bodyY + 2, 2, 4, c.skin.base);
    }
    if (!sitting) {
      const legY = bodyY + bodyH;
      px(4, legY + (step > 0 ? -1 : 0), 2, 4, "#343a4c");
      px(8, legY + (step < 0 ? -1 : 0), 2, 4, "#343a4c");
      px(3, legY + 4, 3, 2, "#1c1f29");
      px(8, legY + 4, 3, 2, "#1c1f29");
    } else {
      px(3, bodyY + bodyH, 8, 2, "#262b39");
    }
    sprites.set(key, cv);
    return cv;
  }

  // ---------- room ----------
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
    g.fillStyle = "rgba(20,12,6,0.32)";
    g.beginPath();
    g.ellipse(sx, sy, w, w * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawTileFloor(g) {
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        const { x: sx, y: sy } = iso(x, y);
        const r = hash01(x, y);
        const base = r > 0.5 ? FLOOR_BASE : FLOOR_ALT;
        const shade = r > 0.85 ? "#a6744a" : base;
        g.fillStyle = shade;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
        g.lineTo(sx, sy + TILE_H);
        g.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
        g.closePath();
        g.fill();
        // plank seams along the iso axis
        g.strokeStyle = FLOOR_SEAM;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(sx - TILE_W / 4, sy + TILE_H / 4);
        g.lineTo(sx + TILE_W / 4, sy + (TILE_H * 3) / 4);
        g.stroke();
        if (r > 0.72) {
          g.beginPath();
          g.moveTo(sx, sy + TILE_H / 2);
          g.lineTo(sx + TILE_W / 4, sy + TILE_H / 4);
          g.stroke();
        }
      }
    }
    // wall ambient occlusion strips
    const b0 = iso(0, 0);
    g.fillStyle = "rgba(50,30,16,0.30)";
    g.beginPath();
    g.moveTo(b0.x, b0.y + TILE_H / 2);
    g.lineTo(b0.x + COLS * (TILE_W / 2) + TILE_H / 2, b0.y + COLS * (TILE_H / 2) + TILE_H / 2);
    g.lineTo(b0.x + COLS * (TILE_W / 2), b0.y + COLS * (TILE_H / 2) + TILE_H);
    g.lineTo(b0.x, b0.y + TILE_H);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(b0.x, b0.y + TILE_H / 2);
    g.lineTo(b0.x - TILE_W / 2 + ROWS * (TILE_W / 2), b0.y + ROWS * (TILE_H / 2) + TILE_H / 2);
    g.lineTo(b0.x - TILE_W / 2 + ROWS * (TILE_W / 2) - TILE_W / 4, b0.y + ROWS * (TILE_H / 2) + TILE_H);
    g.lineTo(b0.x - TILE_W / 4, b0.y + TILE_H);
    g.closePath();
    g.fill();
  }

  function drawWalls(g, doors) {
    const wallH = 78;
    const base0 = iso(0, 0);
    const rightEnd = iso(COLS, 0);
    const leftEnd = iso(0, ROWS);
    // back wall: upper paint + wainscot + baseboard
    g.fillStyle = WALL_UPPER;
    g.beginPath();
    g.moveTo(base0.x - TILE_W / 2, base0.y - 4);
    g.lineTo(rightEnd.x + TILE_W / 2, rightEnd.y - 4);
    g.lineTo(rightEnd.x + TILE_W / 2, rightEnd.y - wallH);
    g.lineTo(base0.x - TILE_W / 2, base0.y - wallH);
    g.closePath();
    g.fill();
    g.fillStyle = WALL_UPPER_D;
    g.fillRect(base0.x - TILE_W / 2, base0.y - wallH, rightEnd.x - base0.x + TILE_W, 7);
    const wainTop = base0.y - 30;
    g.fillStyle = WAINSCOT;
    g.fillRect(base0.x - TILE_W / 2, wainTop, rightEnd.x - base0.x + TILE_W, wainTop === base0.y - 30 ? 26 : 26);
    g.fillStyle = BASEBOARD;
    g.fillRect(base0.x - TILE_W / 2, base0.y - 8, rightEnd.x - base0.x + TILE_W, 5);
    g.strokeStyle = "rgba(74,46,28,0.7)";
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const x = base0.x - TILE_W / 2 + i * 42;
      g.beginPath();
      g.moveTo(x, wainTop + 4);
      g.lineTo(x, wainTop + 22);
      g.stroke();
    }
    // side wall
    g.fillStyle = WALL_SIDE;
    g.beginPath();
    g.moveTo(base0.x - TILE_W / 2, base0.y - 4);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y + 12);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y + 12 - wallH);
    g.lineTo(base0.x - TILE_W / 2, base0.y - wallH);
    g.closePath();
    g.fill();
    g.fillStyle = WAINSCOT;
    g.beginPath();
    g.moveTo(base0.x - TILE_W / 2, base0.y - 26);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y - 8);
    g.lineTo(leftEnd.x - TILE_W / 2, leftEnd.y + 8);
    g.lineTo(base0.x - TILE_W / 2, base0.y - 4);
    g.closePath();
    g.fill();
    // window with sky on side wall
    const wy = base0.y - 56;
    const wx0 = base0.x - TILE_W / 2 + 16;
    g.fillStyle = "#3d2e20";
    g.fillRect(wx0 - 3, wy - 3, 64, 46);
    const sky = g.createLinearGradient(wx0, wy, wx0, wy + 40);
    sky.addColorStop(0, "#8ecdee");
    sky.addColorStop(1, "#d9eef8");
    g.fillStyle = sky;
    g.fillRect(wx0, wy, 58, 40);
    g.fillStyle = "#ffffff";
    g.fillRect(wx0 + 8, wy + 6, 16, 5);
    g.fillRect(wx0 + 32, wy + 16, 20, 6);
    g.fillStyle = "#3d2e20";
    g.fillRect(wx0 + 27, wy, 4, 40);
    g.fillRect(wx0, wy + 19, 58, 3);
    // whiteboard on the back wall (left half)
    const bx = base0.x + 26;
    const by = base0.y - wallH + 14;
    g.fillStyle = "#3d2e20";
    g.fillRect(bx - 3, by - 3, 128, 62);
    g.fillStyle = "#f2f0e4";
    g.fillRect(bx, by, 122, 56);
    g.fillStyle = "#c45c5c";
    g.fillRect(bx + 10, by + 10, 30, 4);
    g.fillStyle = "#5b84c2";
    g.fillRect(bx + 10, by + 22, 46, 4);
    g.fillStyle = "#6aa668";
    g.fillRect(bx + 14, by + 34, 24, 4);
    g.fillStyle = "#e0a458";
    g.fillRect(bx + 66, by + 30, 38, 4);
    // wall clock
    const ckx = rightEnd.x - 90;
    const cky = base0.y - wallH + 22;
    g.fillStyle = "#f2f0e4";
    g.beginPath();
    g.arc(ckx, cky, 13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#4a2e1c";
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = "#22252e";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ckx, cky);
    g.lineTo(ckx, cky - 8);
    g.moveTo(ckx, cky);
    g.lineTo(ckx + 5, cky + 3);
    g.stroke();
    // doors
    doors.forEach((d, i) => {
      const slot = doorSlots(doors.length)[i] || { x: 2 + i * 2 };
      const p = iso(slot.x, 0);
      const dx = p.x - 4;
      const hover = S.hover?.kind === "door" && S.hover.id === d.id;
      g.fillStyle = hover ? "#6e4a2e" : "#5d3d24";
      g.fillRect(dx, p.y - wallH + 14, 48, wallH - 20);
      g.strokeStyle = hover ? "#ffd9a0" : "#3d2412";
      g.lineWidth = 2;
      g.strokeRect(dx + 1, p.y - wallH + 15, 46, wallH - 21);
      g.fillStyle = "#e8c87a";
      g.beginPath();
      g.arc(dx + 38, p.y - wallH / 2 + 10, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hover ? "#fff3d9" : "#f2e6c8";
      g.font = "bold 10px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillText(`#${d.label}`, dx + 24, p.y - wallH + 30);
    });
    // corner plant (fixed decor)
    const corner = iso(COLS - 1, 0);
    drawPlant(g, corner.x + 8, corner.y - 6, 1.1);
  }

  function drawPlant(g, sx, sy, s = 1) {
    g.fillStyle = "#8a5a34";
    g.fillRect(sx - 7 * s, sy - 13 * s, 14 * s, 13 * s);
    g.fillStyle = "#a86e3e";
    g.fillRect(sx - 7 * s, sy - 13 * s, 14 * s, 3 * s);
    g.fillStyle = "#3f7a4a";
    g.fillRect(sx - 11 * s, sy - 26 * s, 8 * s, 14 * s);
    g.fillRect(sx + 3 * s, sy - 29 * s, 8 * s, 17 * s);
    g.fillRect(sx - 3 * s, sy - 33 * s, 7 * s, 21 * s);
    g.fillStyle = "#57a05e";
    g.fillRect(sx - 9 * s, sy - 24 * s, 4 * s, 9 * s);
    g.fillRect(sx + 4 * s, sy - 26 * s, 4 * s, 10 * s);
  }

  function drawShelf(g, sx, sy) {
    drawShadow(g, sx, sy, 16);
    g.fillStyle = "#6b4423";
    g.fillRect(sx - 18, sy - 34, 36, 34);
    g.fillStyle = "#8a5a34";
    g.fillRect(sx - 16, sy - 32, 32, 4);
    g.fillRect(sx - 16, sy - 21, 32, 4);
    g.fillRect(sx - 16, sy - 10, 32, 4);
    const bookCols = ["#c45c5c", "#5b84c2", "#6aa668", "#e0a458", "#b5737c"];
    let bi = 0;
    for (const yy of [sy - 28, sy - 17, sy - 6]) {
      for (let bx = sx - 12; bx < sx + 14; bx += 6) {
        g.fillStyle = bookCols[bi++ % bookCols.length];
        g.fillRect(bx, yy, 5, 8);
      }
    }
  }

  function drawCooler(g, sx, sy) {
    drawShadow(g, sx, sy, 10);
    g.fillStyle = "#3a465c";
    g.fillRect(sx - 8, sy - 18, 16, 18);
    g.fillStyle = "#9fd1ff";
    roundRect(g, sx - 6, sy - 30, 12, 13, 4);
    g.fill();
    g.fillStyle = "#c8e6f5";
    g.fillRect(sx - 4, sy - 28, 8, 5);
    g.fillStyle = "#d8e0e8";
    g.fillRect(sx - 4, sy - 12, 8, 3);
  }

  function drawChair(g, sx, sy, facing) {
    drawShadow(g, sx, sy, 11);
    g.fillStyle = "#5d3d24";
    if (facing === "front") {
      g.fillRect(sx - 9, sy - 14, 18, 5);
    } else if (facing === "back") {
      g.fillRect(sx - 9, sy - 2, 18, 5);
    }
    g.fillStyle = "#7a5a40";
    roundRect(g, sx - 10, sy - 10, 20, 8, 4);
    g.fill();
    g.fillStyle = "#4a2e1c";
    g.fillRect(sx - 9, sy - 2, 4, 6);
    g.fillRect(sx + 5, sy - 2, 4, 6);
  }

  function drawTable(g) {
    const a = iso(TABLE_TILES[0].x - 0.5, TABLE_TILES[0].y);
    const c = iso(TABLE_TILES[3].x + 1.0, TABLE_TILES[3].y);
    const top = a.y - 12;
    const left = a.x - TILE_W / 2 - 4;
    const w = c.x - a.x + TILE_W + 26;
    // legs
    g.fillStyle = "#4a2e1c";
    g.fillRect(left + 6, top + 10, 7, 18);
    g.fillRect(left + w - 13, top + 10, 7, 18);
    g.fillRect(left + w / 2 - 3, top + 12, 7, 18);
    // top slab
    g.fillStyle = "#6b4423";
    roundRect(g, left, top, w, 16, 4);
    g.fill();
    g.fillStyle = "#8a5a34";
    roundRect(g, left, top - 6, w, 9, 4);
    g.fill();
    g.strokeStyle = "#4a2e1c";
    g.lineWidth = 2;
    roundRect(g, left, top - 6, w, 16, 4);
    g.stroke();
    // mugs + notepad
    g.fillStyle = "#f2f0e4";
    g.fillRect(a.x + 30, top - 10, 7, 7);
    g.fillStyle = "#c45c5c";
    g.fillRect(a.x + 74, top - 10, 7, 7);
    g.fillStyle = "#f2f0e4";
    g.fillRect(a.x + 110, top - 9, 14, 8);
  }

  function drawFurniture(g, f, sx, sy, hover) {
    const k = f.kind;
    if (k === "rug") {
      g.fillStyle = hover ? "rgba(224,164,88,0.4)" : "rgba(146,90,74,0.35)";
      g.beginPath();
      g.ellipse(sx, sy + 6, 44, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(90,50,40,0.55)";
      g.lineWidth = 2;
      g.stroke();
      return;
    }
    drawShadow(g, sx, sy, 13);
    if (k === "plant") {
      drawPlant(g, sx, sy + 2, 1);
    } else if (k === "lamp") {
      g.fillStyle = "#4a2e1c";
      g.fillRect(sx - 2, sy - 30, 4, 30);
      g.fillStyle = "#e8c87a";
      g.fillRect(sx - 9, sy - 39, 18, 10);
      const glow = g.createRadialGradient(sx, sy - 4, 4, sx, sy - 4, 38);
      glow.addColorStop(0, "rgba(255,214,150,0.32)");
      glow.addColorStop(1, "rgba(255,214,150,0)");
      g.fillStyle = glow;
      g.beginPath();
      g.ellipse(sx, sy, 34, 18, 0, 0, Math.PI * 2);
      g.fill();
    } else if (k === "sofa") {
      g.fillStyle = "#7a4a68";
      roundRect(g, sx - 28, sy - 20, 56, 18, 6);
      g.fill();
      g.fillStyle = "#93557f";
      roundRect(g, sx - 28, sy - 26, 56, 9, 5);
      g.fill();
      g.fillStyle = "#5d3852";
      g.fillRect(sx - 28, sy - 14, 4, 13);
      g.fillRect(sx + 24, sy - 14, 4, 13);
      g.fillStyle = "#b5737c";
      g.fillRect(sx - 17, sy - 23, 11, 8);
      g.fillRect(sx + 6, sy - 23, 11, 8);
    } else if (k === "shelf") {
      drawShelf(g, sx, sy);
    }
  }

  function drawBubble(g, sx, sy, text, opts = {}) {
    if (!text) return;
    const lines = [];
    let cur = "";
    for (const word of String(text).split(/\s+/)) {
      if ((cur + " " + word).trim().length > 24) {
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
    const w = Math.min(220, Math.max(34, ...out.map((l) => g.measureText(l).width)) + 18);
    const h = 10 + out.length * 14;
    const bx = sx - w / 2;
    const by = sy - h - 30;
    g.fillStyle = "rgba(20,14,8,0.35)";
    roundRect(g, bx + 2, by + 3, w, h, 8);
    g.fill();
    g.fillStyle = "#f6efdd";
    roundRect(g, bx, by, w, h, 8);
    g.fill();
    g.strokeStyle = "#8a6244";
    g.lineWidth = 1.5;
    roundRect(g, bx, by, w, h, 8);
    g.stroke();
    g.beginPath();
    g.moveTo(sx - 5, by + h - 1);
    g.lineTo(sx + 5, by + h - 1);
    g.lineTo(sx, by + h + 7);
    g.closePath();
    g.fillStyle = "#f6efdd";
    g.fill();
    g.fillStyle = "#2b221a";
    g.textAlign = "left";
    out.forEach((line, i) => g.fillText(line, bx + 9, by + 16 + i * 14));
  }

  function entityAt(px, py) {
    let best = null;
    let bestD = 30 * 30;
    for (const m of S.members) {
      const p = iso(m.at.x, m.at.y);
      const dx = p.x - px;
      const dy = p.y - 26 - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { kind: "person", id: m.id, member: m };
      }
    }
    for (const d of S.doors) {
      const p = iso(d.slot.x, 0);
      const dx = p.x - px;
      const dy = p.y - 40 - py;
      const dist = dx * dx + dy * dy;
      if (dist < 40 * 40 && (!best || dist < bestD)) {
        bestD = dist;
        best = { kind: "door", id: d.id };
      }
    }
    if (!best && !S.hold) {
      for (const f of S.furniture) {
        const p = iso(f.x, f.y);
        const dx = p.x - px;
        const dy = p.y - 12 - py;
        if (dx * dx + dy * dy < 26 * 26) return { kind: "furniture", id: f.id, item: f };
      }
    }
    return best;
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function worldFromScreen(px, py) {
    return {
      x: (px - canvas.clientWidth / 2) / S.cam.z + S.cam.x,
      y: (py - canvas.clientHeight / 2) / S.cam.z + S.cam.y,
    };
  }

  function drawMember(g, m, now) {
    const p = iso(m.at.x, m.at.y);
    const busy = m.pose !== "idle";
    const pose = busy ? "type" : "sit";
    const frame = Math.floor(now / (busy ? 210 : 640) + hashFrame(m.id)) % 2;
    drawShadow(g, p.x, p.y + 4, 12);
    drawChair(g, p.x, p.y + 2, m.dir === "back" ? "back" : "front");
    const spr = charSprite(m.look, pose, m.dir, frame);
    g.drawImage(spr, p.x - (SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 12);
    if (busy) {
      // open laptop on the table in front of them
      const lx = p.x + (m.dir === "side-l" ? 18 : m.dir === "side-r" ? -18 : 0);
      const ly = p.y + (m.dir === "front" ? 2 : m.dir === "back" ? 16 : 8);
      g.fillStyle = "#252c3c";
      g.fillRect(lx - 9, ly - 14, 18, 14);
      g.fillStyle = m.pose === "thinking" ? "#d9c6ff" : "#ffe2ad";
      g.fillRect(lx - 7, ly - 12, 14, 10);
      const glow = g.createRadialGradient(lx, ly - 7, 2, lx, ly - 7, 20);
      glow.addColorStop(0, m.pose === "thinking" ? "rgba(180,139,224,0.25)" : "rgba(255,214,150,0.25)");
      glow.addColorStop(1, "rgba(255,214,150,0)");
      g.fillStyle = glow;
      g.fillRect(lx - 20, ly - 24, 40, 38);
    } else {
      // mug
      g.fillStyle = "#f2f0e4";
      g.fillRect(p.x + 10, p.y + 2, 6, 6);
    }
    if (m.pose !== "idle" && POSE_COLORS[m.pose]) {
      g.fillStyle = POSE_COLORS[m.pose];
      g.beginPath();
      g.arc(p.x + SPRITE_W * SCALE / 2 - 2, p.y - SPRITE_H * SCALE + 14, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#141821";
      g.lineWidth = 1.5;
      g.stroke();
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
    const frame = walking ? Math.floor(now / 150) % 4 : Math.floor(now / 640) % 2;
    const p = iso(at.x, at.y);
    drawShadow(g, p.x, p.y + 4, 12);
    const spr = charSprite(y.look, pose, dir, frame);
    const flip = dir === "side" && y.dirX < 0;
    if (flip) {
      g.save();
      g.translate(p.x, 0);
      g.scale(-1, 1);
      g.drawImage(spr, -(SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 10);
      g.restore();
    } else {
      g.drawImage(spr, p.x - (SPRITE_W * SCALE) / 2, p.y - SPRITE_H * SCALE + 10);
    }
  }

  function tick(now) {
    try {
      tickInner(now);
    } catch (err) {
      console.error("floor game error", err);
      try {
        const g = ctx;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "#0d0f15";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = "#ff9a7a";
        g.font = "12px monospace";
        g.fillText("floor error: " + (err && err.message ? err.message : err), 12, 20);
      } catch {}
    }
    requestAnimationFrame(tick);
  }

  function tickInner(now) {
    S.t = now;
    resizeIfNeeded();
    const g = ctx;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#221812");
    bg.addColorStop(1, "#120d09");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.save();
    const cx = W / 2;
    const cy = H / 2;
    g.translate(cx, cy);
    g.scale(S.cam.z, S.cam.z);
    g.translate(-S.cam.x, -S.cam.y);

    // bookshelf + cooler against the back/left walls
    const shelfSpot = iso(1, 0);
    drawShelf(g, shelfSpot.x + 16, shelfSpot.y - 2);
    const coolerSpot = iso(COLS - 2, 0);
    drawCooler(g, coolerSpot.x - 10, coolerSpot.y + 4);

    drawTileFloor(g);
    // window light shaft on the floor
    const shaftBase = iso(2, 3);
    g.fillStyle = "rgba(255,236,180,0.22)";
    g.beginPath();
    g.moveTo(shaftBase.x - 26, shaftBase.y - 40);
    g.lineTo(shaftBase.x + 40, shaftBase.y - 64);
    g.lineTo(shaftBase.x + 96, shaftBase.y + 40);
    g.lineTo(shaftBase.x - 6, shaftBase.y + 92);
    g.closePath();
    g.fill();
    drawWalls(g, S.doors);
    drawTable(g);

    if (S.hover?.kind === "tile") {
      const p = iso(S.hover.x, S.hover.y);
      g.fillStyle = S.hold ? "rgba(224,164,88,0.25)" : "rgba(255,214,150,0.14)";
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      g.lineTo(p.x, p.y + TILE_H);
      g.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      g.closePath();
      g.fill();
    }
    if (S.hold && S.hover?.kind === "tile") {
      const p = iso(S.hover.x, S.hover.y);
      g.globalAlpha = 0.6;
      drawFurniture(g, { kind: S.hold }, p.x, p.y + TILE_H / 2, true);
      g.globalAlpha = 1;
    }

    const drawables = [];
    for (const f of S.furniture) {
      const p = iso(f.x, f.y);
      drawables.push({
        depth: f.x + f.y,
        draw: () => drawFurniture(g, f, p.x, p.y + TILE_H / 2, S.hover?.kind === "furniture" && S.hover.id === f.id),
      });
    }
    for (const m of S.members) {
      drawables.push({ depth: m.at.x + m.at.y + 0.1, draw: () => drawMember(g, m, now) });
    }
    drawables.push({ depth: S.you.at.x + S.you.at.y + 0.2, draw: () => drawYou(g, now) });
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.draw();

    const vig = g.createRadialGradient(S.cam.x, S.cam.y - 20, 90, S.cam.x, S.cam.y, Math.max(W, H) / S.cam.z);
    vig.addColorStop(0, "rgba(255,214,150,0.06)");
    vig.addColorStop(1, "rgba(10,6,4,0.5)");
    g.fillStyle = vig;
    g.fillRect(S.cam.x - W, S.cam.y - H, W * 2, H * 2);

    g.restore();

    g.save();
    g.translate(cx, cy);
    g.scale(S.cam.z, S.cam.z);
    g.translate(-S.cam.x, -S.cam.y);
    for (const m of S.members) {
      const p = iso(m.at.x, m.at.y);
      const b = S.bubbles.get(m.id);
      if (b && b.text) {
        const age = now - b.t0;
        const typed = Math.floor((age / 1000) * 30);
        if (age < b.keepMs) drawBubble(g, p.x, p.y - 52, b.text, { typed });
      } else if (m.pose !== "idle" && m.activityShort) {
        drawBubble(g, p.x, p.y - 52, m.activityShort, { typed: 1e9 });
      }
      g.font = "bold 10px ui-monospace, monospace";
      g.textAlign = "center";
      const label = (m.lead ? "★ " : "@") + m.name;
      const tw = g.measureText(label).width;
      g.fillStyle = "rgba(20,14,8,0.72)";
      roundRect(g, p.x - tw / 2 - 5, p.y + 10, tw + 10, 15, 7);
      g.fill();
      g.fillStyle = m.lead ? "#ffd9a0" : "#e6d9c4";
      g.fillText(label, p.x, p.y + 21);
    }
    const yp = iso(S.you.at.x, S.you.at.y);
    g.font = "bold 10px ui-monospace, monospace";
    g.textAlign = "center";
    const yw = g.measureText("you").width;
    g.fillStyle = "rgba(20,14,8,0.72)";
    roundRect(g, yp.x - yw / 2 - 5, yp.y + 10, yw + 10, 15, 7);
    g.fill();
    g.fillStyle = "#9fd1ff";
    g.fillText("you", yp.x, yp.y + 21);
    g.restore();

    requestAnimationFrame(tick);
  }

  canvas.addEventListener("pointerdown", (e) => {
    const pt = toCanvas(e);
    S.dragging = { x0: pt.x, y0: pt.y, camx: S.cam.x, camy: S.cam.y, moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  });
  canvas.addEventListener("pointermove", (e) => {
    const pt = toCanvas(e);
    if (S.dragging) {
      const dx = pt.x - S.dragging.x0;
      const dy = pt.y - S.dragging.y0;
      if (Math.abs(dx) + Math.abs(dy) > 6) S.dragging.moved = true;
      if (S.dragging.moved) {
        userMoved = true;
        S.cam.x = S.dragging.camx - dx / S.cam.z;
        S.cam.y = S.dragging.camy - dy / S.cam.z;
      }
      return;
    }
    const w = worldFromScreen(pt.x, pt.y);
    const t = screenToTile(w.x, w.y);
    S.hover = entityAt(w.x, w.y);
    if (!S.hover && inRoom(t.x, t.y)) S.hover = { kind: "tile", x: t.x, y: t.y };
    canvas.style.cursor =
      S.hover?.kind === "person" || S.hover?.kind === "door" ? "pointer" : S.hold ? "copy" : "default";
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
    userMoved = true;
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
  fitFloor(true);
  requestAnimationFrame(tick);
  window.addEventListener("resize", resizeIfNeeded);

  return {
    setState(next) {
      const memberIds = (next.members ?? []).map((m) => m.id);
      const seats = SEATS;
      S.members = (next.members ?? []).map((m, i) => {
        const seat = seats[i % seats.length];
        return {
          ...m,
          at: { x: seat.x, y: seat.y },
          dir: seat.dir,
          pose: m.pose || "idle",
          activityShort:
            (m.activity || "").length > 30 ? `${m.activity.slice(0, 28)}…` : m.activity || "",
        };
      });
      S.doors = (next.doors ?? []).map((d, i) => ({ ...d, slot: doorSlots(next.doors.length)[i] }));
      S.furniture = next.furniture ?? [];
      S.mode = memberIds.length ? "channel" : "desk";
      if (next.you) {
        const moved = JSON.stringify(next.you.look) !== JSON.stringify(S.you.look);
        S.you.look = next.you.look || {};
        if (next.you.home && !S.you.path) {
          const target = next.you.home;
          if (S.you.at.x !== target.x || S.you.at.y !== target.y) this.walkTo(target, false);
        }
        if (moved) S.you.face = "front";
      }
      S.roomLabel = next.roomLabel ?? S.roomLabel;
    },
    walkTo(tile, instant) {
      if (!inRoom(tile.x, tile.y)) return;
      const from = { x: Math.round(S.you.at.x), y: Math.round(S.you.at.y) };
      const blocked = buildBlocked({
        members: S.members.map((m) => ({ x: m.at.x, y: m.at.y })),
        furniture: [...S.furniture, ...TABLE_TILES],
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
      const clean = String(text).replace(/\s+/g, " ").trim().slice(0, 140);
      const prev = S.bubbles.get(id);
      if (prev && clean.startsWith(prev.text)) {
        S.bubbles.set(id, { text: clean, t0: prev.t0, keepMs: 7000 });
      } else {
        S.bubbles.set(id, { text: clean, t0: performance.now(), keepMs: 7000 });
      }
    },
    setHold(kind) {
      S.hold = kind || "";
    },
    debugState() {
      return {
        members: S.members.map((m) => ({ id: m.id, at: m.at, pose: m.pose })),
        you: { at: S.you.at, path: Boolean(S.you.path) },
        furniture: S.furniture,
        doors: S.doors,
      };
    },
    debugBubble(id) {
      const b = S.bubbles.get(id);
      return b ? b.text : "";
    },
    debugWorldToScreen(wx, wy) {
      const p = iso(wx, wy);
      return { x: (p.x - S.cam.x) * S.cam.z + canvas.clientWidth / 2, y: (p.y - S.cam.y) * S.cam.z + canvas.clientHeight / 2 };
    },
    focus() {
      userMoved = false;
      fitFloor(true);
    },
  };
}
