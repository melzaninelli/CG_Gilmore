import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'lil-gui';


const MODELS = [
  {
    name: 'Gazebo',
    type: 'gltf',
    url: '/models/wooden_gazebo/scene.gltf',
    position: [0, 0, 0],
    height: 4.5,
    rotationY: 0,
    walkable: true, // escadas e piso do gazebo entram no cálculo de altura do chão
  },
  {
    name: 'Cafeteria Salle',
    type: 'gltf',
    url: '/models/cafeteria_salle/scene.gltf', 
    position: [3.25, 0, -19.5],               
    height: 6,
    rotationY: 0,                             
    fallbackSize: [6.5, 6, 6],
    walkable: true,   // escada e varanda da cafeteria
    enterDepth: 2.5,  // quantos metros, a partir da frente do modelo, o jogador pode avançar (escada + varanda)
  },
  {
    name: 'Antique Coffee Mill',
    type: 'gltf',
    url: '/models/antique_coffee_mill/scene.gltf',
    position: [4.05, 0.93, -15],
    height: 0.35,
    rotationY: Math.PI / 4,
  },
  {
    name: 'Coffee Cup',
    type: 'gltf',
    url: '/models/starbucks_disposable_cup/scene.gltf',
    position: [4.55, 0.93, -15],
    height: 0.15,
    rotationY: 0,
  },
  {
    
    name: 'Xmas Coffee Cup',
    type: 'obj',
    mtl: '/models/SB-CoffeeCupXmas-MODEL/SB-CoffeeCupXmas-MODEL/SB-CoffeeCupXmas-MODEL.mtl',
    url: '/models/SB-CoffeeCupXmas-MODEL/SB-CoffeeCupXmas-MODEL/SB-CoffeeCupXmas-MODEL.obj',
    position: [5.05, 0.93, -15],
    height: 0.15,
    rotationY: 0,
  },
];


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const SKY = 0xe8dcc6; // céu claro/nublado de outono, como na foto de Stars Hollow
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 40, 90);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  80
);
camera.rotation.order = 'YXZ';
const EYE_HEIGHT = 1.7;
camera.position.set(0, EYE_HEIGHT, 12);

/* Superfícies "caminháveis" (escadas, pisos elevados). A altura do chão sob o jogador
 * é obtida lançando um raio para baixo só contra estes objetos. */
const walkables = [];
function registerWalkable(obj, opts = {}) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.userData.walkBoxRaw = box.clone();
  obj.userData.enterDepth = opts.enterDepth ?? 0; // > 0: libera o jogador a entrar além do PLAYER_LIMIT norte
  console.log(
    `[walkable] ${obj.name || obj.type}: x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)}, ` +
    `y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}, z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`
  );
  // caixa em coordenadas de mundo (XZ) usada para pular o raycast quando o jogador está longe
  obj.userData.walkBox = box.clone().expandByScalar(0.5);
  obj.userData.walkMeshes = [];
  obj.traverse((o) => { if (o.isMesh) obj.userData.walkMeshes.push(o); });
  walkables.push(obj);
}

const topCamera = new THREE.PerspectiveCamera(50, 1, 1, 200);
topCamera.up.set(0, 0, -1);

const frustumHelper = new THREE.CameraHelper(camera);
frustumHelper.layers.set(1);
scene.add(frustumHelper);
topCamera.layers.enable(1);


