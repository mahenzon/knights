//! Shared purchased/enemy dragobject pool; see research/weapon-rules.md.
use super::*;

pub(super) const PROJECTILES: usize = 30;
pub(super) const PROJECTILE_STRIDE: usize = 10;
pub(super) const PROJECTILE_WORDS: usize = 17;
pub(super) const DRAG_WORDS: usize = 6;

#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub(super) struct Projectile {
    pub active: bool,
    pub kind: u32,
    pub held: bool,
    pub age: f32,
    pub lifetime: f32,
    pub gravity: f32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub target_x: f32,
    pub target_y: f32,
    pub previous_x: f32,
    pub previous_y: f32,
    pub size: f32,
    pub angle: f32,
    pub landed: bool,
    pub tier: u32,
    pub charge: f32,
    pub travel_charge: f32,
    pub counter: i32,
    pub pressed: bool,
    pub finished: bool,
}

impl Projectile {
    fn new(kind: u32, x: f32, y: f32, size: f32, random: u32) -> Self {
        Self {
            active: true,
            kind,
            x: x.trunc(),
            y: y.trunc(),
            size,
            lifetime: if kind == 4 { 30.0 } else { 3.0 },
            gravity: match kind {
                4 => 400.0,
                5 => 1050.0,
                7 => 500.0,
                _ => 0.0,
            },
            target_x: if kind == 7 {
                (320 + random % 28) as f32
            } else {
                x.trunc()
            },
            target_y: y.trunc(),
            ..Self::default()
        }
    }
    pub fn purchased(kind: u32, tier: u32, x: f32, y: f32) -> Self {
        let mut p = Self::new(kind, x, y, if kind == 0 { 0.7 } else { 1. }, 0);
        p.tier = tier;
        p.held = true;
        p.gravity = match kind {
            0 => 600.,
            1 => -3000.,
            _ => 0.,
        };
        if kind == 1 {
            p.lifetime = 10.;
        }
        if kind == 2 {
            p.charge = 0.5;
            p.counter = 3;
        }
        p
    }
    pub fn release_fireball(&mut self) {
        let (mut dx, mut dy) = (self.x - self.target_x, self.y - self.target_y);
        let mut length = (dx * dx + dy * dy).sqrt();
        if length <= 1. {
            dx = 0.;
            dy = -1.;
            length = 1.;
        }
        self.vx = (-dx / length) * 420.;
        self.vy = (-dy / length) * 420.;
        self.angle = ((dy as f64).atan2(dx as f64) + std::f64::consts::FRAC_PI_2) as f32;
        self.age = 0.;
        self.held = false;
    }
    pub fn drag_words(self) -> [u32; DRAG_WORDS] {
        [
            self.tier,
            self.charge.to_bits(),
            self.travel_charge.to_bits(),
            self.counter as u32,
            self.pressed as u32,
            self.finished as u32,
        ]
    }
    pub fn load_drag_words(&mut self, w: [u32; DRAG_WORDS]) -> bool {
        if w[4] > 1 || w[5] > 1 {
            return false;
        }
        self.tier = w[0];
        self.charge = f32::from_bits(w[1]);
        self.travel_charge = f32::from_bits(w[2]);
        self.counter = w[3] as i32;
        self.pressed = w[4] != 0;
        self.finished = w[5] != 0;
        self.valid()
    }
    pub fn words(self) -> [u32; PROJECTILE_WORDS] {
        [
            self.active as u32,
            self.kind,
            self.held as u32,
            self.age.to_bits(),
            self.lifetime.to_bits(),
            self.gravity.to_bits(),
            self.x.to_bits(),
            self.y.to_bits(),
            self.vx.to_bits(),
            self.vy.to_bits(),
            self.target_x.to_bits(),
            self.target_y.to_bits(),
            self.previous_x.to_bits(),
            self.previous_y.to_bits(),
            self.size.to_bits(),
            self.angle.to_bits(),
            self.landed as u32,
        ]
    }
    pub fn from_words(w: [u32; PROJECTILE_WORDS]) -> Option<Self> {
        if w[0] > 1 || w[2] > 1 || w[16] > 1 {
            return None;
        }
        let f = |i| f32::from_bits(w[i]);
        let p = Self {
            active: w[0] != 0,
            kind: w[1],
            held: w[2] != 0,
            age: f(3),
            lifetime: f(4),
            gravity: f(5),
            x: f(6),
            y: f(7),
            vx: f(8),
            vy: f(9),
            target_x: f(10),
            target_y: f(11),
            previous_x: f(12),
            previous_y: f(13),
            size: f(14),
            angle: f(15),
            landed: w[16] != 0,
            ..Self::default()
        };
        p.valid().then_some(p)
    }
    pub fn valid(&self) -> bool {
        [
            self.age,
            self.lifetime,
            self.gravity,
            self.x,
            self.y,
            self.vx,
            self.vy,
            self.target_x,
            self.target_y,
            self.previous_x,
            self.previous_y,
            self.size,
            self.angle,
            self.charge,
            self.travel_charge,
        ]
        .iter()
        .all(|v| v.is_finite() && v.abs() < 1e7)
            && (!self.active
                || (matches!(self.kind, 0..=2 | 4..=7)
                    && self.lifetime > 0.0
                    && self.lifetime <= 30.0
                    && self.age >= 0.0
                    && self.size > 0.0
                    && self.size <= 10.0
                    && self.tier <= if self.kind == 2 { 3 } else { 2 }
                    && self.charge >= 0.
                    && self.charge <= 0.8
                    && self.travel_charge >= 0.
                    && (0..=4).contains(&self.counter)
                    && (!self.held || matches!(self.kind, 0..=2 | 4))))
    }
}

