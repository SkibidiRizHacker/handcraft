"use client";

import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

/* ================= TYPES ================= */
type Vec2 = { x: number; y: number };

type Item = {
  id: number;
  x: number;
  y: number;
  r: number;
  type: string;
  draggingBy: number | null;
  lastTouched: number;
};

type Pointer = {
  hand: number;
  pinch: boolean;
  closed: boolean;
  release: boolean;
  pos: Vec2;
};

type Ghost = { type: string; hand: number };

/* ================= HELPERS ================= */
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const keyOf = (a: string, b: string) => [a, b].sort().join("+");

/* ================= DATA ================= */
const COLORS: Record<string, string> = {
  Fire: "#ff7043",
  Water: "#4fc3f7",
  Earth: "#8d6e63",
  Air: "#eeeeee",
  Steam: "#cfd8dc",
  Lava: "#ff3b30",
  Mud: "#6d4c41",
  Cloud: "#ffffff",
  Stone: "#9e9e9e",
  Metal: "#b0bec5",
  Sand: "#f4d03f",
  Glass: "#aed6f1",
};

const RECIPES = new Map<string, string>([
  [keyOf("Fire", "Water"), "Steam"],
  [keyOf("Fire", "Earth"), "Lava"],
  [keyOf("Water", "Earth"), "Mud"],
  [keyOf("Steam", "Air"), "Cloud"],
  [keyOf("Earth", "Earth"), "Stone"],
  [keyOf("Stone", "Fire"), "Metal"],
  [keyOf("Sand", "Fire"), "Glass"],
]);

const BASE_ITEMS = ["Fire", "Water", "Earth", "Air"];

/* ================= HAND BONES ================= */
const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
];

