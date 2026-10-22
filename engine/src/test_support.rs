use super::*;

pub(super) fn game() -> Game {
    let mut g = Game {
        config: [
            30.0, 180.0, 0.0, 0.0, 0.0, 0.0, 0.0, 20.0, 0.0, -1.0, 0.0, 1.0,
        ],
        ..Game::default()
    };
    g.start(73, 100.0, 0, 0, 0);
    g
}
