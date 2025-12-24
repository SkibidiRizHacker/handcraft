"use client";

import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

export default function HandTrackingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrame = 0;
    let lastVideoTime = -1;

    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/hand_landmarker.task",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      setReady(true);

      const video = videoRef.current!;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;

      // Enable webcam
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      // Hand skeleton structure
      const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17],
      ];

      // Glow circle renderer
      function drawGlowCircle(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        r: number,
        color: string
      ) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "transparent");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Draw hand (skeleton + dots)
      function drawHand(
        landmarks: any[],
        color: string,
        canvas: HTMLCanvasElement
      ) {
        const w = canvas.width;
        const h = canvas.height;

        // Skeleton lines
        ctx.lineWidth = 4;
        ctx.strokeStyle = color;

        HAND_CONNECTIONS.forEach(([a, b]) => {
          const p1 = landmarks[a];
          const p2 = landmarks[b];

          ctx.beginPath();
          ctx.moveTo(p1.x * w, p1.y * h);
          ctx.lineTo(p2.x * w, p2.y * h);
          ctx.stroke();
        });

        // Dots + glow
        landmarks.forEach((pt) => {
          const x = pt.x * w;
          const y = pt.y * h;

          drawGlowCircle(ctx, x, y, 12, color + "55");

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

      // Render loop
      async function renderLoop() {
        if (!handLandmarker) return;

        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          const result = await handLandmarker.detectForVideo(
            video,
            video.currentTime * 1000
          );

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // MIRROR MODE: flip the canvas horizontally
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          // Draw flipped video
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Draw flipped hands
          if (result.landmarks) {
            result.landmarks.forEach((landmarks, index) => {
              const color = index === 0 ? "#00FF88" : "#33A1FF"; // green / blue
              drawHand(landmarks, color, canvas);
            });
          }

          ctx.restore();
        }

        animationFrame = requestAnimationFrame(renderLoop);
      }

      renderLoop();
    }

    init();

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black">
      {!ready && (
        <p className="text-white text-lg mb-4">Loading Hand Tracker...</p>
      )}

      <video ref={videoRef} className="hidden" />

      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="border-4 border-green-500 rounded-xl shadow-xl"
      />
    </div>
  );
}
