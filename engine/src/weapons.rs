//! Purchased guns, ballistas and scripted jump platforms; see research/weapon-rules.md.
use super::*;

pub(super) const DEVICES: usize = 25;
pub(super) const DEVICE_STRIDE: usize = 11;
pub(super) const DEVICE_WORDS: usize = 13;
pub(super) const MISSILES: usize = 100;
pub(super) const MISSILE_STRIDE: usize = 7;
pub(super) const MISSILE_WORDS: usize = 10;

#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub(super) struct Device {
    pub active: bool,
    pub kind: u32,
    pub tier: u32,
    pub x: f32,
    pub y: f32,
    pub elapsed: f32,
    pub angle: f32,
    pub pressed: bool,
    pub pointer_x: f32,
    pub pointer_y: f32,
    pub recoil: i32,
    pub animation: f32,
    pub animating: bool,
    pub draw_animation: f32,
    pub timer_pending: bool,
    pub draw_timer: bool,
    pub drag_slot: i32,
}
impl Device {
    pub fn cooldown(&self) -> f32 {
        match self.kind {
            2 => 25.,
            4 => 30.,
            5 => 12.,
            6 => 15.0,
            7 => 0.4,
            8 => 10.0 - 2.0 * self.tier as f32,
            _ => 0.0,
        }
    }
    fn anchor(&self) -> (f32, f32) {
        let (dx, dy) = match self.kind {
            0 => (85., 60.),
            3 => (59., 17.),
            2 => (29., 13.),
            4 => (33., 13.),
            5 => (39., 13.),
            6 => (35., 17.),
            7 => (55., 17.),
            _ => (0., 0.),
        };
        (self.x + dx, self.y + dy)
    }
    pub fn valid(&self) -> bool {
        (!self.active
            || match self.kind {
                0 | 3 => self.tier == 0,
                2 | 4 => self.tier <= 2,
                5 => self.tier <= 3,
                6 => matches!(self.tier, 0 | 3 | 6),
                7 => self.tier <= 1,
                8 => self.tier <= 2,
                _ => false,
            })
            && [
                self.x,
                self.y,
                self.elapsed,
                self.angle,
                self.pointer_x,
                self.pointer_y,
                self.animation,
            ]
            .iter()
            .all(|v| v.is_finite() && v.abs() < 1e7)
            && self.elapsed >= 0.0
            && if self.kind == 4 {
                (-20..=20).contains(&self.recoil)
            } else {
                (0..=40).contains(&self.recoil)
            }
            && (0.0..=8.8).contains(&self.animation)
            && (0.0..=8.8).contains(&self.draw_animation)
            && (-1..PROJECTILES as i32).contains(&self.drag_slot)
    }
    pub fn words(self) -> [u32; DEVICE_WORDS] {
        [
            self.active as u32,
            self.kind,
            self.tier,
            self.x.to_bits(),
            self.y.to_bits(),
            self.elapsed.to_bits(),
            self.angle.to_bits(),
            self.pressed as u32,
            self.pointer_x.to_bits(),
            self.pointer_y.to_bits(),
            self.recoil as u32,
            self.animation.to_bits(),
            self.animating as u32,
        ]
    }
    pub fn from_words(w: [u32; DEVICE_WORDS]) -> Option<Self> {
        if w[0] > 1 || w[7] > 1 || w[12] > 1 {
            return None;
        }
        let mut d = Self {
            active: w[0] != 0,
            kind: w[1],
            tier: w[2],
            x: f32::from_bits(w[3]),
            y: f32::from_bits(w[4]),
            elapsed: f32::from_bits(w[5]),
            angle: f32::from_bits(w[6]),
            pressed: w[7] != 0,
            pointer_x: f32::from_bits(w[8]),
            pointer_y: f32::from_bits(w[9]),
            recoil: w[10] as i32,
            animation: f32::from_bits(w[11]),
            animating: w[12] != 0,
            draw_animation: f32::from_bits(w[11]),
            timer_pending: false,
            draw_timer: false,
            drag_slot: -1,
        };
        d.timer_pending = matches!(d.kind, 2 | 4 | 5 | 6 | 8) && d.elapsed < d.cooldown();
        d.draw_timer = d.timer_pending;
        d.valid().then_some(d)
    }
}