impl Game {
    pub(super) fn add_purchased_object(&mut self, kind: u32, tier: u32, x: f32, y: f32) -> i32 {
        let Some(i) = self.projectiles.iter().position(|p| !p.active) else {
            return -1;
        };
        self.projectiles[i] = Projectile::purchased(kind, tier, x, y);
        self.rebuild_order();
        i as i32
    }
    fn add_projectile(
        &mut self,
        kind: u32,
        x: f32,
        y: f32,
        vx: f32,
        vy: f32,
        size: f32,
    ) -> Option<usize> {
        let slot = self.projectiles.iter().position(|p| !p.active)?;
        let random = if kind == 7 { self.random() } else { 0 };
        let mut p = Projectile::new(kind, x, y, size, random);
        p.vx = vx;
        p.vy = vy;
        self.projectiles[slot] = p;
        self.rebuild_order();
        Some(slot)
    }
    pub(super) fn drop_barrel(&mut self, i: usize) {
        let u = &mut self.units[i];
        if u.kind != 2 || u.disarmed {
            return;
        }
        u.disarmed = true;
        u.saved_speed *= 2.0;
        let (x, y, size) = (u.x + 10.0, u.y - 10.0, u.size);
        self.add_projectile(4, x, y, 0.0, 0.0, size);
    }
    pub(super) fn attack(&mut self, i: usize) {
        let u = self.units[i];
        self.sound_masks[4] |= 1 << u.kind;
        self.audio.emit(4, u.kind);
        let random = if matches!(u.kind, 2 | 4) {
            self.random()
        } else {
            0
        };
        match u.kind {
            2 => {
                if !u.disarmed {
                    self.add_projectile(
                        4,
                        u.x - 17.0,
                        u.y - 20.0,
                        350.0,
                        -200.0 - (random % 100) as f32,
                        u.size,
                    );
                    self.units[i].disarmed = true;
                    self.units[i].saved_speed *= 2.0;
                }
                self.units[i].speed = -self.units[i].saved_speed;
            }
            4 => {
                self.add_projectile(
                    5,
                    u.x - 10.0,
                    u.y - 23.0,
                    350.0,
                    -400.0 - (random % 100) as f32,
                    u.size,
                );
            }
            5 => {
                let slot = self.add_projectile(7, u.x - 5.0, u.y - 17.0, 450.0, 0., u.size);
                // Native allocation chooses the impact position before Attack chooses velocity.
                let vy = -170.0 - (self.random() % 60) as f32;
                if let Some(slot) = slot {
                    self.projectiles[slot].vy = vy;
                }
            }
            6 => {
                self.add_projectile(6, u.x, u.y - 16.0, 360.0, -30.0, u.size);
            }
            10 => {
                self.units[i].state = DEAD;
                self.units[i].clock = 0.0;
                self.units[i].animation = 0.0;
                self.reward(i);
            }
            _ => {
                self.hit_castle(u.damage as f32);
            }
        }
    }
    pub(super) fn pickup_projectile(&mut self, x: f32, y: f32) -> bool {
        let Some(i) = self.projectiles.iter().position(|p| {
            let (w, h, extra) = if p.kind == 1 {
                (47., 115., 400.)
            } else {
                (20., 20., 0.)
            };
            let short = |v: f32| v as i32 as i16 as f32;
            p.active
                && matches!(p.kind, 1 | 4)
                && x >= short(p.x - w)
                && x < short(p.x + w)
                && y >= short(p.y - h)
                && y < short(p.y + h + extra)
        }) else {
            return false;
        };
        let p = &mut self.projectiles[i];
        p.held = p.kind == 4;
        p.pressed = true;
        p.vx = 0.0;
        p.vy = 0.0;
        p.target_x = p.x;
        p.target_y = p.y;
        p.previous_x = x;
        p.previous_y = y;
        true
    }
    pub(super) fn drag_projectiles(&mut self, x: f32, y: f32) {
        for p in &mut self.projectiles {
            if p.active && p.pressed {
                p.target_x += x - p.previous_x;
                p.target_y += y - p.previous_y;
                if p.kind == 1 {
                    p.vy += 10. * (y - p.previous_y);
                }
                p.held = true;
                p.previous_x = x;
                p.previous_y = y;
            }
        }
    }
    pub(super) fn process_projectiles(&mut self, dt: f32) {
        for i in 0..PROJECTILES {
            let mut p = self.projectiles[i];
            if !p.active {
                continue;
            }
            if p.y < -140.0 {
                self.projectiles[i].active = false;
                continue;
            }
            if p.held {
                let rate = if p.kind == 2 { 8. } else { 20. };
                p.x += (p.target_x - p.x) * rate * dt;
                p.y += (p.target_y - p.y) * rate * dt;
                for _ in 0..5 {
                    if p.kind == 0 {
                        p.size = (p.size + 3. * (dt / 5.)).min(1.);
                    }
                    if p.kind == 2 {
                        p.angle = (((p.target_y - p.y) as f64).atan2((p.target_x - p.x) as f64)
                            - std::f64::consts::FRAC_PI_2) as f32;
                        p.travel_charge = (p.travel_charge - 500. * (dt / 5.)).max(0.);
                        p.charge = (p.travel_charge * 0.0015).clamp(0.4, 0.8);
                    }
                }
                self.projectiles[i] = p;
                continue;
            }
            p.age += dt;
            let mut dies = p.age > p.lifetime;
            if !dies {
                p.vy += p.gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if p.kind <= 2 {
                    match p.kind {
                        0 => {
                            p.size = (p.size + dt).min(1.);
                            let radius = 32. + 16. * p.tier as f32;
                            if p.vy > 0. && p.y > 290. - radius {
                                if !p.landed {
                                    self.tremble.strength = 4. + p.tier as f32;
                                    self.explode(
                                        p.x,
                                        p.y + radius,
                                        p.vy * (0.002 + 0.001 * p.tier as f32),
                                        260 + 35 * p.tier as i32,
                                        0.5,
                                        1.,
                                    );
                                    self.impact_dust(p);
                                    self.weapon_sounds |= 1 << 7;
                                    self.audio.weapon(7);
                                }
                                p.y = 290. - radius;
                                p.vy *= -0.4;
                                p.landed = true;
                                dies = p.vy.abs() < 10.;
                            }
                        }
                        1 => {
                            if !p.finished {
                                p.y = p.y.max(-45.);
                            }
                            p.vy = p.vy.max(-350.);
                            if p.vy > 0. && p.y > 162. {
                                p.y = 162.;
                                self.tremble.strength = (p.vy / 400.).abs();
                                self.explode(p.x, 290., 0.3, 150 + 50 * p.tier as i32, 0.5, 1.);
                                self.hit_splash(p.x, 290., 800, 70 + 30 * p.tier as i32, false);
                                self.impact_dust(p);
                                self.weapon_sounds |= 1 << 7;
                                self.audio.weapon(7);
                                p.landed = true;
                                p.counter += 1;
                                p.finished = p.counter > p.tier as i32 + 1;
                                p.vy *= -0.6;
                            }
                        }
                        2 => {
                            self.add_smoke(Smoke {
                                kind: if p.tier == 3 { 12 } else { 3 },
                                x: p.x.trunc(),
                                y: p.y.trunc(),
                                size: p.charge,
                                alpha: 255.,
                                fade: -820.,
                                additive: true,
                                ..Smoke::default()
                            });
                            p.angle = ((p.vy as f64).atan2(p.vx as f64)
                                - std::f64::consts::FRAC_PI_2)
                                as f32;
                            if p.vy > 0. && p.y > 285. {
                                p.y = 285.;
                                if !p.landed {
                                    self.tremble.strength = 5.;
                                    p.landed = true;
                                }
                                dies = true;
                            }
                        }
                        _ => unreachable!(),
                    }
                } else if matches!(p.kind, 4 | 5) {
                    let (threshold, damage) = if p.kind == 4 {
                        (390., 25.)
                    } else {
                        (373., 15.)
                    };
                    let mut ground_death = false;
                    if p.vy > 0. && p.y > 258. {
                        p.y = 258.;
                        p.vy = (-f64::from(p.vy) * 0.4) as f32;
                        p.landed = true;
                        ground_death = p.vy.abs() < 10.;
                    }
                    self.projectiles[i] = p;
                    if ground_death {
                        self.kill_projectile(i);
                    }
                    // Ground death can replace this slot before the castle test.
                    if self.projectiles[i].x > threshold {
                        self.hit_castle(damage);
                        self.kill_projectile(i);
                    }
                    continue;
                } else {
                    let (threshold, damage) = match p.kind {
                        6 => (355.0, 2.0),
                        7 => (p.target_x, 20.0),
                        _ => unreachable!(),
                    };
                    if p.x > threshold {
                        self.hit_castle(damage);
                        if p.kind == 7 {
                            p.x = threshold;
                            p.vx = 0.0;
                            p.vy = 0.0;
                        } else {
                            dies = true;
                        }
                    }
                    if p.kind == 7 && p.x < p.target_x {
                        p.angle = (p.vy as f64).atan2(p.vx as f64) as f32;
                    }
                }
            }
            self.projectiles[i] = p;
            if dies {
                self.kill_projectile(i);
            }
        }
    }
    fn kill_projectile(&mut self, i: usize) {
        let mut p = self.projectiles[i];
        p.active = false;
        self.projectiles[i] = p;
        if matches!(p.kind, 0 | 5) {
            self.stone_fragments(p);
        }
        if p.kind == 2 {
            self.spell_smoke(if p.tier == 3 { 5 } else { 4 }, p.x, p.y, p.charge);
            if p.tier == 3 {
                for i in 0..CAPACITY {
                    let u = self.units[i];
                    if u.alive()
                        && !matches!(u.state, HELD | FLY)
                        && distance(p.x, p.y, u.x, u.y) < 14400
                    {
                        self.freeze_unit(i, 4.5);
                    }
                }
            } else {
                self.weapon_sounds |= 1 << 8;
                self.audio.weapon(8);
                if matches!(p.tier, 1 | 2) {
                    p.counter -= 1;
                }
                if (p.tier == 1 && p.counter > 1) || (p.tier == 2 && p.counter > 0) {
                    p.active = true;
                    p.gravity = 1200.;
                    p.vy = if p.tier == 1 { -800. } else { -600. };
                    if p.tier == 1 {
                        p.vx = 0.;
                        p.angle = 0.;
                    }
                }
                self.projectiles[i] = p;
                self.explode(p.x, p.y, 0.8, (p.charge * 240.) as i32, 0.5, 1.);
                let p = self.projectiles[i];
                // Native offset0x28 holds charge for fireballs, radius40 for barrels.
                let charge = if p.kind == 4 { 40. } else { p.charge };
                self.hit_splash(p.x, p.y, 1900, (charge * 160.) as i32, true);
            }
        }
        let p = self.projectiles[i];
        if p.kind == 6 {
            self.blast_smoke(3, p.x, p.y);
        }
        if p.kind == 4 {
            self.tremble.strength = 5.;
            self.explode(p.x, p.y, 0.8, 180, 0.5, 1.0);
            // Knockback can drop a carrier's barrel into this just-freed slot.
            let p = self.projectiles[i];
            self.hit_splash(p.x, p.y, 1000, 80, true);
            let p = self.projectiles[i];
            self.blast_smoke(0, p.x, p.y);
            self.weapon_sounds |= 1 << 5;
            self.audio.weapon(5);
        }
    }
    pub(super) fn hit_splash(&mut self, x: f32, y: f32, damage: i32, radius: i32, burning: bool) {
        for i in 0..CAPACITY {
            let u = &mut self.units[i];
            if !u.alive() || u.state == HELD || distance(x, y, u.x, u.y) >= radius {
                continue;
            }
            let died = u.hit(damage);
            if died {
                self.reward(i);
            }
            let u = &mut self.units[i];
            u.burning |= burning && u.freeze_time <= 0.;
        }
    }
    pub(super) fn explode(
        &mut self,
        x: f32,
        y: f32,
        factor: f32,
        radius: i32,
        randomization: f32,
        x_scale: f32,
    ) {
        for i in 0..CAPACITY {
            let u = self.units[i];
            if !u.alive() || matches!(u.state, HELD | FLY) {
                continue;
            }
            let d = distance(x, y, u.x, u.y);
            if d >= radius {
                continue;
            }
            let random = (self.random() % 100) as f32 / 99.0;
            let base = ((radius - d) as f32 * factor).trunc();
            let strength = (base + base * random * randomization).trunc() as f64;
            let dx = (x.trunc() - u.x).trunc();
            let dy = (y.trunc() - u.y).trunc();
            let angle = ((dy as f64).atan2(dx as f64) as f32) as f64;
            let pose = u.pose() as u32;
            self.drop_barrel(i);
            self.sound_masks[2] |= 1 << u.kind;
            self.audio.emit(2, u.kind);
            let u = &mut self.units[i];
            u.held_pose = Some(pose);
            u.state = FLY;
            u.vx = (-angle.cos() * strength * 0.4 * x_scale as f64) as f32;
            u.vy = (-angle.sin().abs() * strength * 3.0 - 60.0) as f32;
        }
    }
}

fn distance(x: f32, y: f32, ux: f32, uy: f32) -> i32 {
    let dx = (x.trunc() - ux).trunc() as f64;
    let dy = (y.trunc() - uy).trunc() as f64;
    (dx * dx + dy * dy).sqrt() as i32
}

#[cfg(test)]
mod tests;
