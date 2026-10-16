<script lang="ts">
  import { onMount } from 'svelte';

  /** Shown to everyone for ~2s when someone turns 7. Never needs dismissing. */
  let { names, ondone }: { names: string[]; ondone: () => void } = $props();

  const DURATION = 2000;
  const COLORS = ['#f2b134', '#e2553f', '#2f6fd6', '#2a8a3a', '#8a3fb0', '#1f8f8f', '#ffffff'];

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const done = setTimeout(ondone, DURATION);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (reduced || !ctx) return () => clearTimeout(done);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Two bursts from the lower corners, angled up and in.
    const pieces = Array.from({ length: 160 }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      return {
        x: left ? 0 : w,
        y: h * 0.85,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length]!,
      };
    });

    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      // Fade out over the last half second.
      ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION - t) / 500));
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < DURATION) frame = requestAnimationFrame(tick);
    });

    return () => {
      clearTimeout(done);
      cancelAnimationFrame(frame);
    };
  });
</script>

<div class="overlay" aria-live="polite">
  <canvas bind:this={canvas}></canvas>
  <div class="message">
    <p class="big">TURN 7!</p>
    <p class="who">{names.join(' & ')} +15</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    display: grid;
    place-items: center;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .message {
    position: relative;
    text-align: center;
    padding: 0 16px;
    animation: pop 2s ease-out forwards;
  }
  p {
    margin: 0;
  }
  .big {
    font-size: clamp(3rem, 14vw, 7rem);
    font-weight: 900;
    line-height: 1;
    color: var(--gold);
    -webkit-text-stroke: 3px #1d2340;
    paint-order: stroke fill;
    text-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
    transform: rotate(-4deg);
  }
  .who {
    margin-top: 0.5rem;
    font-size: clamp(1.2rem, 5vw, 2rem);
    font-weight: 800;
    color: #fff;
    -webkit-text-stroke: 1.5px #1d2340;
    paint-order: stroke fill;
    text-shadow: 0 3px 12px rgb(0 0 0 / 0.4);
  }
  @keyframes pop {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    15% {
      transform: scale(1.12);
      opacity: 1;
    }
    25% {
      transform: scale(1);
    }
    80% {
      opacity: 1;
    }
    100% {
      transform: scale(1.05);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .message {
      animation: fade 2s linear forwards;
    }
    @keyframes fade {
      0%,
      80% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
  }
</style>
