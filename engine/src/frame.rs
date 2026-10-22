//! The original draws creeps/dragobjects before their physics and missile hits.
use super::*;

pub(super) const ACTOR_FLOATS: usize = CAPACITY * STRIDE + PROJECTILES * PROJECTILE_STRIDE;
pub(super) const FRAME_WORDS: usize = ACTOR_FLOATS + 2;

#[derive(Clone)]
pub(super) struct ActorFrame {
    pub captured: bool,
    pub gate_unit: i32,
    pub actors: [f32; ACTOR_FLOATS],
    pub gate_actor: [f32; STRIDE],
}
impl Default for ActorFrame {
    fn default() -> Self {
        Self {
            captured: false,
            gate_unit: -1,
            actors: [0.; ACTOR_FLOATS],
            gate_actor: [0.; STRIDE],
        }
    }
}
impl ActorFrame {
    pub fn load_gate(&mut self, words: [u32; STRIDE]) -> bool {
        let actor = words.map(f32::from_bits);
        if !valid_unit(&actor) {
            return false;
        }
        self.gate_actor = actor;
        true
    }
    pub fn words(&self) -> impl Iterator<Item = u32> + '_ {
        [self.captured as u32, self.gate_unit as u32]
            .into_iter()
            .chain(self.actors.iter().map(|f| f.to_bits()))
    }
    pub fn load(&mut self, w: [u32; FRAME_WORDS]) -> bool {
        let gate = w[1] as i32;
        if w[0] > 1 || !(-1..CAPACITY as i32).contains(&gate) {
            return false;
        }
        let values = std::array::from_fn::<_, ACTOR_FLOATS, _>(|i| f32::from_bits(w[i + 2]));
        if values.iter().any(|f| !f.is_finite() || f.abs() >= 1e7) {
            return false;
        }
        let integer = |f: f32, max: u32| f >= 0. && f <= max as f32 && f.fract() == 0.;
        for u in values[..CAPACITY * STRIDE].chunks_exact(STRIDE) {
            if !valid_unit(u) {
                return false;
            }
        }
        for p in values[CAPACITY * STRIDE..].chunks_exact(PROJECTILE_STRIDE) {
            if !integer(p[0], 8)
                || p[0] == 4.
                || !integer(p[5], 1)
                || !integer(p[7], 1)
                || !integer(p[8], 3)
                || (p[0] != 0. && !(p[4] > 0. && p[4] <= 10.))
            {
                return false;
            }
        }
        self.captured = w[0] != 0;
        self.gate_unit = gate;
        self.actors = values;
        true
    }
}

fn valid_unit(u: &[f32]) -> bool {
    let integer = |f: f32, max: u32| f >= 0. && f <= max as f32 && f.fract() == 0.;
    u.iter().all(|f| f.is_finite() && f.abs() < 1e7)
        && integer(u[0], CAST)
        && integer(u[3], 10)
        && integer(u[8], 383)
        && (u[0] == 0. || (u[5] > 0. && u[5] <= 10. && u[6] >= 0.))
}

pub(super) fn write_actors(units: &[Unit], projectiles: &[Projectile], out: &mut [f32]) {
    for (row, u) in out[..CAPACITY * STRIDE].chunks_exact_mut(STRIDE).zip(units) {
        write_unit(u, row);
    }
    for (row, p) in out[CAPACITY * STRIDE..]
        .chunks_exact_mut(PROJECTILE_STRIDE)
        .zip(projectiles)
    {
        row.copy_from_slice(&[
            if p.active { p.kind as f32 + 1. } else { 0. },
            p.x,
            p.y,
            p.angle,
            p.size,
            p.held as u32 as f32,
            p.age,
            p.landed as u32 as f32,
            p.tier as f32,
            p.charge,
        ]);
    }
}