#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub(super) struct Missile {
    pub active: bool,
    pub kind: u32,
    pub tier: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub age: f32,
    pub gravity: f32,
    pub lifetime: f32,
    pub smoke_timer: f32,
}
impl Missile {
    fn new(kind: u32, tier: u32, x: f32, y: f32, vx: f32, vy: f32) -> Self {
        Self {
            active: true,
            kind,
            tier,
            x: x.trunc(),
            y: y.trunc(),
            vx: vx.trunc(),
            vy: vy.trunc(),
            age: 0.,
            gravity: match kind {
                0 => 1200.,
                3 => 600.,
                _ => 0.,
            },
            lifetime: match kind {
                0 => 0.6,
                3 => 10.,
                _ => 1.4,
            },
            smoke_timer: 0.,
        }
    }
    pub fn valid(&self) -> bool {
        (!self.active
            || (self.kind <= 3 && self.tier <= 2 && self.lifetime > 0. && self.lifetime <= 10.))
            && [
                self.x,
                self.y,
                self.vx,
                self.vy,
                self.age,
                self.gravity,
                self.lifetime,
            ]
            .iter()
            .all(|v| v.is_finite() && v.abs() < 1e7)
            && self.age >= 0.
    }
    pub fn words(self) -> [u32; MISSILE_WORDS] {
        [
            self.active as u32,
            self.kind,
            self.tier,
            self.x.to_bits(),
            self.y.to_bits(),
            self.vx.to_bits(),
            self.vy.to_bits(),
            self.age.to_bits(),
            self.gravity.to_bits(),
            self.lifetime.to_bits(),
        ]
    }
    pub fn from_words(w: [u32; MISSILE_WORDS]) -> Option<Self> {
        if w[0] > 1 {
            return None;
        }
        let m = Self {
            active: w[0] != 0,
            kind: w[1],
            tier: w[2],
            x: f32::from_bits(w[3]),
            y: f32::from_bits(w[4]),
            vx: f32::from_bits(w[5]),
            vy: f32::from_bits(w[6]),
            age: f32::from_bits(w[7]),
            gravity: f32::from_bits(w[8]),
            lifetime: f32::from_bits(w[9]),
            smoke_timer: 0.,
        };
        m.valid().then_some(m)
    }
}