/* ==========================================================================
 * ILUMINAÇÃO — dois tipos de luz + sombras, com justificativa das escolhas
 *
 * Referência visual: Stars Hollow numa tarde de outono, céu claro/nublado,
 * sol baixo e quente. Duas luzes bastam para reproduzir isso:
 *
 * 1) HemisphereLight  (luz AMBIENTE, sem direção e sem sombra)
 *    - Simula a luz difusa do céu e o "rebatimento" do chão. O hemisfério
 *      de cima (0xfff1d6, creme) ilumina as faces voltadas para o céu e o de
 *      baixo (0x7a6a4c, terra) ilumina as faces voltadas para o chão.
 *    - Por que Hemisphere e não AmbientLight? A AmbientLight ilumina todas as
 *      faces por igual e "achata" o volume dos prédios. A Hemisphere varia a
 *      cor com a orientação da normal, então tetos ficam mais claros e
 *      laterais mais quentes/escuras, o que dá leitura de volume mesmo onde
 *      o sol não chega.
 *    - Intensidade 0.95: alta o bastante para a sombra não virar preto
 *      (céu nublado tem muita luz difusa), baixa o bastante para o sol
 *      ainda ser o protagonista. Ela NÃO projeta sombra: luz difusa de céu
 *      não tem direção, e isso também economiza uma passada de render.
 *
 * 2) DirectionalLight (o SOL, luz DIRECIONAL com sombra)
 *    - Raios paralelos: é o modelo correto para uma fonte praticamente no
 *      infinito. Uma PointLight/SpotLight daria sombras divergentes e exigiria
 *      shadow map cúbico (6 passadas) — caro e fisicamente errado para o sol.
 *    - Cor 0xffe6bf (branco quente) e posição (15, 22, 12): elevação ~45°,
 *      como sol de fim de tarde de outono, comprimento de sombra suficiente
 *      para aparecer nos prédios e árvores sem cobrir a praça inteira.
 *    - Intensidade 1.5: maior que a ambiente (0.95) para criar contraste
 *      claro/escuro entre faces iluminadas e sombreadas.
 *
 * SOMBRAS (apenas a luz direcional projeta)
 *    - renderer.shadowMap.type = PCFSoftShadowMap: borda suavizada, sem o
 *      serrilhado do PCF simples e mais barato/estável que VSM (que sofre de
 *      light bleeding). Combina com o sol de céu nublado (sombras macias).
 *    - mapSize 2048x2048: a câmera de sombra cobre 56x56 unidades, então cada
 *      texel ≈ 2,7 cm no mundo. É resolução suficiente para bordas nítidas
 *      de balcões e bancos; 1024 (≈ 5,5 cm) ficaria serrilhado, 4096 gastaria
 *      4x de memória sem ganho perceptível.
 *    - Volume ortográfico ±28 (left/right/top/bottom): a cena jogável vai até
 *      ~±22 (prédios em ±19 + profundidade). Ajustar o volume ao tamanho real
 *      da cena concentra os texels onde importa; um volume de 240x240 (o
 *      tamanho do chão) deixaria as sombras 4x mais borradas.
 *    - near 1 / far 70: o sol está a ~29 unidades da origem e a cena vai até
 *      ~22 de distância dele em cada sentido, então 70 cobre tudo com folga
 *      e mantém a faixa de profundidade curta, o que melhora a precisão do
 *      depth map.
 *    - bias -0.0005 + normalBias 0.02: o bias evita "shadow acne" (listras na
 *      superfície que se auto-sombreia); o normalBias desloca a amostra ao
 *      longo da normal e resolve o acne em ângulos rasantes (sol baixo) sem
 *      precisar de bias grande, que causaria "peter-panning" (sombra
 *      descolada do objeto).
 *    - Quem projeta / recebe: os prédios, árvores, bancos, postes e modelos
 *      externos têm castShadow; o chão e as calçadas têm receiveShadow. Os
 *      detalhes pequenos e planos (vitrines, portas, janelas) não projetam
 *      sombra (shadow=false em addBox) porque seriam invisíveis e só
 *      custariam desempenho.
 * ========================================================================== */

// Luz 1: ambiente do céu/chão (sem sombra)
const hemi = new THREE.HemisphereLight(0xfff1d6, 0x7a6a4c, 0.95);
scene.add(hemi);

// Luz 2: sol direcional (com sombra)
const sun = new THREE.DirectionalLight(0xffe6bf, 1.5);
sun.position.set(15, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);


const WORLD_HALF = 30;
const PLAYER_LIMIT = 15.2; // o jogador anda na praça, na rua e na calçada (não atravessa os prédios)

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // PRNG determinístico

