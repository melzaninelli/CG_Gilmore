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

## 🎮 Controles

| Tecla/controle | Ação |
|---|---|
| W / ↑ | Movimentar para frente |
| S / ↓ | Movimentar para trás |
| A / ← | Movimentar para a esquerda |
| D / → | Movimentar para a direita |
| Mouse | Controlar a visão da câmera, se implementado |
| Painel de diagnóstico | Ajustar opções de visualização gráfica |

*Os controles serão atualizados conforme a implementação final.*

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

Os créditos, autores, fontes originais e licenças de uso serão registrados nesta documentação.

### 5. Navegação

A movimentação será calculada com base no intervalo de tempo entre quadros, garantindo velocidade consistente independentemente da taxa de atualização da renderização.

##  Estrutura do projeto

Exemplo de organização sugerida:

```text
CG_Gilmore/
├── public/
│   └── models/            
├── src/
│   ├── main.js            
│   ├── scene.js           
│   ├── camera.js          
│   ├── lights.js          
│   ├── controls.js        
│   ├── diagnostics.js     
│   ├── models.js          
│   ├── terrain.js         
│   ├── buildings.js       
│   ├── props.js           
│   ├── decor.js           
│   ├── utils.js           
│   └── config.js          
├── index.html
├── package.json
├── .gitignore
└── README.md
```



---

Desenvolvido como projeto acadêmico da disciplina de **Computação Gráfica**.