impl Game {
    pub(super) fn equip(&mut self, slot: usize, kind: u32, tier: u32, x: f32, y: f32) -> bool {
        let Some(previous) = self.devices.get(slot).copied() else {
            return false;
        };
        let mut d = Device {
            active: true,
            kind,
            tier,
            x,
            y,
            // Native artefact::Init leaves aiming, pressed/recoil and drag linkage intact.
            pointer_x: previous.pointer_x,
            pointer_y: previous.pointer_y,
            angle: previous.angle,
            pressed: kind != 3 && previous.pressed,
            recoil: previous.recoil,
            animating: previous.animating,
            drag_slot: previous.drag_slot,
            elapsed: if kind == 3 { previous.elapsed } else { 0. },
            animation: if kind == 7 {
                1.
            } else if kind == 8 {
                3.
            } else {
                0.
            },
            ..Device::default()
        };
        d.draw_animation = d.animation;
        d.draw_timer = matches!(kind, 2 | 4 | 5 | 6 | 8) && d.elapsed < d.cooldown();
        if slot >= DEVICES || !d.valid() {
            return false;
        }
        self.devices[slot] = d;
        true
    }
    pub(super) fn pickup_device(&mut self, x: f32, y: f32) -> bool {
        // Selection precedes readiness/radius checks, including cooling and noninteractive devices.
        let mut nearest = None;
        let mut best = f32::INFINITY;
        for (i, d) in self.devices.iter().enumerate().filter(|(_, d)| d.active) {
            let (cx, cy) = d.anchor();
            let distance = (x - cx).powi(2) + (y - cy).powi(2);
            if distance < best {
                best = distance;
                nearest = Some(i);
            }
        }
        let Some(i) = nearest else {
            return false;
        };
        let d = &mut self.devices[i];
        if !matches!(d.kind, 2 | 4 | 5 | 6 | 8) || d.elapsed < d.cooldown() {
            return false;
        }
        let (cx, mut cy) = d.anchor();
        if d.kind == 8 {
            cy -= 36.;
        }
        let radius = match d.kind {
            2 => 40.,
            4 | 6 => 50.,
            _ => 42.,
        };
        let distance = (x - cx).powi(2) + (y - cy).powi(2);
        if distance > radius * radius
            || (distance == radius * radius && matches!(d.kind, 4 | 6 | 8))
        {
            return false;
        }
        d.pressed = true;
        d.pointer_x = x;
        d.pointer_y = y;
        if matches!(d.kind, 2 | 5) {
            let (kind, tier) = (if d.kind == 2 { 0 } else { 2 }, d.tier);
            d.elapsed = 0.;
            d.pointer_x = d.x;
            d.pointer_y = d.y;
            let slot = self.add_purchased_object(kind, tier, x, y);
            self.devices[i].drag_slot = slot;
            if slot < 0 {
                self.devices[i].pressed = false;
                return false;
            }
        }
        true
    }
    pub(super) fn drag_devices(&mut self, x: f32, y: f32) {
        for d in self.devices.iter_mut().filter(|d| d.active && d.pressed) {
            if matches!(d.kind, 2 | 5) && d.drag_slot >= 0 {
                let p = &mut self.projectiles[d.drag_slot as usize];
                if p.active && p.held {
                    p.target_x = x;
                    p.target_y = y;
                    p.travel_charge +=
                        (x - d.pointer_x).trunc().abs() + (y - d.pointer_y).trunc().abs();
                }
            }
            d.pointer_x = x;
            d.pointer_y = y;
            if !matches!(d.kind, 6 | 8) {
                continue;
            }
            let angle = ((d.y - y) as f64).atan2((d.x - x) as f64) as f32;
            d.angle = if d.kind == 6 {
                angle.clamp(-0.4, 0.45)
            } else {
                angle.clamp(-0.8, 0.85)
            };
        }
    }
    pub(super) fn release_devices(&mut self, x: f32, y: f32) {
        for i in 0..DEVICES {
            let d = self.devices[i];
            if !d.active || !d.pressed {
                continue;
            }
            if d.kind != 4 {
                self.devices[i].pressed = false;
            }
            if matches!(d.kind, 2 | 5) && d.drag_slot >= 0 {
                let p = &mut self.projectiles[d.drag_slot as usize];
                if p.active && p.held {
                    if p.kind == 2 {
                        p.release_fireball();
                        self.weapon_sounds |= 1 << 6;
                        self.audio.weapon(6);
                    } else {
                        p.held = false;
                    }
                }
            }
            if self.status == 0 && d.kind == 4 && d.elapsed > d.cooldown() {
                let (cx, cy) = d.anchor();
                if (cx - x).powi(2) + (cy - y).powi(2) <= 2500. {
                    let slot = self.add_purchased_object(1, d.tier, 200., -70.);
                    self.devices[i].drag_slot = slot;
                    self.devices[i].elapsed = 0.;
                }
            }
            if self.status != 0 || !matches!(d.kind, 6 | 8) {
                continue;
            }
            self.devices[i].elapsed = 0.;
            let (kind, tier, x, y) = if d.kind == 8 {
                (3, d.tier, d.x + 14., d.y - 50.)
            } else {
                ([0, 2, 1][d.tier as usize / 3], 0, d.x + 18., d.y + 20.)
            };
            if let Some(slot) = self.missiles.iter().position(|m| !m.active) {
                self.missiles[slot] = Missile::new(
                    kind,
                    tier,
                    x,
                    y,
                    (-600.0 * (d.angle as f64).cos()) as f32,
                    (-600.0 * (d.angle as f64).sin()) as f32,
                );
            }
            self.weapon_sounds |= 1 << kind;
            self.audio.weapon(kind);
        }
    }
    pub(super) fn process_devices(&mut self, dt: f32) {
        self.frame.gate_actor.fill(0.);
        for slot in 0..DEVICES {
            if !self.devices[slot].active || self.devices[slot].kind == 0 {
                continue;
            }
            if self.devices[slot].kind == 3 {
                self.capture_gate();
                self.process_gate();
                if self.gate_open > 1. {
                    // Gate's unused cooldown field stores its native smoke countdown.
                    self.devices[slot].elapsed -= dt;
                    if self.devices[slot].elapsed < 0. {
                        self.devices[slot].elapsed = 0.15;
                        let d = self.devices[slot];
                        let x = d.x + 15. + (self.random() % 100) as f32;
                        self.add_smoke(Smoke {
                            x,
                            y: d.y + 20.,
                            vy: -120.,
                            size: 1.1,
                            growth: 0.4,
                            alpha: 300.,
                            fade: -800.,
                            ..Smoke::default()
                        });
                    }
                }
                continue;
            }
            self.devices[slot].elapsed += dt;
            let d = &mut self.devices[slot];
            d.draw_animation = d.animation;
            if d.kind == 4 {
                d.recoil = if d.elapsed > d.cooldown() {
                    ((d.recoil as f32 - 100. * dt) as i32).max(-20)
                } else {
                    ((d.recoil as f32 + 100. * dt) as i32).min(20)
                };
            }
            if d.kind == 6 {
                if d.elapsed > d.cooldown() {
                    d.recoil = ((d.recoil as f32 - 100. * dt) as i32).max(5);
                }
                if d.elapsed < d.cooldown() {
                    d.recoil = ((d.recoil as f32 + 100. * dt) as i32).min(40);
                }
            }
            if d.kind == 8 {
                d.animation = (d.animation
                    + if d.elapsed > d.cooldown() {
                        -11. * dt
                    } else {
                        11. * dt
                    })
                .clamp(0., 3.);
            }
            if d.animating {
                d.animation += 20. * dt;
                if d.animation > 8.8 {
                    d.animation = 1.;
                    d.animating = false;
                }
                d.draw_animation = d.animation;
            }
            if matches!(d.kind, 2 | 4 | 5 | 6 | 8) && d.elapsed < d.cooldown() {
                d.timer_pending = true;
            }
            d.draw_timer = d.timer_pending;
            let ready = d.timer_pending && d.elapsed > d.cooldown();
            if ready {
                d.timer_pending = false;
            }
            let d = self.devices[slot];
            if ready {
                let (dx, dy) = match d.kind {
                    2 => (30., 40.),
                    4 => (22., 30.),
                    5 => (25., 40.),
                    6 => (62., 10.),
                    8 => (20., -13.),
                    _ => (0., 0.),
                };
                for (growth, fade) in [(17., -1300.), (10., -1000.), (3., -800.)] {
                    self.add_smoke(Smoke {
                        kind: 0,
                        x: (d.x + dx + 14.5).trunc(),
                        y: (d.y + dy + 15.).trunc(),
                        size: 0.1,
                        growth,
                        alpha: 455.,
                        fade,
                        additive: true,
                        ..Smoke::default()
                    });
                }
            }
            if d.kind != 7 || d.elapsed <= 0.4 {
                continue;
            }
            self.devices[slot].elapsed = 0.;
            for i in 0..CAPACITY {
                let u = self.units[i];
                if !u.alive()
                    || matches!(u.state, HELD | FLY)
                    || u.kind == 2
                    || (d.x - u.x).trunc().powi(2) + (d.y - u.y).trunc().powi(2) >= 900.
                {
                    continue;
                }
                let vx = if d.tier == 0 { 200. } else { 100. } - (self.random() % 50) as f32;
                let vy = if d.tier == 0 { -370. } else { -670. } - (self.random() % 120) as f32;
                let u = &mut self.units[i];
                u.held_pose = Some(u.pose() as u32);
                u.state = FLY;
                u.vx = vx;
                u.vy = vy;
                u.immunity = true;
                self.weapon_sounds |= 1 << 4;
                self.audio.weapon(4);
                self.devices[slot].animating = true;
            }
        }
    }
    pub(super) fn freeze_unit(&mut self, i: usize, seconds: f32) {
        let u = &mut self.units[i];
        u.freeze_time = seconds;
        u.shield = false;
        u.animation = 0.;
        if !matches!(u.state, HELD | FLY) {
            u.state = WALK;
            u.speed = 0.;
        }
    }
    pub(super) fn process_missiles(&mut self, dt: f32) {
        for slot in 0..MISSILES {
            let mut m = self.missiles[slot];
            if !m.active {
                continue;
            }
            m.age += dt;
            if m.age > m.lifetime {
                self.missiles[slot] = m;
                self.missile_die(slot);
                continue;
            }
            if m.age < 0.01 {
                self.missiles[slot] = m;
                continue;
            }
            let movement = dt.min(0.03);
            m.vy += m.gravity * movement;
            m.x += m.vx * movement;
            m.y += m.vy * movement;
            self.missiles[slot] = m;
            // Cannon Die mutates enemies synchronously; later overlapping survivors can explode again.
            for i in 0..CAPACITY {
                let u = self.units[i];
                if !u.alive()
                    || (u.x - m.x).trunc().powi(2) + (u.y - m.y).trunc().powi(2)
                        >= STATS[u.kind as usize][4].powi(2) + 100.
                {
                    continue;
                }
                if m.kind == 0 {
                    self.missile_die(slot);
                    continue;
                }
                let died = self.units[i].hit(if m.kind == 2 { 0 } else { 300 });
                if died {
                    self.reward(i);
                }
                if m.kind == 2 && self.units[i].alive() {
                    self.freeze_unit(i, 3.5);
                }
                if m.kind == 1 {
                    self.units[i].burning = true;
                }
            }
            self.missiles[slot].smoke_timer -= movement;
            self.missile_trail(slot);
            if m.kind == 0 && m.y > 285. {
                self.missile_die(slot);
            }
            if m.kind == 3 && m.tier == 2 && m.y > 270. {
                self.tremble.strength = 5.;
                self.explode(m.x, m.y, 0.8, 180, 0.5, 1.);
                self.hit_splash(m.x, m.y, 1000, 80, true);
                for (kind, size, growth, alpha, fade, additive) in [
                    (5, 0.2, 17., 255., -1200., false),
                    (1, 0.2, 17., 255., -1200., false),
                    (0, 0.1, 17., 455., -1300., true),
                    (3, 2.1, 8., 355., -1250., true),
                ] {
                    self.add_smoke(Smoke {
                        kind,
                        x: m.x,
                        y: m.y,
                        size,
                        growth,
                        alpha,
                        fade,
                        additive,
                        ..Smoke::default()
                    });
                }
                self.weapon_sounds |= 1 << 5;
                self.audio.weapon(5);
                self.missile_die(slot);
            }
        }
    }
    fn missile_die(&mut self, slot: usize) {
        let m = self.missiles[slot];
        self.missiles[slot].active = false;
        self.explode(m.x, m.y + 16., 1.7, 220, 0., 5.);
        self.hit_splash(m.x, m.y + 16., 800, 130, false);
        if m.kind == 0 {
            self.weapon_sounds |= 1 << 5;
            self.audio.weapon(5);
            for (dx, dy, vx, vy, size, growth, fade) in [
                (0., 0., 0., -50., 1.5, 15., -800.),
                (10., -15., -30., -17., 0.8, 10., -750.),
                (-10., 25., 0., -14., 0.6, 7., -850.),
            ] {
                self.add_smoke(Smoke {
                    kind: 4,
                    x: m.x + dx,
                    y: m.y + dy,
                    vx,
                    vy,
                    size,
                    growth,
                    alpha: 255.,
                    fade,
                    ..Smoke::default()
                });
            }
        }
    }
    fn missile_trail(&mut self, slot: usize) {
        let m = self.missiles[slot];
        match m.kind {
            0 | 1 if m.smoke_timer < 0. => {
                self.missiles[slot].smoke_timer = if m.kind == 0 { 0.045 } else { 0.015 };
                let (x, y) = if m.kind == 1 {
                    (
                        m.x - 15. + ((self.random() & 0x7fffffff) % 30) as f32,
                        m.y - 15. + ((self.random() & 0x7fffffff) % 30) as f32,
                    )
                } else {
                    (m.x, m.y)
                };
                self.add_smoke(Smoke {
                    kind: 6,
                    x,
                    y,
                    vy: -10.,
                    size: 1.,
                    growth: 2.5,
                    alpha: 555.,
                    fade: -1300.,
                    ..Smoke::default()
                });
                if m.kind == 1 {
                    self.add_smoke(Smoke {
                        kind: 3,
                        x: m.x,
                        y: m.y,
                        size: 0.8,
                        alpha: 255.,
                        fade: -820.,
                        additive: true,
                        ..Smoke::default()
                    });
                }
            }
            2 => {
                let x = m.x + 15. + ((self.random() & 0x7fffffff) % 20) as f32;
                let y = m.y - 10. + ((self.random() & 0x7fffffff) % 20) as f32;
                let vy = ((self.random() & 0x7fffffff) % 60) as f32 - 30.;
                self.add_smoke(Smoke {
                    kind: 8,
                    x,
                    y,
                    vy,
                    size: 1.,
                    alpha: 355.,
                    fade: -1600.,
                    ..Smoke::default()
                });
                let y = m.y - 10. + ((self.random() & 0x7fffffff) % 20) as f32;
                let vx = -70. - ((self.random() & 0x7fffffff) % 100) as f32;
                let fade = -500. - ((self.random() & 0x7fffffff) % 500) as f32;
                self.add_smoke(Smoke {
                    kind: 7,
                    x: m.x + 20.,
                    y,
                    vx,
                    size: 1.,
                    alpha: 222.,
                    fade,
                    ..Smoke::default()
                });
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests;