const matCache = new Map();
function mat(color, roughness = 0.9, extra = {}) {
  const key = `${color}|${roughness}|${JSON.stringify(extra)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
  }
  return matCache.get(key);
}

function addBox(parent, w, h, d, material, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCyl(parent, rTop, rBot, h, material, x, y, z, segments = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}


function flat(w, d, color, x, z, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 1));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}


const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ color: 0x7d8f4c, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const ROAD = 0x4a4a4f;
const SIDEWALK = 0xbfb6a4;
const PATH = 0xcfc3aa;

// rua em anel
flat(28, 5, ROAD, 0, -11.5, 0.02); // norte
flat(28, 5, ROAD, 0, 11.5, 0.02);  // sul
flat(5, 18, ROAD, -11.5, 0, 0.02); // oeste
flat(5, 18, ROAD, 11.5, 0, 0.02);  // leste

// linha central tracejada
const dashGeo = new THREE.PlaneGeometry(1, 0.12);
const dashMat = mat(0xe3c04a, 1);
function dash(x, z, rotated) {
  const d = new THREE.Mesh(dashGeo, dashMat);
  d.rotation.x = -Math.PI / 2;
  if (rotated) d.rotation.z = Math.PI / 2;
  d.position.set(x, 0.03, z);
  scene.add(d);
}
for (let i = -13; i <= 13; i += 2) {
  dash(i, -11.5, false);
  dash(i, 11.5, false);
}
for (let i = -7; i <= 7; i += 2) {
  dash(-11.5, i, true);
  dash(11.5, i, true);
}


flat(32, 2, SIDEWALK, 0, -15, 0.04);
flat(32, 2, SIDEWALK, 0, 15, 0.04);
flat(2, 28, SIDEWALK, -15, 0, 0.04);
flat(2, 28, SIDEWALK, 15, 0, 0.04);


flat(2.4, 18, PATH, 0, 0, 0.04);
flat(18, 2.4, PATH, 0, 0, 0.04);
const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.8, 40), mat(PATH, 1));
plaza.rotation.x = -Math.PI / 2;
plaza.position.y = 0.05;
plaza.receiveShadow = true;
scene.add(plaza);


const pumpkinGeo = new THREE.SphereGeometry(0.28, 12, 10);
const pumpkinMat = mat(0xe07a1f, 0.7);
const stemMat = mat(0x4a5a2a, 1);
const hayMat = mat(0xd4b25a, 1);
const cornMat = mat(0xc9a85a, 1);

function addPumpkin(parent, x, z, s = 1, y = 0.03) {
  const p = new THREE.Mesh(pumpkinGeo, pumpkinMat);
  p.scale.set(s, 0.8 * s, s);
  p.position.set(x, y + 0.22 * s, z);
  p.castShadow = true;
  parent.add(p);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), stemMat);
  stem.position.set(x, y + 0.46 * s, z);
  parent.add(stem);
}

function addHay(parent, x, z, rotY = 0) {
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.8, 14), hayMat);
  h.rotation.z = Math.PI / 2;
  h.rotation.y = rotY;
  h.position.set(x, 0.4, z);
  h.castShadow = h.receiveShadow = true;
  parent.add(h);
}

function addCornStalks(parent, x, z) {
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.6, 7), cornMat);
    c.position.set(x + (i - 1) * 0.18, 0.83, z + (i % 2) * 0.12);
    c.rotation.z = (i - 1) * 0.08;
    c.castShadow = true;
    parent.add(c);
  }
}

function decorCluster(parent, x, z) {
  addHay(parent, x, z, rand() * 0.6);
  addPumpkin(parent, x + 0.55, z + 0.25, 1);
  addPumpkin(parent, x + 0.95, z - 0.05, 0.75);
  addPumpkin(parent, x - 0.6, z + 0.45, 0.9);
  addCornStalks(parent, x - 0.2, z - 0.55);
}

function addWreath(parent, x, y, z, r = 0.28) {
  const w = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.26, 8, 20), mat(0xb5402a, 0.8));
  w.position.set(x, y, z);
  parent.add(w);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, r * 0.35, 0.04), mat(0xd4a02a, 0.6));
  bow.position.set(x, y - r, z + 0.03);
  parent.add(bow);
}

const BRICKS = [0xa6482f, 0xb85c3c, 0xc79a6b, 0xd9c7a0, 0x8f6a52, 0x9aa88a, 0x7f95a6];
const AWNINGS = [0x2f6b4a, 0xa32a2a, 0x24405e, 0xc98b1b, 0x6b3a5e];
const NAMES = [
  "Doose's Market", "Kim's Antiques", "Weston's Bakery", "Patty's Dance Studio",
  "Sophie's Flowers", 'Hollow Books', 'Hardware & Co.', 'Pizza Hollow',
  'Ice Cream Parlor', 'Post Office', 'Apothecary', 'Candle Shop', 'Barber Shop', 'Gift Shop',
];
let nameIdx = 0;

function signTexture(text, bg = '#2b2118', fg = '#f1e2b3') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 56;
  ctx.font = `bold ${size}px Georgia, serif`;
  while (ctx.measureText(text).width > 450 && size > 20) {
    size -= 2;
    ctx.font = `bold ${size}px Georgia, serif`;
  }
  ctx.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSign(text, w = 2.8, bg, fg) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, w / 4, 0.08),
    new THREE.MeshStandardMaterial({ map: signTexture(text, bg, fg), roughness: 0.7 })
  );
}

const glassMat = mat(0xbfd8e0, 0.2, { emissive: 0x2a3a40, emissiveIntensity: 0.4 });
const frameMat = mat(0xf4efe2, 0.7);
const creamMat = mat(0xefe6cf, 0.8);
const roofMat = mat(0x5a4f48, 0.9);

function buildShop({ w, d, h, color, awning, name }) {
  const g = new THREE.Group();
  const front = d / 2;

  addBox(g, w, h, d, mat(color, 0.85), 0, h / 2, 0);                  // corpo
  addBox(g, w + 0.3, 0.4, d + 0.3, creamMat, 0, h + 0.2, 0);          // cornija
  addBox(g, w - 0.2, 0.1, d - 0.2, roofMat, 0, h + 0.45, 0);          // telhado plano
  addBox(g, w + 0.1, 0.5, 0.1, creamMat, 0, 0.25, front + 0.03);      // rodapé

  // vitrine e porta
  addBox(g, w * 0.5 + 0.2, 2.2, 0.08, frameMat, -w * 0.2, 1.9, front + 0.03, false);
  addBox(g, w * 0.5, 2.0, 0.1, glassMat, -w * 0.2, 1.9, front + 0.06, false);
  addBox(g, 1.3, 2.5, 0.08, frameMat, w * 0.3, 1.25, front + 0.03, false);
  addBox(g, 1.1, 2.3, 0.1, mat(awning, 0.6), w * 0.3, 1.2, front + 0.06, false);
  addWreath(g, w * 0.3, 1.75, front + 0.14);

  // janelas do andar de cima
  const n = Math.max(2, Math.floor(w / 2));
  const uy = (3.4 + h) / 2 + 0.2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    addBox(g, 1.1, 1.5, 0.08, frameMat, x, uy, front + 0.03, false);
    addBox(g, 0.9, 1.3, 0.1, glassMat, x, uy, front + 0.06, false);
  }

  // toldo inclinado + letreiro
  const aw = addBox(g, w * 0.9, 0.1, 1.3, mat(awning, 0.8), 0, 3.15, front + 0.65);
  aw.rotation.x = 0.25;
  const sign = makeSign(name);
  sign.position.set(0, 3.85, front + 0.06);
  g.add(sign);

  // chaminé em alguns prédios
  if (rand() > 0.5) addBox(g, 0.7, 1.6, 0.7, mat(0x7a3a28, 0.9), w * 0.3, h + 1.2, -d * 0.2);

  // decoração na calçada
  decorCluster(g, -w * 0.4, front + 0.9);

  return g;
}

function buildTownHall(w, d, h) {
  const g = new THREE.Group();
  const front = d / 2;
  const white = mat(0xf0ebe0, 0.7);
  const pw = w * 0.8;

  addBox(g, w, h, d, white, 0, h / 2, 0);
  addBox(g, w + 0.3, 0.4, d + 0.3, creamMat, 0, h + 0.2, 0);
  addBox(g, w - 0.2, 0.1, d - 0.2, roofMat, 0, h + 0.45, 0);

  // degrau + varanda
  g.userData.step = addBox(g, pw + 0.4, 0.3, 2.2, mat(0xb8b0a0, 1), 0, 0.15, front + 1.1);
  const cols = 4;
  for (let i = 0; i < cols; i++) {
    const x = -pw / 2 + 0.4 + i * ((pw - 0.8) / (cols - 1));
    addCyl(g, 0.2, 0.22, 3.6, white, x, 2.1, front + 1.8, 14);
  }
  addBox(g, pw, 0.35, 2, white, 0, 4.075, front + 1);

  // frontão triangular
  const s = new THREE.Shape();
  s.moveTo(-pw / 2, 0);
  s.lineTo(pw / 2, 0);
  s.lineTo(0, 1.1);
  s.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }), white);
  ped.position.set(0, 4.25, front);
  ped.castShadow = true;
  g.add(ped);

  // porta dupla, janelas, letreiro
  addBox(g, 1.8, 2.6, 0.1, mat(0x2f6b4a, 0.6), 0, 1.45, front + 0.05, false);
  for (const x of [-w * 0.35, w * 0.35]) {
    addBox(g, 1.1, 1.8, 0.08, frameMat, x, 1.9, front + 0.03, false);
    addBox(g, 0.9, 1.6, 0.1, glassMat, x, 1.9, front + 0.06, false);
  }
  const sign = makeSign('Town Hall', 3.2, '#1f3a5a', '#f4ecd0');
  sign.position.set(0, 3.2, front + 0.08);
  g.add(sign);
  addWreath(g, 0, 2.2, front + 0.16, 0.32);

  decorCluster(g, -w * 0.38, front + 2.8);
  decorCluster(g, w * 0.38, front + 2.8);
  return g;
}

const SLOT_W = 6.5;
const SLOT_CENTERS = [-9.75, -3.25, 3.25, 9.75];
const SIDES = [
  { rotY: 0, at: (c) => [c, -19] },              // norte (frente para +z)
  { rotY: Math.PI, at: (c) => [c, 19] },         // sul
  { rotY: Math.PI / 2, at: (c) => [-19, c] },    // oeste
  { rotY: -Math.PI / 2, at: (c) => [19, c] },    // leste
];

SIDES.forEach((side, si) => {
  SLOT_CENTERS.forEach((c, i) => {
    if (si === 0 && i === 2) return; // slot da Cafeteria Salle (modelo externo)
    const [x, z] = side.at(c);
    let b;
    if (si === 0 && i === 0) {
      b = buildTownHall(SLOT_W, 6, 6.6);
    } else {
      b = buildShop({
        w: SLOT_W,
        d: 6,
        h: 5.2 + rand() * 2.2,
        color: BRICKS[Math.floor(rand() * BRICKS.length)],
        awning: AWNINGS[Math.floor(rand() * AWNINGS.length)],
        name: NAMES[nameIdx++ % NAMES.length],
      });
    }
    b.position.set(x, 0, z);
    b.rotation.y = side.rotY;
    scene.add(b);
    if (b.userData.step) registerWalkable(b.userData.step); // degrau da prefeitura
  });
});

function addLamp(x, z) {
  const g = new THREE.Group();
  const dark = mat(0x1f1f22, 0.5);
  addCyl(g, 0.15, 0.2, 0.5, dark, 0, 0.25, 0, 10);
  addCyl(g, 0.06, 0.08, 3.2, dark, 0, 1.9, 0, 10);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe39a, emissiveIntensity: 0.9 })
  );
  lamp.position.y = 3.6;
  g.add(lamp);
  addCyl(g, 0.12, 0.12, 0.08, dark, 0, 3.35, 0, 10);
  addWreath(g, 0, 2.4, 0.1, 0.26);
  g.position.set(x, 0, z);
  scene.add(g);
}

for (const x of [-8.5, 0, 8.5]) {
  for (const z of [-8.5, 0, 8.5]) {
    if (x === 0 && z === 0) continue;
    addLamp(x, z);
  }
}
for (const p of [-6, 6]) {
  addLamp(p, -14.6);
  addLamp(p, 14.6);
  addLamp(-14.6, p);
  addLamp(14.6, p);
}

function addBench(x, z, rotY) {
  const g = new THREE.Group();
  const wood = mat(0x2e4a33, 0.8);
  const iron = mat(0x1f1f22, 0.5);
  addBox(g, 1.6, 0.08, 0.5, wood, 0, 0.5, 0);
  addBox(g, 1.6, 0.45, 0.06, wood, 0, 0.8, -0.24);
  addBox(g, 0.06, 0.5, 0.5, iron, -0.7, 0.25, 0);
  addBox(g, 0.06, 0.5, 0.5, iron, 0.7, 0.25, 0);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
}

addBench(3, 6.5, Math.PI);
addBench(-3, 6.5, Math.PI);
addBench(3, -6.5, 0);
addBench(-3, -6.5, 0);
addBench(6.5, 3, -Math.PI / 2);
addBench(-6.5, 3, Math.PI / 2);

function addChair(x, z, rotY) {
  const g = new THREE.Group();
  const wood = mat(0x6b4a2b, 0.7);
  addBox(g, 0.45, 0.05, 0.45, wood, 0, 0.45, 0);
  addBox(g, 0.45, 0.45, 0.05, wood, 0, 0.7, -0.2);
  for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    addBox(g, 0.04, 0.45, 0.04, wood, dx, 0.22, dz);
  }
  g.position.set(x, 0.03, z);
  g.rotation.y = rotY;
  scene.add(g);
}

// mesa externa da cafeteria (sobre a calçada norte)
const TABLE = { x: 4.55, z: -15 };
const table = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.1, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 })
);
table.position.set(TABLE.x, 0.88, TABLE.z);
table.castShadow = table.receiveShadow = true;
scene.add(table);
for (const [dx, dz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), table.material);
  leg.position.set(TABLE.x + dx, 0.43, TABLE.z + dz);
  leg.castShadow = true;
  scene.add(leg);
}
addChair(TABLE.x, TABLE.z + 0.85, Math.PI); // do lado da rua, de frente para a mesa
addChair(TABLE.x, TABLE.z - 0.85, 0);       // do lado da cafeteria

// bandeira
{
  const g = new THREE.Group();
  addCyl(g, 0.04, 0.06, 6, mat(0xcfcfcf, 0.4), 0, 3, 0, 8);
  addBox(g, 1.2, 0.7, 0.02, mat(0xb22234, 0.8), 0.65, 5.5, 0, false);
  addBox(g, 0.5, 0.35, 0.03, mat(0x1d3a7a, 0.8), 0.3, 5.68, 0, false);
  g.position.set(3.8, 0, -4.6);
  scene.add(g);
}


const barkMat = mat(0x5b4a3a, 1);


function bareTree(x, z, s = 1) {
  const g = new THREE.Group();
  addCyl(g, 0.22, 0.4, 4, barkMat, 0, 2, 0, 8);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const len = 2.2 + rand() * 1.5;
    const pivot = new THREE.Group();
    pivot.position.y = 3 + rand() * 1.4;
    pivot.rotation.y = (i / N) * Math.PI * 2 + rand();
    pivot.rotation.z = -(0.5 + rand() * 0.5);
    addCyl(pivot, 0.04, 0.12, len, barkMat, 0, len / 2, 0, 5);
    for (const sgn of [-1, 1]) {
      const sub = new THREE.Group();
      sub.position.y = len * (0.55 + rand() * 0.2);
      sub.rotation.z = sgn * (0.6 + rand() * 0.3);
      sub.rotation.y = rand() * Math.PI;
      addCyl(sub, 0.02, 0.06, len * 0.55, barkMat, 0, len * 0.275, 0, 5);
      pivot.add(sub);
    }
    g.add(pivot);
  }
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  scene.add(g);
}

const LEAF_COLORS = [0xd9731c, 0xc0392b, 0xe0a526];
function autumnTree(x, z, colorIdx) {
  const g = new THREE.Group();
  addCyl(g, 0.2, 0.3, 2.4, barkMat, 0, 1.2, 0, 8);
  const lm = mat(LEAF_COLORS[colorIdx % LEAF_COLORS.length], 0.9, { flatShading: true });
  for (const [dx, dy, dz, r] of [[0, 3.3, 0, 1.5], [0.9, 2.9, 0.3, 1.1], [-0.8, 3.0, -0.4, 1.2]]) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lm);
    c.position.set(dx, dy, dz);
    c.castShadow = true;
    g.add(c);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}

bareTree(-4.8, -3.2, 1.2);
autumnTree(-7, -7, 0);
autumnTree(7, -7, 1);
autumnTree(-7, 7, 2);
autumnTree(7, 7, 0);

// moitas ao redor da praça
{
  const bushMat = mat(0x4a6b3a, 1, { flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), bushMat);
    b.scale.y = 0.75;
    b.position.set(Math.cos(a) * 5.4, 0.4, Math.sin(a) * 5.4);
    b.castShadow = true;
    scene.add(b);
  }
}


for (let k = 0; k < 4; k++) {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  decorCluster(scene, Math.cos(a) * 4.4, Math.sin(a) * 4.4);
}


const gltfLoader = new GLTFLoader();

/** Escala o objeto para ter `height` de altura, apoia a base em y = 0 e depois posiciona. */
function fitAndPlace(obj, cfg) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = cfg.height / (size.y || 1);
  obj.scale.multiplyScalar(s);

  box.setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;

  const holder = new THREE.Group();
  holder.add(obj);
  holder.rotation.y = cfg.rotationY ?? 0;
  holder.position.set(...cfg.position);
  holder.name = cfg.name;
  return holder;
}

function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

function placeholder(cfg) {
  // Se o arquivo não carregar, a cena continua funcionando com uma caixa visível
  const [w, h, d] = cfg.fallbackSize ?? [1, 1, 1];
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xff00ff })
  );
  return fitAndPlace(m, cfg);
}

async function loadModel(cfg) {
  try {
    let obj;
    if (cfg.type === 'obj') {
      const objLoader = new OBJLoader();
      if (cfg.mtl) {
        // Se o .mtl falhar, o OBJ ainda carrega (com material padrão) em vez de virar placeholder
        try {
          const mtlLoader = new MTLLoader();
          const materials = await mtlLoader.loadAsync(cfg.mtl);
          materials.preload();
          objLoader.setMaterials(materials);
        } catch (err) {
          console.warn(`[modelo] ${cfg.name}: falha ao carregar o .mtl, usando material padrão`, err);
        }
      }
      obj = await objLoader.loadAsync(cfg.url);
    } else {
      const gltf = await gltfLoader.loadAsync(cfg.url);
      obj = gltf.scene;
    }
    enableShadows(obj);
    const holder = fitAndPlace(obj, cfg);
    scene.add(holder);
    if (cfg.walkable) registerWalkable(holder, cfg);
    console.log(`[modelo] ${cfg.name} carregado`);
  } catch (err) {
    console.warn(`[modelo] falha ao carregar ${cfg.name}:`, err);
    scene.add(placeholder(cfg));
  }
  applyDiagnostics(); // garante que modelos novos respeitem o estado do diagnóstico
}

const MOVE_SPEED = 4;            // m/s
const RUN_MULTIPLIER = 2;        // Shift
const TURN_SPEED = 1.8;          // rad/s (setas)
const MOUSE_SENSITIVITY = 0.002; // rad/pixel

let yaw = 0;
let pitch = 0;
const keys = new Set();

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  handleShortcuts(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

renderer.domElement.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * MOUSE_SENSITIVITY;
  pitch -= e.movementY * MOUSE_SENSITIVITY;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
});

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

/* Limite norte (z mínimo) do jogador na posição x.
 * Normalmente é -PLAYER_LIMIT (a calçada). Diante de um modelo com `enterDepth`
 * (ex.: a escada da cafeteria), o jogador pode avançar `enterDepth` metros a partir da
 * frente do modelo, o suficiente para subir a escada e ficar na varanda. */
function northLimitAt(x) {
  let limit = -PLAYER_LIMIT;
  for (const w of walkables) {
    const d = w.userData.enterDepth;
    if (!d) continue;
    const b = w.userData.walkBoxRaw;
    if (x >= b.min.x && x <= b.max.x) limit = Math.min(limit, b.max.z - d);
  }
  return limit;
}

/* Altura do chão sob o jogador (escadas).
 * - O raio parte de (chão atual + STEP_UP_MAX): degraus de até STEP_UP_MAX são "subíveis"
 *   e o teto do gazebo (acima da origem do raio) é ignorado.
 * - FALL_MAX limita quanto o raio enxerga para baixo; se não achar nada, o chão é y = 0.
 * - A altura é suavizada (exponencial) para a câmera deslizar sobre os degraus em vez de dar saltos. */
const STEP_UP_MAX = 0.6;   // maior degrau que o jogador sobe (m)
const FALL_MAX = 4;        // maior queda detectada (m)
const GROUND_SMOOTH = 14;  // maior = acompanha o degrau mais rápido
const raycaster = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _active = [];
const _hits = [];
const _saved = [];
let groundY = 0;

function updateGround(dt) {
  const px = camera.position.x;
  const pz = camera.position.z;

  _active.length = 0;
  for (const w of walkables) {
    const b = w.userData.walkBox;
    if (px >= b.min.x && px <= b.max.x && pz >= b.min.z && pz <= b.max.z) _active.push(w);
  }

  let target = 0;
  stats.walkHit = _active.length ? 'sem acerto (chão 0)' : '— (fora da área)';
  if (_active.length) {
    // O raycast do Three respeita o lado do material (FrontSide ignora faces "de costas").
    // Para o chão não depender da orientação das faces do modelo, usamos DoubleSide só durante o raio.
    for (const w of _active) {
      for (const m of w.userData.walkMeshes) {
        for (const mt of [].concat(m.material)) {
          _saved.push(mt, mt.side);
          mt.side = THREE.DoubleSide;
        }
      }
    }

    _rayOrigin.set(px, groundY + STEP_UP_MAX, pz);
    raycaster.set(_rayOrigin, _down);
    raycaster.far = STEP_UP_MAX + FALL_MAX;
    _hits.length = 0;
    raycaster.intersectObjects(_active, true, _hits);
    if (_hits.length) {
      target = _hits[0].point.y;
      stats.walkHit = _hits[0].object.name || _hits[0].object.parent?.name || 'malha sem nome';
    }

    for (let i = _saved.length - 2; i >= 0; i -= 2) _saved[i].side = _saved[i + 1]; // restaura (ordem inversa)
    _saved.length = 0;
  }

  groundY += (target - groundY) * (1 - Math.exp(-GROUND_SMOOTH * dt));
  if (Math.abs(target - groundY) < 0.002) groundY = target;
  stats.ground = Number(groundY.toFixed(2));
  return groundY;
}

function updateNavigation(dt) {
  if (keys.has('ArrowLeft')) yaw += TURN_SPEED * dt;
  if (keys.has('ArrowRight')) yaw -= TURN_SPEED * dt;
  if (keys.has('ArrowUp')) pitch += TURN_SPEED * dt;
  if (keys.has('ArrowDown')) pitch -= TURN_SPEED * dt;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

  _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

  _move.set(0, 0, 0);
  if (keys.has('KeyW')) _move.add(_forward);
  if (keys.has('KeyS')) _move.sub(_forward);
  if (keys.has('KeyD')) _move.add(_right);
  if (keys.has('KeyA')) _move.sub(_right);

  if (_move.lengthSq() > 0) {
    const speed = MOVE_SPEED * (keys.has('ShiftLeft') ? RUN_MULTIPLIER : 1);
    _move.normalize().multiplyScalar(speed * dt);
    camera.position.add(_move);
  }


  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -PLAYER_LIMIT, PLAYER_LIMIT);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, northLimitAt(camera.position.x), PLAYER_LIMIT);
  camera.position.y = updateGround(dt) + EYE_HEIGHT; // acompanha escadas/degraus

  camera.rotation.set(pitch, yaw, 0);
}


const state = {
  wireframe: false,        // (1)
  depth: false,            // (2)
  backfaceCulling: true,   
  showFrustum: true,       // (4)
  frustumCulling: true,    // (5)
  near: camera.near,
  far: camera.far,
};

const stats = { drawCalls: 0, triangles: 0, objects: 0, ground: 0, walkHit: '—' };

const depthMat = new THREE.MeshDepthMaterial();

function applyDiagnostics() {
  scene.overrideMaterial = state.depth ? depthMat : null;
  depthMat.wireframe = state.wireframe;
  depthMat.side = state.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide;

  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = state.frustumCulling;                 // (5)
    for (const m of [].concat(o.material)) {
      m.wireframe = state.wireframe;                        // (1)
      m.side = state.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide; // (3)
    }
  });

  frustumHelper.visible = state.showFrustum;                // (4)
}

function updateCameraPlanes() {
  camera.near = state.near;
  camera.far = state.far;
  camera.updateProjectionMatrix();
  frustumHelper.update();
}

const gui = new GUI({ title: 'Diagnóstico do pipeline' });
gui.add(state, 'wireframe').name('1 · Wireframe').onChange(applyDiagnostics);
gui.add(state, 'depth').name('2 · Profundidade (depth)').onChange(applyDiagnostics);
gui.add(state, 'backfaceCulling').name('3 · Back-face culling').onChange(applyDiagnostics);
gui.add(state, 'showFrustum').name('4 · Mostrar frustum').onChange(applyDiagnostics);
gui.add(state, 'frustumCulling').name('5 · Frustum culling').onChange(applyDiagnostics);

const camFolder = gui.addFolder('Câmera principal (near / far)');
camFolder.add(state, 'near', 0.01, 5, 0.01).onChange(updateCameraPlanes);
camFolder.add(state, 'far', 5, 300, 1).onChange(updateCameraPlanes);
camFolder.add(camera, 'fov', 30, 110, 1).onChange(() => {
  camera.updateProjectionMatrix();
  frustumHelper.update();
});

// Controles de iluminação: permitem demonstrar o efeito de cada luz na apresentação
const lightFolder = gui.addFolder('Iluminação');
lightFolder.add(hemi, 'visible').name('Luz hemisférica (ambiente)');
lightFolder.add(hemi, 'intensity', 0, 2, 0.05).name('Intensidade ambiente');
lightFolder.add(sun, 'visible').name('Sol (direcional)');
lightFolder.add(sun, 'intensity', 0, 3, 0.05).name('Intensidade do sol');
lightFolder.add(sun, 'castShadow').name('Sombras do sol');

const infoFolder = gui.addFolder('renderer.info (passada principal)');
infoFolder.add(stats, 'drawCalls').name('Draw calls').listen().disable();
infoFolder.add(stats, 'triangles').name('Triângulos').listen().disable();
infoFolder.add(stats, 'ground').name('Altura do chão (m)').listen().disable();
infoFolder.add(stats, 'walkHit').name('Pisando em').listen().disable();

function handleShortcuts(code) {
  const map = {
    Digit1: 'wireframe',
    Digit2: 'depth',
    Digit3: 'backfaceCulling',
    Digit4: 'showFrustum',
    Digit5: 'frustumCulling',
  };
  const prop = map[code];
  if (!prop) return;
  state[prop] = !state[prop];
  applyDiagnostics();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

applyDiagnostics();
MODELS.forEach(loadModel); // depois do diagnóstico, para o estado já existir quando os modelos chegarem


const timer = new THREE.Timer();
timer.connect(document); // pausa o timer quando a aba fica oculta

const INSET = 0.28; // fração da tela ocupada pela visão de cima

function animate(timestamp) {
  timer.update(timestamp);
  const dt = timer.getDelta();

  updateNavigation(dt);
  camera.updateMatrixWorld();
  frustumHelper.update();

  const W = window.innerWidth;
  const H = window.innerHeight;

  renderer.setScissorTest(false);
  renderer.clear();

  renderer.info.reset();
  renderer.setViewport(0, 0, W, H);
  renderer.setScissor(0, 0, W, H);
  renderer.setScissorTest(true);
  renderer.render(scene, camera);


  stats.drawCalls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;


  if (state.showFrustum) {
    const w = Math.floor(W * INSET);
    const h = Math.floor(H * INSET);
    const x = W - w - 10;
    const y = H - h - 10;

    topCamera.aspect = w / h;
    topCamera.updateProjectionMatrix();
    topCamera.position.set(camera.position.x, 40, camera.position.z);
    topCamera.lookAt(camera.position.x, 0, camera.position.z);

    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.clearDepth();
    renderer.render(scene, topCamera);
  }
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  frustumHelper.update();
  renderer.setSize(window.innerWidth, window.innerHeight);
});