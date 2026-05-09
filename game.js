/* =================================================================
   IDLE EMPIRE — game.js
   一個星露谷風格 × Northguard 經營的放置型網頁遊戲
   ================================================================= */

(() => {
'use strict';

/* =============================================================
   CONST / CONFIG
   ============================================================= */
const TILE = 64;                         // 每格像素大小（資產原生）
const MAP_W = 28, MAP_H = 22;            // 地圖格數（28 * 64 = 1792）
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const SAVE_KEY = 'idleempire.save.v1';

const RES_TYPES = ['gold', 'wood', 'ore', 'food', 'potion'];

const SELL_PRICE = { wood: 2, ore: 5, food: 1, potion: 12 };

const STARTING_RES = { gold: 80, wood: 40, ore: 0, food: 30, potion: 0 };

/* 建築定義 ----------------------------------------------------- */
const BUILDINGS = {
  townhall: {
    name: '主城', desc: '王國的核心，儲存所有資源與糧食。',
    cost: { wood: 0, gold: 0 }, size: { w: 3, h: 2 },
    capacity: 0, recruits: null,
    sprite: 'house_main',
  },
  farm: {
    name: '農舍', desc: '種植稻米生產糧食。可雇用農夫。',
    cost: { wood: 30, gold: 20 }, size: { w: 2, h: 2 },
    capacity: 2, recruits: 'farmer',
    sprite: 'house_farm',
  },
  lumberyard: {
    name: '伐木場', desc: '採集師會去森林砍樹搬回木材。',
    cost: { wood: 50, gold: 30 }, size: { w: 2, h: 2 },
    capacity: 2, recruits: 'gatherer',
    sprite: 'house_wood',
  },
  mine: {
    name: '礦坑', desc: '採礦師到山區挖礦石。',
    cost: { wood: 80, gold: 50 }, size: { w: 2, h: 2 },
    capacity: 2, recruits: 'miner',
    sprite: 'house_mine',
  },
  alchemy: {
    name: '藥水房', desc: '藥水師調配恢復血量的藥水。',
    cost: { wood: 60, ore: 20, gold: 60 }, size: { w: 2, h: 2 },
    capacity: 1, recruits: 'alchemist',
    sprite: 'house_alch',
  },
  market: {
    name: '市場', desc: '把資源賣成金幣的交易所。',
    cost: { wood: 40, gold: 30 }, size: { w: 2, h: 2 },
    capacity: 0, recruits: null,
    sprite: 'house_market',
  },
};

/* NPC 職業定義 ------------------------------------------------- */
const JOBS = {
  farmer: {
    name: '農夫', emoji: '🌾', color: '#e8b73a',
    workAnim: 'hoe',
    output: { food: 4 },               // 一次工作循環產出
    workSeconds: 6,                    // 完成一次工作要多久
    targetType: 'soil',                // 工作目標類型（soil/tree/rock/bush/lab）
    recruitCost: { gold: 20, food: 10 },
  },
  gatherer: {
    name: '採集師', emoji: '🌳', color: '#5fa84e',
    workAnim: 'axe',
    output: { wood: 3, food: 1 },
    workSeconds: 5,
    targetType: 'tree',
    recruitCost: { gold: 25, food: 10 },
  },
  miner: {
    name: '採礦師', emoji: '⛏', color: '#7a8c9c',
    workAnim: 'axe',
    output: { ore: 2 },
    workSeconds: 7,
    targetType: 'rock',
    recruitCost: { gold: 35, food: 15 },
  },
  alchemist: {
    name: '藥水師', emoji: '⚗', color: '#a86bc8',
    workAnim: 'water',
    output: { potion: 1 },
    workSeconds: 8,
    targetType: 'lab',
    recruitCost: { gold: 60, food: 20, ore: 5 },
  },
};

/* =============================================================
   ASSET MANIFEST + LOADER
   ============================================================= */
const ASSETS = { img: {}, aud: {} };

// 每種動作的幀數（walk = 4 幀，其他 = 2 幀）
const ANIM_FRAMES = { walk: 4, idle: 2, axe: 2, hoe: 2, water: 2 };

const IMG_MANIFEST = (() => {
  const m = {};
  // Character — 4 dirs × 5 actions × 不同幀數
  const dirs = ['down','up','left','right'];
  const actions = ['walk','idle','axe','hoe','water'];
  for (const d of dirs) {
    for (const a of actions) {
      const folder = a === 'walk' ? d : `${d}_${a}`;
      const frames = ANIM_FRAMES[a];
      for (let i = 0; i < frames; i++) {
        m[`farmer_${d}_${a}_${i}`] = `./assets/characters/farmer_base/${folder}/${i}.png`;
      }
    }
  }
  // Buildings (tilesets)
  m.house_set     = './assets/buildings/House.png';
  m.house_decor   = './assets/buildings/House Decoration.png';
  // Tiles
  m.grass         = './assets/tiles/Grass.png';
  m.hills         = './assets/tiles/Hills.png';
  m.water_tile    = './assets/tiles/Water.png';
  m.paths         = './assets/tiles/Paths.png';
  m.fences        = './assets/tiles/Fences.png';
  m.plant_decor   = './assets/tiles/Plant Decoration.png';
  m.water_decor   = './assets/tiles/Water Decoration.png';
  // Water animation
  for (let i = 0; i < 4; i++) m[`water_anim_${i}`] = `./assets/tiles/water_anim/${i}.png`;
  // Soil tiles
  ['o','t','b','l','r','tm','bm','lm','rm','tl','tr','bl','br','tb','lr','tbl','tbr','lrt','lrb','soil','x']
    .forEach(k => m[`soil_${k}`] = `./assets/tiles/soil/${k}.png`);
  // Objects
  m.tree_medium   = './assets/objects/tree_medium.png';
  m.tree_small    = './assets/objects/tree_small.png';
  m.bush          = './assets/objects/bush.png';
  m.flower        = './assets/objects/flower.png';
  m.merchant      = './assets/objects/merchant.png';
  m.mushroom      = './assets/objects/mushroom.png';
  m.mushrooms     = './assets/objects/mushrooms.png';
  m.stump_small   = './assets/objects/stump_small.png';
  m.stump_medium  = './assets/objects/stump_medium.png';
  m.sunflower     = './assets/objects/sunflower.png';
  // Fruit (corn 4 stages)
  for (let i = 0; i < 4; i++) m[`corn_${i}`] = `./assets/objects/fruit/corn/${i}.png`;
  for (let i = 0; i < 4; i++) m[`tomato_${i}`] = `./assets/objects/fruit/tomato/${i}.png`;
  // UI icons
  ['axe','corn','hoe','tomato','water'].forEach(k => m[`ui_${k}`] = `./assets/ui/icons/${k}.png`);
  return m;
})();

const AUDIO_MANIFEST = {
  bgm: './assets/audio/bgm.mp3',
  music: './assets/audio/music.mp3',
  chop: './assets/audio/sfx_chop.mp3',
  dig:  './assets/audio/sfx_dig.wav',
  plant:'./assets/audio/sfx_plant.mp3',
  water:'./assets/audio/sfx_water.mp3',
  success:'./assets/audio/sfx_success.wav',
};

function loadAssets(onProgress) {
  return new Promise((resolve) => {
    const total = Object.keys(IMG_MANIFEST).length + Object.keys(AUDIO_MANIFEST).length;
    let loaded = 0;
    const tick = (label) => {
      loaded++;
      onProgress(loaded / total, label);
      if (loaded >= total) resolve();
    };
    for (const [k, src] of Object.entries(IMG_MANIFEST)) {
      const img = new Image();
      img.onload = () => { ASSETS.img[k] = img; tick(k); };
      img.onerror = () => { console.warn('miss img', src); tick(k); };
      img.src = src;
    }
    for (const [k, src] of Object.entries(AUDIO_MANIFEST)) {
      const a = new Audio();
      a.preload = 'auto';
      a.oncanplaythrough = () => { if (!ASSETS.aud[k]) { ASSETS.aud[k] = a; tick(k); } };
      a.onerror = () => { console.warn('miss audio', src); tick(k); };
      a.src = src;
      // 部分瀏覽器 canplaythrough 不會觸發，給保險：
      setTimeout(() => { if (!ASSETS.aud[k]) { ASSETS.aud[k] = a; tick(k); } }, 4000);
    }
  });
}

function playSfx(key, vol = 0.5) {
  if (window.GAME && window.GAME._muted) return;
  const a = ASSETS.aud[key];
  if (!a) return;
  try {
    const c = a.cloneNode();
    c.volume = vol;
    c.play().catch(()=>{});
  } catch(e){}
}

/* =============================================================
   UTIL
   ============================================================= */
const rand = (a, b) => a + Math.random() * (b - a);
const randI = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); };
function nowSec() { return performance.now() / 1000; }

