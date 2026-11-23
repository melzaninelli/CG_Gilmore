import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
<<<<<<< HEAD
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
=======
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89


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
    maxWidth: 6.3,    // não invade o slot vizinho (Kim's Antiques / prédio da esquerda)
    maxDepth: 6,      // não passa da profundidade das lojas
    walkable: true,   // escada, varanda e interior da cafeteria
    enterDepth: 6,    // quantos metros, a partir da frente do modelo, o jogador pode avançar (até o balcão)
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; // M4: curva filmica, evita estourar o branco dos materiais PBR
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

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
 * é obtida lançando raios para baixo só contra estes objetos. */
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
 *    - Intensidade 0.6 (M4): parte da luz difusa passou a vir do environment
 *      map (ver abaixo), então a hemisférica foi reduzida de 0.95 para 0.6
 *      para não somar luz ambiente em dobro. Ela NÃO projeta sombra: luz
 *      difusa de céu não tem direção, e isso também economiza uma passada.
 *
 * 2) DirectionalLight (o SOL, luz DIRECIONAL com sombra)
 *    - Raios paralelos: é o modelo correto para uma fonte praticamente no
 *      infinito. Uma PointLight/SpotLight daria sombras divergentes e exigiria
 *      shadow map cúbico (6 passadas) — caro e fisicamente errado para o sol.
 *    - Cor 0xffe6bf (branco quente) e posição (15, 22, 12): elevação ~45°,
 *      como sol de fim de tarde de outono, comprimento de sombra suficiente
 *      para aparecer nos prédios e árvores sem cobrir a praça inteira.
 *    - Intensidade 1.5: maior que a ambiente para criar contraste
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
 *    - O boneco (avatar do jogador) também projeta sombra; em primeira pessoa
 *      ele fica invisível para a câmera (colorWrite/depthWrite desligados),
 *      mas continua entrando no shadow map.
 * ========================================================================== */

// Luz 1: ambiente do céu/chão (sem sombra)
const hemi = new THREE.HemisphereLight(0xfff1d6, 0x7a6a4c, 0.6);
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


/* ==========================================================================
 * M4 — AMBIENTE (environment map)
 *
 * Os materiais PBR (MeshStandardMaterial) só mostram metal, vidro e brilho de
 * verdade se houver algo para refletir. Em vez de um HDRI externo, geramos um
 * "céu" em gradiente (zênite acinzentado -> horizonte creme quente -> chão
 * terra), com as mesmas cores do fundo/névoa e da luz hemisférica. O
 * PMREMGenerator converte esse céu num mapa de ambiente pré-filtrado por
 * rugosidade, usado como luz indireta e reflexo (scene.environment).
 * ========================================================================== */
function buildSkyEnvironment() {
  const envScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const top = new THREE.Color(0xb9c6cf);
  const horizon = new THREE.Color(0xf3e4c6);
  const bottom = new THREE.Color(0x7a6a4c);
  const c = new THREE.Color();
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 50; // -1 .. 1
    if (t >= 0) c.copy(horizon).lerp(top, Math.pow(t, 0.6));
    else c.copy(horizon).lerp(bottom, Math.min(1, -t * 2.5));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // "sol" no mapa de ambiente, na mesma direção da DirectionalLight, para o reflexo combinar com a sombra
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe6bf).multiplyScalar(6) })
  );
  sunDisc.position.copy(sun.position).normalize().multiplyScalar(45);
  envScene.add(sunDisc);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.03).texture;
  pmrem.dispose();
  geo.dispose();
  return tex;
}
scene.environment = buildSkyEnvironment();
scene.environmentIntensity = 0.45;


/* ==========================================================================
 * M4 — TEXTURAS PROCEDURAIS PBR (cor + normal map + roughness map)
 *
 * Cada "kind" (brick, grass, asphalt, stone, wood, bark) gera, via canvas,
 * três mapas a partir de um mesmo campo de altura:
 *   - map (cor, sRGB)            : tons de cinza; a cor final vem do `color` do material (tint)
 *   - normalMap (dados lineares) : relevo, calculado a partir do campo de altura (diferenças finitas)
 *   - roughnessMap (linear)      : rugosidade por texel (junta de tijolo = fosca, tijolo = mais lisa)
 * Todas são TILEÁVEIS (ruído com período inteiro), então repetem sem emenda visível.
 * Só o mapa de cor é sRGB; normal e roughness são dados e ficam em espaço linear.
 * ========================================================================== */
function hash(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
// ruído de valor tileável: fu/fv = nº de células ao longo de u/v (período)
function tnoise(u, v, fu, fv, s) {
  const x = u * fu, y = v * fv;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = xi % fu, b = (xi + 1) % fu, c = yi % fv, d = (yi + 1) % fv;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const n00 = hash(a, c, s), n10 = hash(b, c, s), n01 = hash(a, d, s), n11 = hash(b, d, s);
  return n00 + (n10 - n00) * sx + (n01 - n00) * sy + (n00 - n10 - n01 + n11) * sx * sy;
}
function fbm(u, v, base, oct, s) {
  let sum = 0, amp = 0.5, norm = 0, f = base;
  for (let i = 0; i < oct; i++) {
    sum += tnoise(u, v, f, f, s + i) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// cada padrão devolve { h: altura 0..1, l: luminância 0..1, r: rugosidade 0..1 }
const PATTERNS = {
  brick(u, v, x, y, s) {
    const rowH = s / 8, bw = s / 4, m = 4;
    const row = Math.floor(y / rowH);
    const off = (row % 2) * bw / 2;
    const bx = (x + off) % bw, by = y % rowH;
    const col = Math.floor((x + off) / bw) % 4;
    const n = fbm(u, v, 16, 3, 1);
    if (bx < m || by < m) return { h: 0.12 + 0.1 * n, l: 0.95 - 0.1 * n, r: 1 }; // argamassa
    const bv = hash(col, row, 3);
    const g = fbm(u, v, 32, 3, 5);
    return { h: 0.65 + 0.2 * g + 0.1 * bv, l: 0.78 + 0.15 * bv + 0.07 * g, r: 0.78 + 0.17 * g };
  },
  grass(u, v) {
    const n = fbm(u, v, 32, 4, 2), f = fbm(u, v, 128, 2, 9);
    const k = 0.6 * n + 0.4 * f;
    return { h: k, l: 0.75 + 0.25 * k, r: 0.95 };
  },
  asphalt(u, v, x, y) {
    const sp = hash(x, y, 11), n = fbm(u, v, 16, 3, 4);
    return { h: 0.4 + 0.4 * sp + 0.2 * n, l: 0.7 + 0.2 * n + 0.1 * sp, r: 0.85 + 0.1 * sp };
  },
  stone(u, v, x, y, s) {
    const sz = s / 4, j = 3;
    const n = fbm(u, v, 24, 3, 6);
    if (x % sz < j || y % sz < j) return { h: 0.1, l: 0.55, r: 1 }; // junta
    const id = hash(Math.floor(x / sz), Math.floor(y / sz), 7);
    return { h: 0.7 + 0.2 * n, l: 0.82 + 0.1 * id + 0.08 * n, r: 0.7 + 0.25 * n };
  },
  wood(u, v, x, y, s) {
    const g = tnoise(u, v, 2, 48, 1) * 0.6 + tnoise(u, v, 4, 96, 2) * 0.4; // veios ao longo de u
    if (y % (s / 4) < 2) return { h: 0.05, l: 0.4, r: 1 }; // fresta entre tábuas
    return { h: 0.5 + 0.4 * g, l: 0.65 + 0.3 * g, r: 0.6 + 0.3 * g };
  },
  bark(u, v) {
    const g = tnoise(u, v, 48, 3, 3) * 0.6 + tnoise(u, v, 96, 6, 4) * 0.4; // sulcos ao longo de v
    return { h: g, l: 0.55 + 0.45 * g, r: 0.95 };
  },
};
const PBR_SIZE = { grass: 512 };                         // padrão: 256
const NORMAL_STRENGTH = { brick: 4, stone: 4, asphalt: 3, grass: 2.5, wood: 2.5, bark: 3 };

function proceduralTextures(kind) {
  const size = PBR_SIZE[kind] ?? 256;
  const fn = PATTERNS[kind];
  const H = new Float32Array(size * size);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    return { c, ctx, img: ctx.createImageData(size, size) };
  };
  const col = mk(), rou = mk(), nor = mk();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = fn(x / size, y / size, x, y, size);
      const i = y * size + x, p = i * 4;
      H[i] = o.h;
      const l = Math.round(THREE.MathUtils.clamp(o.l, 0, 1) * 255);
      const r = Math.round(THREE.MathUtils.clamp(o.r, 0, 1) * 255);
      col.img.data.set([l, l, l, 255], p);
      rou.img.data.set([r, r, r, 255], p);
    }
  }
  // normal map (convenção OpenGL, Y para cima) por diferenças finitas com wrap
  const k = NORMAL_STRENGTH[kind] ?? 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = H[y * size + (x - 1 + size) % size];
      const hr = H[y * size + (x + 1) % size];
      const hu = H[((y - 1 + size) % size) * size + x];
      const hd = H[((y + 1) % size) * size + x];
      let nx = -(hr - hl) * k, ny = (hd - hu) * k, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      nor.img.data.set([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
    }
  }
  const toTex = (m, srgb) => {
    m.ctx.putImageData(m.img, 0, 0);
    const t = new THREE.Texture(m.c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAX_ANISO;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: toTex(col, true), normalMap: toTex(nor, false), roughnessMap: toTex(rou, false) };
}

const pbrBase = new Map();
/** Material PBR com cor, normal map e roughness map. `repeat` = nº de repetições da textura na face. */
function pbr(kind, repeat = [1, 1], { normalScale = 1, ...params } = {}) {
  if (!pbrBase.has(kind)) pbrBase.set(kind, proceduralTextures(kind));
  const b = pbrBase.get(kind);
  const cl = (t) => {
    const c = t.clone(); // compartilha a imagem (Source); só muda o repeat
    c.needsUpdate = true;
    c.repeat.set(repeat[0], repeat[1]);
    return c;
  };
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,   // multiplica o roughnessMap
    metalness: 0,
    map: cl(b.map),
    normalMap: cl(b.normalMap),
    roughnessMap: cl(b.roughnessMap),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...params,
  });
}
/** Mesmo que pbr(), mas com repeat calculado a partir do tamanho da superfície (tile em metros). */
const tiled = (kind, w, d, tile = 4, opts) => pbr(kind, [w / tile, d / tile], opts);


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


