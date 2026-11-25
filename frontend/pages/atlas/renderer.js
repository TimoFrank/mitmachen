import * as T from 'three';
import terrain from './terrain.json';
import places from './places.json';
import { buildMarker, makeMarkerLibrary } from './markers.js';

const duration = 8.3;
const extentX = 510,
  extentZ = 665;
const clamp = T.MathUtils.clamp,
  rad = T.MathUtils.degToRad,
  lerp = T.MathUtils.lerp;
function ease(time, start, end) {
  const a = clamp((time - start) / (end - start), 0, 1);
  return a * a * (3 - 2 * a);
}
function flightProgress(time) {
  const u = clamp(time / duration, 0, 1);
  const pull = 1 - (1 - u) ** 1.72;
  return 0.88 * pull + 0.12 * ease(time, 1.2, 5.8);
}

export function createAtlasScene(canvas, hero) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(31.5, 1, 1, 4400);
  const key = new T.DirectionalLight(0xfff5e8, 2.1);
  key.position.set(-340, 680, 340);
  const rim = new T.DirectionalLight(0xd1e4ff, 0.72);
  rim.position.set(320, 230, -380);
  scene.add(key, new T.HemisphereLight(0xf2f6ff, 0x929aae, 1.5), rim);

  const bytes = Uint8Array.from(atob(terrain.heights), (c) => c.charCodeAt(0));
  const alt = new Uint16Array(bytes.buffer);
  const nx = terrain.width,
    nz = terrain.height;
  // Sample the same two triangles as PlaneGeometry. This keeps the upper lip and
  // symbol bases in contact with the exact rendered surface at any camera angle.
  function heightAt(x, z) {
    const gx = clamp((x / extentX + 0.5) * (nx - 1), 0, nx - 1),
      gz = clamp((z / extentZ + 0.5) * (nz - 1), 0, nz - 1);
    const i = Math.min(nx - 2, Math.floor(gx)),
      j = Math.min(nz - 2, Math.floor(gz));
    const u = gx - i,
      v = gz - j,
      k = j * nx + i;
    const a = alt[k],
      b = alt[k + nx],
      c = alt[k + nx + 1],
      d = alt[k + 1];
    return (u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c)) / 256;
  }
  const landGeo = new T.PlaneGeometry(extentX, extentZ, nx - 1, nz - 1);
  landGeo.rotateX(-Math.PI / 2);
  const positions = landGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, alt[i] / 256);
  landGeo.computeVertexNormals();
  const landMat = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.025,
    alphaTest: 0.35,
  });
  const land = new T.Mesh(landGeo, landMat);
  scene.add(land);

  function makeEdge() {
    const vertices = [],
      lift = [],
      colors = [],
      normals = [],
      indices = [];
    const inside = new T.Color('#21345b'),
      top = new T.Color('#344b73'),
      side = new T.Color('#2a3d69'),
      base = new T.Color('#1d2d4d');
    const stationCount = 5;
    for (const ring of terrain.rings) {
      const loop = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.1);
        for (let n = 0; n < steps; n++) {
          const t = n / steps;
          loop.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
        }
      }
      if (loop.length < 3) continue;
      const offset = vertices.length / 3;
      let signedArea = 0,
        perimeter = 0;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i],
          [bx, bz] = ring[(i + 1) % ring.length];
        signedArea += ax * bz - bx * az;
        perimeter += Math.hypot(bx - ax, bz - az);
      }
      const overlap = Math.min(2.75, (0.38 * Math.abs(signedArea)) / perimeter);
      for (let i = 0; i < loop.length; i++) {
        const prev = loop[(i + loop.length - 1) % loop.length],
          next = loop[(i + 1) % loop.length],
          [x, z] = loop[i];
        const lenA = Math.hypot(z - prev[1], x - prev[0]),
          lenB = Math.hypot(next[1] - z, next[0] - x);
        const rawX = (z - prev[1]) / lenA + (next[1] - z) / lenB,
          rawZ = (prev[0] - x) / lenA + (x - next[0]) / lenB;
        const nLen = Math.hypot(rawX, rawZ) || 1,
          ox = rawX / nLen,
          oz = rawZ / nLen;
        const y = heightAt(x, z),
          bottom = y - 5.1 - 0.09 * Math.min(y, 14);
        // The antialiased map texture can cover less than one sample at grazing
        // angles. An opaque return underneath closes the joint with the wall.
        const insideY = heightAt(x - ox * overlap, z - oz * overlap) - 0.22;
        const stations = [
          [-overlap, insideY, 0, 1, inside],
          [-0.12, y - 0.1, 0.35, 0.937, top],
          [0.1, y - 0.36, 0.94, 0.34, side],
          [0.13, bottom + 0.55, 1, 0, base],
          [-0.12, bottom, 0.95, -0.31, base],
        ];
        for (const [radius, height, horiz, vertical, col] of stations) {
          vertices.push(x + ox * radius, height, z + oz * radius);
          lift.push(0, Math.max(0, (y - height) * 0.66), 0);
          normals.push(ox * horiz, vertical, oz * horiz);
          colors.push(col.r, col.g, col.b);
        }
      }
      for (let i = 0; i < loop.length; i++) {
        const a = offset + stationCount * i,
          b = offset + stationCount * ((i + 1) % loop.length);
        for (let j = 0; j < stationCount - 1; j++)
          indices.push(a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.morphTargetsRelative = true;
    geo.morphAttributes.position = [new T.Float32BufferAttribute(lift, 3)];
    geo.setIndex(indices);
    return new T.Mesh(
      geo,
      new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, metalness: 0.1, roughness: 0.61 }),
    );
  }
  const edgeMesh = makeEdge();
  scene.add(edgeMesh);
  let shadowMesh = null;

  // A single translucent silhouette contains ambient falloff and directional
  // contact darkening. Its feathers blend into the page without offset contours.
  function addShadow(image) {
    const shadowWidth = 580,
      shadowHeight = 756,
      pad = 80;
    const surface = document.createElement('canvas');
    surface.width = shadowWidth + 2 * pad;
    surface.height = shadowHeight + 2 * pad;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const layers = [
      [18, 0.39, 5, 8],
      [4.5, 0.46, 1.1, 2],
    ];
    for (const [blur, opacity, dx, dz] of layers) {
      ctx.globalAlpha = opacity;
      ctx.filter = 'blur(' + blur + 'px)';
      ctx.drawImage(image, pad + dx, pad + dz, shadowWidth, shadowHeight);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#24354a';
    ctx.fillRect(0, 0, surface.width, surface.height);
    const map = new T.CanvasTexture(surface);
    map.colorSpace = T.SRGBColorSpace;
    const shadow = new T.Mesh(
      new T.PlaneGeometry((surface.width / shadowWidth) * extentX, (surface.height / shadowHeight) * extentZ),
      new T.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        premultipliedAlpha: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.9, -4.8, 2.3);
    shadow.renderOrder = -2;
    scene.add(shadow);
    shadowMesh = shadow;
  }

  const sites = {};
  const library = makeMarkerLibrary(T);
  for (const place of places) {
    const x = ((place.lon - 5.7) / 9.5 - 0.5) * extentX,
      z = ((55.18 - place.lat) / 8.01 - 0.5) * extentZ;
    const marker = buildMarker(T, place, library);
    marker.group.position.set(x, heightAt(x, z) + 0.27, z);
    scene.add(marker.group);
    marker.group.updateMatrixWorld(true);
    const cameraAnchor = marker.anchor.clone().add(marker.group.position);
    const anchor = marker.anchor.clone().multiplyScalar(marker.group.scale.x).add(marker.group.position);
    sites[place.id] = { marker, cameraAnchor, anchor, place };
  }
  const outline = terrain.rings.flatMap((r) =>
    r.filter((_, i) => i % 2 === 0).map(([x, z]) => new T.Vector3(x, heightAt(x, z), z)),
  );
  const fitDir = new T.Vector3(),
    right = new T.Vector3(),
    screenUp = new T.Vector3(),
    delta = new T.Vector3();
  const fitTarget = new T.Vector3(),
    viewTarget = new T.Vector3(),
    camDir = new T.Vector3(),
    clip = new T.Vector3();
  const pitch = rad(49),
    yaw = rad(13);
  function direction(y, p, v) {
    return v.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  }
  direction(yaw, pitch, fitDir);
  right.crossVectors(new T.Vector3(0, 1, 0), fitDir).normalize();
  screenUp.crossVectors(fitDir, right).normalize();
  let fitDistance = 1100;
  function fit() {
    const tan = Math.tan(rad(camera.fov) / 2);
    const horizontalSpan = matchMedia('(min-width:901px)').matches ? 1.75 : 1.87;
    fitTarget.set(0, 7, 0);
    let distance = 100;
    for (const p of outline) {
      delta.copy(p).sub(fitTarget);
      const along = delta.dot(fitDir);
      distance = Math.max(
        distance,
        along + Math.abs(delta.dot(right)) / (tan * camera.aspect),
        along + Math.abs(delta.dot(screenUp)) / tan,
      );
    }
    for (let pass = 0; pass < 5; pass++) {
      let l = Infinity,
        r = -Infinity,
        b = Infinity,
        t = -Infinity;
      for (const p of outline) {
        delta.copy(p).sub(fitTarget);
        const d = distance - delta.dot(fitDir),
          x = delta.dot(right) / (d * tan * camera.aspect),
          y = delta.dot(screenUp) / (d * tan);
        l = Math.min(l, x);
        r = Math.max(r, x);
        b = Math.min(b, y);
        t = Math.max(t, y);
      }
      fitTarget.addScaledVector(right, (r + l) * 0.5 * distance * tan * camera.aspect);
      fitTarget.addScaledVector(screenUp, (t + b) * 0.5 * distance * tan);
      distance *= Math.max((r - l) / horizontalSpan, (t - b) / 1.87);
    }
    fitDistance = distance;
  }

  const openingSite = sites['praxis-west'];
  const mapFrame = hero.querySelector('.visual');
  let openingScreenX = 0;
  let width = 0,
    height = 0,
    frameHeight = 0,
    loaded = false,
    disposed = false;
  let state = { time: 0, orbitX: 0, orbitY: 0, focus: null };
  function render(next) {
    if (disposed) return;
    if (next) state = { ...state, ...next };
    const time = clamp(state.time || 0, 0, duration);
    const pull = flightProgress(time);
    const sweep = lerp(ease(time, 0, duration), pull, 0.56);
    const departing = 1 - pull;
    const settled = time >= duration;
    const active = settled ? sites[state.focus] : null;
    const fx = settled ? clamp(state.orbitX || 0, -1, 1) : 0,
      fy = settled ? clamp(state.orbitY || 0, -1, 1) : 0;
    const y = yaw - rad(39) * (1 - sweep) + fx * rad(3);
    const p = pitch - rad(13) * departing + fy * rad(1);
    const openingDistance = clamp(fitDistance * 0.125, 113, 125);
    const distance = fitDistance * Math.exp(Math.log(openingDistance / fitDistance) * departing);
    const close = 1 - ease(distance / fitDistance, 0.17, 0.69);
    edgeMesh.morphTargetInfluences[0] = close;
    if (shadowMesh) {
      shadowMesh.position.y = lerp(-4.8, -0.45, close);
      shadowMesh.material.opacity = lerp(0.36, 0.16, close);
    }
    const pan = ease(pull, 0.14, 1);
    viewTarget.copy(openingSite.cameraAnchor).lerp(fitTarget, pan);
    const lead = openingScreenX * distance * Math.tan(rad(camera.fov) / 2) * camera.aspect * (1 - pan);
    viewTarget.x -= Math.cos(y) * lead;
    viewTarget.z += Math.sin(y) * lead;
    for (const item of Object.values(sites)) {
      const elapsed = time - item.place.at;
      const opacity = ease(elapsed, 0, 0.52);
      const pulse = ease(elapsed, 0.04, 0.31) * (1 - ease(elapsed, 0.31, 0.62));
      item.marker.setReveal(opacity, pulse, item === active);
    }
    camera.position.copy(viewTarget).addScaledVector(direction(y, p, camDir), distance);
    camera.near = Math.max(1, distance * 0.006);
    camera.far = distance + 1400;
    camera.lookAt(viewTarget);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (loaded) renderer.render(scene, camera);
  }
  function resize() {
    if (disposed) return;
    const b = canvas.getBoundingClientRect(),
      w = Math.max(1, b.width),
      h = Math.max(1, b.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const heroBox = hero.getBoundingClientRect(),
      focusBox = mapFrame.getBoundingClientRect();
    const fw = Math.max(1, focusBox.width),
      fh = Math.max(1, focusBox.height);
    const offsetX = b.left - focusBox.left,
      offsetY = b.top - focusBox.top,
      view = camera.view;
    if (
      w === width &&
      h === height &&
      renderer.getPixelRatio() === dpr &&
      view?.fullWidth === fw &&
      view.fullHeight === fh &&
      view.offsetX === offsetX &&
      view.offsetY === offsetY
    )
      return;
    openingScreenX = matchMedia('(min-width:901px)').matches
      ? clamp((2 * (heroBox.left + heroBox.width * 0.755 - focusBox.left)) / fw - 1, -0.6, 0.6)
      : 0;
    // The map column defines the optical frame. Extending its frustum across
    // the entire hero preserves the shot while drawing beyond its old boundary.
    camera.setViewOffset(fw, fh, offsetX, offsetY, w, h);
    frameHeight = fh;
    if (w !== width || h !== height || renderer.getPixelRatio() !== dpr) {
      width = w;
      height = h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    }
    fit();
    render();
  }
  function points() {
    const out = {};
    for (const [id, s] of Object.entries(sites)) {
      clip.copy(s.anchor).project(camera);
      const x = ((clip.x + 1) * width) / 2,
        y = ((1 - clip.y) * height) / 2;
      const depth = camera.position.distanceTo(s.anchor);
      out[id] = {
        x,
        y,
        radius: clamp(
          (s.marker.reach * s.marker.group.scale.x * frameHeight) /
            (2 * Math.tan(rad(camera.fov) / 2) * depth),
          7,
          200,
        ),
        visible: clip.z >= -1 && clip.z <= 1 && x >= 0 && x <= width && y >= 0 && y <= height,
      };
    }
    return out;
  }
  const ready = new T.TextureLoader()
    .loadAsync(new URL('./relief.webp', import.meta.url).href)
    .then((map) => {
      if (disposed) {
        map.dispose();
        return;
      }
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      landMat.map = map;
      landMat.needsUpdate = true;
      addShadow(map.image);
      loaded = true;
      render();
    });
  function dispose() {
    if (disposed) return;
    disposed = true;
    const materials = new Set(),
      geometries = new Set(),
      textures = new Set();
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const m of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        materials.add(m);
        for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap']) if (m[k]) textures.add(m[k]);
      }
    });
    textures.forEach((v) => v.dispose());
    geometries.forEach((v) => v.dispose());
    materials.forEach((v) => v.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
  resize();
  return { duration, ready, render, resize, points, dispose };
}
