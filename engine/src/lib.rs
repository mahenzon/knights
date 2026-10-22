//! Newly written simulation. Recovered constants and rules are documented in research/enemy-rules.md.
mod castle;
use castle::{Door, DOOR_EXTRA_WORDS};
mod tremble;
use tremble::{Tremble, TREMBLE_WORDS};
mod frame;
use frame::{write_actors, write_unit, ActorFrame, ACTOR_FLOATS, FRAME_WORDS};
mod order;
use order::{Order, OBJECTS, ORDER_WORDS};
mod data;
mod effects;
mod snapshot;
mod sound;
#[cfg(test)]
mod test_support;
use sound::SoundQueue;
mod enemies;
use effects::{
    Fragment, Smoke, FRAGMENTS, FRAGMENT_STRIDE, FRAGMENT_WORDS, SMOKES, SMOKE_STRIDE, SMOKE_WORDS,
};
mod projectiles;
mod weapons;
use data::STATS;
use projectiles::{Projectile, DRAG_WORDS, PROJECTILES, PROJECTILE_STRIDE, PROJECTILE_WORDS};
use std::cell::RefCell;
use weapons::{
    Device, Missile, DEVICES, DEVICE_STRIDE, DEVICE_WORDS, MISSILES, MISSILE_STRIDE, MISSILE_WORDS,
};

const DT: f32 = 1.0 / 60.0;
const CAPACITY: usize = 200;
const HEADER: usize = 20;
const STRIDE: usize = 12;
const WALK: u32 = 1;
const HELD: u32 = 2;
const FLY: u32 = 3;
const STUN: u32 = 4;
const ATTACK: u32 = 5;
const DEAD: u32 = 6;
const HOOKED: u32 = 7;
const SACRIFICE: u32 = 8;
const EJECTED: u32 = 9;
const ESCAPE: u32 = 10;
const CAST: u32 = 11;
const EFFECTS_START: usize = HEADER
    + CAPACITY * STRIDE
    + PROJECTILES * PROJECTILE_STRIDE
    + DEVICES * DEVICE_STRIDE
    + MISSILES * MISSILE_STRIDE;
const SMOKE_START: usize = EFFECTS_START + 6;
const FRAGMENT_START: usize = SMOKE_START + SMOKES * SMOKE_STRIDE;
const DOOR_STATE: usize = FRAGMENT_START + FRAGMENTS * FRAGMENT_STRIDE;
const ORDER_START: usize = DOOR_STATE + 8;
const GATE_FRAME_START: usize = ORDER_START + OBJECTS;
const DRAW_LEN: usize = GATE_FRAME_START + STRIDE;
const SCENE_WORDS: usize = 10;

fn next_random(state: &mut u32) -> u32 {
    *state ^= *state << 13;
    *state ^= *state >> 17;
    *state ^= *state << 5;
    // Native rand returns a nonnegative signed int; retain the full generator state.
    *state & 0x7fffffff
}

#[derive(Clone, Copy, Default, Debug, PartialEq)]
struct Unit {
    state: u32,
    kind: u32,
    x: f32,
    y: f32,
    ground: f32,
    vx: f32,
    vy: f32,
    hp: f32,
    speed: f32,
    saved_speed: f32,
    mass: f32,
    size: f32,
    clock: f32,
    held_recovery: f32,
    animation: f32,
    angle: f32,
    held_pose: Option<u32>,
    target_x: f32,
    target_y: f32,
    min_y: f32,
    cooldown: f32,
    alpha: f32,
    ability_delay: f32,
    ability_time: f32,
    ability_done: bool,
    ability_active: bool,
    shield: bool,
    immunity: bool,
    reward: u32,
    damage: u32,
    range: f32,
    disarmed: bool,
    burning: bool,
    freeze_time: f32,
    corpse_flying: bool,
}
impl Unit {
    fn alive(&self) -> bool {
        matches!(
            self.state,
            WALK | HELD | FLY | STUN | ATTACK | ESCAPE | CAST
        )
    }
    fn hit(&mut self, damage: i32) -> bool {
        if self.state == 0 {
            return false;
        }
        if self.immunity {
            self.immunity = false;
            self.clock = -1.0;
            return false;
        }
        self.hp -= damage as f32;
        if self.hp < 0.0 {
            self.corpse_flying |= self.state == FLY;
            self.state = DEAD;
            self.clock = 0.0;
            self.animation = 0.0;
            return true;
        }
        false
    }
    fn release(&mut self) {
        if self.state != HELD {
            return;
        }
        if self.x.trunc() > 344.0
            && self.x.trunc() < 480.0
            && self.y.trunc() > 99.0
            && self.y.trunc() < 320.0
        {
            self.vx = 2.0 * (480.0 - self.x).trunc() - 420.0;
            self.vy = 3.0 * (320.0 - self.y).trunc() - 400.0;
        }
        self.vx -= 2.0 * (self.x - self.target_x).trunc();
        self.vy -= 2.0 * (self.y - self.target_y + 30.0).trunc();
        self.held_pose = Some(self.pose() as u32);
        self.state = FLY;
        self.clock = 0.0;
    }
    fn drag_to(&mut self, x: f32, y: f32, previous: [f32; 2]) {
        let dx = x - previous[0];
        let dy = y - previous[1];
        self.vx += 2.5 * dx / self.mass;
        self.vy += if dy < 0.0 {
            4.0 * dy / self.mass
        } else {
            4.0 * dy
        };
        self.target_x = x;
        self.target_y = y;
    }
}

