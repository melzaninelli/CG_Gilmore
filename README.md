# Gilmore Girls — Stars Hollow 3D

Um mundo 3D interativo inspirado na série *Gilmore Girls*, desenvolvido para a disciplina de **Computação Gráfica**. O projeto busca recriar a atmosfera acolhedora e charmosa da cidade fictícia de Stars Hollow, explorando conceitos de renderização, iluminação, texturização e navegação em ambientes tridimensionais.

##  Objetivo

Desenvolver uma aplicação gráfica interativa utilizando Three.js, permitindo que o usuário explore um cenário inspirado em Stars Hollow e observe, na prática, conceitos fundamentais de Computação Gráfica.

##  Funcionalidades

-  Ambiente 3D inspirado em Stars Hollow.
-  Câmera interativa em primeira ou terceira pessoa.
-  Navegação com movimentação independente da taxa de quadros (FPS).
-  Iluminação com diferentes fontes de luz e sombras.
-  Materiais e texturas com propriedades de superfície, incluindo mapas de relevo.
-  Integração de modelos 3D externos em diferentes formatos.
-  Modo de diagnóstico para análise do pipeline gráfico.
-  Visualização de wireframe, profundidade e frustum da câmera.
-  Análise de chamadas de desenho e quantidade de triângulos renderizados.

##  Tecnologias utilizadas

- **JavaScript** — lógica e interatividade.
- **Three.js** — criação e renderização do ambiente 3D.
- **Vite** — servidor de desenvolvimento e execução do projeto.
- **HTML5 e CSS3** — estrutura e apresentação da aplicação.
- **lil-gui** — painel de controles e diagnóstico gráfico.
- **Git e GitHub** — versionamento e colaboração.

##  Como executar o projeto

### Pré-requisitos

- Node.js instalado.
- npm instalado.
- Git instalado para clonar o repositório.

### Instalação

1. Clone o repositório:

   ```bash
   git clone URL_DO_REPOSITORIO
   ```

2. Entre na pasta do projeto:

   ```bash
   cd gilmore-girls
   ```

3. Instale as dependências:

   ```bash
   npm install
   ```

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Acesse no navegador o endereço informado pelo Vite, normalmente `http://localhost:5173`.

##  Controles

## Controles

| Tecla / controle | Ação |
|---|---|
| Clique na tela | Captura o mouse (pointer lock); `Esc` libera |
| Mouse | Controla a visão da câmera |
| `W` `A` `S` `D` | Andar |
| `Shift` | Correr (2x) |
| Setas | Girar e inclinar a câmera |
| `E` | Falar com a bruxa / avançar o diálogo |
| `H` | Liga e desliga o Halloween |
| `V` | Alterna primeira e terceira pessoa |
| `1` | Wireframe |
| `2` | Profundidade (depth) |
| `3` | Back-face culling |
| `4` | Mostrar frustum e minimapa |
| `5` | Frustum culling |
| `6` | Normal maps |
| `7` | Roughness maps |
| Painel de diagnóstico | Ajustar opções de visualização gráfica, câmera e iluminação |



##  Conceitos de Computação Gráfica

### 1. Pipeline de visualização

Configuração da câmera, projeção em perspectiva e planos de recorte `near` e `far`, responsáveis por determinar quais partes da cena podem ser visualizadas.

O modo de diagnóstico permitirá observar diferentes aspectos do pipeline, incluindo:

- **Wireframe:** visualização da estrutura poligonal dos objetos.
- **Depth Material:** representação da profundidade da cena.
- **Back-face culling:** controle da renderização das faces dos polígonos.
- **Camera Helper:** visualização do frustum de uma segunda câmera.
- **Renderer Info:** análise de chamadas de desenho e triângulos renderizados.

### 2. Iluminação e sombras

Utilização de diferentes tipos de iluminação para construir uma atmosfera coerente com o cenário de Stars Hollow, explorando intensidade, cor, direção da luz e configuração de sombras.

As escolhas de iluminação serão documentadas conforme os recursos implementados no projeto.

### 3. Materiais e texturas

Aplicação de materiais com propriedades distintas para representar superfícies como madeira, pedra, vidro, metal e vegetação.

Serão explorados:

- Coordenadas UV para mapeamento de texturas.
- Mapas de textura e mapas de relevo (`normal map` ou `bump map`).
- Parâmetros de rugosidade (`roughness`) e propriedades dos materiais.

### 4. Modelos 3D externos

O cenário utilizará pelo menos três modelos 3D externos, integrados à composição visual.

| Modelo | Formato | Fonte e licença |
|---|---|---|
| Starbucks Disposable Cup | OBJ | NEEL BAFNA |
| Wooden Gazebo | GLTF | Andrew Weems |
| CAFETERIA SALLE | GLTF | Karen Rocha |
| Coffe Cup | OBJ | https://www.cgtrader.com/designers/jd-imagery?utm_source=credit&utm_source=credit_item_page|
| Fantasma Ghost Phantom | glTF| Fantasmas do Halloween | Marcos.Andre (CC Attribution)|
|Pumpkin | glTF|	Abóboras do Halloween | [autor / licença]|

### 5. Navegação

A movimentação será calculada com base no intervalo de tempo entre quadros, garantindo velocidade consistente independentemente da taxa de atualização da renderização.

##  Estrutura do projeto

Exemplo de organização sugerida:

