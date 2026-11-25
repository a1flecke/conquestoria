#!/usr/bin/env python3
"""Local-only interactive Sign-Off Studio for the Nano Banana sprite pipeline.

Serves a self-contained HTML review & sign-off UI on 127.0.0.1:<port> so the owner can:
  - inspect every animation state (idle, walk 1/4/loop, attack, hurt, defeat, work) at 1x and 0.25x
  - compare the new unit side-by-side against a recent shipped unit of the same family at the same scale/tint
  - inspect all 4 damage tiers, wounded walks, 6 faction colours, and the 36-150px size strip
  - inspect raw source sheets (a..e) and rig-review.png cut lines
  - regenerate any single sheet with a free-text feedback note (and optional cascade from a new master)
  - click "Sign Off & Ship to Game" to run export, finalize provenance, and wire all game/test/ledger files
"""
from __future__ import annotations

import json
import secrets
import threading
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

STUDIO_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nano Banana Sprite Sign-Off Studio</title>
<style>
  :root {
    --bg: #f3efe6; --card: #fffdf8; --ink: #2b2620; --muted: #6d6556; --line: #ddd4c2;
    --accent: #8a3b1f; --ok: #256d3c; --ok-bg: #e2f5e8; --warn: #8a5a00; --warn-bg: #fff3d6;
    --err: #a32020; --err-bg: #fde8e8; --btn: #efe6d3; --btn-hover: #e4d6b9;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1b1814; --card: #25211b; --ink: #efe8da; --muted: #a79d89; --line: #3b352b;
      --accent: #e09a68; --ok: #67d38a; --ok-bg: #173322; --warn: #f2c56b; --warn-bg: #3a2f14;
      --err: #f28b82; --err-bg: #3d1c1c; --btn: #353026; --btn-hover: #463f31;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header.bar {
    position: sticky; top: 0; z-index: 20; background: var(--card); border-bottom: 1px solid var(--line);
    padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
  }
  .title-block h1 { font-size: 1.25rem; margin: 0; }
  .title-block .sub { font-size: .85rem; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  main { max-width: 1220px; margin: 0 auto; padding: 16px 20px 64px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-top: 16px; }
  h2 { font-size: 1.05rem; margin: 0 0 10px; }
  .badge { display: inline-block; font-size: .8rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
  .badge.ok { background: var(--ok-bg); color: var(--ok); }
  .badge.warn { background: var(--warn-bg); color: var(--warn); }
  .badge.err { background: var(--err-bg); color: var(--err); }
  button {
    font: inherit; border: 1px solid var(--line); background: var(--btn); color: var(--ink);
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--btn-hover); }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  button.approve { background: var(--ok); color: #fff; border-color: transparent; font-weight: 600; }
  button.primary { background: var(--accent); color: #fff; border-color: transparent; }
  input[type="text"] {
    font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--ink); width: 100%;
  }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin: 10px 0; }
  label { display: inline-flex; gap: 8px; align-items: center; }
  .swatches { display: inline-flex; gap: 6px; }
  .swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--line); padding: 0; }
  .swatch[aria-pressed="true"] { border-color: var(--ink); transform: scale(1.1); }
  .mapwrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--line); background: #8fbf6a; }
  canvas { display: block; }
  .split { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start; }
  @media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
  .sheets { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
  .tile { background: #8fbf6a; border-radius: 10px; padding: 8px; border: 1px solid var(--line); }
  .tile canvas { width: 100%; height: auto; }
  .tile .cap { background: var(--card); color: var(--ink); border-radius: 6px; padding: 4px 8px; margin-top: 6px; font-size: .85rem; }
  .sheet-card { border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .sheet-card img { width: 100%; max-height: 260px; object-fit: contain; border-radius: 8px; background: #222; }
  .tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  @media (max-width: 640px) { .tiers { grid-template-columns: repeat(2, 1fr); } }
  .status-banner {
    margin-top: 12px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--card); font-size: .9rem; white-space: pre-wrap;
  }
  .status-banner.ok { background: var(--ok-bg); color: var(--ok); border-color: transparent; }
  .status-banner.err { background: var(--err-bg); color: var(--err); border-color: transparent; }
  .muted { color: var(--muted); font-size: .9rem; }
  ul.findings { margin: 4px 0 0 18px; padding: 0; font-size: .85rem; }
</style>
</head>
<body>
<header class="bar">
  <div class="title-block">
    <h1 id="title">Nano Banana Sprite Sign-Off Studio</h1>
    <div id="subtitle" class="sub">Loading...</div>
  </div>
  <div class="actions">
    <span id="budgetBadge" class="badge ok">Checking...</span>
    <button id="btnApproveShip" class="approve">Sign Off &amp; Ship to Game</button>
    <button id="btnApproveOnly">Export Only (No Wiring)</button>
    <button id="btnClose">Save Draft &amp; Exit</button>
  </div>
</header>
<main>
  <div id="banner" class="status-banner" hidden></div>

  <div class="split">
    <section class="card">
      <h2>Live Hex-Map Preview</h2>
      <div class="controls" id="actControls">
        <button data-act="walk1" data-role="walk">Walk 1 hex</button>
        <button data-act="walk4" data-role="walk">Walk 4 hexes</button>
        <button data-act="walkloop" data-role="walk">Walk in place</button>
        <button data-act="attack" data-role="attack">Attack</button>
        <button data-act="hit" data-role="hurt">Hurt</button>
        <button data-act="work" data-role="work">Work</button>
        <button data-act="defeat" data-role="death">Defeat</button>
        <button data-act="idle" data-role="idle">Idle</button>
        <button class="primary" id="seq">Play all</button>
        <button id="reset">Reset</button>
      </div>
      <div class="row">
        <label>Health <input id="health" type="range" min="0" max="100" value="100"> <strong id="healthOut">100</strong></label>
        <span id="tierline" class="muted">Tier 0 (healthy)</span>
        <label>Speed <select id="speed"><option value="1">1x (game)</option><option value="0.25">0.25x (inspect)</option></select></label>
        <label>Height <select id="size"><option value="48">48 px</option><option value="72" selected>72 px</option><option value="110">110 px</option></select></label>
      </div>
      <div class="row">
        <span>Faction colour:</span>
        <div class="swatches" id="swatches"></div>
        <input id="custom" type="color" value="#1d4a8c" aria-label="Custom faction colour">
      </div>
      <div class="mapwrap"><canvas id="map"></canvas></div>
      <div id="actStatus" class="muted" style="margin-top:8px"></div>
    </section>

    <section class="card" id="parityCard">
      <h2>Parity Check vs Recent Shipped Sprite</h2>
      <p id="paritySub" class="muted"></p>
      <div class="mapwrap"><canvas id="parityCanvas"></canvas></div>
      <h2 style="margin-top:16px">Size Check (36 to 150 px)</h2>
      <div class="mapwrap"><canvas id="sizes"></canvas></div>
    </section>
  </div>

  <section class="card">
    <h2>Damage Tiers (Standing + Wounded Walk)</h2>
    <div class="tiers" id="tiers"></div>
    <div class="grid" id="tierwalkgrid" style="margin-top:12px"></div>
  </section>

  <section class="card">
    <h2>Source Sheets &amp; One-Click Regeneration</h2>
    <p class="muted">If any sheet looks off, type what to fix and click Regenerate. Nano Banana will redraw, auto-scan, auto-probe, and rebuild the preview automatically.</p>
    <div class="sheets" id="sheets"></div>
  </section>

  <section class="card" id="rigCard" hidden>
    <h2>Rig Calibration Review</h2>
    <img id="rigImg" alt="Rig calibration cut lines" style="max-width:100%; border-radius:8px; border:1px solid var(--line);">
  </section>
</main>

<script>
const TOKEN = __STUDIO_TOKEN__;
const FACTIONS = [
  ['Rome (blue)', '#1d4a8c'], ['Carthage (red)', '#b8252a'], ['Egypt (gold)', '#c99728'],
  ['Persia (purple)', '#6c3483'], ['Greece (teal)', '#1b7a75'], ['Celt (green)', '#2f7a3e']
];
const ROLES = {
  idle: ['idle'], walk: ['walkrig', 'move', 'walk'], attack: ['attack', 'fire'],
  hurt: ['hit'], death: ['defeat', 'wreck', 'sinking', 'down'], work: ['work']
};
const $ = (id) => document.getElementById(id);

let state = null;
let sheet = null, mask = null, M = null;
let paritySheet = null, parityMask = null, PM = null;
let tint = '#1d4a8c', speed = 1, figureH = 72, health = 100;
let cur = { row: 'idle', start: 0, loop: true, hold: false };
let actor = { col: 1, x: 0, y: 0, fromX: 0, toX: 0, t0: 0, dur: 0, moving: false };
let seqId = 0, animFrame = null, loopCtx = [], busy = false;
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');

function showBanner(msg, kind = '') {
  const b = $('banner');
  b.hidden = !msg;
  b.className = 'status-banner' + (kind ? ' ' + kind : '');
  b.textContent = msg;
}

function setBusy(flag) {
  busy = flag;
  for (const el of document.querySelectorAll('button')) el.disabled = flag;
}

function loadImg(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Failed to load ' + url));
    im.src = url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
  });
}

function tierOf(hp) { return hp > 75 ? 0 : hp > 50 ? 1 : hp > 25 ? 2 : 3; }
function has(st) { return Boolean(M && M.states && M.states[st]); }
function hasRole(role) { return (ROLES[role] || []).some(has); }
function rowOf(role) {
  const base = (ROLES[role] || []).find(has) || 'idle';
  if (role === 'walk' && M.tiers && M.tiers[base]) {
    const group = M.tiers[base];
    const t = tierOf(health);
    return group[Math.min(t + 1, group.length - 1)] || base;
  }
  return base;
}

function drawSpriteFrame(ctx, manifest, sh, mk, stateName, frameIdx, cx, by, scale) {
  const st = manifest.states[stateName];
  if (!st || !sh || !mk) return;
  const CW = manifest.cellWidth, CH = manifest.cellHeight, BASE = manifest.baseline;
  const sx = (frameIdx % st.frames) * CW, sy = st.row * CH;
  off.width = CW; off.height = CH;
  offCtx.clearRect(0, 0, CW, CH);
  offCtx.drawImage(sh, sx, sy, CW, CH, 0, 0, CW, CH);
  offCtx.globalCompositeOperation = 'source-atop';
  offCtx.fillStyle = tint;
  // Build tinted copy via mask
  const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(sh, sx, sy, CW, CH, 0, 0, CW, CH);
  tctx.globalCompositeOperation = 'multiply';
  tctx.fillStyle = tint;
  tctx.fillRect(0, 0, CW, CH);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(mk, sx, sy, CW, CH, 0, 0, CW, CH);
  offCtx.globalCompositeOperation = 'source-over';
  offCtx.drawImage(tmp, 0, 0);
  ctx.drawImage(off, cx - (CW / 2) * scale, by - BASE * scale, CW * scale, CH * scale);
}

function drawHexBg(ctx, w, h, family) {
  ctx.fillStyle = family === 'naval' ? '#3d7bb3' : family === 'aircraft' ? '#86bfe8' : '#8fbf6a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  const step = 96;
  for (let x = 48; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 12); ctx.lineTo(x + 42, 36); ctx.lineTo(x + 42, h - 36);
    ctx.lineTo(x, h - 12); ctx.lineTo(x - 42, h - 36); ctx.lineTo(x - 42, 36);
    ctx.closePath(); ctx.stroke();
  }
}