function flat(w, d, material, x, z, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}


// --- materiais do terreno (M4) ---
const grassMat = tiled('grass', 240, 240, 4, { color: 0xa9bd6a, normalScale: 0.8 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), grassMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const ROAD_TINT = 0x77777d;
const SIDEWALK_TINT = 0xd6cdbb;
const PATH_TINT = 0xe0d4ba;

// rua em anel
flat(28, 5, tiled('asphalt', 28, 5, 4, { color: ROAD_TINT }), 0, -11.5, 0.02); // norte
flat(28, 5, tiled('asphalt', 28, 5, 4, { color: ROAD_TINT }), 0, 11.5, 0.02);  // sul
flat(5, 18, tiled('asphalt', 5, 18, 4, { color: ROAD_TINT }), -11.5, 0, 0.02); // oeste
flat(5, 18, tiled('asphalt', 5, 18, 4, { color: ROAD_TINT }), 11.5, 0, 0.02);  // leste

// linha central tracejada
const dashGeo = new THREE.PlaneGeometry(1, 0.12);
const dashMat = mat(0xe3c04a, 0.8);
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


flat(32, 2, tiled('stone', 32, 2, 2, { color: SIDEWALK_TINT }), 0, -15, 0.04);
flat(32, 2, tiled('stone', 32, 2, 2, { color: SIDEWALK_TINT }), 0, 15, 0.04);
flat(2, 28, tiled('stone', 2, 28, 2, { color: SIDEWALK_TINT }), -15, 0, 0.04);
flat(2, 28, tiled('stone', 2, 28, 2, { color: SIDEWALK_TINT }), 15, 0, 0.04);


flat(2.4, 18, tiled('stone', 2.4, 18, 2, { color: PATH_TINT }), 0, 0, 0.04);
flat(18, 2.4, tiled('stone', 18, 2.4, 2, { color: PATH_TINT }), 0, 0, 0.04);
const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.8, 40), pbr('stone', [3.8, 3.8], { color: PATH_TINT }));
plaza.rotation.x = -Math.PI / 2;
plaza.position.y = 0.05;
plaza.receiveShadow = true;
scene.add(plaza);


// --- decoração de outono ---
const pumpkinGeo = new THREE.SphereGeometry(0.28, 12, 10);
const pumpkinMat = mat(0xe07a1f, 0.55);
const stemMat = pbr('bark', [1, 1], { color: 0x5a6a30 });
const hayMat = pbr('bark', [2, 1], { color: 0xdcbc62 });   // sulcos viram "palha"
const cornMat = pbr('bark', [1, 2], { color: 0xcfae5e });

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

const wreathMat = mat(0xb5402a, 0.8);
const bowMat = mat(0xd4a02a, 0.5, { metalness: 0.3 });
function addWreath(parent, x, y, z, r = 0.28) {
  const w = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.26, 8, 20), wreathMat);
  w.position.set(x, y, z);
  parent.add(w);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, r * 0.35, 0.04), bowMat);
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
  t.anisotropy = MAX_ANISO;
  return t;
}

function makeSign(text, w = 2.8, bg, fg) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, w / 4, 0.08),
    new THREE.MeshStandardMaterial({ map: signTexture(text, bg, fg), roughness: 0.55, metalness: 0.1 })
  );
}

// vidro: liso (roughness baixa) para refletir o environment map
const glassMat = mat(0xbfd8e0, 0.06, { metalness: 0.15, envMapIntensity: 1.6, emissive: 0x2a3a40, emissiveIntensity: 0.25 });
const frameMat = mat(0xf4efe2, 0.6);
const creamMat = pbr('stone', [4, 1], { color: 0xefe6cf, normalScale: 0.6 }); // cornijas
const roofMat = pbr('asphalt', [3, 3], { color: 0x8a7f78 });
const chimneyMat = pbr('brick', [1, 2], { color: 0x8a4630 });
const stepMat = pbr('stone', [4, 1], { color: 0xc4bcac });
const doorMat = (awning) => mat(awning, 0.45, { metalness: 0.05 });


/* ==========================================================================
 * INTERIORES — lojas ocas, com porta aberta e zonas de colisão
 *
 * Cada loja é uma casca oca (fundo, laterais, fachada com vãos, piso e teto).
 * O jogador só pode estar: (a) na praça/rua/calçada (quadrado PLAYER_LIMIT),
 * (b) dentro da zona interna de uma loja, ou (c) no corredor estreito que liga
 * a calçada à porta. Assim as paredes continuam sólidas e só o vão da porta passa.
 * Móveis são "blockers" (retângulos proibidos).
 * ========================================================================== */
const WALL_T = 0.2;
const ZONES = [];      // retângulos (mundo, XZ) onde o jogador pode ficar além da praça
const INTERIORS = [];  // só as zonas internas (liga a luz de ambiente)
const BLOCKERS = [];   // móveis: o jogador não entra
const ROOFS = [];      // telhados (para as abóboras de Halloween)
const lampMats = [];   // materiais dos postes (brilho muda no Halloween)
let iseed = 99;        // PRNG separado, para não alterar o layout aleatório da cidade
const irand = () => (iseed = (iseed * 16807) % 2147483647) / 2147483647;

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
function toWorldRect(b, [x0, x1, z0, z1]) {
  b.updateMatrixWorld(true);
  const a = b.localToWorld(new THREE.Vector3(x0, 0, z0));
  const c = b.localToWorld(new THREE.Vector3(x1, 0, z1));
  return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), z0: Math.min(a.z, c.z), z1: Math.max(a.z, c.z) };
}
function canStand(x, z) {
  for (const r of BLOCKERS) if (inRect(r, x, z)) return false;
  if (Math.abs(x) <= PLAYER_LIMIT && z <= PLAYER_LIMIT && z >= northLimitAt(x)) return true;
  for (const r of ZONES) if (inRect(r, x, z)) return true;
  return false;
}

const glassClear = mat(0xbfd8e0, 0.05, { metalness: 0.1, envMapIntensity: 1.6, transparent: true, opacity: 0.22, depthWrite: false });
const lampMat = mat(0xfff2c0, 0.4, { emissive: 0xffe39a, emissiveIntensity: 1.3 });
const ceilMat = mat(0xf1e8d4, 0.9);
const counterMat = pbr('wood', [2, 1], { color: 0x8a5a30, normalScale: 0.8 });
const shelfMat = pbr('wood', [2, 1], { color: 0x6e4725, normalScale: 0.6 });
const GOODS = [0xc0392b, 0x2f6b4a, 0xd4a02a, 0x24405e, 0xe0a526, 0x6b3a5e];
const RUGS = [0x8a2f2f, 0x2f4f6b, 0x6b5a2f, 0x4a6b3a];

/** Pedaço de parede (x0..x1, y0..y1) no plano z. */
function wallSeg(g, mk, x0, x1, y0, y1, z, t = WALL_T) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0.001 || h <= 0.001) return;
  addBox(g, w, h, t, mk(w, h), (x0 + x1) / 2, (y0 + y1) / 2, z);
}

/** Moldura em volta de um vão (barras + travessas opcionais). */
function addFrame(g, x0, x1, y0, y1, z, { sill = true, mullion = true, b = 0.1 } = {}) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  addBox(g, w + 2 * b, b, 0.26, frameMat, cx, y1 + b / 2, z, false);
  if (sill) addBox(g, w + 2 * b, b, 0.26, frameMat, cx, y0 - b / 2, z, false);
  addBox(g, b, h, 0.26, frameMat, x0 - b / 2, cy, z, false);
  addBox(g, b, h, 0.26, frameMat, x1 + b / 2, cy, z, false);
  if (mullion) {
    addBox(g, w, 0.04, 0.06, frameMat, cx, cy, z, false);
    addBox(g, 0.04, h, 0.06, frameMat, cx, cy, z, false);
  }
}