```text
CG_Gilmore/
└── vite-project/
    ├── index.html
    ├── main.js                     ← toda a cena (renderer, luzes, texturas, cidade, navegação, Halloween)
    ├── package.json
    ├── .gitignore
    ├── README.md
    ├── public/
    │   └── models/
    │       ├── wooden_gazebo/
    │       ├── cafeteria_salle/
    │       ├── antique_coffee_mill/
    │       ├── starbucks_disposable_cup/
    │       ├── SB-CoffeeCupXmas-MODEL/SB-CoffeeCupXmas-MODEL/   (.obj + .mtl)
    │       ├── ghost_phantom/      (scene.gltf, scene.bin, license.txt, textures/)
    │       └── pumpkin/            (scene.gltf, scene.bin, license.txt, textures/)
    └── src/                       
```

## Iluminação e sombras

**Referência visual:** tarde de outono em Stars Hollow, com céu claro/nublado, sol baixo e quente, sombras macias e cores quentes.

### Luzes (2 tipos)

| Luz | Tipo | Cor | Intensidade | Projeta sombra |
|---|---|---|---|---|
| Céu/chão | `HemisphereLight` | céu `#fff1d6`, chão `#7a6a4c` | 0.95 | Não |
| Sol | `DirectionalLight` | `#ffe6bf` | 1.5 | Sim |

**HemisphereLight (ambiente).** Representa a luz difusa do céu nublado e o rebatimento do solo. Foi escolhida no lugar da `AmbientLight` porque a cor varia com a orientação da superfície (tetos mais claros, laterais mais quentes), o que preserva o volume dos prédios nas áreas em sombra. Não projeta sombra, pois luz difusa não tem direção e isso poupa uma passada de renderização. A intensidade 0.95 evita sombras totalmente pretas sem competir com o sol.

**DirectionalLight (sol).** Raios paralelos são o modelo adequado para uma fonte muito distante. `PointLight` e `SpotLight` gerariam sombras divergentes e a `PointLight` exigiria mapa de sombra cúbico (6 passadas). A posição (15, 22, 12) dá uma elevação de cerca de 45°, típica de sol de fim de tarde. A intensidade 1.5, maior que a ambiente, cria o contraste entre faces iluminadas e sombreadas.

### Configuração das sombras

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `shadowMap.type` | `PCFSoftShadowMap` | Bordas suaves, coerentes com céu nublado; mais estável que VSM (sem *light bleeding*). |
| `shadow.mapSize` | 2048 × 2048 | Com volume de 56 × 56 unidades, cada texel cobre cerca de 2,7 cm. 1024 ficaria serrilhado; 4096 quadruplica a memória sem ganho visível. |
| Volume ortográfico | ±28 | A área jogável e os prédios vão até cerca de ±22; um volume justo concentra a resolução onde há geometria. |
| `near` / `far` | 1 / 70 | Cobre a cena inteira com folga e mantém a faixa de profundidade curta, o que melhora a precisão do depth map. |
| `bias` | -0.0005 | Evita *shadow acne*. |
| `normalBias` | 0.02 | Corrige o acne em ângulos rasantes sem usar bias grande, que descolaria a sombra do objeto (*peter-panning*). |

**Quem projeta e quem recebe:** projetam sombra os prédios, árvores, bancos, postes, mesa, abóboras e os modelos externos; recebem sombra o chão, as ruas, as calçadas e os próprios objetos. Detalhes finos e planos (vitrines, portas, janelas, bandeira) não projetam sombra, porque ela seria imperceptível e só custaria desempenho.

**Como demonstrar:** o painel *Iluminação* (lil-gui) liga e desliga cada luz, altera as intensidades e ativa/desativa as sombras do sol.

## Subida de escadas

A navegação em primeira pessoa mantinha a câmera sempre à altura `EYE_HEIGHT`, então o jogador não conseguia subir degraus. A solução calcula a altura do chão sob o jogador a cada frame:

1. Um raio (`THREE.Raycaster`) parte de pouco acima do chão atual (`STEP_UP_MAX = 0.6 m`) e desce contra as superfícies marcadas como caminháveis: o gazebo, a Cafeteria Salle e o degrau da prefeitura. Partir de pouco acima do chão atual faz com que degraus de até 0,6 m sejam subíveis e que tetos sejam ignorados.
2. A altura do ponto atingido vira a altura do chão desejada. Se nada for atingido, o chão fica em y = 0.
3. A altura do chão é suavizada com decaimento exponencial (`GROUND_SMOOTH`), para a câmera deslizar sobre os degraus em vez de dar saltos.
4. A câmera fica em `altura do chão + EYE_HEIGHT`.

Otimizações e detalhes:
- O raio só é lançado quando o jogador está dentro da caixa (no plano XZ) de uma superfície caminhável.
- Durante o raio, os materiais são tratados como `DoubleSide`, para que o chão não dependa da orientação das faces do modelo.
- O limite norte do jogador (`PLAYER_LIMIT`) é liberado em frente à cafeteria (`enterDepth`), para que a escada seja alcançável.
- O painel de diagnóstico mostra a *Altura do chão* e a malha sobre a qual o jogador está pisando.

**Limitação conhecida:** A colisão é por zonas retangulares (praça, interiores, corredores de porta e móveis), não por geometria. Dentro da Cafeteria Salle (modelo externo) o jogador só é limitado por enterDepth e pela largura do modelo, então pode atravessar corrimãos e paredes do próprio modelo.
A câmera em terceira pessoa não colide com paredes.
A transformação de Halloween altera a cor das texturas (tint) em vez de trocar as texturas por outras.
Os interiores e o Halloween têm custo alto em draw calls em computadores mais simples.

## Nota de transparência de IA

**O que foi pedido à IA (Claude):** (1) documentar e justificar a configuração de iluminação e sombras já existente;


---

Desenvolvido como projeto acadêmico da disciplina de **Computação Gráfica**.
