//! Original DrawNormalGame transform; smoke/fragments subtract its retained offset.
use super::DT;

pub(super) const TREMBLE_WORDS: usize = 4;
#[derive(Clone, Copy, Default)]
pub(super) struct Tremble {
    pub strength: f32,
    pub x: f32,
    pub y: f32,
    pub active: bool,
}
impl Tremble {
    pub fn frame(&mut self, random: [u32; 2]) {
        self.active = self.strength > 0.;
        if self.active {
            let offset = |r| {
                let n = ((r & 0x7fffffff) % 100) as i32 - 50;
                ((n as f32 * self.strength) as f64 * 0.02) as f32
            };
            self.x = offset(random[0]);
            self.y = offset(random[1]);
            self.strength -= DT * 10.;
        }
    }
    pub fn words(self) -> [u32; TREMBLE_WORDS] {
        [
            self.strength.to_bits(),
            self.x.to_bits(),
            self.y.to_bits(),
            self.active as u32,
        ]
    }
    pub fn load(&mut self, w: [u32; TREMBLE_WORDS]) -> bool {
        let [strength, x, y] = [w[0], w[1], w[2]].map(f32::from_bits);
        if !(-1. ..=100000.).contains(&strength)
            || !(-100000. ..=100000.).contains(&x)
            || !(-100000. ..=100000.).contains(&y)
            || w[3] > 1
        {
            return false;
        }
        *self = Self {
            strength,
            x,
            y,
            active: w[3] != 0,
        };
        true
    }
}