/** Porta aberta: batente + folha girada para dentro. */
function addDoor(g, doorX, doorW, doorH, front, color) {
  const z = front - WALL_T / 2;
  addFrame(g, doorX - doorW / 2, doorX + doorW / 2, 0, doorH, z, { sill: false, mullion: false });
  const leafW = doorW - 0.2, leafH = doorH - 0.1;
  const pivot = new THREE.Group();
  pivot.position.set(doorX - doorW / 2 + 0.05, 0.03, front - WALL_T - 0.05);
  pivot.rotation.y = Math.PI / 2 * 0.92; // aberta, encostada na lateral de dentro
  addBox(pivot, leafW, leafH, 0.05, doorMat(color), leafW / 2, leafH / 2, 0, false);
  g.add(pivot);
}

/**
 * Casca oca: fundo, laterais, fachada com vãos (porta + janelas), piso, teto e
 * luminárias. Registra as zonas de colisão em g.userData.
 */
function buildShell(g, { w, d, h, mk, doorX, doorW, doorH, openings = [], ceilY = 3.4, floorTop = 0.045, floorMat }) {
  const front = d / 2, t = WALL_T, zf = front - t / 2;

  // fundo e laterais
  addBox(g, w, h, t, mk(w, h), 0, h / 2, -front + t / 2);
  for (const sx of [-1, 1]) addBox(g, t, h, d - t, mk(d, h), sx * (w / 2 - t / 2), h / 2, t / 2);

  // fachada: trechos entre os vãos + parede acima/abaixo de cada vão
  const ops = [{ x0: doorX - doorW / 2, x1: doorX + doorW / 2, y0: 0, y1: doorH, door: true }, ...openings]
    .sort((a, b) => a.x0 - b.x0);
  let cx = -w / 2;
  for (const o of ops) {
    wallSeg(g, mk, cx, o.x0, 0, ceilY, zf);
    wallSeg(g, mk, o.x0, o.x1, 0, o.y0, zf);        // peitoril
    wallSeg(g, mk, o.x0, o.x1, o.y1, ceilY, zf);    // verga
    if (!o.door) {
      addFrame(g, o.x0, o.x1, o.y0, o.y1, zf);
      addBox(g, o.x1 - o.x0, o.y1 - o.y0, 0.03, glassClear, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, zf, false);
    }
    cx = o.x1;
  }
  wallSeg(g, mk, cx, w / 2, 0, ceilY, zf);
  wallSeg(g, mk, -w / 2, w / 2, ceilY, h, zf);      // faixa de cima (janelas do 2º andar são decoração)

  // piso (vai até a frente, por baixo da soleira) e teto
  const floor = addBox(g, w - 2 * t, floorTop, d - t, floorMat, 0, floorTop / 2, t / 2, false);
  if (floorTop > 0.1) g.userData.floor = floor; // piso elevado vira "caminhável"
  addBox(g, w - 2 * t, 0.1, d - 2 * t, ceilMat, 0, ceilY + 0.05, 0, false);
  for (const [lx, lz] of [[-w * 0.2, 0], [w * 0.25, 0.8]]) {
    addBox(g, 0.55, 0.06, 0.55, lampMat, lx, ceilY - 0.03, lz, false);
  }

  // zonas (coordenadas locais): interior, e corredor da porta até a calçada
  const m = 0.3;
  g.userData.zones = [
    [-w / 2 + t + m, w / 2 - t - m, -front + t + 0.55, front - t - m],
    [doorX - 0.4, doorX + 0.4, front - t - 0.8, front + 1.2],
  ];
  g.userData.blockers = [];
}

function furnishShop(g, w, d) {
  const front = d / 2, backZ = -front + WALL_T;
  const fy = 0.045;
  // prateleiras no fundo, com mercadorias
  for (let k = 0; k < 3; k++) {
    const y = fy + 0.45 + k * 0.85;
    addBox(g, w - 0.7, 0.06, 0.42, shelfMat, 0, y, backZ + 0.21, false);
    const n = 5, span = w - 1.2;
    for (let j = 0; j < n; j++) {
      const gw = 0.35 + irand() * 0.25, gh = 0.25 + irand() * 0.3;
      const col = GOODS[Math.floor(irand() * GOODS.length)];
      addBox(g, gw, gh, 0.3, mat(col, 0.7), -span / 2 + (j + 0.5) * (span / n), y + 0.03 + gh / 2, backZ + 0.2, false);
    }
  }
  // balcão (bloqueia o lado esquerdo)
  const cxm = -w * 0.2;
  addBox(g, 2.4, 1.0, 0.7, counterMat, cxm, fy + 0.5, 0, false);
  addBox(g, 2.5, 0.06, 0.8, shelfMat, cxm, fy + 1.03, 0, false);
  g.userData.blockers.push([cxm - 1.5, cxm + 1.5, -0.65, 0.65]);
  // mesinha
  const tx = 1.9, tz = -1.6;
  addBox(g, 0.8, 0.05, 0.8, counterMat, tx, fy + 0.75, tz, false);
  addBox(g, 0.1, 0.72, 0.1, shelfMat, tx, fy + 0.36, tz, false);
  g.userData.blockers.push([tx - 0.7, tx + 0.7, tz - 0.7, tz + 0.7]);
  // tapete
  addBox(g, 2.2, 0.01, 1.6, mat(RUGS[Math.floor(irand() * RUGS.length)], 0.95), 1.4, fy + 0.005, 1.1, false);
}

function buildShop({ w, d, h, color, awning, name }) {
  const g = new THREE.Group();
  const front = d / 2;
  const cache = new Map();
  const mk = (pw, ph) => {
    const k = `${pw.toFixed(2)}|${ph.toFixed(2)}`;
    if (!cache.has(k)) cache.set(k, pbr('brick', [pw / 1.2, ph / 1.2], { color, normalScale: 1.2 }));
    return cache.get(k);
  };
  const doorX = w * 0.3, doorW = 1.3, doorH = 2.5;

  buildShell(g, {
    w, d, h, mk, doorX, doorW, doorH, ceilY: 3.4, floorTop: 0.045,
    floorMat: pbr('wood', [w / 2, d / 2], { color: 0xb98a56, normalScale: 0.6 }),
    openings: [{ x0: -w * 0.45, x1: w * 0.05, y0: 0.9, y1: 2.9 }], // vitrine
  });
  addDoor(g, doorX, doorW, doorH, front, awning);

  addBox(g, w + 0.3, 0.4, d + 0.3, creamMat, 0, h + 0.2, 0);   // cornija
  addBox(g, w - 0.2, 0.1, d - 0.2, roofMat, 0, h + 0.45, 0);   // telhado plano
  // rodapé externo só nos trechos de parede (não na porta)
  const dl = doorX - doorW / 2, dr = doorX + doorW / 2;
  addBox(g, dl + w / 2 + 0.05, 0.5, 0.1, creamMat, (-w / 2 - 0.05 + dl) / 2, 0.25, front + 0.03);
  addBox(g, w / 2 + 0.05 - dr, 0.5, 0.1, creamMat, (dr + w / 2 + 0.05) / 2, 0.25, front + 0.03);
  addWreath(g, dr + (w / 2 - dr) / 2, 1.9, front + 0.14);

  // janelas do andar de cima (decoração)
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
  if (rand() > 0.5) addBox(g, 0.7, 1.6, 0.7, chimneyMat, w * 0.3, h + 1.2, -d * 0.2);

  // decoração na calçada
  decorCluster(g, -w * 0.4, front + 0.9);

  furnishShop(g, w, d);
  g.userData.h = h;
  return g;
}

