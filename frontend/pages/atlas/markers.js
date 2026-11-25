// The geometry and artwork stay fixed to the map, including when the camera turns.
const enamels = {
  praxis: { face: '#80cec1', rim: '#569c95', ink: '#123c48' },
  klinik: { face: '#edaaa3', rim: '#b87978', ink: '#592c40' },
  apotheke: { face: '#a9d49d', rim: '#739c70', ink: '#274b3d' },
  pflege: { face: '#c8b2dd', rim: '#9882ac', ink: '#3c3458' },
  rettung: { face: '#edbd85', rim: '#b0895d', ink: '#523529' },
  zahn: { face: '#a3cced', rim: '#7296b7', ink: '#223e64' },
};

function signTexture(T, id) {
  const canvas = document.createElement('canvas');
  const pixelScale = id === 'praxis' ? 12 : 6;
  canvas.width = canvas.height = 64 * pixelScale;
  const c = canvas.getContext('2d');
  c.scale(pixelScale, pixelScale);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = c.fillStyle = '#ffffff';
  const stroke = (d, width) => {
    c.lineWidth = width;
    c.stroke(new Path2D(d));
  };
  const fill = (d) => c.fill(new Path2D(d));
  const dot = (x, y, r) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  if (id === 'klinik') {
    fill('M24 4 H40 V23 H59 V40 H40 V59 H24 V40 H5 V23 H24 Z');
  } else if (id === 'praxis') {
    stroke('M9 9 C7 18 9 28 17 32 Q20 35 24 34 C33 33 39 21 35 9', 5.7);
    stroke('M22 35 V40 C22 52 29 56 38 55 C47 54 51 48 50 37', 5.8);
    stroke('M10 9 L14 10 M31 10 L35 9', 6.9);
    dot(50, 29, 8.2);
    c.globalCompositeOperation = 'destination-out';
    dot(50, 29, 3.6);
  } else if (id === 'apotheke') {
    // Bowl of Hygieia: cup lip, solid bowl, stem and foot, with a snake drinking above it.
    fill('M6 28 H56 C54 36 44 43 35 44 V52 H45 Q48 52 49 57 H14 Q16 52 20 52 H28 V44 C18 42 9 37 6 28 Z');
    stroke('M15 22 C18 19 23 19 30 21 C38 24 48 23 49 16 C50 10 44 6 39 7 C35 8 34 11 34 14', 4.6);
    fill('M27 15 C30 11 37 10 39 14 C38 18 34 21 29 20 L26 18 Z');
  } else if (id === 'pflege') {
    fill('M32 36 C29 33 13 23 15 15 C16 6 26 5 32 13 C37 4 49 6 50 15 C51 23 39 32 32 36 Z');
    // One cupped palm on either side, leaving a clear gap beneath the heart.
    stroke('M7 31 L12 41 Q15 45 21 47 L29 52 M16 37 L25 41', 5.6);
    stroke('M57 31 L52 41 Q49 45 43 47 L35 52 M48 37 L39 41', 5.6);
  } else if (id === 'rettung') {
    c.save();
    c.translate(32, 32);
    for (let i = 0; i < 3; i++) {
      c.fillRect(-6, -26, 12, 52);
      c.rotate(Math.PI / 3);
    }
    c.restore();
    c.globalCompositeOperation = 'destination-out';
    stroke('M33 16 L31 48', 2.8);
    stroke('M36 23 C27 19 24 27 32 31 C41 35 36 40 29 39', 2.8);
  } else if (id === 'zahn') {
    fill(
      'M32 13 C26 11 21 5 14 8 C5 10 5 21 11 32 C15 40 13 51 20 56 C24 58 25 47 28 40 C30 34 35 34 37 40 C41 49 40 56 44 57 C51 57 50 42 53 33 C56 26 61 16 55 10 C49 3 41 7 35 11 L43 15 Q37 17 32 13 Z',
    );
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const faceRadius = 0.928;
function enamelHeight(x, z) {
  return 0.166 + 0.032 * Math.max(0, 1 - (x * x + z * z) / (faceRadius * faceRadius));
}

export function makeMarkerLibrary(T) {
  // Profile of a single curved metal edge under the inset enamel face.
  const outline = [
    [0.91, 0],
    [0.967, 0.012],
    [0.995, 0.041],
    [1, 0.057],
    [1, 0.125],
    [0.992, 0.148],
    [0.975, 0.17],
    [0.948, 0.18],
    [0.915, 0.177],
    [0.905, 0.162],
  ];
  const segments = 80;
  const rim = new T.LatheGeometry(
    outline.map(([x, y]) => new T.Vector2(x, y)),
    segments,
  );
  // Mount the ink flush on the curved enamel to keep the opening close-up crisp.
  const faceRadii = [1, 0.88, 0.74, 0.6, 0.45, 0.3, 0.15, 0].map((r) => faceRadius * r);
  const face = new T.LatheGeometry(
    faceRadii.map((r) => new T.Vector2(r, enamelHeight(r, 0))),
    segments,
  );
  const surface = face.attributes.position,
    normal = new T.Vector3(),
    slope = 0.064 / (faceRadius * faceRadius);
  for (let i = 0; i < surface.count; i++) {
    normal.set(slope * surface.getX(i), 1, slope * surface.getZ(i)).normalize();
    face.attributes.normal.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const decal = new T.PlaneGeometry(1.62, 1.62, 16, 16);
  decal.rotateX(-Math.PI / 2);
  const pos = decal.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, enamelHeight(pos.getX(i), pos.getZ(i)) + 0.004);
  const disc = new T.CircleGeometry(1, segments);
  disc.rotateX(-Math.PI / 2);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 96;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(48, 48, 1, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(3,12,40,.82)');
  gradient.addColorStop(0.49, 'rgba(3,12,40,.62)');
  gradient.addColorStop(0.77, 'rgba(3,12,40,.2)');
  gradient.addColorStop(1, 'rgba(3,12,40,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  const shadeMap = new T.CanvasTexture(shadowCanvas);
  shadeMap.colorSpace = T.SRGBColorSpace;
  const shadow = new T.MeshBasicMaterial({
    map: shadeMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.61,
  });
  const shadeGeometry = new T.PlaneGeometry(2, 2);
  shadeGeometry.rotateX(-Math.PI / 2);
  const signs = {};
  for (const [key, inks] of Object.entries(enamels)) {
    const artwork = signTexture(T, key);
    signs[key] = {
      // The bevel is narrow enough to read as metal, not as a second ring.
      rim: new T.MeshStandardMaterial({ color: inks.rim, roughness: 0.36, metalness: 0.21 }),
      foot: new T.MeshStandardMaterial({ color: inks.rim, roughness: 0.6, metalness: 0.04 }),
      ink: new T.MeshBasicMaterial({
        map: artwork,
        color: inks.ink,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        toneMapped: false,
      }),
    };
  }
  return { rim, face, decal, disc, shadow, shadeGeometry, signs };
}

export function buildMarker(T, place, lib) {
  const enam = enamels[place.kind],
    sign = lib.signs[place.kind];
  if (!enam) throw new Error('Unknown atlas marker ' + place.kind);
  const radius = 13,
    tilt = 0.45;
  const group = new T.Group();
  group.name = place.id;
  group.scale.setScalar(0.75);
  const body = new T.Group();
  group.add(body);
  const seal = new T.Group();
  const centerHeight = radius * Math.sin(tilt) + 0.52;
  seal.position.y = centerHeight;
  seal.rotation.x = tilt;
  seal.scale.setScalar(radius);
  body.add(seal);
  const foot = new T.Mesh(lib.disc, sign.foot);
  foot.material.side = T.DoubleSide;
  seal.add(foot);
  const edge = new T.Mesh(lib.rim, sign.rim);
  seal.add(edge);
  const enamelMaterial = new T.MeshPhysicalMaterial({
    color: enam.face,
    roughness: 0.55,
    metalness: 0.025,
    clearcoat: 0.23,
    clearcoatRoughness: 0.39,
    emissive: enam.face,
    emissiveIntensity: 0.055,
  });
  const top = new T.Mesh(lib.face, enamelMaterial);
  seal.add(top);
  const glyph = new T.Mesh(lib.decal, sign.ink);
  seal.add(glyph);
  const shadow = new T.Mesh(lib.shadeGeometry, lib.shadow);
  shadow.position.set(1.1, 0.33, 2.1);
  shadow.scale.set(radius * 1.16, 1, radius * 1.05);
  shadow.renderOrder = 1;
  body.add(shadow);

  const glyphHeight = enamelHeight(0, 0) + 0.004;
  const anchor = new T.Vector3(
    0,
    centerHeight + glyphHeight * radius * Math.cos(tilt),
    glyphHeight * radius * Math.sin(tilt),
  );
  function setReveal(progress, pulse, selected = false) {
    const t = Math.max(0, Math.min(1, progress));
    group.visible = t > 0.01;
    if (!group.visible) return;
    const rise = Math.sin(Math.PI * t);
    body.scale.setScalar(t + 0.42 * t * rise);
    seal.position.y = centerHeight + 1.5 * rise;
    enamelMaterial.emissiveIntensity = 0.055 + 0.18 * (pulse || 0) + (selected ? 0.24 : 0);
  }
  setReveal(0, 0);
  return { group, anchor, reach: radius, setReveal };
}