pub(super) fn write_unit(u: &Unit, row: &mut [f32]) {
    row.copy_from_slice(&[
        u.state as f32,
        u.x,
        u.y,
        u.kind as f32,
        u.animation,
        u.size,
        u.alpha,
        u.hp,
        ((u.kind == 6 && u.state != DEAD && u.ability_active && u.shield) as u32
            | (u.disarmed as u32) << 1
            | (u.burning as u32) << 2
            | ((u.freeze_time > 0.) as u32) << 3
            | ((u.state == DEAD && u.corpse_flying && u.clock > 0.) as u32) << 4
            | if matches!(u.state, WALK | HELD | HOOKED | FLY | SACRIFICE) {
                u.held_pose.map_or(0, |pose| (pose + 1) << 5)
            } else {
                0
            }) as f32,
        u.angle,
        u.clock,
        u.ground,
    ]);
}

impl Game {
    pub(super) fn capture_gate(&mut self) {
        // Native DrawBefore draws the captive before digestion/ejection changes its pose.
        self.frame.gate_actor.fill(0.);
        if self.gate_unit >= 0 {
            write_unit(
                &self.units[self.gate_unit as usize],
                &mut self.frame.gate_actor,
            );
        }
    }
    pub(super) fn capture_actors(&mut self) {
        write_actors(&self.units, &self.projectiles, &mut self.frame.actors);
        self.frame.gate_unit = self.gate_unit;
        self.frame.captured = true;
    }
    pub(super) fn frame_ptr(&mut self) -> *const f32 {
        self.draw_ptr();
        if self.frame.captured {
            self.draw[HEADER..HEADER + ACTOR_FLOATS].copy_from_slice(&self.frame.actors);
            self.draw[15] = self.frame.gate_unit as f32;
            self.draw[GATE_FRAME_START..].copy_from_slice(&self.frame.gate_actor);
        }
        for (i, d) in self.devices.iter().enumerate() {
            let p = HEADER + ACTOR_FLOATS + i * DEVICE_STRIDE;
            self.draw[p + 9] = d.draw_animation;
            self.draw[p + 10] = (d.animating as u32 | (d.draw_timer as u32) << 1) as f32;
        }
        self.draw.as_ptr()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missile_hits_and_expiry_do_not_erase_the_already_drawn_pose() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.start(73, 100., 0, 0, 0);
        g.spawn(0, 100., 240., false);
        g.units[0].hp = 1.;
        g.missiles[0] = Missile {
            active: true,
            kind: 1,
            x: 100.,
            y: 240.,
            lifetime: 3.,
            ..Missile::default()
        };
        g.add_purchased_object(0, 0, 180., 100.);
        g.projectiles[0].held = false;
        g.projectiles[0].age = 30.;
        g.step();
        assert_eq!(g.units[0].state, DEAD);
        assert!(!g.projectiles[0].active);
        g.frame_ptr();
        assert_eq!(g.draw[HEADER], WALK as f32);
        assert_eq!(g.draw[HEADER + CAPACITY * STRIDE], 1.);
        g.draw_ptr();
        assert_eq!(g.draw[HEADER], DEAD as f32);
        assert_eq!(g.draw[HEADER + CAPACITY * STRIDE], 0.);
        g.step();
        g.frame_ptr();
        assert_eq!(g.draw[HEADER], DEAD as f32);
        assert_eq!(g.draw[HEADER + CAPACITY * STRIDE], 0.);
    }

    #[test]
    fn last_corpse_frame_survives_expiry_and_new_day_clears_it() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.start(73, 100., 0, 0, 0);
        g.spawn(0, 100., 240., false);
        g.units[0].state = DEAD;
        g.units[0].animation = data::ANIMATION_LIMITS[0][6];
        g.units[0].alpha = 1. / 255.;
        g.step();
        assert_eq!(g.units[0].state, 0);
        g.frame_ptr();
        assert_eq!(g.draw[HEADER], DEAD as f32);
        assert_eq!(g.draw[HEADER + 6], 1. / 255.);
        g.save();
        let mut restored = Game::default();
        assert!(restored.load(&g.snapshot));
        restored.frame_ptr();
        assert_eq!(restored.draw, g.draw);
        restored.start(73, 100., 0, 0, 0);
        restored.frame_ptr();
        assert_eq!(restored.draw[HEADER], 0.);
        assert!(!restored.frame.captured);
    }
}