function buildTownHall(w, d, h) {
  const g = new THREE.Group();
  const front = d / 2;
  const pw = w * 0.8;
  const cache = new Map();
  const mk = (a, b) => {
    const k = `${a.toFixed(2)}|${b.toFixed(2)}`;
    if (!cache.has(k)) cache.set(k, pbr('stone', [a / 2, b / 2], { color: 0xf0ebe0, normalScale: 0.7 }));
    return cache.get(k);
  };
  const white = pbr('stone', [w / 2, h / 2], { color: 0xf0ebe0, normalScale: 0.7 }); // pedra clara
  const whiteCol = pbr('stone', [1, 3], { color: 0xf0ebe0, normalScale: 0.5 });      // colunas
  const doorW = 1.8, doorH = 2.6, FLOOR = 0.3; // piso do hall na altura do degrau

  buildShell(g, {
    w, d, h, mk, doorX: 0, doorW, doorH, ceilY: 4.2, floorTop: FLOOR,
    floorMat: pbr('stone', [3, 3], { color: 0xd8cfbb }),
    openings: [-1, 1].map((s) => ({ x0: s * w * 0.35 - 0.45, x1: s * w * 0.35 + 0.45, y0: 1.0, y1: 2.8 })),
  });
  addDoor(g, 0, doorW, doorH, front, 0x2f6b4a);

  addBox(g, w + 0.3, 0.4, d + 0.3, creamMat, 0, h + 0.2, 0);
  addBox(g, w - 0.2, 0.1, d - 0.2, roofMat, 0, h + 0.45, 0);

  // degrau + varanda
  g.userData.step = addBox(g, pw + 0.4, 0.3, 2.2, stepMat, 0, 0.15, front + 1.1);
  const cols = 4;
  for (let i = 0; i < cols; i++) {
    const x = -pw / 2 + 0.4 + i * ((pw - 0.8) / (cols - 1));
    addCyl(g, 0.2, 0.22, 3.6, whiteCol, x, 2.1, front + 1.8, 14);
  }
  addBox(g, pw, 0.35, 2, white, 0, 4.075, front + 1);

  // frontão triangular
  const s = new THREE.Shape();
  s.moveTo(-pw / 2, 0);
  s.lineTo(pw / 2, 0);
  s.lineTo(0, 1.1);
  s.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }), mat(0xf0ebe0, 0.7));
  ped.position.set(0, 4.25, front);
  ped.castShadow = true;
  g.add(ped);

  const sign = makeSign('Town Hall', 3.2, '#1f3a5a', '#f4ecd0');
  sign.position.set(0, 3.2, front + 0.08);
  g.add(sign);
  addWreath(g, 1.3, 2.2, front + 0.16, 0.32);

  decorCluster(g, -w * 0.38, front + 2.8);
  decorCluster(g, w * 0.38, front + 2.8);

  // mobília: mesa do prefeito e dois bancos
  addBox(g, 3.2, 1.0, 0.8, counterMat, 0, FLOOR + 0.5, -1.7, false);
  g.userData.blockers.push([-1.9, 1.9, -2.4, -1.0]);
  for (const sx of [-1, 1]) {
    addBox(g, 0.5, 0.08, 1.6, shelfMat, sx * 2.3, FLOOR + 0.45, 0.8, false);
    addBox(g, 0.4, 0.4, 0.1, shelfMat, sx * 2.3, FLOOR + 0.2, 0.2, false);
    addBox(g, 0.4, 0.4, 0.1, shelfMat, sx * 2.3, FLOOR + 0.2, 1.4, false);
    g.userData.blockers.push([sx * 2.3 - 0.5, sx * 2.3 + 0.5, -0.25, 1.85]);
  }
  g.userData.h = h;
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
    b.updateMatrixWorld(true);
    const zs = b.userData.zones.map((r) => toWorldRect(b, r));
    ZONES.push(...zs);
    INTERIORS.push(zs[0]);
    ROOFS.push({ b, h: b.userData.h });
    for (const r of b.userData.blockers) BLOCKERS.push(toWorldRect(b, r));
    if (b.userData.step) registerWalkable(b.userData.step);   // degrau da prefeitura
    if (b.userData.floor) registerWalkable(b.userData.floor); // piso elevado do hall
  });
});

// metal: metalness alto só faz sentido COM environment map (senão fica preto)
const ironMat = mat(0x1f1f22, 0.4, { metalness: 0.85 });

function addLamp(x, z) {
  const g = new THREE.Group();
  addCyl(g, 0.15, 0.2, 0.5, ironMat, 0, 0.25, 0, 10);
  addCyl(g, 0.06, 0.08, 3.2, ironMat, 0, 1.9, 0, 10);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe39a, emissiveIntensity: 0.9, roughness: 0.3 })
  );
  lamp.position.y = 3.6;
  lampMats.push(lamp.material);
  g.add(lamp);
  addCyl(g, 0.12, 0.12, 0.08, ironMat, 0, 3.35, 0, 10);
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

const benchWood = pbr('wood', [1, 1], { color: 0x4a7a54, normalScale: 0.8 }); // madeira pintada de verde
function addBench(x, z, rotY) {
  const g = new THREE.Group();
  addBox(g, 1.6, 0.08, 0.5, benchWood, 0, 0.5, 0);
  addBox(g, 1.6, 0.45, 0.06, benchWood, 0, 0.8, -0.24);
  addBox(g, 0.06, 0.5, 0.5, ironMat, -0.7, 0.25, 0);
  addBox(g, 0.06, 0.5, 0.5, ironMat, 0.7, 0.25, 0);
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

const chairWood = pbr('wood', [1, 1], { color: 0x9a6c3e });
function addChair(x, z, rotY) {
  const g = new THREE.Group();
  addBox(g, 0.45, 0.05, 0.45, chairWood, 0, 0.45, 0);
  addBox(g, 0.45, 0.45, 0.05, chairWood, 0, 0.7, -0.2);
  for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    addBox(g, 0.04, 0.45, 0.04, chairWood, dx, 0.22, dz);
  }
  g.position.set(x, 0.03, z);
  g.rotation.y = rotY;
  scene.add(g);
}

// mesa externa da cafeteria (sobre a calçada norte)
const TABLE = { x: 4.55, z: -15 };
const table = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.1, 0.9),
  pbr('wood', [1.5, 1], { color: 0xa5703a, normalScale: 0.9 })
);
table.position.set(TABLE.x, 0.88, TABLE.z);
table.castShadow = table.receiveShadow = true;
scene.add(table);
for (const [dx, dz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), chairWood);
  leg.position.set(TABLE.x + dx, 0.43, TABLE.z + dz);
  leg.castShadow = true;
  scene.add(leg);
}
addChair(TABLE.x, TABLE.z + 0.85, Math.PI); // do lado da rua, de frente para a mesa
addChair(TABLE.x, TABLE.z - 0.85, 0);       // do lado da cafeteria

// bandeira
{
  const g = new THREE.Group();
  addCyl(g, 0.04, 0.06, 6, mat(0xcfcfcf, 0.3, { metalness: 0.9 }), 0, 3, 0, 8);
  addBox(g, 1.2, 0.7, 0.02, mat(0xb22234, 0.8), 0.65, 5.5, 0, false);
  addBox(g, 0.5, 0.35, 0.03, mat(0x1d3a7a, 0.8), 0.3, 5.68, 0, false);
  g.position.set(3.8, 0, -4.6);
  scene.add(g);
}


// casca de árvore com relevo (normal map) e roughness alta
const barkMat = pbr('bark', [2, 3], { color: 0x6b5744, normalScale: 1.4 });


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
  const lm = mat(LEAF_COLORS[colorIdx % LEAF_COLORS.length], 0.85, { flatShading: true });
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
  const bushMat = mat(0x4a6b3a, 0.95, { flatShading: true });
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


/* ==========================================================================
 * BONECO (avatar do jogador) + luz interna
 *
 * Em primeira pessoa o corpo fica invisível para a câmera principal (colorWrite
 * e depthWrite desligados), mas continua projetando sombra no shadow map.
 * Na visão de cima (minimapa) e na terceira pessoa (tecla V) ele aparece.
 * ========================================================================== */
const avatar = new THREE.Group();
const avatarMats = [];
const limbs = {};
(function buildAvatar() {
  const std = (c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); avatarMats.push(m); return m; };
  const skin = std(0xe8b894), shirt = std(0xb5402a), pants = std(0x24405e), hair = std(0x4a2f1c), shoe = std(0x2b2118);
  const part = (geo, m, x, y, z, parent = avatar) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  part(new THREE.BoxGeometry(0.44, 0.6, 0.24), shirt, 0, 1.15, 0);               // tronco
  part(new THREE.SphereGeometry(0.15, 16, 12), skin, 0, 1.56, 0);                 // cabeça
  part(new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.575, 0.02); // cabelo
  const limb = (x, y, w, h, d, m) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    part(new THREE.BoxGeometry(w, h, d), m, 0, -h / 2, 0, p);
    avatar.add(p);
    return p;
  };
  limbs.legL = limb(-0.11, 0.85, 0.18, 0.8, 0.2, pants);
  limbs.legR = limb(0.11, 0.85, 0.18, 0.8, 0.2, pants);
  limbs.armL = limb(-0.3, 1.42, 0.12, 0.6, 0.14, shirt);
  limbs.armR = limb(0.3, 1.42, 0.12, 0.6, 0.14, shirt);
  for (const l of [limbs.legL, limbs.legR]) part(new THREE.BoxGeometry(0.18, 0.08, 0.3), shoe, 0, -0.76, -0.05, l);
})();
scene.add(avatar);

function setAvatarVisible(v) {
  for (const m of avatarMats) { m.colorWrite = v; m.depthWrite = v; } // invisível, mas ainda projeta sombra
}

function updateAvatar(amp) {
  avatar.position.set(camera.position.x, groundY, camera.position.z);
  avatar.rotation.y = yaw;
  const sw = Math.sin(bobT) * 0.7 * amp;
  limbs.legL.rotation.x = sw;  limbs.legR.rotation.x = -sw;
  limbs.armL.rotation.x = -sw; limbs.armR.rotation.x = sw;
}

// luz quente que acende quando o jogador está dentro de uma loja
const roomLight = new THREE.PointLight(0xffe2b8, 0, 10, 1.6);
scene.add(roomLight);
const ROOM_LIGHT_MAX = 12;
function updateRoomLight(dt) {
  const px = camera.position.x, pz = camera.position.z;
  let inside = false;
  for (const r of INTERIORS) if (inRect(r, px, pz)) { inside = true; break; }
  roomLight.intensity += ((inside ? ROOM_LIGHT_MAX : 0) - roomLight.intensity) * (1 - Math.exp(-6 * dt));
  roomLight.position.set(px, groundY + 2.4, pz);
}


