"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLATFORM_TRACKS, blockState } from "@/lib/mapModel";

const S = 1 / 20; // metres → scene units
const DEPT_HEX = { tms: 0x2e6b4b, smms: 0x1d5a96, tdms: 0x9a5f0c };
const TRACTION_HEX = { D: 0x2b2b28, E: 0x8a1a2d, H: 0x3a4a5c };

function labelSprite(text, { size = 28, color = "#1b1b19", bg = "rgba(255,255,255,0.92)", scale = 1 } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `500 ${size}px "IBM Plex Sans", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  c.width = w * 2;
  c.height = h * 2;
  ctx.scale(2, 2);
  ctx.font = `500 ${size}px "IBM Plex Sans", sans-serif`;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 6);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false })
  );
  const px = 0.0009 * scale; // fraction of viewport height per canvas px
  sp.scale.set(w * px, h * px, 1);
  sp.renderOrder = 10;
  return sp;
}

export default function Map3D({ network, blocks, trains, ghosts, t }) {
  const mount = useRef(null);
  const live = useRef({ blocks, trains, ghosts, t });
  useEffect(() => {
    live.current = { blocks, trains, ghosts, t };
  }, [blocks, trains, ghosts, t]);

  useEffect(() => {
    const el = mount.current;
    const [bx0, by0, bx1, by1] = network.bounds;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    const toV = (x, y, h = 0) => new THREE.Vector3((x - cx) * S, h, -(y - cy) * S);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f3ef);
    scene.fog = new THREE.Fog(0xf3f3ef, 2600, 5200);

    const camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);
    const j1 = network.junctions.find((j) => j.id === "JN_1")?.pos || [cx, cy];
    const j2 = network.junctions.find((j) => j.id === "JN_2")?.pos || [cx, cy];
    const focus = toV((j1[0] + j2[0]) / 2, (j1[1] + j2[1]) / 2);
    camera.position.set(focus.x - 260, 430, focus.z + 520);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 120;
    controls.maxDistance = 4200;
    controls.target.copy(focus);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d9d0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-900, 1400, 700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1500, right: 1500, top: 900, bottom: -900, near: 10, far: 4000 });
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 6000),
      new THREE.MeshStandardMaterial({ color: 0xeceee6, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(6000, 60, 0xdcdcd4, 0xe4e4dd);
    grid.position.y = 0.05;
    scene.add(grid);

    // ---------- Track ----------
    const ballastMat = new THREE.MeshStandardMaterial({ color: 0xc9c7bd, roughness: 1 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x55554f, metalness: 0.6, roughness: 0.4 });
    const platMat = new THREE.MeshStandardMaterial({ color: 0xdedcd3, roughness: 0.9 });
    const sleeperGeo = new THREE.BoxGeometry(2.2, 0.9, 13);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x8b8173, roughness: 1 });
    const segs = [];
    const sectionMid = {};

    Object.entries(network.sections).forEach(([id, s]) => {
      for (let i = 0; i < s.shape.length - 1; i++) {
        const a = toV(...s.shape[i]);
        const b = toV(...s.shape[i + 1]);
        segs.push({ id, a, b });
      }
      const pts = s.shape;
      const m = pts[Math.floor((pts.length - 1) / 2)];
      const n = pts[Math.min(pts.length - 1, Math.floor((pts.length - 1) / 2) + 1)];
      sectionMid[id] = { a: toV(...m), b: toV(...n), shape: pts };
    });

    const trackGroup = new THREE.Group();
    let sleeperCount = 0;
    segs.forEach(({ a, b }) => (sleeperCount += Math.floor(a.distanceTo(b) / 7)));
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
    sleepers.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let si = 0;

    segs.forEach(({ id, a, b }) => {
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const ballast = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 2.4, 20), ballastMat);
      ballast.position.set(mid.x, 1.2, mid.z);
      ballast.rotation.y = -ang;
      ballast.receiveShadow = true;
      trackGroup.add(ballast);
      [-4.2, 4.2].forEach((off) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.9), railMat);
        rail.position.set(mid.x - Math.sin(ang) * off, 3.4, mid.z + Math.cos(ang) * off);
        rail.rotation.y = -ang;
        rail.castShadow = true;
        trackGroup.add(rail);
      });
      const n = Math.floor(len / 7);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        dummy.position.set(a.x + (b.x - a.x) * f, 2.6, a.z + (b.z - a.z) * f);
        dummy.rotation.set(0, -ang, 0);
        dummy.updateMatrix();
        sleepers.setMatrixAt(si++, dummy.matrix);
      }
      if (PLATFORM_TRACKS.has(id.split("_")[0])) {
        const plat = new THREE.Mesh(new THREE.BoxGeometry(len, 4, 12), platMat);
        plat.position.set(mid.x - Math.sin(ang) * 19, 2, mid.z + Math.cos(ang) * 19);
        plat.rotation.y = -ang;
        plat.castShadow = plat.receiveShadow = true;
        trackGroup.add(plat);
      }
    });
    trackGroup.add(sleepers);
    scene.add(trackGroup);

    // Stations, junctions, track labels
    network.stations.forEach((s) => {
      if (!s.pos) return;
      const p = toV(s.pos[0], s.pos[1]);
      const shelter = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      shelter.position.set(p.x, 6, p.z - 32);
      shelter.castShadow = true;
      scene.add(shelter);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(26, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0x0ea5e9 }));
      roof.position.set(p.x, 12.8, p.z - 32);
      scene.add(roof);
      const lab = labelSprite(s.name, { size: 26 });
      lab.position.set(p.x, 40, p.z - 32);
      scene.add(lab);
    });
    network.junctions.forEach((j) => {
      if (!j.pos) return;
      const p = toV(j.pos[0], j.pos[1]);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 22), new THREE.MeshStandardMaterial({ color: 0x33332f }));
      mast.position.set(p.x, 11, p.z + 18);
      scene.add(mast);
      const lab = labelSprite(j.id.replace("_", " "), { size: 20, color: "#52524c" });
      lab.position.set(p.x, 30, p.z + 18);
      scene.add(lab);
    });
    network.tracks.forEach((tr) => {
      const m = sectionMid[`${tr.id}_S${Math.ceil(tr.sections / 2)}`];
      if (!m) return;
      const lab = labelSprite(tr.id, { size: 20, color: "#7d7d76", bg: null });
      lab.position.set(m.a.x, 10, m.a.z - 20);
      scene.add(lab);
    });

    // ---------- Blocks ----------
    const blockObjs = {};
    const buildBlocks = () => {
      Object.values(blockObjs).forEach((o) => scene.remove(o.group));
      live.current.blocks.forEach((b) => {
        const s = network.sections[b.loc];
        if (!s) return;
        const a = toV(...s.shape[0]);
        const e = toV(...s.shape[s.shape.length - 1]);
        const len = a.distanceTo(e);
        const mid = a.clone().add(e).multiplyScalar(0.5);
        const ang = Math.atan2(e.z - a.z, e.x - a.x);
        const color = DEPT_HEX[b.dept] ?? 0x52524c;
        const group = new THREE.Group();
        const zoneMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.2, roughness: 0.8 });
        const zone = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 26), zoneMat);
        zone.position.set(mid.x, 2.9, mid.z);
        zone.rotation.y = -ang;
        group.add(zone);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(len, 16, 26)),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })
        );
        edges.position.set(mid.x, 8, mid.z);
        edges.rotation.y = -ang;
        group.add(edges);
        // Barriers at both ends
        const barriers = new THREE.Group();
        [a, e].forEach((p) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 30), new THREE.MeshStandardMaterial({ color: 0xb42318 }));
          bar.position.set(p.x, 9, p.z);
          bar.rotation.y = -ang;
          bar.castShadow = true;
          barriers.add(bar);
          [-13, 13].forEach((off) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 9), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            post.position.set(p.x - Math.sin(ang) * off, 4.5, p.z + Math.cos(ang) * off);
            barriers.add(post);
          });
        });
        group.add(barriers);
        // Crew hut in the middle
        const hut = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 8), new THREE.MeshStandardMaterial({ color }));
        hut.position.set(mid.x - Math.sin(ang) * 24, 4, mid.z + Math.cos(ang) * 24);
        hut.castShadow = true;
        group.add(hut);
        const lab = labelSprite(`${b.loc.replace("_", " ")}`, { size: 20, color: "#fff", bg: `#${color.toString(16).padStart(6, "0")}` });
        lab.position.set(mid.x, 30, mid.z);
        group.add(lab);
        scene.add(group);
        blockObjs[b.id] = { group, zoneMat, edges, barriers, hut, lab };
      });
    };
    buildBlocks();
    let blockKey = JSON.stringify(live.current.blocks.map((b) => [b.id, b.loc, b.start, b.end]));

    // ---------- Trains ----------
    const trainObjs = {};
    const makeTrain = (tr, ghost) => {
      const g = new THREE.Group();
      const color = ghost ? 0x1b1b19 : TRACTION_HEX[tr.traction] ?? 0x2b2b28;
      const bodyMat = ghost
        ? new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(46, 11, 11), bodyMat);
      body.position.y = 9.5;
      body.castShadow = !ghost;
      g.add(body);
      if (!ghost) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 11.4), new THREE.MeshStandardMaterial({ color: 0xf2e6e8 }));
        cab.position.set(20.5, 11, 0);
        g.add(cab);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(46.2, 1.6, 11.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        stripe.position.y = 7.5;
        g.add(stripe);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xb42318, emissive: 0xb42318, emissiveIntensity: 1.2 })
        );
        lamp.position.set(0, 18.5, 0);
        lamp.visible = false;
        g.add(lamp);
        g.userData.lamp = lamp;
        const lab = labelSprite(`${tr.trainId}`, { size: 22 });
        lab.position.set(0, 30, 0);
        g.add(lab);
      }
      scene.add(g);
      return g;
    };

    const syncTrains = () => {
      const { trains, ghosts } = live.current;
      const seen = new Set();
      [...trains.map((x) => [x, false]), ...(ghosts || []).map((x) => [x, true])].forEach(([tr, ghost]) => {
        seen.add(tr.key);
        let g = trainObjs[tr.key];
        if (!g) g = trainObjs[tr.key] = makeTrain(tr, ghost);
        const p = toV(tr.x, tr.y);
        g.position.set(p.x, 0, p.z);
        g.rotation.y = Math.atan2(tr.dy, tr.dx);
        if (g.userData.lamp) g.userData.lamp.visible = tr.status === "held";
      });
      Object.keys(trainObjs).forEach((k) => {
        if (!seen.has(k)) {
          scene.remove(trainObjs[k]);
          delete trainObjs[k];
        }
      });
    };

    const syncBlocks = () => {
      const { blocks, t } = live.current;
      const key = JSON.stringify(blocks.map((b) => [b.id, b.loc, b.start, b.end]));
      if (key !== blockKey) {
        buildBlocks();
        blockKey = key;
      }
      blocks.forEach((b) => {
        const o = blockObjs[b.id];
        if (!o) return;
        const st = blockState(b, t);
        const active = st === "active";
        o.zoneMat.opacity = active ? 0.85 : st === "done" ? 0.08 : 0.22;
        o.edges.visible = active || st === "upcoming" || st === "pending";
        o.edges.material.opacity = active ? 0.9 : 0.35;
        o.barriers.visible = active;
        o.hut.visible = active;
        o.lab.visible = active;
      });
    };

    // ---------- Loop ----------
    const resize = () => {
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 520;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf;
    const tick = () => {
      syncBlocks();
      syncTrains();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => {
          mm.map?.dispose?.();
          mm.dispose?.();
        });
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [network]);

  return <div ref={mount} className="w-full h-[560px] cursor-grab active:cursor-grabbing" aria-label="3D network view" />;
}