struct Game {
    // URL-selected behavior, retained across days/restores but never stored in a snapshot.
    fix_ballista_gate: bool,
    units: [Unit; CAPACITY],
    config: [f32; 12],
    attack_range_offset: f32,
    table: [u32; CAPACITY],
    table_len: usize,
    hp: f32,
    max_hp: f32,
    gold: u32,
    sacrifices: u32,
    score: u32,
    kills: u32,
    time: f32,
    tick: u32,
    rng: u32,
    pressure: f32,
    delay: f32,
    spawn_timer: f32,
    wave_skip: u32,
    prefix: f32,
    status: u32,
    held: i32,
    // Input is transient: loading a snapshot releases any held actor.
    pointer: [f32; 2],
    events: u32,
    sound_masks: [u32; 5],
    audio: SoundQueue,
    hook_time: f32,
    gate_open: f32,
    gate_time: f32,
    gate_unit: i32,
    hook_unit: i32,
    hook_alpha: f32,
    gate_amplitude: f32,
    gate_burst_y: f32,
    gate_lid_y: f32,
    gate_lid_angle: f32,
    gate_burst: bool,
    gate_ready: bool,
    ending: u32,
    end_fade: f32,
    end_time: f32,
    projectiles: [Projectile; PROJECTILES],
    devices: [Device; DEVICES],
    missiles: [Missile; MISSILES],
    weapon_sounds: u32,
    smokes: [Smoke; SMOKES],
    fragments: [Fragment; FRAGMENTS],
    door: Door,
    tremble: Tremble,
    order: Order,
    frame: ActorFrame,
    draw: [f32; DRAW_LEN],
    snapshot: Vec<u8>,
}
impl Default for Game {
    fn default() -> Self {
        Self {
            fix_ballista_gate: false,
            units: [Unit::default(); CAPACITY],
            config: [0.0; 12],
            attack_range_offset: 0.,
            table: [0; CAPACITY],
            table_len: 1,
            hp: 100.0,
            max_hp: 100.0,
            gold: 0,
            sacrifices: 0,
            score: 0,
            kills: 0,
            time: 0.0,
            tick: 0,
            rng: 73,
            pressure: 0.0,
            delay: 3.5,
            spawn_timer: 0.0,
            wave_skip: 0,
            prefix: 1.0,
            status: 0,
            held: -1,
            pointer: [0.; 2],
            events: 0,
            sound_masks: [0; 5],
            audio: SoundQueue::default(),
            hook_time: -1.0,
            gate_open: 0.0,
            gate_time: -1.0,
            gate_unit: -1,
            hook_unit: -1,
            hook_alpha: 0.,
            gate_amplitude: 0.,
            gate_burst_y: 0.,
            gate_lid_y: 227.,
            gate_lid_angle: 0.,
            gate_burst: false,
            gate_ready: false,
            ending: 0,
            end_fade: -400.,
            end_time: 0.,
            projectiles: [Projectile::default(); PROJECTILES],
            devices: [Device::default(); DEVICES],
            missiles: [Missile::default(); MISSILES],
            weapon_sounds: 0,
            smokes: [Smoke::default(); SMOKES],
            fragments: [Fragment::default(); FRAGMENTS],
            door: Door::default(),
            tremble: Tremble::default(),
            order: Order::default(),
            frame: ActorFrame::default(),
            draw: [0.0; DRAW_LEN],
            snapshot: Vec::new(),
        }
    }
}
impl Game {
    fn random(&mut self) -> u32 {
        next_random(&mut self.rng)
    }
    fn active(&self) -> usize {
        self.units
            .iter()
            .filter(|u| u.state != 0 && u.state != DEAD && u.state != EJECTED)
            .count()
    }
    fn start(&mut self, seed: u32, health: f32, gold: u32, sacrifices: u32, score: u32) {
        self.units.fill(Unit::default());
        self.projectiles.fill(Projectile::default());
        self.devices.fill(Device::default());
        self.missiles.fill(Missile::default());
        self.equip(0, 0, 0, 35., 30.);
        self.equip(1, 3, 0, 173., 210.);
        self.weapon_sounds = 0;
        self.hp = health;
        self.max_hp = health;
        self.gold = gold;
        self.sacrifices = sacrifices;
        self.score = score;
        self.kills = 0;
        self.time = 0.0;
        self.tick = 0;
        self.rng = seed.max(1);
        self.pressure = self.config[1] + 3.0;
        self.delay = 3.5;
        self.prefix = self.config[7];
        self.status = 0;
        self.held = -1;
        self.pointer = [0.; 2];
        self.events = 0;
        self.sound_masks = [0; 5];
        self.audio.clear();
        self.hook_time = -1.0;
        self.gate_open = 0.0;
        self.gate_time = -1.0;
        self.gate_unit = -1;
        self.hook_unit = -1;
        self.hook_alpha = 0.;
        self.gate_amplitude = 0.;
        self.gate_burst_y = 0.;
        self.gate_lid_y = 227.;
        self.gate_lid_angle = 0.;
        self.gate_burst = false;
        self.gate_ready = false;
        self.ending = 0;
        self.end_fade = 255.;
        self.end_time = 0.;
        self.smokes.fill(Smoke::default());
        self.fragments.fill(Fragment::default());
        self.door = Door::default();
        self.tremble = Tremble::default();
        self.frame = ActorFrame::default();
    }
    fn spawn(&mut self, kind: u32, x: f32, ground: f32, giant: bool) {
        let Some(slot) = self.units.iter().position(|u| u.state == 0) else {
            return;
        };
        let s = STATS[kind as usize];
        let size = if giant { 1.0 } else { 0.8 };
        let y = ground + 55.0 - s[8] * 0.5 - if giant { 15.0 } else { 0.0 };
        let ability_delay = match kind {
            1 => 1.6 + (self.random() % 100) as f32 / 45.0,
            6 => {
                if self.random().is_multiple_of(2) {
                    3.5
                } else {
                    3.0 + (self.random() % 100) as f32 / 25.0
                }
            }
            7 => (self.random() % 100) as f32 / 25.0 - 1.2,
            8 | 9 => {
                let delay = 2.0 + (self.random() % 100) as f32 / 55.0;
                if self.random().is_multiple_of(2) {
                    0.4
                } else {
                    delay
                }
            }
            _ => f32::MAX,
        };
        let bonus = if self.config[4] > 0.0 {
            (self.random() % self.config[4] as u32) as f32
        } else {
            0.0
        };
        let speed = (s[1] + self.config[3]).trunc() + bonus;
        self.units[slot] = Unit {
            state: WALK,
            kind,
            x,
            y,
            ground: y,
            hp: s[0] * (1.0 + self.config[5]) * if giant { 1.5 } else { 1.0 },
            speed: if giant { (speed * 0.8).trunc() } else { speed },
            saved_speed: if giant { (speed * 0.8).trunc() } else { speed },
            mass: if giant { 1.8 } else { 0.9 },
            size,
            target_x: x,
            target_y: y,
            min_y: ground.trunc(),
            reward: s[3] as u32 * if giant { 2 } else { 1 },
            damage: (s[2] * if giant { 2.5 } else { 1.0 }) as u32,
            range: (s[6] + self.attack_range_offset).max(0.),
            cooldown: -1.,
            clock: -1.,
            alpha: 1.0,
            ability_delay,
            ..Unit::default()
        };
    }
    fn pickup(&mut self, x: f32, y: f32) -> bool {
        if self.status != 0 || !x.is_finite() || !y.is_finite() {
            return false;
        }
        let (x, y) = (x.trunc(), y.trunc());
        if self.held >= 0
            || self.projectiles.iter().any(|p| p.active && p.held)
            || self
                .devices
                .iter()
                .any(|d| d.active && d.pressed && !matches!(d.kind, 0 | 3 | 4))
        {
            self.release();
        }
        self.pointer = [x, y];
        for d in &mut self.devices {
            d.pointer_x = x;
            d.pointer_y = y;
        }
        for (i, u) in self.units.iter().enumerate() {
            if !u.alive() || u.shield {
                continue;
            }
            let dx = (x - u.x).trunc();
            let dy = (y - u.y).trunc();
            if dx * dx + dy * dy < STATS[u.kind as usize][4].powi(2) {
                self.held = i as i32;
            }
        }
        if self.held < 0 {
            return self.pickup_projectile(x, y) || self.pickup_device(x, y);
        }
        let u = &mut self.units[self.held as usize];
        if u.state == STUN {
            u.held_recovery = u.clock;
        }
        u.held_pose = Some(u.pose() as u32);
        u.state = HELD;
        u.clock = 0.0;
        u.vx = 0.0;
        u.vy = 0.0;
        u.immunity = false;
        u.target_x = u.x.trunc();
        u.target_y = u.y.trunc();
        if u.kind == 7 {
            u.alpha = 1.0;
            u.ability_time = -1.0;
            u.ability_active = false;
        }
        self.events |= 1;
        self.sound_masks[3] |= 1 << u.kind;
        self.audio.emit(3, u.kind);
        self.drop_barrel(self.held as usize);
        true
    }
    fn drag(&mut self, x: f32, y: f32) {
        if x.is_finite() && y.is_finite() {
            let (x, y) = (x.trunc(), y.trunc());
            if self.held >= 0 {
                self.units[self.held as usize].drag_to(x, y, self.pointer);
                if self.gate_unit < 0 {
                    for d in &mut self.devices {
                        if d.active && d.kind == 3 {
                            d.pressed = x > d.x + 20. && x < d.x + 100. && y < 180.;
                        }
                    }
                }
            }
            self.pointer = [x, y];
            self.drag_devices(x, y);
            self.drag_projectiles(x, y);
        }
    }
    fn release(&mut self) {
        self.release_at(self.pointer[0], self.pointer[1]);
    }
    fn release_at(&mut self, x: f32, y: f32) {
        if !x.is_finite() || !y.is_finite() {
            return;
        }
        self.release_creep();
        self.release_devices(x.trunc(), y.trunc());
        for p in &mut self.projectiles {
            if p.active && p.held && p.kind == 2 {
                p.release_fireball();
            }
            p.held = false;
            p.pressed = false;
        }
    }
    fn release_creep(&mut self) {
        if self.held < 0 {
            return;
        }
        let i = self.held as usize;
        let u = &mut self.units[i];
        u.release();
        self.held = -1;
        self.events |= 2;
        self.sound_masks[2] |= 1 << u.kind;
        self.audio.emit(2, u.kind);
        if self.status != 0 {
            return;
        }
        if self.devices.iter().any(|d| d.active && d.kind == 0)
            && self.hook_time < 0.0
            && u.freeze_time <= 0.0
            && (120.0 - u.x).trunc().powi(2) + (75.0 - u.y).trunc().powi(2) <= 1600.0
            && u.vx.trunc().powi(2) + u.vy.trunc().powi(2) <= 122500.0
        {
            u.state = HOOKED;
            u.x = 120.0;
            u.y = 90.0;
            u.target_x = 120.;
            u.target_y = 60.;
            u.shield = true;
            u.vx = 0.0;
            u.vy = 0.0;
            u.clock = 0.0;
            self.hook_time = 0.0;
            self.hook_unit = i as i32;
            self.events |= 32;
        } else if self.devices.iter().any(|d| d.active && d.kind == 3)
            && self.gate_unit == -1
            && self.gate_ready
        {
            u.state = SACRIFICE;
            u.shield = true;
            u.vx = 0.0;
            u.vy = 0.0;
            u.speed = 0.0;
            u.ground = 300.0;
            self.gate_unit = i as i32;
            self.gate_time = -1.0;
            self.events |= 32;
            self.events |= if matches!(u.kind, 4 | 5 | 10) {
                1024
            } else {
                512
            };
            self.audio.emit(11, u32::from(matches!(u.kind, 4 | 5 | 10)));
        }
    }
    fn reward(&mut self, i: usize) {
        // Native Hit switches to the death pose (and shatters ice) before calling Die.
        self.shatter_ice(i);
        let u = self.units[i];
        self.units[i].speed = 0.0;
        self.units[i].alpha = 1.0;
        self.gold += u.reward;
        self.score +=
            ((u.reward as f32 + 0.1 * (u.ground - u.min_y)) as u32) * (1 << self.config[11] as u32);
        self.kills += 1;
        self.events |= 8;
        self.sound_masks[1] |= 1 << u.kind;
        self.audio.emit(1, u.kind);
        if self.held == i as i32 {
            self.held = -1;
        }
        if matches!(u.kind, 4 | 5) {
            self.explode(u.x, u.y, 0.8, 180, 0.5, 1.0);
            self.hit_splash(u.x, u.y, 1000, 80, true);
            self.events |= 128;
            self.audio.emit(15, 0);
            let u = self.units[i];
            self.machine_fragments(u.x, u.y);
            self.blast_smoke(1, u.x, u.y);
        }
        // A nested giant death can replace a shattered machine in this same slot.
        let u = self.units[i];
        if u.kind == 10 {
            self.units[i].state = 0;
            if u.x > 300.0 {
                self.hit_castle(25.0);
            }
            self.explode(u.x, u.y, 0.8, 180, 0.5, 1.0);
            self.hit_splash(u.x, u.y, 1000, 80, true);
            self.events |= 128;
            self.audio.emit(15, 0);
            let u = self.units[i];
            self.blast_smoke(2, u.x, u.y);
            if u.mass > 1.0 {
                if let Some(slot) = self.units.iter().position(|v| v.state == 0) {
                    self.spawn(10, u.x.trunc(), u.y.trunc(), false);
                    self.units[slot].size = 0.7;
                }
            }
        }
    }
    fn step(&mut self) -> u32 {
        self.audio.begin_frame();
        if self.status != 0 {
            self.audio.finish_frame();
            return 0;
        }
        self.tick += 1;
        let world_random = if self.tremble.strength > 0. {
            [self.random(), self.random()]
        } else {
            [0; 2]
        };
        self.tremble.frame(world_random);
        let protected_hp = if self.ending == 1 {
            Some(self.hp)
        } else {
            None
        };
        self.time += DT;
        self.delay -= DT;
        if self.config[9] > 0. {
            self.spawn_timer -= DT;
        }
        self.pressure += self.config[2] * DT;
        self.prefix += self.config[8] * DT;
        // Hook draws before this frame's dragon update; fixed ticks also preserve 30 FPS behavior.
        let hook_frame = (self.hook_time * 60.).round() as i32;
        self.hook_alpha = if self.hook_time >= 0. && hook_frame >= 162 {
            0.
        } else {
            (self.hook_alpha + 10.).min(255.)
        };
        self.wave_skip = self.wave_skip.saturating_sub(1);
        if self.ending != 1 && self.wave_skip == 0 && self.delay <= 0. {
            self.wave_skip = 10;
            // UpdateWaveCurrentPower counts all active slots in the first half of the pool.
            let count = self.units[..100].iter().filter(|u| u.state != 0).count();
            let chance = self.random() % 1000;
            if ((self.config[9] > 0. && self.spawn_timer < 0.)
                || (chance as f32) < self.pressure
                || count == 0)
                && count <= 19
                && self.delay < 0.
            {
                self.random(); // ProcessWave draws an unused tier before AddOneMonster.
                let lane = self.random() % 40;
                let len = self.table_len.min(self.prefix.max(1.0) as usize).max(1);
                let kind = self.table[self.random() as usize % len];
                let giant = ((self.random() % 100) as f32) < self.config[6] * 100.0;
                if self.config[10] != 0.0 {
                    for j in 0..3 {
                        self.spawn(
                            kind,
                            -110.0 + j as f32 * 7.0,
                            227.0 + j as f32 * 15.0,
                            giant,
                        );
                    }
                } else {
                    self.spawn(kind, -110.0, 227.0 + lane as f32, giant);
                }
                self.spawn_timer = self.config[9];
            }
        }
        // DrawCastle follows waves and precedes attacks, including the door-breaking frame.
        let door_random = if self.door.broken {
            [0; 2]
        } else {
            [self.random(), self.random()]
        };
        self.door.frame(door_random);
        self.process_devices(DT);
        self.capture_order();
        self.capture_actors();
        if self.hook_time >= 0.0 {
            let previous = self.hook_time;
            self.hook_time += DT;
            let dragon_call = 1.0 + (360.0 - 235.0) / 180.0;
            if previous <= dragon_call && self.hook_time > dragon_call {
                self.events |= 256;
                self.audio.emit(10, 0);
            }
            if self.hook_time > 1.0 + 290.0 / 180.0 && self.hook_unit >= 0 {
                self.units[self.hook_unit as usize].state = 0;
                self.hook_unit = -1;
                self.sacrifices += 1;
            }
            if self.hook_time > 4.4 {
                self.hook_time = -1.0;
            }
        }
        for _ in 0..3 {
            self.process_missiles(DT / 3.);
        }
        for i in 0..CAPACITY {
            let u = &mut self.units[i];
            if u.state == 0 {
                continue;
            }
            if u.state == EJECTED && u.y >= u.ground && u.vy > 0. {
                u.alpha = (u.alpha - 450. * DT / 255.).max(0.);
                if u.alpha == 0. {
                    u.state = 0;
                }
                continue;
            }
            if u.state == DEAD
                && !u.corpse_flying
                && u.animation >= data::ANIMATION_LIMITS[u.kind as usize][6].trunc()
            {
                u.alpha = (u.alpha * 255. - DT * 450.) / 255.;
                if u.alpha < 0. {
                    u.alpha = 0.;
                    u.state = 0;
                }
                continue;
            }
            u.min_y = u.min_y.min(u.y.trunc());
            u.update_ability(|| next_random(&mut self.rng));
            if u.freeze_time > 0.0
                && !matches!(u.state, HELD | FLY | DEAD | EJECTED | HOOKED | SACRIFICE)
            {
                u.freeze_time -= DT;
                if u.freeze_time > 0.0 {
                    u.speed = 0.0;
                } else {
                    u.freeze_time = 0.0;
                    u.state = WALK;
                    u.speed = if u.disarmed {
                        -u.saved_speed
                    } else {
                        u.saved_speed
                    };
                    u.animation = 0.0;
                }
            }
            if u.state == DEAD && u.corpse_flying && u.clock == 0. {
                u.animation = 0.;
            }
            if u.state == FLY && u.freeze_time <= 0. {
                if u.held_pose.is_some_and(|pose| pose != 3) {
                    u.animation = 0.;
                }
                u.held_pose = None;
            }
            if u.state != SACRIFICE {
                u.animation += DT * STATS[u.kind as usize][5];
            }
            u.cooldown -= DT;
            let flying = u.state == FLY || (u.state == DEAD && u.corpse_flying);
            let mut attacked = false;
            match u.state {
                DEAD => {
                    u.clock += DT;
                    if !flying {
                        u.x += u.speed * DT;
                    }
                }
                SACRIFICE => {
                    if u.captive_step() {
                        self.sound_masks[0] |= 1 << u.kind;
                        self.audio.emit(0, u.kind);
                    }
                }
                EJECTED => {
                    u.vy += 1000.0 * DT;
                    u.x += u.vx * DT;
                    u.y += u.vy * DT;
                    u.angle += DT * 3.;
                    if u.y > u.ground && u.vy > 0.0 {
                        u.y = u.ground;
                        u.angle = -std::f32::consts::FRAC_PI_2;
                    }
                }
                HELD | HOOKED => {
                    u.x += (u.target_x - u.x) * 20.0 * DT;
                    u.y += (u.target_y + 30.0 - u.y) * 20.0 * DT;
                    u.clock += DT;
                    u.speed = 0.0;
                    u.vx *= 0.9;
                    u.vy *= 0.9;
                    if u.kind == 3 && u.clock > 0.6 && u.freeze_time <= 0.0 {
                        u.state = ESCAPE;
                        u.animation = DT * STATS[u.kind as usize][5];
                        u.shield = false;
                        if self.held == i as i32 {
                            self.held = -1;
                        }
                        if self.hook_unit == i as i32 {
                            self.hook_unit = -1;
                        }
                    } else if u.clock as f64 > 0.1 && u.freeze_time <= 0. && u.pose() != 2 {
                        u.held_pose = Some(2);
                        u.animation = DT * STATS[u.kind as usize][5];
                    }
                    // Native recovery and held duration use separate timers.
                    if u.pose() == 4 {
                        u.held_recovery -= DT;
                        if u.held_recovery < 0. {
                            u.held_pose = Some(0);
                            u.animation = DT * STATS[u.kind as usize][5];
                            u.speed = u.saved_speed;
                        }
                    }
                    if u.disarmed && u.pose() <= 1 {
                        u.held_pose = Some(8);
                        u.animation = DT * STATS[u.kind as usize][5];
                        u.speed = -u.saved_speed;
                    }
                    if u.pose() <= 1 && (u.x - (u.y - 200.) + u.range).trunc() > 290. {
                        u.x -= 50. * DT;
                        u.speed = 0.;
                    }
                    u.x += u.speed * DT;
                }
                ESCAPE => {
                    if u.animation > data::ANIMATION_LIMITS[u.kind as usize][9] {
                        u.state = HELD;
                        u.held_pose = Some(9);
                        u.animation = 0.;
                        u.vx = 0.0;
                        u.vy = -450.0;
                        u.release();
                        self.sound_masks[2] |= 1 << u.kind;
                        self.audio.emit(2, u.kind);
                    }
                }
                STUN => {
                    u.stun_step(DT);
                }
                CAST => {
                    u.x += u.speed * DT;
                }
                WALK | ATTACK => {
                    u.walk_step(DT);
                }
                _ => {}
            }
            if flying {
                self.fly(i, DT);
            }
            let u = &mut self.units[i];
            let limit = data::ANIMATION_LIMITS[u.kind as usize][u.pose()];
            if u.animation > limit {
                let held = matches!(u.state, HELD | HOOKED);
                u.animation = if u.state == DEAD && !u.corpse_flying {
                    limit
                } else {
                    0.
                };
                if u.pose() == 1 {
                    attacked = true;
                    u.cooldown = STATS[u.kind as usize][7];
                    if !held {
                        u.state = WALK;
                    }
                    u.speed = 0.;
                    u.held_pose = (held || u.kind == 2).then_some(0);
                }
                if u.pose() == 10 {
                    u.shield = true;
                    if held {
                        u.held_pose = Some(0);
                    } else {
                        u.state = WALK;
                    }
                }
                if u.pose() == 0 && (u.x - (u.y - 200.) + u.range).trunc() > 284. && u.cooldown < 0.
                {
                    if held {
                        u.held_pose = Some(1);
                    } else {
                        u.state = ATTACK;
                        u.held_pose = None;
                    }
                    u.speed = 0.;
                }
            }
            if attacked {
                self.attack(i);
                self.units[i].speed = 0.;
            }
        }
        self.process_projectiles(DT);
        if self.door.broken {
            // Original DrawAfter sets speed on every slot, including dying actors.
            for u in &mut self.units {
                u.speed = 100.;
                u.range = -1000.;
            }
        }
        self.door.step();
        for s in &mut self.smokes {
            s.step();
        }
        for s in &mut self.fragments {
            s.step();
        }
        if let Some(hp) = protected_hp {
            self.hp = hp;
        }
        if self.ending == 0 && self.hp < 0.0 {
            self.ending = 2;
        } else if self.ending == 0 && self.time > self.config[0] {
            self.ending = 1;
        }
        self.end_fade = (self.end_fade - 170. * DT).max(-400.);
        if self.ending != 0 {
            self.end_time += DT;
            self.end_fade += 250. * DT;
        }
        if self.end_fade > 255. {
            self.end_fade = 255.;
            self.status = self.ending;
        }
        let events = self.events;
        self.events = 0;
        self.audio.finish_frame();
        events
    }
    fn process_gate(&mut self) {
        if !self.devices.iter().any(|d| d.active && d.kind == 3) {
            return;
        }
        if self.gate_unit >= 0 {
            let u = &self.units[self.gate_unit as usize];
            if u.state == EJECTED && u.y < 180. {
                self.gate_unit = -1;
            }
        }
        // Hover is latched by StylusMove, before the draw can free an ejected captive.
        let slot = self
            .devices
            .iter()
            .position(|d| d.active && d.kind == 3)
            .unwrap();
        let mut hover = self.devices[slot].pressed;
        let captive = self.gate_unit >= 0 && self.units[self.gate_unit as usize].state == SACRIFICE;
        if captive {
            self.units[self.gate_unit as usize].speed = 0.;
        }
        if captive && self.gate_time < 0. {
            if self.units[self.gate_unit as usize].y > 290. {
                self.gate_time = 5.;
                self.gate_amplitude = 0.;
                self.gate_burst_y = 0.;
                self.gate_burst = false;
                hover = false;
            } else {
                hover = true;
            }
        }
        let digesting = captive && self.gate_time >= 0.;
        let mut jitter_y = 0.;
        self.gate_lid_angle = 0.;
        if digesting {
            self.gate_time -= DT;
            if self.gate_open <= 1. {
                self.gate_amplitude = (self.gate_amplitude + 0.1 * DT).min(1.);
                jitter_y = (self.random() % 1000) as f32 / 400. * self.gate_amplitude;
                let angle = (self.random() % 1000) as f32 / 1000. - 0.5;
                self.gate_lid_angle =
                    ((angle as f64 * 0.08 * self.gate_amplitude as f64) as f32) * 1.25;
                if self.gate_time < 0. {
                    self.tremble.strength = 6.;
                    let vy = (self.random() % 100) as f32 - 850.;
                    let vx = -40. - (self.random() % 40) as f32;
                    let u = &mut self.units[self.gate_unit as usize];
                    if self.fix_ballista_gate && u.kind == 5 {
                        u.x = self.devices[slot].x + 60.;
                    }
                    u.state = EJECTED;
                    u.held_pose = None;
                    u.vx = vx;
                    u.vy = vy;
                    u.ground = 265.;
                    u.clock = 0.;
                    u.animation = 0.;
                    u.alpha = 655. / 255.;
                    self.sacrifices += 1;
                    self.events |= 64;
                    self.audio.emit(11, 2);
                    self.gate_burst = true;
                }
            }
        }
        if self.gate_burst {
            self.gate_burst_y -= 800. * DT;
            if self.gate_burst_y < -1200. {
                self.gate_burst_y = 0.;
                self.gate_burst = false;
                self.gate_open = 22.;
            }
        }
        self.gate_lid_y = 227. + self.gate_open + 2. * jitter_y + self.gate_burst_y;
        self.gate_open += if hover { 50. * DT } else { -50. * DT };
        self.gate_ready = self.gate_open > 22.;
        self.gate_open = self.gate_open.clamp(0., 22.);
        self.devices[slot].pressed = hover;
    }
    fn draw_ptr(&mut self) -> *const f32 {
        let active = self.active() as f32;
        self.draw[..HEADER].copy_from_slice(&[
            self.time,
            self.config[0],
            self.hp,
            self.max_hp,
            self.gold as f32,
            self.score as f32,
            self.sacrifices as f32,
            self.kills as f32,
            active,
            self.status as f32,
            self.held as f32,
            self.tick as f32,
            self.hook_time,
            self.gate_open,
            self.gate_time,
            self.gate_unit as f32,
            self.hook_unit as f32,
            PROJECTILES as f32,
            DEVICES as f32,
            MISSILES as f32,
        ]);
        write_actors(
            &self.units,
            &self.projectiles,
            &mut self.draw[HEADER..HEADER + ACTOR_FLOATS],
        );
        let device_start = HEADER + CAPACITY * STRIDE + PROJECTILES * PROJECTILE_STRIDE;
        for (i, d) in self.devices.iter().enumerate() {
            let p = device_start + i * DEVICE_STRIDE;
            self.draw[p..p + DEVICE_STRIDE].copy_from_slice(&[
                if d.active { d.kind as f32 + 1. } else { 0. },
                d.x,
                d.y,
                d.tier as f32,
                d.elapsed,
                d.cooldown(),
                d.angle,
                d.pressed as u32 as f32,
                d.recoil as f32,
                d.animation,
                d.animating as u32 as f32,
            ]);
        }
        let missile_start = device_start + DEVICES * DEVICE_STRIDE;
        for (i, m) in self.missiles.iter().enumerate() {
            let p = missile_start + i * MISSILE_STRIDE;
            self.draw[p..p + MISSILE_STRIDE].copy_from_slice(&[
                if m.active { m.kind as f32 + 1. } else { 0. },
                m.x,
                m.y,
                (m.vy as f64).atan2(m.vx as f64) as f32,
                m.tier as f32,
                m.age,
                0.,
            ]);
        }
        self.draw[EFFECTS_START..SMOKE_START].copy_from_slice(&[
            self.hook_alpha / 255.,
            self.gate_lid_y,
            self.gate_lid_angle,
            self.end_time,
            self.ending as f32,
            self.end_fade,
        ]);
        for (i, s) in self.smokes.iter().enumerate() {
            let start = SMOKE_START + i * SMOKE_STRIDE;
            self.draw[start..start + SMOKE_STRIDE].copy_from_slice(&[
                if s.active { s.kind as f32 + 1. } else { 0. },
                s.x,
                s.y,
                s.size,
                s.alpha.trunc().clamp(0., 255.) / 255.,
                s.additive as u32 as f32,
            ]);
        }
        for (i, s) in self.fragments.iter().enumerate() {
            let start = FRAGMENT_START + i * FRAGMENT_STRIDE;
            self.draw[start..start + FRAGMENT_STRIDE].copy_from_slice(&[
                if s.active { s.kind as f32 + 1. } else { 0. },
                s.x as f32,
                s.y as f32,
                s.size,
            ]);
        }
        self.draw[DOOR_STATE..DOOR_STATE + 4].copy_from_slice(&[
            self.door.broken as u32 as f32,
            self.door.frame_flags as f32,
            self.door.x,
            self.door.y,
        ]);
        self.draw[DOOR_STATE + 4..ORDER_START].copy_from_slice(&[
            if self.tremble.active {
                self.tremble.x
            } else {
                0.
            },
            if self.tremble.active {
                self.tremble.y
            } else {
                0.
            },
            self.tremble.x,
            self.tremble.y,
        ]);
        for (out, &id) in self.draw[ORDER_START..GATE_FRAME_START]
            .iter_mut()
            .zip(&self.order.frame)
        {
            *out = id as f32;
        }
        self.draw[GATE_FRAME_START..].fill(0.);
        if self.gate_unit >= 0 {
            write_unit(
                &self.units[self.gate_unit as usize],
                &mut self.draw[GATE_FRAME_START..],
            );
        }
        self.draw.as_ptr()
    }
}