/* ==========================================================================
 * HALLOWEEN
 *
 * - Bruxa na praça: chegue perto e aperte E para conversar. No fim da conversa
 *   a cidade vira Halloween (transição suave de ~3,5 s). Atalho direto: tecla H.
 * - Muda: céu/névoa (noite roxa), luz hemisférica (roxa), sol (luar azulado),
 *   env map, tint de TODAS as texturas PBR (tijolo, pedra, asfalto, madeira...),
 *   grama seca, vidros acesos em laranja, postes verdes.
 * - Surgem: abóboras em toda a cidade (modelo glTF, com brilho), fantasmas voando
 *   em círculos pelo céu, lua, estrelas e luzes laranja na praça. Raios de vez em quando.
 * - Os modelos de fantasma e abóbora são opcionais: se o arquivo não carregar,
 *   são usados fantasmas e abóboras gerados por código.
 * ========================================================================== */
const hrand = (() => { let s = 4242; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const lerp = THREE.MathUtils.lerp;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const HW_DURATION = 3.5; // segundos da transição
let hw = 0, hwTarget = 0, hwApplied = -1;

// Onde estão os modelos (pasta própria para cada um) + ajustes de tamanho e direção da frente
const HW_ASSETS = {
<<<<<<< HEAD
  ghost:   { name: 'Fantasma', url: '/models/ghost_phantom/scene.gltf', height: 2.2, yaw: 0, animate: true },
=======
  ghost:   { name: 'Fantasma', url: '/models/ghost_phantom/scene.gltf', height: 2.2, yaw: 0 },
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
  pumpkin: { name: 'Abóbora',  url: '/models/pumpkin/scene.gltf',       height: 0.6, yaw: 0 },
};

const hwc = (hex) => new THREE.Color(hex);
const C = {
  sky: hwc(SKY), night: hwc(0x120a22),
  hemiSky0: hwc(0xfff1d6), hemiSky1: hwc(0x6a4a9a),
  hemiGnd0: hwc(0x7a6a4c), hemiGnd1: hwc(0x2b1a12),
  sun0: hwc(0xffe6bf), sun1: hwc(0x8fa0ff),
  tint: hwc(0x8f86b8), grass: hwc(0x4b5326),
  lamp0: hwc(0xffe39a), lamp1: hwc(0x66ff7a),
  glass0: hwc(0x2a3a40), glass1: hwc(0xff8a2a),
};
const _tint = new THREE.Color();
const ghostMats = [];

// ---------- lua, halo e estrelas (acompanham a câmera) ----------
const MOON_OFF = new THREE.Vector3(-26, 36, -44);
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(5, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe9b8, fog: false, transparent: true, opacity: 0 })
);
const halo = new THREE.Mesh(
  new THREE.SphereGeometry(7.5, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffc66a, fog: false, transparent: true, opacity: 0, depthWrite: false })
);
const stars = (() => {
  const p = [];
  for (let i = 0; i < 350; i++) {
    const u = hrand() * Math.PI * 2, y = 0.15 + hrand() * 0.85, r = Math.sqrt(1 - y * y);
    p.push(Math.cos(u) * r * 68, y * 68, Math.sin(u) * r * 68);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, fog: false, transparent: true, opacity: 0, depthWrite: false }));
})();
moon.visible = halo.visible = stars.visible = false;
scene.add(moon, halo, stars);

// luzes laranja da praça (intensidade 0 até virar Halloween)
const lanternLights = [[3.1, 3.1], [-3.1, 3.1], [3.1, -3.1], [-3.1, -3.1]].map(([x, z]) => {
  const l = new THREE.PointLight(0xff7a1a, 0, 10, 1.6);
  l.position.set(x, 1.1, z);
  scene.add(l);
  return l;
});

// ---------- onde nascem as abóboras ----------
const spots = [];
const addSpot = (x, z, s = 1, y = 0.04, rot = null) =>
  spots.push({ x, y, z, s, rot: rot ?? Math.atan2(-x, -z) + (hrand() - 0.5) * 0.9, delay: hrand() * 0.45 });

for (let x = -13; x <= 13; x += 2.6) {            // calçadas norte e sul
  for (const sz of [-1, 1]) {
    if (sz < 0 && x > -0.5 && x < 7.2) continue;   // escada/mesa da cafeteria
    addSpot(x + (hrand() - 0.5) * 0.6, sz * (15 + (hrand() - 0.5) * 1.2), 0.9 + hrand() * 0.5);
  }
}
for (let z = -13; z <= 13; z += 2.6) {            // calçadas oeste e leste
  for (const sx of [-1, 1]) addSpot(sx * (15 + (hrand() - 0.5) * 1.2), z + (hrand() - 0.5) * 0.6, 0.9 + hrand() * 0.5);
}
for (let i = 0; i < 10; i++) {                    // anel da praça
  const a = (i / 10) * Math.PI * 2, r = 4.3 + hrand() * 0.6;
  addSpot(Math.cos(a) * r, Math.sin(a) * r, 1 + hrand() * 0.4, 0.05);
}
for (const z of [-12, -9, -6, 9, 12]) for (const sx of [-1, 1]) addSpot(sx * 1.8, z, 0.8 + hrand() * 0.4); // caminhos
for (const [x, z] of [[-9.5, 5], [9.5, 5], [-9.5, -5], [9.5, -5]]) addSpot(x, z, 2.4, 0.03);           // gigantes
for (const { b, h } of ROOFS) {                   // telhados
  for (const [lx, lz, s] of [[-1.8, 1.0, 1.5], [-0.2, 1.7, 1.15]]) {
    const p = b.localToWorld(new THREE.Vector3(lx, h + 0.5, lz));
    spots.push({ x: p.x, y: p.y, z: p.z, s, rot: b.rotation.y, delay: hrand() * 0.45 });
  }
}

const pumpkinGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
pumpkinGroup.visible = ghostGroup.visible = false;
scene.add(pumpkinGroup, ghostGroup);
const pumpkins = [];
const ghosts = [];

// ---------- modelos de reserva (gerados por código) ----------
function faceCanvas(bg, fg, ribs) {
  const W = 512, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (ribs) {
    ctx.strokeStyle = 'rgba(60,20,0,0.35)'; ctx.lineWidth = 5;
    for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.quadraticCurveTo(i * 32 + 8, H / 2, i * 32, H); ctx.stroke(); }
  }
  ctx.fillStyle = fg;
  const cx = W * 0.25; // centro da frente da esfera
  const tri = (a, b, c2, d, e, f) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.lineTo(e, f); ctx.closePath(); ctx.fill(); };
  tri(cx - 50, 118, cx - 14, 118, cx - 32, 80);   // olho esquerdo
  tri(cx + 14, 118, cx + 50, 118, cx + 32, 80);   // olho direito
  tri(cx - 8, 136, cx + 8, 136, cx, 122);         // nariz
  ctx.beginPath(); ctx.moveTo(cx - 64, 146); ctx.lineTo(cx + 64, 146);
  for (let i = 0; i <= 8; i++) ctx.lineTo(cx + 64 - i * 16, i % 2 ? 168 : 190);
  ctx.closePath(); ctx.fill();                    // boca com dentes
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFallbackPumpkin(cfg) {
  const jack = new THREE.MeshStandardMaterial({
    map: faceCanvas('#e8741a', '#1a0a00', true),
    emissiveMap: faceCanvas('#000000', '#ffb020', false),
    emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.55,
  });
  const stem = new THREE.MeshStandardMaterial({ color: 0x4f6a2a, roughness: 0.85 });
  jack.userData.hwSkip = stem.userData.hwSkip = true;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), jack);
  body.scale.y = 0.82; body.position.y = 0.246;
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 8), stem);
  st.position.y = 0.54;
  body.castShadow = true; st.castShadow = true;
  g.add(body, st);
  g.scale.setScalar(cfg.height / 0.6);
  return g;
}

function buildFallbackGhost(cfg) {
  const parts = [];
  const head = new THREE.SphereGeometry(0.42, 16, 12); head.translate(0, 1.15, 0); parts.push(head);
  const trunk = new THREE.CylinderGeometry(0.42, 0.52, 0.9, 16); trunk.translate(0, 0.7, 0); parts.push(trunk);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, s = new THREE.SphereGeometry(0.2, 8, 6);
    s.translate(Math.cos(a) * 0.4, 0.25 + (i % 2) * 0.06, Math.sin(a) * 0.4); parts.push(s);
  }
  for (const sx of [-1, 1]) {
    const arm = new THREE.SphereGeometry(0.14, 8, 6); arm.scale(1, 2.2, 1); arm.rotateZ(sx * 0.9); arm.translate(sx * 0.55, 0.95, 0.05); parts.push(arm);
  }
  const face = [];
  for (const sx of [-1, 1]) { const e = new THREE.SphereGeometry(0.07, 8, 6); e.scale(0.9, 1.5, 0.6); e.translate(sx * 0.15, 1.2, 0.4); face.push(e); }
  const mo = new THREE.SphereGeometry(0.09, 8, 6); mo.scale(1, 1.4, 0.6); mo.translate(0, 0.95, 0.385); face.push(mo);
  const m = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xbcd8ff, emissiveIntensity: 0.9, roughness: 0.6, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const fm = new THREE.MeshBasicMaterial({ color: 0x10101a, transparent: true, opacity: 0, fog: false });
  m.userData.hwSkip = true;
  ghostMats.push(m, fm);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts), m), new THREE.Mesh(mergeGeometries(face), fm));
  g.scale.setScalar(cfg.height / 1.6);
  return g;
}