function playState(role, opts = {}) {
  const row = rowOf(role);
  cur = { row, start: performance.now(), loop: opts.loop ?? Boolean(M.states[row]?.loop), hold: Boolean(opts.hold) };
  $('actStatus').textContent = `Playing: ${role} (${row}, ${M.states[row]?.frames || 1} frames @ ${M.states[row]?.fps || 4} fps)`;
}

function frameIndexFor(st, start, now, loop, hold) {
  const elapsed = Math.max(0, (now - start) / 1000) * speed;
  const idx = Math.floor(elapsed * (st.fps || 4));
  if (loop) return idx % st.frames;
  return Math.min(idx, st.frames - 1);
}

function layoutMap() {
  const cv = $('map');
  cv.width = 720; cv.height = 240;
  actor.y = 186;
  actor.x = 120 + actor.col * 104;
}

function moveCols(delta, durMs) {
  const targetCol = (actor.col + delta) > 5 ? 1 : actor.col + delta;
  actor.fromX = actor.x; actor.toX = 120 + targetCol * 104;
  actor.col = targetCol; actor.t0 = performance.now(); actor.dur = durMs / speed; actor.moving = true;
  playState('walk', { loop: true });
}

function drawFrameLoop(now) {
  if (!M || !sheet) return;
  const cv = $('map'), ctx = cv.getContext('2d');
  drawHexBg(ctx, cv.width, cv.height, M.family);
  if (actor.moving) {
    const p = Math.min(1, (now - actor.t0) / Math.max(1, actor.dur));
    actor.x = actor.fromX + (actor.toX - actor.fromX) * p;
    if (p >= 1) { actor.moving = false; playState('idle', { loop: true }); }
  }
  const k = figureH / (M.restHeight || 140);
  const st = M.states[cur.row] || M.states.idle;
  let fIdx = frameIndexFor(st, cur.start, now, cur.loop, cur.hold);
  let rowName = cur.row;
  if (rowName === 'idle' && has('damage') && tierOf(health) > 0) {
    rowName = 'damage'; fIdx = tierOf(health);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(actor.x, actor.y + 2, 26 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  drawSpriteFrame(ctx, M, sheet, mask, rowName, fIdx, actor.x, actor.y, k);

  // Tier walk loops
  for (const item of loopCtx) {
    const lctx = item.ctx;
    lctx.clearRect(0, 0, M.cellWidth, M.cellHeight);
    lctx.fillStyle = M.family === 'naval' ? '#3d7bb3' : M.family === 'aircraft' ? '#86bfe8' : '#8fbf6a';
    lctx.fillRect(0, 0, M.cellWidth, M.cellHeight);
    const lst = M.states[item.row];
    if (lst) {
      const fi = Math.floor((now / 1000) * speed * lst.fps) % lst.frames;
      drawSpriteFrame(lctx, M, sheet, mask, item.row, fi, M.cellWidth / 2, M.baseline, 1);
    }
  }

  // Parity side-by-side canvas
  const pcv = $('parityCanvas');
  const pctx = pcv.getContext('2d');
  drawHexBg(pctx, pcv.width, pcv.height, M.family);
  const pk = 110 / (M.restHeight || 140);
  const walkRow = rowOf('walk');
  const wSt = M.states[walkRow] || M.states.idle;
  const wFi = Math.floor((now / 1000) * speed * (wSt.fps || 8)) % wSt.frames;
  drawSpriteFrame(pctx, M, sheet, mask, walkRow, wFi, 100, 168, pk);
  pctx.fillStyle = '#1d2418'; pctx.font = 'bold 12px system-ui, sans-serif'; pctx.textAlign = 'center';
  pctx.fillText(M.id + ' (NEW)', 100, 192);
  if (PM && paritySheet) {
    const refK = 110 / (PM.restHeight || 140);
    const refWalk = (ROLES.walk.find((r) => PM.states[r])) || 'idle';
    const rSt = PM.states[refWalk];
    const rFi = Math.floor((now / 1000) * speed * (rSt.fps || 8)) % rSt.frames;
    drawSpriteFrame(pctx, PM, paritySheet, parityMask, refWalk, rFi, 255, 168, refK);
    pctx.fillText(PM.id + ' (SHIPPED)', 255, 192);
  }
  animFrame = requestAnimationFrame(drawFrameLoop);
}

function drawStaticPanels() {
  // Damage tiers
  const tiersHost = $('tiers'); tiersHost.textContent = '';
  const bands = ['Tier 0 (76-100 HP)', 'Tier 1 (51-75 HP)', 'Tier 2 (26-50 HP)', 'Tier 3 (0-25 HP)'];
  for (let t = 0; t < 4; t++) {
    const div = document.createElement('div'); div.className = 'tile';
    const cv = document.createElement('canvas'); cv.width = M.cellWidth; cv.height = M.cellHeight;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = M.family === 'naval' ? '#3d7bb3' : M.family === 'aircraft' ? '#86bfe8' : '#8fbf6a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (has('damage')) drawSpriteFrame(ctx, M, sheet, mask, 'damage', t, M.cellWidth / 2, M.baseline, 1);
    const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = bands[t];
    div.append(cv, cap); tiersHost.append(div);
  }
  // Tier walk loops
  loopCtx = [];
  const twHost = $('tierwalkgrid'); twHost.textContent = '';
  const wKey = ROLES.walk.find(has);
  const group = M.tiers && wKey && M.tiers[wKey];
  if (group) {
    for (let t = 0; t < 4; t++) {
      const row = group[Math.min(t + 1, group.length - 1)];
      const div = document.createElement('div'); div.className = 'tile';
      const cv = document.createElement('canvas'); cv.width = M.cellWidth; cv.height = M.cellHeight;
      const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = `Walk Tier ${t} (${row})`;
      div.append(cv, cap); twHost.append(div);
      loopCtx.push({ ctx: cv.getContext('2d'), row });
    }
  }
  // Size check
  const sizes = [36, 48, 72, 100, 140];
  const scv = $('sizes'); scv.width = 360; scv.height = 176;
  const sctx = scv.getContext('2d');
  drawHexBg(sctx, scv.width, scv.height, M.family);
  let x = 28;
  sctx.font = '11px system-ui, sans-serif'; sctx.textAlign = 'center';
  for (const h of sizes) {
    const k = h / (M.restHeight || 140);
    const slot = Math.max(40, h * 0.65);
    drawSpriteFrame(sctx, M, sheet, mask, 'idle', 0, x + slot / 2, 152, k);
    sctx.fillStyle = '#1d2418'; sctx.fillText(h + 'px', x + slot / 2, 168);
    x += slot + 12;
  }
}

function renderSheetCards() {
  const host = $('sheets'); host.textContent = '';
  for (const s of state.sheets) {
    const card = document.createElement('div'); card.className = 'sheet-card';
    const head = document.createElement('div');
    head.style.display = 'flex'; head.style.justifyContent = 'space-between'; head.style.alignItems = 'center';
    const h3 = document.createElement('strong'); h3.textContent = `${s.file}.png — ${s.role}`;
    const badge = document.createElement('span');
    badge.className = 'badge ' + (s.errors.length ? 'err' : s.warnings.length ? 'warn' : 'ok');
    badge.textContent = s.errors.length ? `${s.errors.length} err` : s.warnings.length ? `${s.warnings.length} warn` : 'QC pass';
    head.append(h3, badge);

    const img = document.createElement('img');
    img.src = `/api/original/${encodeURIComponent(s.file)}?v=${Date.now()}`;
    img.alt = s.role;

    const meta = document.createElement('div'); meta.className = 'muted';
    const tintPct = s.tintFraction != null ? ` · tint ${Math.round(s.tintFraction * 100)}%` : '';
    meta.textContent = `${s.size ? s.size[0] + 'x' + s.size[1] : '?'}${tintPct} · aspect ${s.aspectRatio}`;

    const ul = document.createElement('ul'); ul.className = 'findings';
    for (const e of s.errors) { const li = document.createElement('li'); li.textContent = `ERROR [${e[0]}]: ${e[1]}`; ul.append(li); }
    for (const w of s.warnings) { const li = document.createElement('li'); li.textContent = `WARN [${w[0]}]: ${w[1]}`; ul.append(li); }

    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Optional note for Nano Banana (e.g. make shield larger)...';

    const row = document.createElement('div'); row.className = 'controls'; row.style.marginBottom = '0';
    const btn = document.createElement('button'); btn.textContent = `Regenerate ${s.file}.png`;
    let cascadeChk = null;
    if (s.isMaster) {
      const lbl = document.createElement('label'); lbl.style.fontSize = '.85rem';
      cascadeChk = document.createElement('input'); cascadeChk.type = 'checkbox'; cascadeChk.checked = true;
      lbl.append(cascadeChk, document.createTextNode('Also redraw b..e from new master'));
      row.append(btn, lbl);
    } else {
      row.append(btn);
    }
    btn.addEventListener('click', () => regenerateSheet(s.file, input.value, cascadeChk ? cascadeChk.checked : false));
    card.append(head, img, meta, ul, input, row);
    host.append(card);
  }
}

async function apiPost(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function regenerateSheet(fileKey, note, cascade) {
  setBusy(true);
  showBanner(`Calling Nano Banana to regenerate ${fileKey}.png${cascade ? ' (plus dependent sheets)' : ''}...`);
  try {
    const res = await apiPost('/api/regenerate', { file: fileKey, note, cascade });
    await refreshAll();
    showBanner(res.message || `Regenerated ${fileKey}.png and rebuilt preview.`, 'ok');
  } catch (err) {
    showBanner('Regeneration failed: ' + err.message, 'err');
  } finally {
    setBusy(false);
  }
}

async function approve(wire) {
  setBusy(true);
  showBanner(wire ? 'Exporting, finalizing provenance, and wiring unit into Conquestoria...' : 'Exporting and finalizing provenance...');
  try {
    const res = await apiPost('/api/approve', { wire });
    showBanner(res.message, 'ok');
    $('btnApproveShip').textContent = 'Signed Off';
  } catch (err) {
    showBanner('Sign-off failed: ' + err.message, 'err');
    setBusy(false);
  }
}

async function refreshAll() {
  const res = await fetch('/api/state?v=' + Date.now());
  state = await res.json();
  M = state.manifest;
  $('title').textContent = `Sign-Off Studio: ${state.unitName} (${state.unitId})`;
  $('subtitle').textContent = `Family: ${state.family} · Model: ${state.model} · Originals: ${state.originalsDir}`;
  const pf = state.preflight;
  const bb = $('budgetBadge');
  if (pf && pf.ok) {
    bb.className = 'badge ok';
    bb.textContent = `Export OK · ${pf.diskKb}/${pf.maxDiskKb} KB · ${pf.decodedMib}/${pf.maxDecodedMib} MiB`;
  } else {
    bb.className = 'badge err';
    bb.textContent = 'Export blocked: ' + (pf ? pf.error : 'unknown');
  }
  [sheet, mask] = await Promise.all([loadImg('/api/preview/sheet.png'), loadImg('/api/preview/mask.png')]);
  if (state.parity) {
    PM = state.parity.manifest;
    $('paritySub').textContent = `Comparing ${M.id} (left) against shipped ${PM.id} (right) at identical height and tint.`;
    [paritySheet, parityMask] = await Promise.all([
      loadImg('/api/parity/sheet.png'), loadImg('/api/parity/mask.png')
    ]);
  } else {
    $('paritySub').textContent = 'No shipped exemplar available for this family yet.';
  }
  if (state.hasRigReview) {
    $('rigCard').hidden = false;
    $('rigImg').src = '/api/rig-review.png?v=' + Date.now();
  }
  for (const b of document.querySelectorAll('[data-role]')) b.hidden = !hasRole(b.dataset.role);
  $('parityCanvas').width = 360; $('parityCanvas').height = 205;
  layoutMap();
  drawStaticPanels();
  renderSheetCards();
  playState('idle', { loop: true });
  if (!animFrame) animFrame = requestAnimationFrame(drawFrameLoop);
}

// Wire controls once
const sw = $('swatches');
for (const [label, col] of FACTIONS) {
  const b = document.createElement('button');
  b.className = 'swatch'; b.style.background = col; b.title = label; b.setAttribute('aria-label', label);
  b.setAttribute('aria-pressed', String(col === tint));
  b.addEventListener('click', () => {
    tint = col; $('custom').value = col;
    for (const s of sw.querySelectorAll('.swatch')) s.setAttribute('aria-pressed', String(s === b));
    drawStaticPanels();
  });
  sw.append(b);
}
$('custom').addEventListener('input', (e) => { tint = e.target.value; drawStaticPanels(); });
$('speed').addEventListener('change', (e) => { speed = Number(e.target.value); });
$('size').addEventListener('change', (e) => { figureH = Number(e.target.value); });
$('health').addEventListener('input', (e) => {
  health = Number(e.target.value); $('healthOut').textContent = String(health);
  $('tierline').textContent = `Tier ${tierOf(health)}`;
});
for (const b of document.querySelectorAll('[data-act]')) {
  b.addEventListener('click', () => {
    seqId++;
    const a = b.dataset.act;
    if (a === 'walk1') moveCols(1, 260);
    else if (a === 'walk4') moveCols(4, 850);
    else if (a === 'walkloop') { actor.moving = false; playState('walk', { loop: true }); }
    else if (a === 'idle') { actor.moving = false; playState('idle', { loop: true }); }
    else { actor.moving = false; playState(a === 'hit' ? 'hurt' : a === 'defeat' ? 'death' : a, { loop: false, hold: true }); }
  });
}
$('seq').addEventListener('click', async () => {
  const id = ++seqId;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
  moveCols(2, 520); await wait(650); if (id !== seqId) return;
  if (hasRole('attack')) { playState('attack', { loop: false, hold: true }); await wait(1300); if (id !== seqId) return; }
  if (hasRole('hurt')) { playState('hurt', { loop: false, hold: true }); await wait(800); if (id !== seqId) return; }
  if (hasRole('death')) { playState('death', { loop: false, hold: true }); await wait(1400); if (id !== seqId) return; }
  playState('idle', { loop: true });
});
$('reset').addEventListener('click', () => {
  seqId++; actor.moving = false; actor.col = 1; layoutMap();
  $('health').value = 100; health = 100; $('healthOut').textContent = '100'; $('tierline').textContent = 'Tier 0';
  playState('idle', { loop: true });
});
$('btnApproveShip').addEventListener('click', () => approve(true));
$('btnApproveOnly').addEventListener('click', () => approve(false));
$('btnClose').addEventListener('click', async () => {
  setBusy(true);
  try { await apiPost('/api/close', {}); showBanner('Draft preserved. You can close this browser tab.', 'ok'); }
  catch (err) { showBanner(err.message, 'err'); setBusy(false); }
});

refreshAll().catch((err) => showBanner('Failed to initialize studio: ' + err.message, 'err'));
</script>
</body>
</html>
"""


class StudioOutcome:
    """Result returned when the Sign-Off Studio finishes."""

    def __init__(self) -> None:
        self.decision: str = 'closed'  # 'shipped' | 'exported' | 'closed'
        self.details: dict = {}


def start_review_server(
    *,
    get_state: Callable[[], dict],
    preview_dir: Path,
    originals_dir: Path,
    rig_review_path: Path,
    parity_preview_dir: Path | None,
    on_regenerate: Callable[[str, str, bool], dict],
    on_approve: Callable[[bool], dict],
    port: int = 0,
    open_browser: bool = True,
) -> tuple[ThreadingHTTPServer, str, str, StudioOutcome]:
    """Start the local Sign-Off Studio HTTP server and return `(server, url, token, outcome)`."""
    token = secrets.token_hex(16)
    outcome = StudioOutcome()
    html_bytes = STUDIO_HTML.replace('__STUDIO_TOKEN__', json.dumps(token)).encode('utf-8')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:  # quiet stdout
            return

        def _send_bytes(self, body: bytes, content_type: str, status: int = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, obj: dict, status: int = HTTPStatus.OK) -> None:
            self._send_bytes(json.dumps(obj).encode('utf-8'), 'application/json; charset=utf-8', status)

        def _serve_file(self, path: Path) -> None:
            if not path.is_file():
                self._send_json({'ok': False, 'error': 'not found'}, HTTPStatus.NOT_FOUND)
                return
            self._send_bytes(path.read_bytes(), 'image/png')

        def do_GET(self) -> None:
            parsed = urllib.parse.urlsplit(self.path)
            path = parsed.path
            if path in ('/', '/index.html'):
                self._send_bytes(html_bytes, 'text/html; charset=utf-8')
                return
            if path == '/api/state':
                self._send_json(get_state())
                return
            if path == '/api/preview/sheet.png':
                self._serve_file(preview_dir / 'sheet.png')
                return
            if path == '/api/preview/mask.png':
                self._serve_file(preview_dir / 'mask.png')
                return
            if path == '/api/parity/sheet.png' and parity_preview_dir:
                self._serve_file(parity_preview_dir / 'sheet.png')
                return
            if path == '/api/parity/mask.png' and parity_preview_dir:
                self._serve_file(parity_preview_dir / 'mask.png')
                return
            if path == '/api/rig-review.png':
                self._serve_file(rig_review_path)
                return
            if path.startswith('/api/original/'):
                name = urllib.parse.unquote(path.removeprefix('/api/original/'))
                if not name or '/' in name or '\\' in name or '..' in name:
                    self._send_json({'ok': False, 'error': 'invalid file name'}, HTTPStatus.BAD_REQUEST)
                    return
                candidate = originals_dir / f'{name}.png'
                self._serve_file(candidate)
                return
            self._send_json({'ok': False, 'error': 'not found'}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if self.headers.get('X-Studio-Token') != token:
                self._send_json({'ok': False, 'error': 'invalid studio token'}, HTTPStatus.FORBIDDEN)
                return
            length = int(self.headers.get('Content-Length') or '0')
            raw = self.rfile.read(length) if length > 0 else b'{}'
            try:
                body = json.loads(raw.decode('utf-8')) if raw else {}
            except ValueError:
                self._send_json({'ok': False, 'error': 'invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path == '/api/regenerate':
                fkey = str(body.get('file') or '').strip()
                note = str(body.get('note') or '').strip()
                cascade = bool(body.get('cascade', False))
                try:
                    res = on_regenerate(fkey, note, cascade)
                    self._send_json({'ok': True, **res})
                except Exception as exc:
                    self._send_json({'ok': False, 'error': str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return

            if parsed.path == '/api/approve':
                wire = bool(body.get('wire', True))
                try:
                    res = on_approve(wire)
                    outcome.decision = 'shipped' if wire else 'exported'
                    outcome.details = res
                    self._send_json({'ok': True, **res})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                except Exception as exc:
                    self._send_json({'ok': False, 'error': str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return

            if parsed.path == '/api/close':
                outcome.decision = 'closed'
                self._send_json({'ok': True, 'message': 'Review session closed.'})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return

            self._send_json({'ok': False, 'error': 'unknown endpoint'}, HTTPStatus.NOT_FOUND)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    actual_port = server.server_address[1]
    url = f'http://127.0.0.1:{actual_port}/'
    if open_browser:
        webbrowser.open(url)
    return server, url, token, outcome