thread_local! { static GAME: RefCell<Game> = RefCell::new(Game::default()); }
#[no_mangle]
pub extern "C" fn fix_ballista_gate(enabled: u32) -> u32 {
    if enabled > 1 {
        return 0;
    }
    GAME.with(|g| g.borrow_mut().fix_ballista_gate = enabled == 1);
    1
}
#[no_mangle]
pub extern "C" fn random_state() -> u32 {
    GAME.with(|g| g.borrow().rng)
}
#[no_mangle]
pub extern "C" fn equip(slot: u32, kind: u32, tier: u32, x: f32, y: f32) -> u32 {
    GAME.with(|g| g.borrow_mut().equip(slot as usize, kind, tier, x, y) as u32)
}
#[no_mangle]
pub extern "C" fn clear_equipment() {
    GAME.with(|g| {
        for d in &mut g.borrow_mut().devices {
            d.active = false;
        }
    });
}
#[no_mangle]
pub extern "C" fn weapon_sounds() -> u32 {
    GAME.with(|g| std::mem::take(&mut g.borrow_mut().weapon_sounds))
}
#[no_mangle]
pub extern "C" fn configure(index: u32, value: f32) -> u32 {
    if index >= 13 || !value.is_finite() || (index == 12 && value.abs() > 1000.) {
        return 0;
    }
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        if index == 12 {
            g.attack_range_offset = value;
        } else {
            g.config[index as usize] = value;
        }
    });
    1
}
#[no_mangle]
pub extern "C" fn enemy_type(index: u32, kind: u32) -> u32 {
    if index >= CAPACITY as u32 || kind > 10 {
        return 0;
    }
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        if index == 0 {
            g.table_len = 1;
        }
        g.table[index as usize] = kind;
        g.table_len = g.table_len.max(index as usize + 1);
    });
    1
}
#[no_mangle]
pub extern "C" fn start(
    seed: u32,
    health: f32,
    gold: u32,
    sacrifices: u32,
    score: u32,
    next_day: u32,
) -> u32 {
    if !health.is_finite() || health <= 0.0 || health > 1e6 || next_day > 1 {
        return 0;
    }
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        let devices = g.devices;
        let gate_open = g.gate_open;
        g.start(seed, health, gold, sacrifices, score);
        if next_day != 0 {
            g.devices = devices;
            g.gate_open = gate_open;
        }
        g.valid() as u32
    })
}
#[no_mangle]
pub extern "C" fn step() -> u32 {
    GAME.with(|g| g.borrow_mut().step())
}
#[no_mangle]
pub extern "C" fn pickup(x: f32, y: f32) -> u32 {
    GAME.with(|g| g.borrow_mut().pickup(x, y) as u32)
}
#[no_mangle]
pub extern "C" fn drag(x: f32, y: f32) {
    GAME.with(|g| g.borrow_mut().drag(x, y));
}
#[no_mangle]
pub extern "C" fn release() {
    GAME.with(|g| g.borrow_mut().release());
}
#[no_mangle]
pub extern "C" fn release_at(x: f32, y: f32) {
    GAME.with(|g| g.borrow_mut().release_at(x, y));
}
#[no_mangle]
pub extern "C" fn draw_ptr() -> *const f32 {
    GAME.with(|g| g.borrow_mut().draw_ptr())
}
#[no_mangle]
pub extern "C" fn frame_ptr() -> *const f32 {
    GAME.with(|g| g.borrow_mut().frame_ptr())
}
#[no_mangle]
pub extern "C" fn draw_len() -> usize {
    DRAW_LEN
}
#[no_mangle]
pub extern "C" fn sound_events_ptr() -> *const u32 {
    GAME.with(|g| g.borrow().sound_masks.as_ptr())
}
#[no_mangle]
pub extern "C" fn clear_sound_events() {
    GAME.with(|g| g.borrow_mut().sound_masks.fill(0));
}
#[no_mangle]
pub extern "C" fn audio_events_ptr() -> *const u32 {
    GAME.with(|g| g.borrow().audio.events.as_ptr())
}
#[no_mangle]
pub extern "C" fn audio_events_len() -> usize {
    GAME.with(|g| g.borrow().audio.events.len())
}
#[no_mangle]
pub extern "C" fn clear_audio_events() {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.audio.clear();
        g.sound_masks.fill(0);
        g.weapon_sounds = 0;
    });
}
#[no_mangle]
pub extern "C" fn save_ptr() -> *const u8 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.save();
        g.snapshot.as_ptr()
    })
}
#[no_mangle]
pub extern "C" fn save_len() -> usize {
    GAME.with(|g| g.borrow().snapshot.len())
}
#[no_mangle]
pub extern "C" fn load_buffer(len: usize) -> *mut u8 {
    if len > 65536 {
        return std::ptr::null_mut();
    }
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.snapshot.resize(len, 0);
        g.snapshot.as_mut_ptr()
    })
}
#[no_mangle]
pub extern "C" fn restore() -> u32 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        let bytes = std::mem::take(&mut g.snapshot);
        g.load(&bytes) as u32
    })
}

#[cfg(test)]
mod tests;
