import places from './places.json';
import { createAtlasScene } from './renderer.js';

export function mountAtlas(hero, signal, showFinalPose, showFallback) {
  const stage = hero.querySelector('.art-stage');
  const canvas = stage.querySelector('canvas');
  const visual = hero.querySelector('.visual');
  const tip = visual.querySelector('.site-tip');
  const keys = visual.querySelector('.site-keys');
  const playback = hero.querySelector('[data-atlas-playback]');
  const status = hero.querySelector('[data-atlas-status]');
  const buttons = new Map();
  const names = {};
  const byKind = ['praxis', 'klinik', 'apotheke', 'pflege', 'rettung', 'zahn'].map((kind) =>
    places.filter((place) => place.kind === kind).map((place) => place.id),
  );
  for (const place of places) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.site = place.id;
    button.setAttribute('aria-pressed', 'false');
    names[place.id] = place.label + ' · ' + place.region;
    button.textContent = names[place.id];
    buttons.set(place.id, button);
  }
  keys.replaceChildren(...buttons.values());
  keys.inert = true;
  const listen = (element, type, callback) => element.addEventListener(type, callback, { signal });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const state = { time: 0, focus: null, orbitX: 0, orbitY: 0 };
  const fingers = new Set();
  const scene = createAtlasScene(canvas, hero);
  listen(canvas, 'webglcontextlost', showFallback);
  const duration = scene.duration;
  let ready = false,
    visible = false,
    running = false,
    origin = 0,
    frame = 0;
  let drag = null,
    pointer = null,
    hot = null;

  function unlocked() {
    return ready && !running && state.time >= duration;
  }

  function pickAt(x, y) {
    const box = stage.getBoundingClientRect();
    const localX = x - box.left,
      localY = y - box.top;
    let nearest = null,
      best = 1;
    for (const [id, p] of Object.entries(scene.points())) {
      if (!p.visible) continue;
      const distance = Math.hypot(localX - p.x, localY - p.y) / Math.max(15, p.radius);
      if (distance <= best) {
        nearest = id;
        best = distance;
      }
    }
    return nearest;
  }

  function updateTip() {
    hot = unlocked() && !drag && !fingers.size && pointer ? pickAt(pointer.x, pointer.y) : null;
    stage.dataset.hot = String(Boolean(hot));
    const id = hot || state.focus;
    if (!unlocked() || !id || drag || fingers.size) {
      tip.hidden = true;
      return;
    }
    const site = scene.points()[id];
    if (!site || !site.visible) {
      tip.hidden = true;
      return;
    }
    tip.textContent = names[id];
    tip.hidden = false;
    const box = stage.getBoundingClientRect(),
      parent = visual.getBoundingClientRect();
    const x = box.left - parent.left + site.x,
      y = box.top - parent.top + site.y;
    tip.style.left = clamp(x + site.radius + 6, 5, parent.width - tip.offsetWidth - 5) + 'px';
    tip.style.top = clamp(y - tip.offsetHeight / 2, 5, parent.height - tip.offsetHeight - 5) + 'px';
  }

  function paint() {
    if (!ready) return;
    scene.render(state);
    const exposure = clamp((state.time - 4.35) / 1.7, 0, 1);
    stage.style.setProperty('--map-opacity', (exposure * exposure * (3 - 2 * exposure)).toFixed(5));
    stage.dataset.unlocked = String(unlocked());
    updateTip();
  }

  function label() {
    const locked = !unlocked();
    if (keys.inert !== locked) keys.inert = locked;
    const action = running ? 'pause' : state.time < duration ? 'play' : 'replay';
    const text = { pause: 'Flug anhalten', play: 'Weiterfliegen', replay: 'Flug wiederholen' }[action];
    playback.dataset.action = action;
    playback.setAttribute('aria-label', text);
    playback.querySelector('span').textContent = text;
  }

  function clearGesture() {
    const captured = [...fingers];
    fingers.clear();
    drag = pointer = hot = null;
    tip.hidden = true;
    stage.dataset.hot = stage.dataset.drag = 'false';
    for (const id of captured) if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
  }

  function request() {
    if (ready && running && visible && !frame) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    if (!ready || !running || !visible) return;
    state.time = clamp((now - origin) / 1000, 0, duration);
    if (state.time >= duration) {
      running = false;
      label();
    }
    paint();
    request();
  }

  function selectSite(id) {
    if (!unlocked()) return;
    const previous = state.focus;
    state.focus = id && id !== previous ? id : null;
    if (previous) buttons.get(previous).setAttribute('aria-pressed', 'false');
    if (state.focus) buttons.get(state.focus).setAttribute('aria-pressed', 'true');
    status.textContent = state.focus ? names[state.focus] : '';
    paint();
  }

  function play(restart) {
    clearGesture();
    if (restart) {
      if (state.focus) selectSite(null);
      Object.assign(state, { time: 0, focus: null, orbitX: 0, orbitY: 0 });
    }
    running = true;
    origin = performance.now() - state.time * 1000;
    paint();
    label();
    request();
  }

  function activatePlayback() {
    if (!ready) return;
    if (!running) {
      play(state.time >= duration);
      return;
    }
    state.time = clamp((performance.now() - origin) / 1000, 0, duration);
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    paint();
    label();
  }

  listen(stage, 'pointerdown', (e) => {
    if (!unlocked() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    fingers.add(e.pointerId);
    pointer = null;
    if (fingers.size === 1 && e.isPrimary) {
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        ox: state.orbitX,
        oy: state.orbitY,
        moved: false,
      };
    } else {
      drag = null;
      stage.dataset.drag = 'false';
    }
    stage.setPointerCapture(e.pointerId);
    updateTip();
  });

  listen(stage, 'pointermove', (e) => {
    if (!unlocked()) return;
    if (!drag || drag.id !== e.pointerId) {
      if (e.pointerType !== 'touch' && !fingers.size) {
        pointer = { x: e.clientX, y: e.clientY };
        updateTip();
      }
      return;
    }
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    stage.dataset.drag = 'true';
    state.orbitX = clamp(drag.ox + dx / (stage.clientWidth * 0.36), -1, 1);
    state.orbitY = clamp(drag.oy - dy / (stage.clientHeight * 0.38), -1, 1);
    paint();
  });

  function release(e, cancelled) {
    if (!fingers.delete(e.pointerId)) return;
    const tap = !cancelled && drag?.id === e.pointerId && !drag.moved;
    drag = null;
    stage.dataset.drag = 'false';
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (tap) selectSite(pickAt(e.clientX, e.clientY));
    else updateTip();
  }
  listen(stage, 'pointerup', (e) => release(e, false));
  listen(stage, 'pointercancel', (e) => release(e, true));
  listen(stage, 'lostpointercapture', (e) => release(e, true));
  listen(stage, 'pointerleave', () => {
    pointer = null;
    updateTip();
  });

  listen(stage, 'keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ') activatePlayback();
    else if (!unlocked()) return;
    else if (e.key === 'Escape' || e.key === 'Home') {
      pointer = null;
      state.orbitX = 0;
      state.orbitY = 0;
      selectSite(null);
    } else if (e.key === 'Enter' && hot) selectSite(hot);
    else if (/^[1-6]$/.test(e.key)) {
      const group = byKind[Number(e.key) - 1];
      selectSite(group[(group.indexOf(state.focus) + 1) % group.length]);
    } else if (e.key.startsWith('Arrow')) {
      pointer = null;
      state.orbitX = clamp(state.orbitX + ({ ArrowLeft: -0.34, ArrowRight: 0.34 }[e.key] || 0), -1, 1);
      state.orbitY = clamp(state.orbitY + ({ ArrowUp: 0.34, ArrowDown: -0.34 }[e.key] || 0), -1, 1);
      paint();
    } else return;
    e.preventDefault();
  });

  listen(playback, 'click', activatePlayback);
  for (const button of buttons.values())
    listen(button, 'click', () => {
      pointer = null;
      selectSite(button.dataset.site);
    });

  function finalPose() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    state.time = duration;
    paint();
    label();
  }
  listen(motion, 'change', () => {
    if (ready && motion.matches) finalPose();
  });
  const observer = new ResizeObserver(() => {
    if (ready && visible) {
      scene.resize();
      paint();
    }
  });
  function setVisible(next) {
    if (!ready || next === visible) return;
    visible = next;
    if (visible) {
      scene.resize();
      origin = performance.now() - state.time * 1000;
      paint();
      request();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      clearGesture();
    }
  }
  function dispose() {
    ready = false;
    clearGesture();
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.dispose();
    // A fresh canvas can acquire its own context when the home view reopens.
    canvas.replaceWith(canvas.cloneNode(false));
    keys.replaceChildren();
    status.textContent = '';
    stage.tabIndex = -1;
  }
  return {
    ready: scene.ready.then(() => {
      if (signal.aborted) return;
      ready = true;
      hero.dataset.renderer = 'webgl';
      stage.tabIndex = 0;
      observer.observe(stage);
      observer.observe(visual);
      scene.resize();
      if (motion.matches || showFinalPose) finalPose();
      else play(true);
    }),
    setVisible,
    dispose,
  };
}
