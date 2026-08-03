import { useEffect, useRef } from 'react';


export function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Palette lue dans la feuille de style (jetons `--net-*`, en triplets RVB) : le
    // canvas compose ses propres alphas à la volée, il lui faut donc les composantes
    // et non des couleurs finies. Relue au changement de thème seulement — jamais par
    // trame, `getComputedStyle` étant bien trop coûteux à 60 images/seconde.
    const readPalette = () => {
      const s = getComputedStyle(document.documentElement);
      const rgb = (name: string, fallback: string) =>
        (s.getPropertyValue(name).trim() || fallback).replace(/\s+/g, ',');
      return {
        link: rgb('--net-link', '28 79 143'),
        halo: rgb('--net-halo', '17 133 254'),
        node: rgb('--net-node', '28 79 143'),
        nodeAlt: rgb('--net-node-alt', '29 122 85'),
        ring: rgb('--net-ring', '17 133 254'),
        ringAlt: rgb('--net-ring-alt', '23 201 100'),
      };
    };
    let palette = readPalette();

    // `hx`/`hy` : le point d'attache du nœud. Un ressort très souple l'y ramène, ce qui
    // borne le rassemblement au voisinage — sans lui, le pointeur finit par ramasser
    // toute la population en un seul tas, et le champ se vide.
    type Pt = { x: number; y: number; hx: number; hy: number; vx: number; vy: number; green: boolean; near: number };
    const LINK = 132; // distance maximale d'un lien entre deux nœuds
    const INFLUENCE = 186; // portée du curseur : rien ne se relie à vous au-delà
    const CORE = 78; // zone intime, tenue vide : on se rassemble autour, pas dessus
    const SEPARATION = 27; // distance personnelle entre deux nœuds
    const HOME_PULL = 0.0002; // ressort de rappel : dosé pour équilibrer l'attraction
    const MAX_SPEED = 1.4;

    let w = 0;
    let h = 0;
    let raf = 0;
    // Intensité du rassemblement : monte quand le curseur entre dans le cadre, retombe
    // quand il en sort — l'attroupement se défait en douceur au lieu de s'éteindre net.
    let power = 0;
    const nodes: Pt[] = [];
    const mouse = { x: 0, y: 0, active: false };
    // Centre lissé : suit le curseur avec un léger retard, ce qui adoucit les à-coups.
    const eye = { x: -1, y: -1 };

    const rnd = () => (Math.random() - 0.5) * 0.32;
    const spawn = (): Pt => {
      const x = Math.random() * w;
      const y = Math.random() * h;
      return { x, y, hx: x, hy: y, vx: rnd(), vy: rnd(), green: Math.random() < 0.24, near: 0 };
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.max(28, Math.min(116, Math.round((w * h) / 13000)));
      while (nodes.length < target) nodes.push(spawn());
      nodes.length = Math.min(nodes.length, target);
      // Cadre rétréci : on redonne un foyer *tiré au hasard* dans le nouveau cadre. Le
      // raboter sur le bord alignerait tous les nœuds sortis le long d'une même arête.
      for (const n of nodes) {
        if (n.hx > w || n.hy > h) {
          n.hx = Math.random() * w;
          n.hy = Math.random() * h;
        }
        if (n.x > w) n.x = n.hx;
        if (n.y > h) n.y = n.hy;
      }
      // Mouvement désactivé : redimensionner efface le canevas, il faut le repeindre.
      if (reduce) draw();
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);

      power += ((mouse.active ? 1 : 0) - power) * 0.035;

      if (mouse.active) {
        // Halo éteint (première venue, ou retour après une sortie) : on se recale d'un
        // coup — sinon le lissage traînerait les liens depuis l'ancienne position.
        if (eye.x < 0 || power < 0.02) {
          eye.x = mouse.x;
          eye.y = mouse.y;
        } else {
          eye.x += (mouse.x - eye.x) * 0.06;
          eye.y += (mouse.y - eye.y) * 0.06;
        }
      }

      // Déplacement + attraction douce vers le curseur.
      for (const n of nodes) {
        if (mouse.active) {
          const dx = eye.x - n.x;
          const dy = eye.y - n.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < INFLUENCE) {
            // Le cœur repousse doucement : on se rassemble *autour* de vous, on ne
            // s'agglutine pas sur vous (un amas au curseur lirait « bug »).
            const f = (1 - d / INFLUENCE) * 0.026 * (d < CORE ? -0.7 : 1);
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
        // Rappel vers le point d'attache : chacun repart chez lui quand vous partez.
        n.vx += (n.hx - n.x) * HOME_PULL;
        n.vy += (n.hy - n.y) * HOME_PULL;
        n.vx *= 0.992;
        n.vy *= 0.992;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp < 0.12) {
          n.vx += (Math.random() - 0.5) * 0.06;
          n.vy += (Math.random() - 0.5) * 0.06;
        } else if (sp > MAX_SPEED) {
          n.vx *= MAX_SPEED / sp;
          n.vy *= MAX_SPEED / sp;
        }
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) { n.x = 0; n.vx = -n.vx; } else if (n.x > w) { n.x = w; n.vx = -n.vx; }
        if (n.y < 0) { n.y = 0; n.vy = -n.vy; } else if (n.y > h) { n.y = h; n.vy = -n.vy; }
        // Proximité au curseur, une fois par trame (1 au centre, 0 à la portée limite).
        const d = Math.hypot(n.x - eye.x, n.y - eye.y);
        n.near = d < INFLUENCE ? 1 - d / INFLUENCE : 0;
      }

      // Liens entre nœuds proches : un murmure (le texte de la page doit toujours
      // gagner), qui se renforce quand les deux extrémités sont près du curseur.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            // Distance personnelle : deux nœuds ne se superposent pas. Sans elle, le
            // rassemblement autour du pointeur se tasse en pâté au lieu de rester une
            // foule dont on distingue les individus.
            if (d < SEPARATION) {
              const push = (1 - d / SEPARATION) * 0.05;
              const ux = (a.x - b.x) / (d || 1);
              const uy = (a.y - b.y) / (d || 1);
              a.vx += ux * push;
              a.vy += uy * push;
              b.vx -= ux * push;
              b.vy -= uy * push;
            }
            // Boost mesuré : près du curseur, c'est le lien *vers vous* qui doit se lire,
            // pas la maille entre voisins (sans quoi l'attroupement devient un gribouillis).
            const lit = Math.min(a.near, b.near) * power;
            const alpha = (0.1 + 0.11 * lit) * (1 - d / LINK);
            ctx!.strokeStyle = `rgba(${palette.link},${alpha.toFixed(3)})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Nappe de lumière autour du curseur : un halo diffus, sans contour.
      if (power > 0.002) {
        const grd = ctx!.createRadialGradient(eye.x, eye.y, 0, eye.x, eye.y, INFLUENCE);
        grd.addColorStop(0, `rgba(${palette.halo},${(0.085 * power).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${palette.halo},0)`);
        ctx!.fillStyle = grd;
        ctx!.beginPath();
        ctx!.arc(eye.x, eye.y, INFLUENCE, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Liens vers vous : réservés à ce qui est à portée.
      for (const n of nodes) {
        if (n.near <= 0) continue;
        ctx!.strokeStyle = `rgba(${palette.link},${(0.42 * n.near * power).toFixed(3)})`;
        ctx!.lineWidth = 1.1;
        ctx!.beginPath();
        ctx!.moveTo(eye.x, eye.y);
        ctx!.lineTo(n.x, n.y);
        ctx!.stroke();
      }

      // Nœuds : discrets au loin, pleins et cerclés d'un halo de présence à portée.
      for (const n of nodes) {
        const lit = n.near * power;
        const r = 1.9 + 1.5 * lit;
        ctx!.globalAlpha = 0.42 + 0.58 * lit;
        ctx!.fillStyle = `rgb(${n.green ? palette.nodeAlt : palette.node})`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx!.fill();
        if (lit > 0.45) {
          ctx!.globalAlpha = (lit - 0.45) * 0.9;
          ctx!.strokeStyle = `rgb(${n.green ? palette.ringAlt : palette.ring})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, r + 3.6, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.globalAlpha = 1;
      }
    }

    function loop() {
      draw();
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= w && mouse.y <= h;
    }
    function onLeave() {
      mouse.active = false;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Bascule clair/sombre : on relit la palette. Sans animation il faut repeindre
    // à la main, la boucle ne le fera pas.
    const themeWatch = new MutationObserver(() => {
      palette = readPalette();
      if (reduce) draw();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onLeave);
    window.addEventListener('blur', onLeave);

    if (reduce) draw();
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="onb-net" aria-hidden="true" />;
}
