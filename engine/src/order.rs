//! Native creep/dragobject ordering; its 13-frame timer and list survive day resets.
use super::*;

pub(super) const OBJECTS: usize = CAPACITY + PROJECTILES;
pub(super) const ORDER_WORDS: usize = 1 + OBJECTS * 2;
#[derive(Clone)]
pub(super) struct Order {
    pub timer: u32,
    pub entries: [u32; OBJECTS],
    pub frame: [u32; OBJECTS],
}
impl Default for Order {
    fn default() -> Self {
        Self {
            timer: 30,
            entries: [0; OBJECTS],
            frame: [0; OBJECTS],
        }
    }
}
impl Order {
    pub fn words(&self) -> impl Iterator<Item = u32> + '_ {
        std::iter::once(self.timer)
            .chain(self.entries)
            .chain(self.frame)
    }
    pub fn load(&mut self, w: [u32; ORDER_WORDS]) -> bool {
        if w[0] > 12 && w[0] != 30 {
            return false;
        }
        for group in w[1..].chunks_exact(OBJECTS) {
            let mut seen = [false; OBJECTS];
            let mut ended = false;
            for &id in group {
                if id == 0 {
                    ended = true;
                    continue;
                }
                if ended || id as usize > OBJECTS || seen[id as usize - 1] {
                    return false;
                }
                seen[id as usize - 1] = true;
            }
        }
        self.timer = w[0];
        self.entries.copy_from_slice(&w[1..1 + OBJECTS]);
        self.frame.copy_from_slice(&w[1 + OBJECTS..]);
        true
    }
}
impl Game {
    pub(super) fn rebuild_order(&mut self) {
        let mut keys = [(0_i32, 0_u32); OBJECTS];
        let mut len = 0;
        for (i, u) in self.units.iter().enumerate().filter(|(_, u)| u.state != 0) {
            keys[len] = (
                (u.y + STATS[u.kind as usize][8] - 110.) as i32,
                i as u32 + 1,
            );
            len += 1;
        }
        for (i, p) in self
            .projectiles
            .iter()
            .enumerate()
            .filter(|(_, p)| p.active)
        {
            keys[len] = (
                p.y as i32 + if p.held { 250 } else { 0 },
                (CAPACITY + i + 1) as u32,
            );
            len += 1;
        }
        // shortcut: preserve pool order for equal native keys until historical libc tie order is recovered.
        keys[..len].sort_by_key(|&(depth, _)| depth);
        self.order.entries.fill(0);
        for (out, &(_, id)) in self.order.entries.iter_mut().zip(&keys[..len]) {
            *out = id;
        }
        self.order.timer = 0;
    }
    pub(super) fn capture_order(&mut self) {
        self.order.timer += 1;
        if self.order.timer > 12 {
            self.rebuild_order();
        }
        self.order.frame = self.order.entries;
    }
}