// ---------- carregamento dos modelos glTF (com reserva) ----------
function loadTexAny(urls, srgb = true) {
  const t = new THREE.Texture();
  t.flipY = false; // convenção do glTF
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  const tryAt = (i) => {
    if (i >= urls.length) return;
    new THREE.ImageLoader().load(urls[i], (img) => { t.image = img; t.needsUpdate = true; }, undefined, () => tryAt(i + 1));
  };
  tryAt(0);
  return t;
}

function setupGhostModel(obj, url) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const diffuse = loadTexAny([dir + 'textures/Fantasma_diffuse.png', dir + 'Fantasma_diffuse.png']);
  const emissive = loadTexAny([dir + 'textures/Fantasma_emissive.png', dir + 'Fantasma_emissive.png']);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    // o glTF usa pbrSpecularGlossiness (não suportado nas versões novas do three): refazemos o material
    const m = new THREE.MeshStandardMaterial({
<<<<<<< HEAD
      map: diffuse, emissiveMap: emissive,
=======
      map: o.material.map ?? diffuse, emissiveMap: o.material.emissiveMap ?? emissive,
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
      emissive: 0xffffff, emissiveIntensity: 0.9, color: 0xffffff, roughness: 0.6,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    m.userData.hwSkip = true;
    o.material = m;
    o.castShadow = false;
    ghostMats.push(m);
  });
}

function setupPumpkinModel(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
<<<<<<< HEAD
      if (m.map && m.map.image && m.map.image.width <= 1) { m.map = null; m.color.setHex(0xd9650f); } // carregou sem textura
=======
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
      if (m.map) m.emissiveMap = m.map;
      m.emissive = new THREE.Color(0xff6a10);
      m.emissiveIntensity = 0.55; // brilho de lanterna
      m.userData.hwSkip = true;
    }
  });
}

<<<<<<< HEAD
const BLANK_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function loadHwTemplate(cfg, fallback, setup) {
  // 3 tentativas: caminho normal; texturas na mesma pasta do .gltf; sem texturas (só a malha)
  const attempts = [
    ['normal', null],
    ['texturas na mesma pasta do .gltf', (u) => u.replace('/textures/', '/')],
    ['sem texturas', (u) => (/\.(png|jpe?g|webp)(\?.*)?$/i.test(u) ? BLANK_PX : u)],
  ];
  for (const [label, mod] of attempts) {
    try {
      const mgr = new THREE.LoadingManager();
      if (mod) mgr.setURLModifier(mod);
      const gltf = await new GLTFLoader(mgr).loadAsync(cfg.url);
      const obj = gltf.scene;
      enableShadows(obj);
      setup(obj, cfg.url);
      console.log(`[halloween] ${cfg.name} carregado de ${cfg.url} (tentativa: ${label})`);
      const holder = fitAndPlace(obj, { name: cfg.name, height: cfg.height, position: [0, 0, 0], rotationY: 0 });
      holder.userData.clips = gltf.animations ?? [];
      return holder;
    } catch (err) {
      console.warn(`[halloween] ${cfg.name}: tentativa "${label}" falhou`, err);
    }
  }
  console.warn(`[halloween] ${cfg.name}: usando modelo de reserva (${cfg.url} não carregou)`);
  return fallback(cfg);
=======
async function loadHwTemplate(cfg, fallback, setup) {
  try {
    const gltf = await gltfLoader.loadAsync(cfg.url);
    const obj = gltf.scene;
    enableShadows(obj);
    setup(obj, cfg.url);
    console.log(`[halloween] ${cfg.name} carregado de ${cfg.url}`);
    return fitAndPlace(obj, { name: cfg.name, height: cfg.height, position: [0, 0, 0], rotationY: 0 });
  } catch (err) {
    console.warn(`[halloween] ${cfg.name}: usando modelo de reserva (${cfg.url} não carregou)`, err);
    return fallback(cfg);
  }
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
}

function spawnPumpkins(tpl) {
  for (const sp of spots) {
    const h = tpl.clone(true);
    h.position.set(sp.x, sp.y, sp.z);
    h.rotation.y = sp.rot + HW_ASSETS.pumpkin.yaw;
    h.userData.sp = sp;
    h.traverse((o) => { if (o.isMesh) o.castShadow = sp.s >= 1.4; }); // só as grandes projetam sombra
    h.scale.setScalar(0.0001);
    pumpkinGroup.add(h);
    pumpkins.push(h);
  }
}

function spawnGhosts(tpl) {
  for (let i = 0; i < 17; i++) {
    const low = i >= 14; // 3 fantasmas "correndo" perto do chão
    const w = new THREE.Group();
    w.rotation.order = 'YXZ';
<<<<<<< HEAD
    // SkeletonUtils.clone: clone() comum de modelo com esqueleto deixa todas as cópias presas na origem
    const m = SkeletonUtils.clone(tpl);
    m.rotation.y = HW_ASSETS.ghost.yaw;
    w.add(m);
    let mixer = null;
    const clips = tpl.userData.clips ?? [];
    if (HW_ASSETS.ghost.animate && clips.length) {
      mixer = new THREE.AnimationMixer(m);
      const act = mixer.clipAction(clips[0]);
      act.play();
      act.time = hrand() * clips[0].duration;
    }
=======
    const m = tpl.clone(true);
    m.rotation.y = HW_ASSETS.ghost.yaw;
    w.add(m);
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
    w.scale.setScalar(low ? 1.1 : 1.2 + hrand() * 0.7);
    ghostGroup.add(w);
    ghosts.push({
      g: w, low,
      R: low ? 13 + hrand() * 1.5 : 16 + hrand() * 26,
      h: low ? 0.3 : 6 + hrand() * 14,
      spd: (low ? 0.5 : 0.25 + hrand() * 0.5) * (hrand() < 0.5 ? -1 : 1),
      ph: hrand() * Math.PI * 2,
<<<<<<< HEAD
      mixer,
    });
  }
  console.log(`[halloween] ${ghosts.length} fantasmas criados`);
=======
    });
  }
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
}

async function initHalloweenAssets() {
  const [gt, pt] = await Promise.all([
    loadHwTemplate(HW_ASSETS.ghost, buildFallbackGhost, setupGhostModel),
    loadHwTemplate(HW_ASSETS.pumpkin, buildFallbackPumpkin, setupPumpkinModel),
  ]);
  spawnPumpkins(pt);
  spawnGhosts(gt);
  applyDiagnostics();
  hwApplied = -1; // reaplica o estado atual aos objetos novos
}

// ---------- a bruxa (NPC) ----------
const NPC_POS = new THREE.Vector3(0, 0.04, 5.6);
const NPC_RANGE = 3.2;
const npc = new THREE.Group();
const npcMats = [];
let npcLantern, npcCloak, npcMark;
(function buildNPC() {
  const std = (c, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra }); m.userData.hwSkip = true; npcMats.push(m); return m; };
  const part = (geo, m, x, y, z, parent = npc) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const robe = std(0x2a1a3a), skin = std(0x8fb86a), hat = std(0x15101f), band = std(0xe07a1f), eye = std(0x111111);
  npcCloak = part(new THREE.CylinderGeometry(0.14, 0.52, 1.5, 18), robe, 0, 0.75, 0);
  part(new THREE.SphereGeometry(0.18, 16, 12), skin, 0, 1.68, 0);                                 // cabeça
  part(new THREE.ConeGeometry(0.035, 0.14, 8), skin, 0, 1.64, 0.19).rotation.x = Math.PI / 2;      // nariz
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(0.03, 8, 6), eye, sx * 0.07, 1.72, 0.155);                       // olhos
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 8), robe, sx * 0.32, 1.15, 0.05).rotation.z = sx * 0.5; // mangas
  }
  part(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), hat, 0, 1.82, 0);                          // aba
  part(new THREE.ConeGeometry(0.22, 0.62, 18), hat, 0, 2.14, 0).rotation.z = 0.12;                // chapéu
  part(new THREE.CylinderGeometry(0.225, 0.23, 0.08, 18), band, 0, 1.88, 0);                      // fita
  part(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6), std(0x6b4a2a), -0.5, 0.95, 0.1).rotation.z = 0.1; // vassoura
  part(new THREE.ConeGeometry(0.14, 0.4, 10), std(0xc9a24a), -0.41, 0.2, 0.1);
  npcLantern = part(new THREE.SphereGeometry(0.13, 14, 10), std(0xff8a1a, { emissive: 0xff6a00, emissiveIntensity: 1.6, roughness: 0.5 }), 0.5, 1.1, 0.3);
  npcLantern.castShadow = false;

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 110px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#2b1a05'; ctx.strokeText('!', 64, 70);
  ctx.fillStyle = '#ffb020'; ctx.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  npcMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
  npcMark.scale.set(0.5, 0.5, 1);
  npc.add(npcMark);
})();
npc.position.copy(NPC_POS);
scene.add(npc);
BLOCKERS.push({ x0: NPC_POS.x - 0.55, x1: NPC_POS.x + 0.55, z0: NPC_POS.z - 0.55, z1: NPC_POS.z + 0.55 });