/* ================= MAIN ================= */
export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);

  const itemsRef = useRef<Item[]>([]);
  const nextId = useRef(1);

  const ghostRef = useRef<Ghost | null>(null);
  const lastHandPos = useRef<Record<number, Vec2>>({});
  const pinchDist = useRef<Record<number, number>>({});

  const [discovered, setDiscovered] = useState<string[]>(BASE_ITEMS);
  const menuScroll = useRef({ offset: 0, lastY: 0, active: false });

  useEffect(() => {
    let alive = true;

    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
        numHands: 2,
        runningMode: "VIDEO",
      });

      const v = videoRef.current!;
      v.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      await v.play();
      loop();
    }

    function spawn(type: string, x: number, y: number, w: number, h: number) {
      itemsRef.current.push({
        id: nextId.current++,
        x: clamp(x, 40, w - 40),
        y: clamp(y, 40, h - 40),
        r: 34,
        type,
        draggingBy: null,
        lastTouched: performance.now(),
      });
      if (!discovered.includes(type)) setDiscovered(d => [type, ...d]);
    }

    function loop() {
      if (!alive) return;
      const v = videoRef.current!;
      const c = canvasRef.current!;
      const ctx = c.getContext("2d")!;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      c.width = w;
      c.height = h;

      /* CAMERA */
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-w, 0);
      ctx.drawImage(v, 0, 0, w, h);
      ctx.restore();

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, w, h);

      /* HAND TRACKING */
      let res = null;
      const now = performance.now();
      if (now - lastDetectRef.current > 33) {
        res = landmarkerRef.current!.detectForVideo(v, now);
        lastDetectRef.current = now;
      }

      const pointers: Pointer[] = [];

      res?.landmarks?.forEach((hand, hi) => {
        const pts = hand.map(p => ({ x: (1 - p.x) * w, y: p.y * h }));
        const index = pts[8];
        const thumb = pts[4];
        const middle = pts[12];

        lastHandPos.current[hi] = index;

        const d1 = dist(index, thumb);
        const d2 = dist(middle, thumb);

        const closed = d1 < 55 && d2 < 65;
        const pinch = d1 < 55;
        const release = d1 > 90;

        ctx.strokeStyle = closed ? "#00ff9c" : "#00bcd4";
        ctx.lineWidth = 2;
        HAND_BONES.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        });

        pts.forEach(p => {
          ctx.fillStyle = closed ? "#00ff9c" : "#00bcd4";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        pointers.push({ hand: hi, pinch, closed, release, pos: index });
      });

      /* LEFT MENU */
      const menuW = 160;
      ctx.fillStyle = "rgba(20,20,28,0.9)";
      ctx.fillRect(0, 0, menuW, h);

      pointers.forEach(p => {
        const pos = lastHandPos.current[p.hand];
        if (!pos || pos.x > menuW) return;
        if (!p.pinch) {
          if (!menuScroll.current.active) {
            menuScroll.current.active = true;
            menuScroll.current.lastY = pos.y;
          } else {
            menuScroll.current.offset += pos.y - menuScroll.current.lastY;
            menuScroll.current.lastY = pos.y;
          }
        } else menuScroll.current.active = false;
      });

      const spacing = 70;
      menuScroll.current.offset = clamp(
        menuScroll.current.offset,
        -discovered.length * spacing + h - 60,
        20
      );

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, menuW, h);
      ctx.clip();

      discovered.forEach((t, i) => {
        const cy = 60 + i * spacing + menuScroll.current.offset;
        ctx.fillStyle = COLORS[t];
        ctx.beginPath();
        ctx.arc(menuW / 2, cy, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t, menuW / 2, cy);
      });

      ctx.restore();

      /* MENU DRAG (GHOST) */
      pointers.forEach(p => {
        const pos = lastHandPos.current[p.hand];
        if (!pos) return;

        if (!ghostRef.current && p.pinch && pos.x < menuW) {
          discovered.forEach((t, i) => {
            const cy = 60 + i * spacing + menuScroll.current.offset;
            if (Math.abs(pos.y - cy) < 28) {
              ghostRef.current = { type: t, hand: p.hand };
            }
          });
        }

        if (ghostRef.current?.hand === p.hand) {
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = COLORS[ghostRef.current.type];
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          if (p.release) {
            if (pos.x > menuW + 20)
              spawn(ghostRef.current.type, pos.x, pos.y, w, h);
            ghostRef.current = null;
          }
        }
      });

      /* GRAB (CLOSED HAND ONLY) */
      const items = itemsRef.current;
      pointers.forEach(p => {
        if (ghostRef.current?.hand === p.hand) return;
        const pos = lastHandPos.current[p.hand];
        if (!pos) return;

        const held = items.find(it => it.draggingBy === p.hand);
        if (held) {
          held.x += (clamp(pos.x, held.r, w - held.r) - held.x) * 0.45;
          held.y += (clamp(pos.y, held.r, h - held.r) - held.y) * 0.45;
          held.lastTouched = performance.now();
          if (p.release) held.draggingBy = null;
        } else if (p.closed) {
          for (const it of [...items].reverse()) {
            if (it.draggingBy) continue;
            if (dist(it, pos) < it.r + 24) {
              it.draggingBy = p.hand;
              it.lastTouched = performance.now();
              break;
            }
          }
        }
      });

      /* MERGE */
      const tNow = performance.now();
      const MERGE_GRACE = 350;

      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (dist(a, b) > a.r + b.r - 6) continue;
          if (
            tNow - a.lastTouched > MERGE_GRACE &&
            tNow - b.lastTouched > MERGE_GRACE
          ) continue;

          const out = RECIPES.get(keyOf(a.type, b.type));
          if (!out) continue;

          items.splice(j, 1);
          items.splice(i, 1);
          items.push({
            id: nextId.current++,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            r: 36,
            type: out,
            draggingBy: null,
            lastTouched: tNow,
          });
          if (!discovered.includes(out))
            setDiscovered(d => [out, ...d]);
          break;
        }
      }

      /* DRAW ITEMS */
      items.forEach(it => {
        if (it.draggingBy !== null) {
          ctx.strokeStyle = "#00ffc8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(it.x, it.y, it.r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = COLORS[it.type];
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(it.type, it.x, it.y);
      });

      rafRef.current = requestAnimationFrame(loop);
    }

    init();
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [discovered]);

  return (
    <>
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
}