/* =============================================================
   WORLD GENERATION（手工配置 + 程序化點綴）
   ============================================================= */
class World {
  constructor() {
    // tile layer: 0=grass, 1=water, 2=path, 3=hills(rocky)
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.objects = [];      // 樹、石、草叢、灌木裝飾
    this.resources = [];    // 可採集點：tree, rock, bush, soil
    this.buildings = [];
    this.npcs = [];

    this._generate();
  }

  idx(tx, ty) { return ty * MAP_W + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H; }
  tileAt(tx, ty) { return this.tiles[this.idx(tx, ty)]; }
  setTile(tx, ty, v) { this.tiles[this.idx(tx, ty)] = v; }

  _generate() {
    // 全圖預設草地
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i] = 0;

    // 北側森林（樹叢密集）：y < 6, x 散佈
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (Math.random() < 0.32) {
          this.objects.push({ kind: 'decor_tree', x: x*TILE+rand(8,24), y: y*TILE+rand(8,24) });
        }
      }
    }
    // 可採集樹（在森林層下緣，玩家容易進入）
    for (let i = 0; i < 14; i++) {
      const tx = randI(2, MAP_W-3);
      const ty = randI(0, 7);
      if (this._anyResAtTile(tx, ty)) continue;
      this.resources.push({
        kind: 'tree', tx, ty,
        x: tx*TILE + 32, y: ty*TILE + 56,
        hp: 3, maxHp: 3,
        depleted: false, respawnAt: 0,
      });
    }

    // 東側山岩（採礦）：x > MAP_W-6, y > 4
    for (let y = 4; y < MAP_H; y++) {
      for (let x = MAP_W-6; x < MAP_W; x++) {
        if (Math.random() < 0.25) this.setTile(x, y, 3); // 石礫地
      }
    }
    // 礦點
    for (let i = 0; i < 10; i++) {
      const tx = randI(MAP_W-5, MAP_W-2);
      const ty = randI(6, MAP_H-2);
      if (this._anyResAtTile(tx, ty)) continue;
      this.resources.push({
        kind: 'rock', tx, ty,
        x: tx*TILE + 32, y: ty*TILE + 48,
        hp: 4, maxHp: 4,
        depleted: false, respawnAt: 0,
      });
    }

    // 西側河流（從上往下）+ 橋
    const riverX = 4;
    for (let y = 0; y < MAP_H; y++) {
      this.setTile(riverX, y, 1);
      if (Math.random() < 0.5) this.setTile(riverX-1, y, 1);
      if (Math.random() < 0.5) this.setTile(riverX+1, y, 1);
    }
    // 橋
    this.setTile(riverX-1, Math.floor(MAP_H/2), 2);
    this.setTile(riverX,   Math.floor(MAP_H/2), 2);
    this.setTile(riverX+1, Math.floor(MAP_H/2), 2);

    // 西邊蘑菇林（採集師也吃這個）
    for (let i = 0; i < 8; i++) {
      const tx = randI(0, riverX-2);
      const ty = randI(8, MAP_H-2);
      if (this._anyResAtTile(tx, ty)) continue;
      this.resources.push({
        kind: 'bush', tx, ty,
        x: tx*TILE + 32, y: ty*TILE + 48,
        hp: 2, maxHp: 2,
        depleted: false, respawnAt: 0,
      });
    }

    // 南邊大草原 — 給農舍蓋稻田
    // 蓋路：從中央延伸
    const cx = Math.floor(MAP_W/2), cy = Math.floor(MAP_H/2);
    for (let dx = -3; dx <= 3; dx++) this.setTile(cx+dx, cy, 2);
    for (let dy = -2; dy <= 2; dy++) this.setTile(cx, cy+dy, 2);

    // 中央放主城
    const townHall = new Building('townhall', cx-1, cy-1);
    townHall.builtAt = 0;
    this.buildings.push(townHall);
    this.townHall = townHall;

    // 主城門口放一個 merchant（裝飾）
    this.objects.push({ kind: 'decor_merchant', x: (cx+2)*TILE, y: (cy)*TILE + 16 });

    // 南邊散落幾朵花、灌木裝飾
    for (let i = 0; i < 30; i++) {
      const tx = randI(0, MAP_W-1);
      const ty = randI(MAP_H-7, MAP_H-1);
      if (this.tileAt(tx, ty) !== 0) continue;
      const k = choice(['decor_flower','decor_bush','decor_grass']);
      this.objects.push({ kind: k, x: tx*TILE+rand(0,TILE), y: ty*TILE+rand(0,TILE) });
    }
  }

  _anyResAtTile(tx, ty) {
    return this.resources.some(r => r.tx === tx && r.ty === ty);
  }

  // 嘗試在某 tile 區塊放建築。回傳 true 成功
  canPlaceBuilding(type, tx, ty) {
    const def = BUILDINGS[type];
    if (!def) return false;
    for (let dx = 0; dx < def.size.w; dx++) {
      for (let dy = 0; dy < def.size.h; dy++) {
        const x = tx + dx, y = ty + dy;
        if (!this.inBounds(x, y)) return false;
        const t = this.tileAt(x, y);
        if (t === 1) return false; // 不能蓋水上
        if (this._buildingAtTile(x, y)) return false;
      }
    }
    return true;
  }

  _buildingAtTile(tx, ty) {
    return this.buildings.find(b => {
      return tx >= b.tx && tx < b.tx + b.def.size.w &&
             ty >= b.ty && ty < b.ty + b.def.size.h;
    });
  }

  placeBuilding(type, tx, ty) {
    const b = new Building(type, tx, ty);
    b.builtAt = nowSec();
    this.buildings.push(b);
    return b;
  }

  // 找最近的指定種類資源點
  findClosestRes(kind, fromX, fromY) {
    let best = null, bestD = Infinity;
    for (const r of this.resources) {
      if (r.kind !== kind || r.depleted) continue;
      if (r._claimedBy && r._claimedByExpires > nowSec()) continue;
      const d = Math.hypot(r.x - fromX, r.y - fromY);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  // 隨機回家用空地（townhall 附近）
  homePoint() {
    const th = this.townHall;
    return {
      x: (th.tx + th.def.size.w/2) * TILE,
      y: (th.ty + th.def.size.h + 0.5) * TILE,
    };
  }
}

/* =============================================================
   BUILDING
   ============================================================= */
class Building {
  constructor(type, tx, ty) {
    this.type = type;
    this.def = BUILDINGS[type];
    this.tx = tx; this.ty = ty;
    this.workers = [];
    this.builtAt = nowSec();
    this.constructionDur = type === 'townhall' ? 0 : 4; // 4 秒蓋好
  }
  get x() { return (this.tx + this.def.size.w/2) * TILE; }
  get y() { return (this.ty + this.def.size.h)   * TILE; }   // 入口在底邊
  get isBuilt() { return nowSec() - this.builtAt >= this.constructionDur; }
  get progress() { return Math.min(1, (nowSec() - this.builtAt) / Math.max(0.0001, this.constructionDur)); }

  // 員工招募點（建築前空地）
  workSpot(idx) {
    return {
      x: this.x + ((idx % 2) - 0.5) * TILE * 0.6,
      y: this.y + 16,
    };
  }
}

/* =============================================================
   NPC — 狀態機 AI
   ============================================================= */
const NPC_STATE = {
  IDLE: 'idle',
  GOTO_WORK: 'goto_work',
  WORKING: 'working',
  RETURN: 'return',
  DEPOSIT: 'deposit',
  EAT: 'eat',
  DEAD: 'dead',
  GO_HOME_HUNGRY: 'go_home_hungry',
};

let _npcId = 1;
class NPC {
  constructor(job, home) {
    this.id = _npcId++;
    this.job = job;
    this.def = JOBS[job];
    this.home = home;        // 主城建築物
    this.workplace = null;   // 工作建築（farm/lumberyard/...）

    const hp = this.home;
    const sp = hp ? { x: hp.x + rand(-30, 30), y: hp.y + rand(0, 24) } : { x: WORLD_W/2, y: WORLD_H/2 };
    this.x = sp.x; this.y = sp.y;
    this.dir = 'down';
    this.frame = 0;
    this.frameTime = 0;
    this.anim = 'idle';      // idle | walk | axe | hoe | water

    this.maxHp = 100;
    this.hp = 100;
    this.maxHunger = 100;
    this.hunger = 80;
    this.starveTimer = 0;

    this.state = NPC_STATE.IDLE;
    this.target = null;      // {x,y,kind?,res?}
    this.path = null;
    this.workTimer = 0;
    this.carry = {};         // 攜帶資源
    this.speed = 60 + Math.random() * 20;     // 像素/秒

    this.name = this._genName();
  }

  _genName() {
    const a = ['Pip','Lina','Bran','Mira','Tess','Otto','Zeke','Bea','Cora','Finn','Maya','Niko'];
    return choice(a);
  }

  setAnim(name) {
    if (this.anim !== name) { this.anim = name; this.frame = 0; this.frameTime = 0; }
  }

  /* AI tick ----------------------------------------------------- */
  tick(dt, game) {
    if (this.state === NPC_STATE.DEAD) return;

    // 飢餓 & HP
    this.hunger -= dt * 1.6;       // 每秒掉 1.6
    if (this.hunger <= 0) {
      this.hunger = 0;
      this.starveTimer += dt;
      if (this.starveTimer > 4) { this.hp -= dt * 5; this.starveTimer = 0; }
    } else {
      this.starveTimer = 0;
    }
    if (this.hp <= 0) { this._die(game); return; }

    // 太餓就回家吃飯（飢餓<25 強制回去）
    if (this.hunger < 25 && this.state !== NPC_STATE.EAT &&
        this.state !== NPC_STATE.GO_HOME_HUNGRY &&
        this.state !== NPC_STATE.RETURN &&
        this.state !== NPC_STATE.DEPOSIT) {
      this.state = NPC_STATE.GO_HOME_HUNGRY;
      this.target = { x: this.home.x, y: this.home.y };
    }

    switch (this.state) {
      case NPC_STATE.IDLE:        this._tickIdle(game); break;
      case NPC_STATE.GOTO_WORK:   this._moveTo(this.target, dt, () => this._onArriveWork(game)); break;
      case NPC_STATE.WORKING:     this._tickWorking(dt, game); break;
      case NPC_STATE.RETURN:      this._moveTo(this.target, dt, () => this._onArriveHome(game)); break;
      case NPC_STATE.DEPOSIT:     this._tickDeposit(game); break;
      case NPC_STATE.GO_HOME_HUNGRY: this._moveTo(this.target, dt, () => { this.state = NPC_STATE.EAT; }); break;
      case NPC_STATE.EAT:         this._tickEat(dt, game); break;
    }

    // animate
    this.frameTime += dt;
    const fps = (this.anim === 'walk') ? 8 : 4;
    const totalFrames = ANIM_FRAMES[this.anim] || 2;
    if (this.frameTime > 1/fps) { this.frame = (this.frame + 1) % totalFrames; this.frameTime = 0; }
  }

  _tickIdle(game) {
    if (!this.workplace) return;
    // 找工作目標
    if (this.def.targetType === 'lab') {
      // 藥水師工作地點 = 自家建築前
      this.target = { x: this.workplace.x, y: this.workplace.y, kind: 'lab' };
      this.state = NPC_STATE.GOTO_WORK;
      return;
    }
    if (this.def.targetType === 'soil') {
      // 農夫：在自家建築附近的田地
      this.target = {
        x: this.workplace.x + rand(-TILE*0.8, TILE*0.8),
        y: this.workplace.y + rand(TILE*0.4, TILE*1.4),
        kind: 'soil',
      };
      this.state = NPC_STATE.GOTO_WORK;
      return;
    }
    // 採集師/採礦師：找最近的 res
    const res = game.world.findClosestRes(this.def.targetType, this.x, this.y);
    if (res) {
      res._claimedBy = this.id;
      res._claimedByExpires = nowSec() + 30;
      this.target = { x: res.x, y: res.y, kind: this.def.targetType, res };
      this.state = NPC_STATE.GOTO_WORK;
    } else {
      // 沒找到資源：四處遊走
      this.target = {
        x: this.workplace.x + rand(-TILE*2, TILE*2),
        y: this.workplace.y + rand(-TILE*2, TILE*2),
      };
      this.state = NPC_STATE.GOTO_WORK;
      this._idleStroll = true;
    }
  }

  _onArriveWork(game) {
    if (this._idleStroll) {
      this._idleStroll = false;
      this.state = NPC_STATE.IDLE;
      return;
    }
    this.state = NPC_STATE.WORKING;
    this.workTimer = 0;
    this.setAnim(this.def.workAnim);
  }

  _tickWorking(dt, game) {
    this.workTimer += dt;
    // 朝向目標
    if (this.target) this._faceTowards(this.target.x, this.target.y);
    if (this.workTimer >= this.def.workSeconds) {
      // 完成一次循環
      const out = this.def.output;
      for (const [k, v] of Object.entries(out)) {
        this.carry[k] = (this.carry[k] || 0) + v;
      }
      // 對資源造成消耗
      const r = this.target?.res;
      if (r) {
        r.hp -= 1;
        if (r.hp <= 0) {
          r.depleted = true;
          r.respawnAt = nowSec() + (r.kind === 'tree' ? 60 : r.kind === 'rock' ? 80 : 30);
        }
        r._claimedBy = null;
      }
      // 音效
      if (this.def.workAnim === 'axe')  playSfx('chop', 0.35);
      if (this.def.workAnim === 'hoe')  playSfx('plant', 0.3);
      if (this.def.workAnim === 'water')playSfx('water', 0.25);
      // 改成回家
      this.target = { x: this.home.x, y: this.home.y };
      this.state = NPC_STATE.RETURN;
      this.setAnim('walk');
    }
  }

  _onArriveHome(game) {
    this.state = NPC_STATE.DEPOSIT;
  }

  _tickDeposit(game) {
    // 把攜帶資源轉入 game.resources
    let any = false;
    for (const [k, v] of Object.entries(this.carry)) {
      if (v > 0) {
        game.addResource(k, v, this.x, this.y - 60);
        any = true;
      }
    }
    if (any) playSfx('success', 0.25);
    this.carry = {};
    this.state = NPC_STATE.IDLE;
    this.setAnim('idle');
  }

  _tickEat(dt, game) {
    // 從 game.resources.food 取
    if (game.resources.food >= 1 && this.hunger < this.maxHunger - 1) {
      const need = Math.min(this.maxHunger - this.hunger, 30);
      const got = Math.min(game.resources.food, Math.ceil(need / 10));
      game.resources.food -= got;
      this.hunger = clamp(this.hunger + got * 12, 0, this.maxHunger);
      game.flashRes('food', -got);
      if (this.hp < this.maxHp) {
        this.hp = clamp(this.hp + 8, 0, this.maxHp);
      }
      playSfx('success', 0.2);
    }
    // 也順便回血一點
    if (game.resources.potion >= 1 && this.hp < this.maxHp - 20) {
      game.resources.potion -= 1;
      this.hp = clamp(this.hp + 30, 0, this.maxHp);
      game.flashRes('potion', -1);
    }
    this.state = NPC_STATE.IDLE;
    this.setAnim('idle');
  }

  _moveTo(target, dt, onArrive) {
    if (!target) { this.state = NPC_STATE.IDLE; return; }
    const dx = target.x - this.x, dy = target.y - this.y;
    const d = Math.hypot(dx, dy);
    const arriveDist = 6;
    if (d < arriveDist) { this.setAnim('idle'); onArrive(); return; }
    this.setAnim('walk');
    const step = Math.min(d, this.speed * dt);
    const ux = dx / d, uy = dy / d;
    let nx = this.x + ux * step;
    let ny = this.y + uy * step;
    // 簡單避免水（只是把目標往旁邊推）
    nx = clamp(nx, 8, WORLD_W - 8);
    ny = clamp(ny, 8, WORLD_H - 8);
    this.x = nx; this.y = ny;
    this._faceTowards(target.x, target.y);
  }

  _faceTowards(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
  }

  _die(game) {
    this.state = NPC_STATE.DEAD;
    this.setAnim('idle');
    game.toast(`💀 ${this.def.name} ${this.name} 倒下了…`);
  }

  /* ---- render ---- */
  spriteKey() {
    return `farmer_${this.dir}_${this.anim}_${this.frame}`;
  }
}

/* =============================================================
   GAME — 主控
   ============================================================= */
class Game {
  constructor() {
    this.canvas = document.getElementById('world');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.world = new World();
    this.resources = { ...STARTING_RES };

    this.camera = { x: WORLD_W/2 - 400, y: WORLD_H/2 - 300, zoom: 1, minZoom: 0.5, maxZoom: 2 };
    this.lastTick = nowSec();
    this.timeScale = 1;
    this.dayTime = 0.25;             // 0~1，0=午夜，0.25=早晨，0.75=傍晚
    this.day = 1;

    this._setupInput();
    this._setupUI();
    this._loadSave();
    this._tickResRespawn = 0;

    // 讓主城旁自帶 1 個農夫示範
    if (this.world.npcs.length === 0) {
      this._spawnDemoFarmer();
    }
    this._renderResUI();

    // BGM — 等使用者互動再播（瀏覽器 autoplay 政策）
    this._muted = localStorage.getItem('idleempire.muted') === '1';
    this.bgm = ASSETS.aud.bgm || ASSETS.aud.music || null;
    if (this.bgm) { this.bgm.loop = true; this.bgm.volume = 0.35; }
    this._updateMuteUI();

    const startBgm = () => {
      if (!this.bgm || this._muted || this._bgmStarted) return;
      this.bgm.play().then(() => { this._bgmStarted = true; })
        .catch(() => { /* 仍可被使用者再次觸發 */ });
    };
    window.addEventListener('mousedown', startBgm);
    window.addEventListener('keydown', startBgm);

    // 分頁切換 / 關閉時暫停 BGM（避免關掉視窗音樂還在播）
    document.addEventListener('visibilitychange', () => {
      if (!this.bgm) return;
      if (document.hidden) { try { this.bgm.pause(); } catch(e){} }
      else if (!this._muted && this._bgmStarted) { this.bgm.play().catch(()=>{}); }
    });
    const stopAll = () => {
      try { if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; } } catch(e){}
      // 同時停掉所有 SFX cloneNode 殘響
      document.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch(e){} });
      this._save();
    };
    window.addEventListener('pagehide', stopAll);
    window.addEventListener('beforeunload', stopAll);

    // 靜音切換按鈕
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.onclick = () => this.toggleMute();

    requestAnimationFrame(() => this.loop());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx.imageSmoothingEnabled = false;
  }

  _spawnDemoFarmer() {
    // 試玩教學 NPC：先在主城旁站著
    const npc = new NPC('farmer', this.world.townHall);
    npc.workplace = null;  // 沒農舍前無事可做
    npc.x = this.world.townHall.x + 80;
    npc.y = this.world.townHall.y + 30;
    this.world.npcs.push(npc);
  }

  /* =============================================================
     輸入
     ============================================================= */
  _setupInput() {
    const c = this.canvas;
    let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0, downTime = 0;

    c.addEventListener('mousedown', (e) => {
      dragging = true; c.classList.add('dragging');
      lastX = e.clientX; lastY = e.clientY;
      downX = e.clientX; downY = e.clientY; downTime = performance.now();
    });
    window.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false; c.classList.remove('dragging');
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      const dur = performance.now() - downTime;
      if (moved < 6 && dur < 300) this._onClick(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this._clampCam();
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const z = this.camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1);
      this.camera.zoom = clamp(z, this.camera.minZoom, this.camera.maxZoom);
      this._clampCam();
    }, { passive: false });
    c.addEventListener('mousemove', (e) => {
      this._mouseScreen = { x: e.clientX, y: e.clientY };
    });

    // ESC 取消擺放
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancelPlacement();
    });
  }

  _clampCam() {
    const vw = this.canvas.width / this.camera.zoom;
    const vh = this.canvas.height / this.camera.zoom;
    this.camera.x = clamp(this.camera.x, 0, Math.max(0, WORLD_W - vw));
    this.camera.y = clamp(this.camera.y, 0, Math.max(0, WORLD_H - vh));
  }

  screenToWorld(sx, sy) {
    return { x: this.camera.x + sx / this.camera.zoom, y: this.camera.y + sy / this.camera.zoom };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.camera.x) * this.camera.zoom, y: (wy - this.camera.y) * this.camera.zoom };
  }

  _onClick(sx, sy) {
    const w = this.screenToWorld(sx, sy);

    // 擺放模式
    if (this._placing) {
      const tx = Math.floor(w.x / TILE);
      const ty = Math.floor(w.y / TILE);
      this._tryPlaceBuilding(this._placing, tx, ty);
      return;
    }

    // 點 NPC
    const hitN = this.world.npcs.find(n => n.state !== NPC_STATE.DEAD &&
      Math.hypot(n.x - w.x, n.y - (w.y - 20)) < 28);
    if (hitN) { this._showNPCPanel(hitN); return; }

    // 點建築
    const hitB = this.world.buildings.find(b => {
      const x0 = b.tx * TILE, y0 = b.ty * TILE;
      const x1 = x0 + b.def.size.w * TILE, y1 = y0 + b.def.size.h * TILE;
      return w.x >= x0 && w.x <= x1 && w.y >= y0 && w.y <= y1;
    });
    if (hitB) { this._showBuildingPanel(hitB); return; }

    this._hideSidePanel();
  }

  /* =============================================================
     UI 設置
     ============================================================= */
  _setupUI() {
    document.getElementById('buildBtn').onclick = () => this._openBuildMenu();
    document.getElementById('marketBtn').onclick = () => this._openMarket();
    document.getElementById('helpBtn').onclick = () => document.getElementById('helpMenu').classList.remove('hidden');
    document.getElementById('closeSide').onclick = () => this._hideSidePanel();
    document.querySelectorAll('[data-close]').forEach(b => {
      b.onclick = () => document.getElementById(b.dataset.close).classList.add('hidden');
    });
    document.getElementById('speedBtn').onclick = () => {
      const cycle = [1, 2, 3];
      const i = cycle.indexOf(this.timeScale);
      this.timeScale = cycle[(i + 1) % cycle.length];
      document.getElementById('speedBtn').textContent = `▶ ${this.timeScale}x`;
    };
  }

  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem('idleempire.muted', this._muted ? '1' : '0');
    if (this.bgm) {
      if (this._muted) { try { this.bgm.pause(); } catch(e){} }
      else if (this._bgmStarted) { this.bgm.play().catch(()=>{}); }
    }
    this._updateMuteUI();
  }
  _updateMuteUI() {
    const btn = document.getElementById('muteBtn');
    if (btn) btn.textContent = this._muted ? '🔇' : '🔊';
  }

  _openBuildMenu() {
    const menu = document.getElementById('buildMenu');
    const list = document.getElementById('buildList');
    list.innerHTML = '';
    for (const [type, def] of Object.entries(BUILDINGS)) {
      if (type === 'townhall') continue;
      const card = document.createElement('div');
      card.className = 'buildCard';
      const cost = Object.entries(def.cost).map(([k, v]) => `${this._iconFor(k)} ${v}`).join('  ');
      const enough = this._canAfford(def.cost);
      if (!enough) card.classList.add('disabled');
      card.innerHTML = `
        <div class="info">
          <div class="name">${def.name}</div>
          <div class="desc">${def.desc}</div>
          <div class="cost">花費：${cost}</div>
        </div>
      `;
      card.onclick = () => {
        if (!enough) { this.toast('資源不足！'); return; }
        menu.classList.add('hidden');
        this._beginPlacement(type);
      };
      list.appendChild(card);
    }
    menu.classList.remove('hidden');
  }

  _iconFor(res) {
    return ({ gold: '⛁', wood: '🪵', ore: '⛏', food: '🌾', potion: '⚗' })[res] || res;
  }

  _canAfford(cost) {
    return Object.entries(cost).every(([k, v]) => (this.resources[k] || 0) >= v);
  }

  _beginPlacement(type) {
    this._placing = type;
    document.getElementById('placementHint').classList.remove('hidden');
    this.canvas.classList.add('placing');
  }
  _cancelPlacement() {
    this._placing = null;
    document.getElementById('placementHint').classList.add('hidden');
    this.canvas.classList.remove('placing');
  }
  _tryPlaceBuilding(type, tx, ty) {
    if (!this.world.canPlaceBuilding(type, tx, ty)) {
      this.toast('這裡蓋不了！');
      return;
    }
    const def = BUILDINGS[type];
    if (!this._canAfford(def.cost)) {
      this.toast('資源不足！');
      return;
    }
    this._spend(def.cost);
    this.world.placeBuilding(type, tx, ty);
    this._cancelPlacement();
    this._renderResUI();
    this.toast(`✅ ${def.name} 建造中…`);
  }

  _spend(cost) {
    for (const [k, v] of Object.entries(cost)) {
      this.resources[k] = (this.resources[k] || 0) - v;
      this.flashRes(k, -v);
    }
  }

  _showBuildingPanel(b) {
    const def = b.def;
    const panel = document.getElementById('sidePanel');
    const c = document.getElementById('sideContent');
    let workersHtml = '';
    if (def.recruits) {
      const rj = JOBS[def.recruits];
      const recruitCost = rj.recruitCost;
      const costStr = Object.entries(recruitCost).map(([k,v]) => `${this._iconFor(k)} ${v}`).join(' ');
      const canRec = this._canAfford(recruitCost) && b.workers.length < def.capacity && b.isBuilt;
      workersHtml += `<h3>👥 員工 (${b.workers.length}/${def.capacity})</h3>`;
      for (const w of b.workers) {
        workersHtml += `<div class="npcCard" data-npc="${w.id}">
          ${rj.emoji} ${w.name} · HP ${Math.round(w.hp)} · 飢餓 ${Math.round(w.hunger)}
        </div>`;
      }
      workersHtml += `<button class="actBtn" id="recruitBtn" ${canRec?'':'disabled'}>
        招募 ${rj.name}（${costStr}）
      </button>`;
    }
    c.innerHTML = `
      <h2>${def.name}</h2>
      <div class="stat"><span>狀態</span><span>${b.isBuilt ? '✅ 完工' : `🔨 建造中 ${Math.round(b.progress*100)}%`}</span></div>
      <p style="font-size:13px;color:#5a3a22;margin:6px 0">${def.desc}</p>
      ${workersHtml}
    `;
    panel.classList.remove('hidden');
    const rb = document.getElementById('recruitBtn');
    if (rb) rb.onclick = () => this._tryRecruit(b);
    c.querySelectorAll('.npcCard').forEach(el => {
      el.onclick = () => {
        const id = +el.dataset.npc;
        const npc = this.world.npcs.find(n => n.id === id);
        if (npc) this._showNPCPanel(npc);
      };
    });
  }

  _tryRecruit(b) {
    if (!b.def.recruits) return;
    const job = b.def.recruits;
    const cost = JOBS[job].recruitCost;
    if (!this._canAfford(cost)) return this.toast('資源不足！');
    if (b.workers.length >= b.def.capacity) return this.toast('已達上限！');
    this._spend(cost);
    const npc = new NPC(job, this.world.townHall);
    npc.workplace = b;
    npc.x = b.x + rand(-20, 20); npc.y = b.y + 8;
    b.workers.push(npc);
    this.world.npcs.push(npc);
    this._renderResUI();
    this._showBuildingPanel(b); // 刷新面板
    this.toast(`✅ 招募了 ${JOBS[job].name} ${npc.name}`);
    playSfx('success', 0.4);
  }

  _showNPCPanel(n) {
    const panel = document.getElementById('sidePanel');
    const c = document.getElementById('sideContent');
    c.innerHTML = `
      <h2>${n.def.emoji} ${n.def.name} · ${n.name}</h2>
      <div class="stat"><span>HP</span><span>${Math.round(n.hp)}/${n.maxHp}</span></div>
      <div class="bar hp"><div style="width:${(n.hp/n.maxHp)*100}%"></div></div>
      <div class="stat"><span>飢餓度</span><span>${Math.round(n.hunger)}/${n.maxHunger}</span></div>
      <div class="bar hunger"><div style="width:${(n.hunger/n.maxHunger)*100}%"></div></div>
      <div class="stat"><span>狀態</span><span>${this._stateLabel(n.state)}</span></div>
      <div class="stat"><span>速度</span><span>${Math.round(n.speed)} px/s</span></div>
      <div class="stat"><span>職業產出</span><span>${Object.entries(n.def.output).map(([k,v])=>this._iconFor(k)+v).join(' ')}</span></div>
      <button class="actBtn" id="locateBtn">📍 定位到他</button>
    `;
    panel.classList.remove('hidden');
    document.getElementById('locateBtn').onclick = () => this._centerOn(n.x, n.y);
  }

  _stateLabel(s) {
    return ({
      idle: '😴 待命',
      goto_work: '🚶 前往工作',
      working: '⚒ 工作中',
      return: '🏠 返家',
      deposit: '📦 儲存中',
      go_home_hungry: '🍽 太餓了，回家',
      eat: '🍞 吃飯',
      dead: '💀 死亡',
    })[s] || s;
  }

  _centerOn(x, y) {
    this.camera.x = x - this.canvas.width / this.camera.zoom / 2;
    this.camera.y = y - this.canvas.height / this.camera.zoom / 2;
    this._clampCam();
  }

  _hideSidePanel() {
    document.getElementById('sidePanel').classList.add('hidden');
  }

  _openMarket() {
    const m = document.getElementById('marketMenu');
    const list = document.getElementById('marketList');
    list.innerHTML = '';
    for (const [k, price] of Object.entries(SELL_PRICE)) {
      const have = this.resources[k] || 0;
      const row = document.createElement('div');
      row.className = 'marketRow';
      row.innerHTML = `
        <div class="info">
          <div class="name">${this._iconFor(k)} ${this._resName(k)}</div>
          <div class="cost">擁有 ${have} · 1 個 = ${price} ⛁</div>
        </div>
        <button class="qtyBtn" data-q="1">賣 1</button>
        <button class="qtyBtn" data-q="10">賣 10</button>
        <button class="qtyBtn" data-q="all">全賣</button>
      `;
      row.querySelectorAll('.qtyBtn').forEach(btn => {
        btn.onclick = () => {
          let q = btn.dataset.q === 'all' ? have : Math.min(have, +btn.dataset.q);
          if (q <= 0) { this.toast('沒有資源可賣！'); return; }
          this.resources[k] -= q;
          this.resources.gold += q * price;
          this.flashRes(k, -q);
          this.flashRes('gold', +q * price);
          this._renderResUI();
          this._openMarket();    // 刷新
          playSfx('success', 0.3);
        };
      });
      list.appendChild(row);
    }
    m.classList.remove('hidden');
  }

  _resName(k) {
    return ({ gold: '金幣', wood: '木材', ore: '礦石', food: '糧食', potion: '藥水' })[k];
  }

  /* =============================================================
     資源變動 / UI 同步
     ============================================================= */
  _renderResUI() {
    document.querySelectorAll('#topBar .res').forEach(el => {
      const k = el.dataset.res;
      el.querySelector('.val').textContent = Math.round(this.resources[k] || 0);
    });
    const dl = document.getElementById('dayLabel');
    if (dl) dl.textContent = `Day ${this.day}`;
    const tl = document.getElementById('timeLabel');
    if (tl) tl.textContent = this._timeLabel();
  }

  _timeLabel() {
    const t = this.dayTime;
    if (t < 0.2) return '🌙 深夜';
    if (t < 0.35) return '🌅 早晨';
    if (t < 0.6) return '☀ 中午';
    if (t < 0.8) return '🌇 傍晚';
    return '🌌 夜晚';
  }

  addResource(k, v, atX, atY) {
    this.resources[k] = (this.resources[k] || 0) + v;
    this.flashRes(k, v, atX, atY);
    this._renderResUI();
  }

  flashRes(k, v, wx, wy) {
    const sign = v > 0 ? '+' : '';
    const txt = `${sign}${v} ${this._iconFor(k)}`;
    let sx, sy;
    if (wx != null && wy != null) {
      const s = this.worldToScreen(wx, wy);
      sx = s.x; sy = s.y;
    } else {
      const el = document.querySelector(`#topBar .res[data-res="${k}"]`);
      const r = el.getBoundingClientRect();
      sx = r.left + r.width/2; sy = r.bottom + 8;
    }
    const f = document.createElement('div');
    f.className = 'floater ' + (v > 0 ? 'gain' : 'lose');
    f.textContent = txt;
    f.style.left = sx + 'px';
    f.style.top = sy + 'px';
    document.getElementById('floaters').appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  /* =============================================================
     主迴圈
     ============================================================= */
  loop() {
    const now = nowSec();
    let dt = now - this.lastTick;
    this.lastTick = now;
    if (dt > 0.1) dt = 0.1;
    dt *= this.timeScale;

    this._tick(dt);
    this._render();
    requestAnimationFrame(() => this.loop());
  }

  _tick(dt) {
    // 時間
    this.dayTime += dt / 300;            // 5 分鐘一日
    if (this.dayTime >= 1) {
      this.dayTime -= 1; this.day++;
      this.toast(`☀ 第 ${this.day} 天開始`);
      this._save();
    }

    // 建築們：建造完工
    for (const b of this.world.buildings) {
      // 自動建設（不需 npc）
    }

    // 資源點重生
    this._tickResRespawn += dt;
    if (this._tickResRespawn > 1) {
      this._tickResRespawn = 0;
      const t = nowSec();
      for (const r of this.world.resources) {
        if (r.depleted && t >= r.respawnAt) {
          r.depleted = false;
          r.hp = r.maxHp;
        }
      }
    }

    // NPC tick
    for (const n of this.world.npcs) n.tick(dt, this);

    // 移除死亡 NPC（延遲移除以播動畫）
    this.world.npcs = this.world.npcs.filter(n => {
      if (n.state === NPC_STATE.DEAD) {
        if (!n._deadAt) n._deadAt = nowSec();
        if (nowSec() - n._deadAt > 4) {
          // 從建築物名單移除
          if (n.workplace) n.workplace.workers = n.workplace.workers.filter(w => w.id !== n.id);
          return false;
        }
      }
      return true;
    });

    // UI 數字
    if (Math.random() < 0.05) this._renderResUI();
  }

  /* =============================================================
     渲染
     ============================================================= */
  _render() {
    const { ctx, canvas, camera } = this;
    ctx.fillStyle = '#2a3018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    this._renderTiles();
    this._renderObjects();
    this._renderResources();
    this._renderBuildings();
    this._renderNPCs();
    this._renderPlacementGhost();

    ctx.restore();

    this._renderDayNightOverlay();
  }

  _renderTiles() {
    const { ctx, camera } = this;
    const vx0 = Math.floor(camera.x / TILE);
    const vy0 = Math.floor(camera.y / TILE);
    const vx1 = Math.ceil((camera.x + this.canvas.width / camera.zoom) / TILE);
    const vy1 = Math.ceil((camera.y + this.canvas.height / camera.zoom) / TILE);

    const grass = ASSETS.img.grass;
    const water = ASSETS.img.water_tile;
    const path  = ASSETS.img.paths;
    const hills = ASSETS.img.hills;
    const wfA   = ASSETS.img[`water_anim_${Math.floor(performance.now()/300) % 4}`];

    for (let ty = vy0; ty < vy1; ty++) {
      for (let tx = vx0; tx < vx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) {
          ctx.fillStyle = '#1a2010';
          ctx.fillRect(tx*TILE, ty*TILE, TILE, TILE);
          continue;
        }
        const v = this.world.tileAt(tx, ty);
        if (v === 0 && grass) {
          // 從 grass tilesheet 取一塊「純草地」
          ctx.drawImage(grass, 16, 16, 16, 16, tx*TILE, ty*TILE, TILE, TILE);
        } else if (v === 1) {
          // 動畫水
          if (wfA) ctx.drawImage(wfA, tx*TILE, ty*TILE, TILE, TILE);
          else { ctx.fillStyle = '#3068a8'; ctx.fillRect(tx*TILE, ty*TILE, TILE, TILE); }
        } else if (v === 2 && path) {
          // 路（從 paths tileset 取一塊）
          ctx.drawImage(path, 16, 16, 16, 16, tx*TILE, ty*TILE, TILE, TILE);
        } else if (v === 3 && hills) {
          // 岩石地（從 hills 取一塊）
          ctx.drawImage(hills, 32, 32, 16, 16, tx*TILE, ty*TILE, TILE, TILE);
        } else if (grass) {
          ctx.drawImage(grass, 16, 16, 16, 16, tx*TILE, ty*TILE, TILE, TILE);
        }
      }
    }
  }

  _renderObjects() {
    const { ctx } = this;
    for (const o of this.world.objects) {
      let img;
      switch (o.kind) {
        case 'decor_tree': img = ASSETS.img.tree_medium; break;
        case 'decor_flower': img = ASSETS.img.flower; break;
        case 'decor_bush': img = ASSETS.img.bush; break;
        case 'decor_grass': img = ASSETS.img.sunflower; break;
        case 'decor_merchant': img = ASSETS.img.merchant; break;
      }
      if (!img) continue;
      ctx.drawImage(img, o.x - img.width/2, o.y - img.height + 8);
    }
  }

  _renderResources() {
    const { ctx } = this;
    for (const r of this.world.resources) {
      if (r.depleted) {
        // 顯示枯萎/採完狀態（用 stump 或淡化）
        const stump = ASSETS.img.stump_small;
        if (r.kind === 'tree' && stump) {
          ctx.drawImage(stump, r.x - stump.width/2, r.y - stump.height + 8);
        }
        continue;
      }
      let img;
      if (r.kind === 'tree')  img = ASSETS.img.tree_medium;
      else if (r.kind === 'rock') img = ASSETS.img.mushroom; // 用菇菇代表礦點 (因為沒原生 rock)
      else if (r.kind === 'bush') img = ASSETS.img.mushrooms;
      if (!img) continue;
      ctx.drawImage(img, r.x - img.width/2, r.y - img.height + 8);
      // HP bar 在受傷時顯示
      if (r.hp < r.maxHp) {
        const w = 30, h = 4;
        ctx.fillStyle = '#000'; ctx.fillRect(r.x - w/2, r.y - img.height + 4, w, h);
        ctx.fillStyle = '#5fa84e'; ctx.fillRect(r.x - w/2, r.y - img.height + 4, w * (r.hp/r.maxHp), h);
      }
    }
  }

  _renderBuildings() {
    const { ctx } = this;
    // 從 House.png tileset 取小房子，每種建築取不同色塊（這 House.png 已經是組合圖）
    const sheet = ASSETS.img.house_set;
    for (const b of this.world.buildings) {
      const px = b.tx * TILE, py = b.ty * TILE;
      // 我們把 House.png 切成 4 區（左上/右上/左下/右下）給不同建築用
      // House.png = 448 x 320，切成 224x160 4 大塊
      let sx = 0, sy = 0, sw = 224, sh = 160;
      switch (b.type) {
        case 'townhall':   sx = 0;    sy = 0;   sw = 224; sh = 160; break;
        case 'farm':       sx = 0;    sy = 160; sw = 224; sh = 160; break;
        case 'lumberyard': sx = 224;  sy = 0;   sw = 224; sh = 160; break;
        case 'mine':       sx = 224;  sy = 160; sw = 224; sh = 160; break;
        case 'alchemy':    sx = 0;    sy = 0;   sw = 224; sh = 160; break;
        case 'market':     sx = 224;  sy = 0;   sw = 224; sh = 160; break;
      }
      const dw = b.def.size.w * TILE;
      const dh = b.def.size.h * TILE;
      // 建造中：半透明 + 鷹架/掃描效果
      if (!b.isBuilt) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.4 * b.progress;
        if (sheet) ctx.drawImage(sheet, sx, sy, sw, sh, px, py - dh*0.2, dw, dh*1.2);
        else { ctx.fillStyle = '#a06a3a'; ctx.fillRect(px, py, dw, dh); }
        ctx.restore();
        // 進度條
        ctx.fillStyle = '#000'; ctx.fillRect(px+8, py + dh - 12, dw-16, 8);
        ctx.fillStyle = '#e8b73a'; ctx.fillRect(px+8, py + dh - 12, (dw-16)*b.progress, 8);
      } else {
        if (sheet) ctx.drawImage(sheet, sx, sy, sw, sh, px, py - dh*0.2, dw, dh*1.2);
        else { ctx.fillStyle = '#a06a3a'; ctx.fillRect(px, py, dw, dh); }
      }
      // 建築名牌
      ctx.font = 'bold 16px "Noto Sans TC", "PingFang TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(b.def.name).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(px + dw/2 - tw/2, py - 22, tw, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(b.def.name, px + dw/2, py - 13);
    }
  }

  _renderNPCs() {
    const { ctx } = this;
    // 按 y 排序確保前後關係
    const sorted = [...this.world.npcs].sort((a, b) => a.y - b.y);
    for (const n of sorted) {
      const key = n.spriteKey();
      const img = ASSETS.img[key] || ASSETS.img[`farmer_down_idle_0`];
      if (!img) continue;
      // 角色 sprite 中心對齊 npc 腳底（172x124，本體 bbox y_bottom = 100，x_center = 86）
      const ox = 86, oy = 100;
      ctx.save();
      // 死亡半透明
      if (n.state === NPC_STATE.DEAD) ctx.globalAlpha = 0.5;
      // 職業色光暈
      ctx.fillStyle = n.def.color + '55';
      ctx.beginPath();
      ctx.arc(n.x, n.y - 4, 14, 0, Math.PI*2);
      ctx.fill();
      ctx.drawImage(img, n.x - ox, n.y - oy);
      ctx.restore();

      // HP / Hunger 條（站立中）
      this._renderNpcBars(n);
      // 職業 emoji 標籤
      ctx.font = '18px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(n.def.emoji, n.x, n.y - 76);
    }
  }

  _renderNpcBars(n) {
    const { ctx } = this;
    const w = 36, h = 4;
    const x = n.x - w/2;
    const y = n.y - 70;
    // HP
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#d65a3a'; ctx.fillRect(x, y, w * (n.hp/n.maxHp), h);
    // Hunger
    ctx.fillStyle = '#000'; ctx.fillRect(x, y + 6, w, h);
    ctx.fillStyle = '#e8b73a'; ctx.fillRect(x, y + 6, w * (n.hunger/n.maxHunger), h);
  }

  _renderPlacementGhost() {
    if (!this._placing || !this._mouseScreen) return;
    const ms = this._mouseScreen;
    const w = this.screenToWorld(ms.x, ms.y);
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    const def = BUILDINGS[this._placing];
    const dw = def.size.w * TILE, dh = def.size.h * TILE;
    const ok = this.world.canPlaceBuilding(this._placing, tx, ty);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#5fa84e' : '#b53a2c';
    ctx.fillRect(tx*TILE, ty*TILE, dw, dh);
    ctx.restore();
    ctx.strokeStyle = ok ? '#5fa84e' : '#b53a2c';
    ctx.lineWidth = 3;
    ctx.strokeRect(tx*TILE+1, ty*TILE+1, dw-2, dh-2);
  }

  _renderDayNightOverlay() {
    const t = this.dayTime;
    let alpha = 0;
    let r=0,g=0,b=0;
    if (t < 0.2) { alpha = 0.55; r=20; g=10; b=40; }
    else if (t < 0.3) { alpha = 0.55 - (t-0.2)*5.5; r=20; g=10; b=40; }
    else if (t < 0.7) { alpha = 0; }
    else if (t < 0.85) { alpha = (t-0.7) * 3.0; r=80; g=30; b=20; }
    else if (t < 1) { alpha = 0.5; r=30; g=15; b=50; }
    if (alpha > 0.01) {
      const ctx = this.ctx;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /* =============================================================
     存檔
     ============================================================= */
  _save() {
    try {
      const data = {
        v: 1,
        day: this.day,
        dayTime: this.dayTime,
        resources: this.resources,
        buildings: this.world.buildings.map(b => ({ type: b.type, tx: b.tx, ty: b.ty, builtAt: b.builtAt - nowSec() })),
        npcs: this.world.npcs
          .filter(n => n.state !== NPC_STATE.DEAD)
          .map(n => ({
            job: n.job,
            x: n.x, y: n.y, hp: n.hp, hunger: n.hunger,
            workplaceIdx: n.workplace ? this.world.buildings.indexOf(n.workplace) : -1,
          })),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { console.warn('save fail', e); }
  }

  _loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.day = d.day || 1;
      this.dayTime = d.dayTime || 0.25;
      this.resources = { ...STARTING_RES, ...d.resources };
      // 重建建築（除了 townhall 已存在）
      this.world.buildings = this.world.buildings.filter(b => b.type === 'townhall');
      for (const bs of d.buildings || []) {
        if (bs.type === 'townhall') continue;
        const b = this.world.placeBuilding(bs.type, bs.tx, bs.ty);
        b.builtAt = nowSec() + (bs.builtAt || 0); // 還原進度
      }
      // 重建 NPC
      this.world.npcs = [];
      for (const ns of d.npcs || []) {
        const n = new NPC(ns.job, this.world.townHall);
        n.x = ns.x; n.y = ns.y; n.hp = ns.hp; n.hunger = ns.hunger;
        if (ns.workplaceIdx >= 0) {
          const wp = this.world.buildings[ns.workplaceIdx];
          if (wp) { n.workplace = wp; wp.workers.push(n); }
        }
        this.world.npcs.push(n);
      }
    } catch (e) { console.warn('load fail', e); }
  }
}

/* =============================================================
   啟動
   ============================================================= */
window.addEventListener('DOMContentLoaded', () => {
  const fill = document.getElementById('loadingFill');
  const status = document.getElementById('loadingStatus');
  loadAssets((p, label) => {
    fill.style.width = (p * 100).toFixed(0) + '%';
    status.textContent = `載入中… ${(p*100).toFixed(0)}% (${label})`;
  }).then(() => {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('game').classList.remove('hidden');
    window.GAME = new Game();
    // 每 30 秒自動存檔
    setInterval(() => window.GAME._save(), 30000);
    window.addEventListener('beforeunload', () => window.GAME._save());
  });
});

})();