// ---------- HUD (balão de fala) e flash ----------
const hud = document.createElement('div');
Object.assign(hud.style, {
  position: 'fixed', left: '50%', bottom: '90px', transform: 'translateX(-50%)', maxWidth: '560px',
  padding: '12px 18px', background: 'rgba(20,10,30,0.85)', color: '#f4ecd0', font: '18px Georgia, serif',
  border: '2px solid #e07a1f', borderRadius: '10px', display: 'none', textAlign: 'center', zIndex: '20', pointerEvents: 'none',
});
document.body.appendChild(hud);
const flash = document.createElement('div');
Object.assign(flash.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0', zIndex: '19', pointerEvents: 'none' });
document.body.appendChild(flash);
let hudKey = '';
function setHud(html) {
  if (html === hudKey) return;
  hudKey = html;
  hud.style.display = html ? 'block' : 'none';
  hud.innerHTML = html;
}

const DLG_ON = [
  '🎃 <b>Bruxa:</b> Ora, ora... mais um visitante passeando por Stars Hollow.',
  '🎃 <b>Bruxa:</b> Esse outono está bonito demais, não acha? Falta um pouquinho de... mistério.',
  '🎃 <b>Bruxa:</b> Feche os olhos e não se assuste. Vou acender as abóboras!',
];
const DLG_OFF = [
  '🎃 <b>Bruxa:</b> Já cansou dos fantasmas? Posso devolver a cidade ao normal.',
  '🎃 <b>Bruxa:</b> Então tá... puf!',
];
let dlg = null;
function showLine() {
  setHud(`${dlg.lines[dlg.i]}<div style="font-size:13px;opacity:.7;margin-top:6px">E para continuar</div>`);
}
function interactNPC() {
  if (dlg) {
    dlg.i++;
    if (dlg.i >= dlg.lines.length) { const done = dlg.done; dlg = null; setHud(''); done(); } else showLine();
    return;
  }
  const d = Math.hypot(camera.position.x - npc.position.x, camera.position.z - npc.position.z);
  if (d > NPC_RANGE) return;
  dlg = hwTarget === 0 ? { lines: DLG_ON, i: 0, done: () => setHalloween(true) } : { lines: DLG_OFF, i: 0, done: () => setHalloween(false) };
  showLine();
}
function setHalloween(on) {
  hwTarget = on ? 1 : 0;
  flash.style.transition = 'none';
  flash.style.opacity = '0.95';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    flash.style.transition = 'opacity 1.6s ease-out';
    flash.style.opacity = '0';
  }));
}
function toggleHalloween() { setHalloween(hwTarget === 0); }

function updateNPC(dt, t) {
  const dx = camera.position.x - npc.position.x, dz = camera.position.z - npc.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 14) {
    let d = Math.atan2(dx, dz) - npc.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    npc.rotation.y += d * Math.min(1, dt * 4);
  }
  npcLantern.position.y = 1.1 + Math.sin(t * 2) * 0.06;
  npcCloak.rotation.z = Math.sin(t * 1.5) * 0.03;
  npcMark.position.y = 2.9 + Math.sin(t * 3) * 0.08;
  npcMark.visible = hwTarget === 0 && !dlg;
  if (dlg && dist > 6) { dlg = null; setHud(''); }
  if (!dlg) setHud(dist < NPC_RANGE ? 'Pressione <b>E</b> para falar com a Bruxa 🎃' : '');
}

// ---------- aplica o estado (0..1) a toda a cena ----------
for (const m of [...avatarMats, ...lampMats, glassMat, glassClear, lampMat, pumpkinMat]) m.userData.hwSkip = true;

function applyHalloween(h) {
  const e = THREE.MathUtils.smoothstep(h, 0, 1);
  scene.background.copy(C.sky).lerp(C.night, e);
  scene.fog.color.copy(scene.background);
  scene.fog.near = lerp(40, 10, e);
  scene.fog.far = lerp(90, 62, e);
  hemi.color.copy(C.hemiSky0).lerp(C.hemiSky1, e);
  hemi.groundColor.copy(C.hemiGnd0).lerp(C.hemiGnd1, e);
  hemi.intensity = lerp(0.6, 0.5, e);
  sun.color.copy(C.sun0).lerp(C.sun1, e);
  sun.intensity = lerp(1.5, 0.6, e);
  scene.environmentIntensity = lerp(0.45, 0.12, e);
  renderer.toneMappingExposure = lerp(1, 1.15, e);

  glassMat.emissive.copy(C.glass0).lerp(C.glass1, e);
  glassMat.emissiveIntensity = lerp(0.25, 0.9, e);
  for (const m of lampMats) { m.emissive.copy(C.lamp0).lerp(C.lamp1, e); m.emissiveIntensity = lerp(0.9, 1.6, e); }

  // texturas: tint roxo em tudo que é PBR; grama seca
  _tint.set(0xffffff).lerp(C.tint, e);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.isMeshStandardMaterial || m.userData.hwSkip) continue;
      m.userData.hwBase ??= m.color.clone();
      if (m === grassMat) m.color.copy(m.userData.hwBase).lerp(C.grass, e * 0.85);
      else m.color.copy(m.userData.hwBase).multiply(_tint);
    }
  });

  const on = h > 0.001;
  moon.visible = halo.visible = stars.visible = on;
  moon.material.opacity = e;
  halo.material.opacity = 0.18 * e;
  stars.material.opacity = e;
  pumpkinGroup.visible = ghostGroup.visible = on;
  for (const m of ghostMats) m.opacity = (m.isMeshBasicMaterial ? 1 : 0.8) * e;
  for (const p of pumpkins) {
    const sp = p.userData.sp;
    p.scale.setScalar(Math.max(0.0001, sp.s * easeOutBack(THREE.MathUtils.clamp((h - sp.delay) / 0.5, 0, 1))));
  }
}

let nextBolt = 0, boltUntil = 0;
function updateHalloween(dt, tms) {
  const t = tms * 0.001;
  updateNPC(dt, t);

  if (hw !== hwTarget) hw = hwTarget > hw ? Math.min(hwTarget, hw + dt / HW_DURATION) : Math.max(hwTarget, hw - dt / HW_DURATION);
  if (hw !== hwApplied) { applyHalloween(hw); hwApplied = hw; }
  if (hw <= 0) return;

  const e = THREE.MathUtils.smoothstep(hw, 0, 1);
  moon.position.copy(camera.position).add(MOON_OFF);
  halo.position.copy(moon.position);
  stars.position.copy(camera.position);

  for (const gh of ghosts) {
<<<<<<< HEAD
    gh.mixer?.update(dt);
=======
>>>>>>> 00b4bcc4f8cee5666182274a1cf36c7ebf8e7c89
    const a = gh.ph + t * gh.spd, dir = Math.sign(gh.spd);
    gh.g.position.set(Math.cos(a) * gh.R, gh.h + Math.sin(t * 2.2 + gh.ph * 3) * (gh.low ? 0.25 : 1.2), Math.sin(a) * gh.R);
    gh.g.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
    gh.g.rotation.x = 0.15;
    gh.g.rotation.z = Math.sin(t * 3 + gh.ph) * 0.12;
  }

  lanternLights.forEach((l, i) => { l.intensity = e * 9 * (0.8 + 0.2 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 5.3 + i)); });

  if (hw > 0.95) { // raios de vez em quando
    if (t > nextBolt) {
      boltUntil = t + 0.15;
      nextBolt = t + 7 + hrand() * 9;
      sun.intensity = 3;
      scene.background.setHex(0x44336a);
      scene.fog.color.copy(scene.background);
    } else if (boltUntil && t > boltUntil) {
      boltUntil = 0;
      hwApplied = -1; // restaura as cores
    }
  }
}

const gltfLoader = new GLTFLoader();

/** Escala o objeto para ter `height` de altura, apoia a base em y = 0 e depois posiciona. */
function fitAndPlace(obj, cfg) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let s = cfg.height / (size.y || 1);
  if (cfg.maxWidth) s = Math.min(s, cfg.maxWidth / (size.x || 1));
  if (cfg.maxDepth) s = Math.min(s, cfg.maxDepth / (size.z || 1));
  obj.scale.multiplyScalar(s);

  box.setFromObject(obj);
  if (cfg.maxWidth || cfg.maxDepth) {
    const f = box.getSize(new THREE.Vector3());
    console.log(`[modelo] ${cfg.name} tamanho final: ${f.x.toFixed(2)} x ${f.y.toFixed(2)} x ${f.z.toFixed(2)} (L x A x P)`);
  }
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

/* M4: o OBJLoader/MTLLoader gera MeshPhongMaterial (modelo antigo, sem roughness/metalness).
 * Convertemos para MeshStandardMaterial para o OBJ reagir ao environment map e ficar
 * consistente com o resto da cena (que é PBR). Os mapas que o .mtl trouxer são mantidos. */
function upgradeMaterial(m) {
  if (m.isMeshStandardMaterial) return m; // glTF já vem PBR
  if (!m.isMeshPhongMaterial && !m.isMeshLambertMaterial) return m;
  const s = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color,
    map: m.map,
    normalMap: m.normalMap,
    bumpMap: m.bumpMap,
    bumpScale: m.bumpScale ?? 1,
    alphaMap: m.alphaMap,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    roughness: 0.55,
    metalness: 0,
  });
  m.dispose();
  return s;
}

