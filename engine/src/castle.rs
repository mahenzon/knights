//! Original land::HitCastle, DrawCastle and post-breach state.
use super::*;

pub(super) const DOOR_EXTRA_WORDS: usize = 5;
#[derive(Clone, Copy)]
pub(super) struct Door {
    pub broken: bool,
    pub shake: f32,
    pub age: f32,
    pub x: f32,
    pub y: f32,
    pub frame_flags: u32,
}
impl Default for Door {
    fn default() -> Self {
        Self {
            broken: false,
            shake: 0.,
            age: 0.,
            x: 331.,
            y: 162.,
            frame_flags: 1,
        }
    }
}
impl Door {
    pub fn hit(&mut self) {
        self.shake += 1.5;
        self.age = 0.;
    }
    pub fn frame(&mut self, random: [u32; 2]) {
        self.frame_flags = (self.broken as u32) << 1 | (self.age < 0.1) as u32;
        self.x = 331. + (((random[0] & 0x7fffffff) % 1000) as f32 / 1000. - 0.5) * self.shake;
        self.y = 162. + (((random[1] & 0x7fffffff) % 1000) as f32 / 1000. - 0.5) * self.shake;
    }
    pub fn step(&mut self) {
        self.age += DT;
        self.shake = (self.shake + (DT * self.shake) * -6.).max(0.);
    }
    pub fn words(self) -> [u32; DOOR_EXTRA_WORDS] {
        [
            self.shake.to_bits(),
            self.age.to_bits(),
            self.x.to_bits(),
            self.y.to_bits(),
            self.frame_flags,
        ]
    }
    pub fn load(&mut self, w: [u32; DOOR_EXTRA_WORDS]) -> bool {
        let [shake, age, x, y] = [w[0], w[1], w[2], w[3]].map(f32::from_bits);
        if !(0. ..=100000.).contains(&shake)
            || !(0. ..=1e9).contains(&age)
            || !(-100000. ..=100000.).contains(&x)
            || !(-100000. ..=100000.).contains(&y)
            || w[4] > 3
        {
            return false;
        }
        *self = Self {
            shake,
            age,
            x,
            y,
            frame_flags: w[4],
            ..*self
        };
        true
    }
}
