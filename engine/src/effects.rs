use super::*;

pub(super) const SMOKES: usize = 256;
// Keep legacy save/draw offsets; the original allocator only uses the first 50 slots.
pub(super) const SMOKE_CAPACITY: usize = 50;
pub(super) const SMOKE_WORDS: usize = 9;
pub(super) const SMOKE_STRIDE: usize = 6;
pub(super) const FRAGMENTS: usize = 150;
pub(super) const FRAGMENT_WORDS: usize = 7;
pub(super) const FRAGMENT_STRIDE: usize = 4;

#[derive(Clone, Copy, Default)]
pub(super) struct Fragment {
    pub active: bool,
    pub kind: u32,
    pub x: i32,
    pub y: i32,
    pub vx: f32,
    pub vy: f32,
    pub size: f32,
}
impl Fragment {
    pub fn step(&mut self) {
        if !self.active {
            return;
        }
        // All native emitters keep size/alpha constant; only ice has the higher gravity.
        self.vy += if self.kind < 3 { 1400. } else { 1000. } * DT;
        // Native fragments truncate their position to integer pixels on every tick.
        self.x = (self.x as f32 + DT * self.vx) as i32;
        self.y = (self.y as f32 + DT * self.vy) as i32;
        self.active = self.y <= 520;
    }
    pub fn words(self) -> [u32; FRAGMENT_WORDS] {
        [
            self.active as u32,
            self.kind,
            self.x as u32,
            self.y as u32,
            self.vx.to_bits(),
            self.vy.to_bits(),
            self.size.to_bits(),
        ]
    }
    pub fn from_words(w: [u32; FRAGMENT_WORDS]) -> Option<Self> {
        let [vx, vy, size] = [w[4], w[5], w[6]].map(f32::from_bits);
        let (x, y) = (w[2] as i32, w[3] as i32);
        if w[0] > 1
            || w[1] > 14
            || !(-20000..=20000).contains(&x)
            || !(-20000..=20000).contains(&y)
            || !(-10000. ..=10000.).contains(&vx)
            || !(-10000. ..=10000.).contains(&vy)
            || !(0. ..=100.).contains(&size)
        {
            return None;
        }
        Some(Self {
            active: w[0] != 0,
            kind: w[1],
            x,
            y,
            vx,
            vy,
            size,
        })
    }
}
#[derive(Clone, Copy, Default)]
pub(super) struct Smoke {
    pub active: bool,
    pub kind: u32,
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub growth: f32,
    pub alpha: f32,
    pub fade: f32,
    pub additive: bool,
    pub vx: f32,
    pub vy: f32,
}
impl Smoke {
    pub fn step(&mut self) {
        if !self.active {
            return;
        }
        self.x = (self.x + DT * self.vx) as i32 as f32;
        self.y = (self.y + DT * self.vy) as i32 as f32;
        self.size += DT * self.growth;
        self.alpha += DT * self.fade;
        if self.size < 0. || self.alpha < 0. {
            self.alpha = self.alpha.max(0.);
            self.active = false;
        }
    }
    pub fn words(self) -> [u32; SMOKE_WORDS] {
        [
            self.active as u32,
            self.kind,
            self.x.to_bits(),
            self.y.to_bits(),
            self.size.to_bits(),
            self.growth.to_bits(),
            self.alpha.to_bits(),
            self.fade.to_bits(),
            self.additive as u32,
        ]
    }
    pub fn from_words(w: [u32; SMOKE_WORDS]) -> Option<Self> {
        if w[0] > 1 || w[1] > 12 || w[8] > 1 {
            return None;
        }
        let [x, y, size, growth, alpha, fade] =
            [w[2], w[3], w[4], w[5], w[6], w[7]].map(f32::from_bits);
        if ![x, y, size, growth, alpha, fade]
            .iter()
            .all(|v| v.is_finite())
            || !(-10000. ..=10000.).contains(&x)
            || !(-10000. ..=10000.).contains(&y)
            // The original ice impact includes a negative-size layer, culled on its first tick.
            || !(-1. ..=100.).contains(&size)
            || !(-100. ..=100.).contains(&growth)
            || !(0. ..=1000.).contains(&alpha)
            || !(-10000. ..=0.).contains(&fade)
        {
            return None;
        }
        Some(Self {
            active: w[0] != 0,
            kind: w[1],
            x,
            y,
            size,
            growth,
            alpha,
            fade,
            additive: w[8] != 0,
            ..Self::default()
        })
    }
}
impl Game {
    pub(super) fn add_smoke(&mut self, smoke: Smoke) {
        if let Some(slot) = self.smokes[..SMOKE_CAPACITY].iter_mut().find(|s| !s.active) {
            *slot = Smoke {
                active: true,
                x: smoke.x as i32 as f32,
                y: smoke.y as i32 as f32,
                ..smoke
            };
        }
    }
    pub(super) fn impact_dust(&mut self, p: Projectile) {
        let (rx, ry, ground, steps, size, growth, alpha, fade, vy) = if p.kind == 0 {
            (
                16.,
                8.,
                p.y + (32. + 16. * p.tier as f32),
                2,
                1.,
                2.,
                155.,
                -320.,
                -110.,
            )
        } else {
            let (rx, ry) = [(30., 10.), (36., 12.), (64., 16.)][p.tier as usize];
            (rx, ry, p.y + 128., 5, 0.6, 6., 255., -620., -160.)
        };
        for i in 0..=steps {
            // The native constants are float32 angles promoted before sin/cos.
            let angle = (std::f32::consts::PI * i as f32 / steps as f32) as f64;
            self.add_smoke(Smoke {
                kind: 2,
                x: (p.x as f64 + angle.cos() * rx).trunc() as f32,
                y: (ground as f64 + angle.sin() * ry - ry).trunc() as f32,
                size,
                growth,
                alpha,
                fade,
                vy,
                ..Smoke::default()
            });
        }
    }
    pub(super) fn shatter_ice(&mut self, i: usize) {
        let u = self.units[i];
        if u.freeze_time <= 0. {
            return;
        }
        self.units[i].state = 0;
        if self.held == i as i32 {
            self.held = -1;
        }
        self.events |= 2048;
        self.audio.emit(17, 1);
        for column in 0..4 {
            for row in 0..4 {
                let kind = (self.random() & 0x7fffffff) % 3;
                let vx = ((self.random() & 0x7fffffff) % 200) as f32 - 100.;
                let vy = -400. - ((self.random() & 0x7fffffff) % 250) as f32;
                self.add_fragment(Fragment {
                    kind,
                    x: (u.x - 30. + column as f32 * 10.) as i32,
                    y: (u.y + 10. + row as f32 * 10.) as i32,
                    vx,
                    vy,
                    size: 0.8,
                    ..Fragment::default()
                });
            }
        }
    }
    fn add_fragment(&mut self, fragment: Fragment) {
        if let Some(slot) = self.fragments.iter().position(|s| !s.active) {
            // Native Init consumes an angle even though Draw does not rotate fragments.
            self.random();
            self.fragments[slot] = Fragment {
                active: true,
                ..fragment
            };
        }
    }
    pub(super) fn machine_fragments(&mut self, x: f32, y: f32) {
        for kind in [3, 3, 4, 5] {
            let vx = ((self.random() & 0x7fffffff) % 600) as f32 - 300.;
            let vy = -400. - ((self.random() & 0x7fffffff) % 350) as f32;
            self.add_fragment(Fragment {
                kind,
                x: x as i32,
                y: y as i32,
                vx,
                vy,
                size: 0.7,
                ..Fragment::default()
            });
        }
    }
    pub(super) fn stone_fragments(&mut self, p: Projectile) {
        let mut angle = 0.0_f64;
        // Preserve the original rounded constants and f32 angle accumulation.
        #[allow(clippy::approx_constant)]
        let (limit, increment) = if p.kind == 0 {
            (12.566370614 + 2. * p.tier as f64, 0.5235987755833333)
        } else {
            (7., 1.0471975511666667)
        };
        let mut index = 0;
        while if p.kind == 0 {
            angle < limit
        } else {
            index < 7
        } {
            let radii = if p.kind == 0 {
                17..30 + 10 * p.tier
            } else {
                16..17
            };
            for radius in radii.step_by(8) {
                let kind =
                    (self.random() & 0x7fffffff) % 3 + if p.kind == 0 { 6 + 3 * p.tier } else { 9 };
                let vx = ((self.random() & 0x7fffffff) % 200) as f32
                    - if p.kind == 0 { 100. } else { 300. };
                let vy = -(((self.random() & 0x7fffffff) % 150) as f32)
                    - if p.kind == 0 { 100. } else { 10. };
                self.add_fragment(Fragment {
                    kind,
                    x: (p.x as f64 + radius as f64 * angle.sin()) as i32,
                    y: (p.y as f64 + radius as f64 * angle.cos()) as i32,
                    vx,
                    vy,
                    size: 0.7,
                    ..Fragment::default()
                });
            }
            angle = (angle + increment) as f32 as f64;
            index += 1;
        }
    }
    pub(super) fn hit_castle(&mut self, damage: f32) {
        self.events |= 16;
        self.door.hit();
        if self.ending == 1 {
            return;
        }
        self.hp -= damage;
        if self.hp >= 0. || self.door.broken {
            return;
        }
        self.door.broken = true;
        self.events |= 128;
        self.audio.emit(15, 0);
        for x in (336..378).step_by(6) {
            for y in (162..274).step_by(8) {
                let kind = (self.random() & 0x7fffffff) % 2 + 4;
                let vx = ((self.random() & 0x7fffffff) % 200) as f32 - 100.;
                let vy = -100. - ((self.random() & 0x7fffffff) % 150) as f32;
                self.add_fragment(Fragment {
                    kind,
                    x,
                    y,
                    vx,
                    vy,
                    size: 0.7,
                    ..Fragment::default()
                });
            }
        }
    }
    pub(super) fn blast_smoke(&mut self, preset: usize, x: f32, y: f32) {
        self.spell_smoke(preset, x, y, 0.5);
    }
    pub(super) fn spell_smoke(&mut self, preset: usize, x: f32, y: f32, charge: f32) {
        for (i, &[kind, dy, size, growth, alpha, fade, additive]) in
            data::BLAST_SMOKE[preset].iter().enumerate()
        {
            self.add_smoke(Smoke {
                kind: kind as u32,
                x: x.trunc(),
                y: y.trunc() + dy,
                size,
                growth,
                alpha,
                fade: if (preset == 4 && matches!(i, 0..=2 | 5)) || (preset == 5 && i == 0) {
                    fade - 400. + charge * 800.
                } else {
                    fade
                },
                additive: additive != 0.,
                ..Smoke::default()
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ice_pool_is_bounded_and_reclaimed() {
        let mut g = Game::default();
        g.spawn(0, 200., 240., false);
        g.units[0].freeze_time = 3.5;
        for _ in 0..20 {
            g.shatter_ice(0);
        }
        assert_eq!(g.fragments.iter().filter(|s| s.active).count(), FRAGMENTS);
        for _ in 0..120 {
            for s in &mut g.fragments {
                s.step();
            }
        }
        assert!(g.fragments.iter().all(|s| !s.active));
    }
    #[test]
    fn chain_death_emits_once_and_pool_saturation_is_bounded() {
        let mut g = Game::default();
        g.spawn(4, 200., 240., false);
        g.spawn(5, 210., 240., false);
        g.units[0].hit(1000);
        g.reward(0);
        assert_eq!(g.kills, 2);
        assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 6);
        for _ in 0..100 {
            g.blast_smoke(0, 200., 240.);
        }
        assert_eq!(g.smokes.iter().filter(|s| s.active).count(), SMOKE_CAPACITY);
        for _ in 0..120 {
            for s in &mut g.smokes {
                s.step();
            }
        }
        assert!(g.smokes.iter().all(|s| !s.active));
    }
}