function enableShadows(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(upgradeMaterial) : upgradeMaterial(o.material);
    for (const m of [].concat(o.material)) {
      // anisotropia em todos os mapas: texturas nítidas em ângulo rasante
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (m[k]) m[k].anisotropy = MAX_ANISO;
      }
      m.envMapIntensity = 1;
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
  if (!e.repeat) handleShortcuts(e.code);
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
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const THIRD_DIST = 3.2; // distância da câmera em terceira pessoa

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
    if (x >= b.min.x + 0.3 && x <= b.max.x - 0.3) limit = Math.min(limit, Math.max(b.min.z + 0.4, b.max.z - d));
  }
  return limit;
}

/* Altura do chão sob o jogador (escadas, degraus, pisos elevados).
 * - 5 raios em volta dos pés (centro + 4 pontos a FOOT_R) e vale o mais alto: não "cai" entre degraus.
 * - O raio parte de (chão atual + STEP_UP_MAX): degraus de até STEP_UP_MAX são "subíveis"
 *   e tetos acima da origem do raio são ignorados.
 * - Subida: suavização exponencial. Descida: queda com gravidade (parece um passo para baixo).
 * - Enquanto sobe/desce (onStairs) a velocidade cai um pouco (STAIR_SLOW). */
const STEP_UP_MAX = 0.65;  // maior degrau que o jogador sobe (m)
const FALL_MAX = 4;        // maior queda detectada (m)
const RISE_SMOOTH = 16;    // subida: maior = acompanha o degrau mais rápido
const GRAVITY = 20;        // descida: acelera como uma queda curta
const STAIR_SLOW = 0.75;   // velocidade relativa enquanto sobe/desce
const FOOT_R = 0.28;
const FOOT_SAMPLES = [[0, 0], [FOOT_R, 0], [-FOOT_R, 0], [0, FOOT_R], [0, -FOOT_R]];
const raycaster = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _active = [];
const _hits = [];
const _saved = [];
let groundY = 0;
let fallVel = 0, onStairs = false, bobT = 0, _lastPX = NaN, _lastPZ = NaN;

function updateGround(dt) {
  const px = camera.position.x;
  const pz = camera.position.z;

  _active.length = 0;
  for (const w of walkables) {
    const b = w.userData.walkBox;
    if (px >= b.min.x && px <= b.max.x && pz >= b.min.z && pz <= b.max.z) _active.push(w);
  }

  // parado e já assentado: não precisa lançar raios de novo
  if (px === _lastPX && pz === _lastPZ && !onStairs) return groundY;
  _lastPX = px; _lastPZ = pz;

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

    const fromY = groundY + STEP_UP_MAX;
    raycaster.far = STEP_UP_MAX + FALL_MAX;
    let best = -Infinity;
    for (const [ox, oz] of FOOT_SAMPLES) {
      _rayOrigin.set(px + ox, fromY, pz + oz);
      raycaster.set(_rayOrigin, _down);
      _hits.length = 0;
      raycaster.intersectObjects(_active, true, _hits);
      if (_hits.length && _hits[0].point.y > best) {
        best = _hits[0].point.y;
        stats.walkHit = _hits[0].object.name || _hits[0].object.parent?.name || 'malha sem nome';
      }
    }
    if (best > -Infinity) target = Math.max(0, best);

    for (let i = _saved.length - 2; i >= 0; i -= 2) _saved[i].side = _saved[i + 1]; // restaura (ordem inversa)
    _saved.length = 0;
  }

  const diff = target - groundY;
  if (diff > 0) {                       // subindo: desliza suave
    fallVel = 0;
    groundY += diff * (1 - Math.exp(-RISE_SMOOTH * dt));
  } else if (diff < 0) {                // descendo: cai com gravidade
    fallVel = Math.min(fallVel + GRAVITY * dt, 12);
    groundY = Math.max(target, groundY - fallVel * dt);
  }
  if (Math.abs(target - groundY) < 0.002) { groundY = target; fallVel = 0; }
  onStairs = Math.abs(target - groundY) > 0.01;
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

  const ox = camera.position.x, oz = camera.position.z;
  if (_move.lengthSq() > 0) {
    const speed = MOVE_SPEED * (keys.has('ShiftLeft') ? RUN_MULTIPLIER : 1) * (onStairs ? STAIR_SLOW : 1);
    _move.normalize().multiplyScalar(speed * dt);
    const nx = ox + _move.x, nz = oz + _move.z;
    // colisão com deslizamento: tenta X+Z, depois só X, depois só Z
    if (canStand(nx, nz)) { camera.position.x = nx; camera.position.z = nz; }
    else if (canStand(nx, oz)) camera.position.x = nx;
    else if (canStand(ox, nz)) camera.position.z = nz;
  }

  const moved = Math.hypot(camera.position.x - ox, camera.position.z - oz) / Math.max(dt, 1e-4);
  const amp = Math.min(1, moved / MOVE_SPEED);
  bobT += moved * dt * 2.4;
  camera.position.y = updateGround(dt) + EYE_HEIGHT + Math.sin(bobT * 2) * 0.02 * amp; // leve balanço ao andar

  camera.rotation.set(pitch, yaw, 0);

  updateAvatar(amp);
  updateRoomLight(dt);
}


const state = {
  wireframe: false,        // (1)
  depth: false,            // (2)
  backfaceCulling: true,   // (3)
  showFrustum: true,       // (4)
  frustumCulling: true,    // (5)
  normalMaps: true,        // (6) M4: mapas de relevo
  roughnessMaps: true,     // (7) M4: mapas de rugosidade
  thirdPerson: false,      // (V) terceira pessoa
  near: camera.near,
  far: camera.far,
};

const stats = { drawCalls: 0, triangles: 0, objects: 0, ground: 0, walkHit: '—' };

const depthMat = new THREE.MeshDepthMaterial();

/* M4: liga/desliga normal map e roughness map em TODOS os materiais da cena (inclusive os modelos
 * carregados depois). Guardamos o mapa original em userData para poder restaurar. Serve para
 * demonstrar na apresentação o efeito de cada mapa (antes/depois). */
function applyMaterialToggles() {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.userData.mapsSaved) {
        m.userData.nm = m.normalMap ?? null;
        m.userData.rm = m.roughnessMap ?? null;
        m.userData.mapsSaved = true;
      }
      const nm = state.normalMaps ? m.userData.nm : null;
      const rm = state.roughnessMaps ? m.userData.rm : null;
      if (m.normalMap !== nm || m.roughnessMap !== rm) {
        m.normalMap = nm;
        m.roughnessMap = rm;
        m.needsUpdate = true;
      }
    }
  });
}

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

  applyMaterialToggles();                                   // (6)(7)
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
gui.add(state, 'thirdPerson').name('V · Terceira pessoa');
gui.add({ halloween: () => toggleHalloween() }, 'halloween').name('H · Halloween (ou fale com a bruxa)');

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
lightFolder.add(roomLight, 'visible').name('Luz interna das lojas');

// M4: materiais e ambiente
const matFolder = gui.addFolder('Materiais e ambiente (M4)');
matFolder.add(state, 'normalMaps').name('6 · Normal maps (relevo)').onChange(applyMaterialToggles);
matFolder.add(state, 'roughnessMaps').name('7 · Roughness maps').onChange(applyMaterialToggles);
matFolder.add(scene, 'environmentIntensity', 0, 2, 0.05).name('Intensidade do env map');
matFolder.add(renderer, 'toneMappingExposure', 0.3, 2, 0.05).name('Exposição (tone mapping)');

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
    Digit6: 'normalMaps',
    Digit7: 'roughnessMaps',
    KeyV: 'thirdPerson',
  };
  if (code === 'KeyE') interactNPC();
  if (code === 'KeyH') toggleHalloween();
  const prop = map[code];
  if (!prop) return;
  state[prop] = !state[prop];
  applyDiagnostics();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

applyDiagnostics();
MODELS.forEach(loadModel); // depois do diagnóstico, para o estado já existir quando os modelos chegarem
initHalloweenAssets();     // fantasmas e abóboras do Halloween (com modelos de reserva)


const timer = new THREE.Timer();
timer.connect(document); // pausa o timer quando a aba fica oculta

const INSET = 0.28; // fração da tela ocupada pela visão de cima

function animate(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05); // evita saltos grandes que atravessariam paredes

  updateNavigation(dt);
  updateHalloween(dt, timestamp);
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

  // terceira pessoa: afasta a câmera só para esta passada e restaura depois
  const tp = state.thirdPerson;
  if (tp) {
    camera.getWorldDirection(_dir);
    _eye.copy(camera.position);
    camera.position.addScaledVector(_dir, -THIRD_DIST);
    camera.position.y = Math.max(camera.position.y, 0.4);
  }
  setAvatarVisible(tp); // 1ª pessoa: corpo invisível, sombra continua
  renderer.render(scene, camera);
  if (tp) camera.position.copy(_eye);


  stats.drawCalls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;


  if (state.showFrustum) {
    setAvatarVisible(true); // na visão de cima o boneco aparece
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