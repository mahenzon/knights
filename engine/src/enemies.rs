use super::*;

impl Unit {
    pub(super) fn pose(&self) -> usize {
        match self.state {
            SACRIFICE if self.held_pose.is_some() => self.held_pose.unwrap() as usize,
            EJECTED => 5,
            _ if self.freeze_time > 0. => 7,
            WALK | HELD | HOOKED | FLY if self.held_pose.is_some() => {
                self.held_pose.unwrap() as usize
            }
            HELD | HOOKED => 2,
            FLY | SACRIFICE => 3,
            STUN => 4,
            DEAD if self.corpse_flying && self.clock > 0. => 3,
            DEAD => 6,
            ATTACK => 1,
            ESCAPE => 9,
            CAST => 10,
            _ if self.disarmed => 8,
            _ => 0,
        }
    }

    pub(super) fn captive_step(&mut self) -> bool {
        let increment = DT * STATS[self.kind as usize][5];
        let switch = |u: &mut Self, pose| {
            u.held_pose = Some(pose);
            u.animation = 0.;
        };
        let mut landed = false;
        if self.y != self.ground {
            if self.freeze_time <= 0. && self.pose() != 3 {
                switch(self, 3);
            }
            self.vy = self.vy.clamp(-900., 900.) + 1000. * DT;
            self.y += self.vy * DT;
            if self.y > self.ground {
                self.y = self.ground;
                self.clock = (self.vy / 300.).abs() + 0.2;
                switch(self, 4);
                landed = true;
                if matches!(self.kind, 8 | 9) {
                    self.clock = -1.;
                    self.speed = self.saved_speed;
                    switch(self, 0);
                }
            }
        }
        if self.pose() == 4 {
            self.clock -= DT;
            if self.clock < 0. {
                self.speed = self.saved_speed;
                switch(self, 0);
            }
        }
        if self.disarmed && self.pose() <= 1 {
            self.speed = -self.saved_speed;
            switch(self, 8);
        }
        if self.freeze_time > 0. {
            self.speed = 0.;
            if self.y >= self.ground {
                self.freeze_time -= DT;
                if self.freeze_time < 0. {
                    self.freeze_time = 0.;
                    self.speed = self.saved_speed;
                    switch(self, 0);
                }
            }
        }
        if self.pose() <= 1 && (self.x - (self.y - 200.) + self.range).trunc() > 290. {
            self.x -= 50. * DT;
            self.speed = 0.;
        }
        self.x += self.speed * DT;
        self.animation += increment;
        if self.animation > data::ANIMATION_LIMITS[self.kind as usize][self.pose()] {
            self.animation = 0.;
            // The gate disables Attack/UpdateAbilities, but native pose transitions still run.
            if self.pose() == 1 {
                switch(self, 0);
                self.speed = 0.;
            }
            if self.pose() == 0
                && (self.x - (self.y - 200.) + self.range).trunc() > 284.
                && self.cooldown < 0.
            {
                switch(self, 1);
                self.speed = 0.;
            }
        }
        landed
    }

    pub(super) fn walk_step(&mut self, dt: f32) {
        let retired = self.disarmed && self.x < -150.;
        if self.disarmed && self.pose() <= 1 {
            self.held_pose = None;
            self.state = WALK;
            self.speed = -self.saved_speed;
            self.animation = dt * STATS[self.kind as usize][5];
        }
        if self.pose() <= 1 && (self.x - (self.y - 200.) + self.range).trunc() > 290. {
            self.x -= 50. * dt;
            self.speed = 0.;
        }
        self.x += self.speed * dt;
        if retired {
            self.state = 0;
        }
    }

    pub(super) fn stun_step(&mut self, dt: f32) {
        self.clock -= dt;
        if self.clock < 0. {
            self.state = WALK;
            self.speed = if self.disarmed {
                -self.saved_speed
            } else {
                self.saved_speed
            };
            self.animation = dt * STATS[self.kind as usize][5];
            self.walk_step(dt);
        }
    }

    pub(super) fn update_ability(&mut self, mut random: impl FnMut() -> u32) {
        if !self.alive() {
            return;
        }
        if self.kind == 7 {
            if !self.ability_active {
                self.alpha = (self.alpha + DT * 400. / 255.).min(1.);
            }
            if self.pose() != 0 {
                self.ability_active = false;
                self.ability_time = -1.;
            }
        }
        if self.state == HELD || self.ability_done {
            return;
        }
        self.ability_delay -= DT;
        if self.pose() != 0 {
            return;
        }
        if self.ability_active {
            self.ability_time -= DT;
            if self.ability_time < 0. {
                self.ability_active = false;
                self.ability_done = self.kind != 9 || self.x >= 250.;
                if self.kind == 1 {
                    self.saved_speed = (self.saved_speed / 3.).trunc();
                    self.speed = self.saved_speed;
                }
                if self.kind == 6 {
                    self.shield = false;
                }
            }
            if self.kind == 7 && self.ability_time > 0. {
                self.alpha = (self.alpha - DT * 200. / 255.).max(0.);
            }
        } else if self.ability_delay <= 0. {
            self.ability_active = true;
            match self.kind {
                1 => {
                    self.saved_speed *= 3.;
                    self.speed = self.saved_speed;
                    self.ability_time = 0.7 + (random() % 100) as f32 / 250.;
                }
                6 => {
                    if self.state == FLY {
                        self.held_pose = Some(10);
                    } else {
                        self.state = CAST;
                    }
                    self.animation = 0.;
                    self.ability_time = 6.;
                }
                7 => self.ability_time = 6.,
                8 | 9 => {
                    if self.kind == 9 && self.state == FLY {
                        return;
                    }
                    self.vx = if self.kind == 8 { 200. } else { 40. };
                    self.vy = if self.kind == 8 {
                        -500.
                    } else {
                        -450. - (random() % 120) as f32
                    };
                    self.state = FLY;
                    self.animation = 0.;
                    if self.kind == 9 {
                        self.ability_time = 0.5;
                        self.immunity = true;
                    }
                }
                _ => {
                    self.ability_active = false;
                    self.ability_done = true;
                }
            }
        }
    }
}

impl Game {
    pub(super) fn fly(&mut self, i: usize, dt: f32) {
        let u = &mut self.units[i];
        let mut dead = u.state == DEAD;
        u.vx = u.vx.clamp(-900., 900.);
        u.vy = u.vy.clamp(-900., 900.) + 1000. * dt;
        u.x += u.vx * dt;
        u.y += u.vy * dt;
        if u.x > 405. {
            u.hp = 1.;
            u.ground = 310.;
        }
        if u.x > 350. && u.y > 80. && u.vx > 0. {
            let died = u.hit(u.vx.trunc().abs() as i32);
            dead |= died;
            if died {
                // Native Die runs at each impact, even twice during one Process call.
                self.reward(i);
                dead = self.units[i].state == DEAD || self.units[i].hp < 0.;
            }
            let u = &mut self.units[i];
            u.vx = -70.;
            u.vy = 0.;
            if dead {
                u.clock = 0.;
                u.animation = dt * STATS[u.kind as usize][5];
            }
        }
        let u = &mut self.units[i];
        let retired = u.disarmed && u.x < -150.;
        if u.y > u.ground && u.vy >= 0. {
            u.y = u.ground;
            u.corpse_flying = false;
            u.state = if dead { DEAD } else { STUN };
            u.clock = (u.vy / 300.).abs() + 0.2;
            u.speed = 0.;
            let died = u.hit(u.vy as i32);
            dead |= died;
            if died {
                self.reward(i);
                dead = self.units[i].state == DEAD || self.units[i].hp < 0.;
            }
            let active = self.units[i].state != 0;
            if !dead {
                self.units[i].state = STUN;
            }
            self.events |= 4;
            let u = &mut self.units[i];
            u.animation = dt * STATS[u.kind as usize][5];
            if !dead {
                if matches!(u.kind, 8 | 9) {
                    u.clock = -1.;
                    u.state = WALK;
                    u.speed = u.saved_speed;
                    u.walk_step(dt);
                } else {
                    u.stun_step(dt);
                }
            }
            self.shatter_ice(i);
            if !dead {
                self.sound_masks[0] |= 1 << self.units[i].kind;
                self.audio.emit(0, self.units[i].kind);
            }
            if !active {
                self.units[i].state = 0;
            }
        } else {
            u.x += u.speed * dt;
        }
        let u = &mut self.units[i];
        if retired {
            u.state = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn airborne_retreat_checks_exit_before_the_walk_speed_step() {
        let mut g = Game::default();
        g.spawn(2, -115., 240., false);
        let u = &mut g.units[0];
        u.state = FLY;
        u.disarmed = true;
        u.y = 100.;
        u.vx = -39.;
        u.vy = -113.;
        u.speed = -4156.;
        g.fly(0, DT);
        assert!(g.units[0].x < -150.);
        assert_eq!(g.units[0].state, FLY);
        g.fly(0, DT);
        assert_eq!(g.units[0].state, 0);
    }
    #[test]
    fn abilities_use_retained_pose_on_the_first_knockback_frame() {
        for (kind, vx, vy, duration) in [
            (1, -40., -120., 0.924),
            (6, -40., -120., 6.),
            (7, -40., -120., 6.),
            (8, 200., -500., 0.),
            (9, -40., -120., 0.),
        ] {
            let mut g = Game::default();
            g.spawn(kind, 100., 240., false);
            let u = &mut g.units[0];
            u.state = FLY;
            u.held_pose = Some(0);
            u.ability_delay = -1.;
            u.vx = -40.;
            u.vy = -120.;
            u.update_ability(|| 123456);
            assert!(u.ability_active, "kind {kind}");
            assert_eq!(u.state, FLY);
            assert_eq!((u.vx, u.vy, u.ability_time), (vx, vy, duration));
            assert!(!u.immunity);
        }
    }
    #[test]
    fn machine_chain_preserves_native_score_and_effect_order() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.config[11] = 1.;
        g.start(73, 100000., 0, 0, 0);
        g.delay = 9999.;
        for (kind, x) in [(4, 200.), (5, 250.), (0, 300.), (8, 360.)] {
            g.spawn(kind, x, 240., false);
        }
        g.rng = 0;
        let u = &mut g.units[0];
        u.state = FLY;
        u.speed = 0.;
        u.y = u.ground - 1.;
        u.vy = 800.;
        g.step();
        assert_eq!((g.gold, g.score, g.kills), (110, 218, 3));
        assert_eq!(g.smokes[0].x, 250.);
        assert_eq!(g.smokes[3].x, 200.);
        assert_eq!(g.units[1].pose(), 3);
        assert_eq!(g.units[1].animation, DT * 8.);
    }

    #[test]
    fn shattered_machine_slot_can_be_replaced_then_removed_by_its_own_death() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.config[11] = 1.;
        g.start(73, 100000., 0, 0, 0);
        g.delay = 9999.;
        for (kind, x) in [(4, 200.), (10, 250.), (0, 300.), (8, 360.)] {
            g.spawn(kind, x, 240., kind == 10);
        }
        g.freeze_unit(0, 3.5);
        g.rng = 0;
        let u = &mut g.units[0];
        u.state = FLY;
        u.y = u.ground - 1.;
        u.vy = 800.;
        g.step();
        assert_eq!((g.gold, g.score, g.kills), (160, 316, 3));
        assert_eq!((g.units[0].state, g.units[1].state), (0, 0));
        assert_eq!((g.units[0].kind, g.units[0].hp), (10, 1.));
        assert_eq!(g.sound_masks[0], 1 << 10);
        assert_eq!(g.fragments[0].kind, 0);
        assert_eq!(g.fragments[16].kind, 3);
        assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 11);
        assert_eq!(g.smokes[7].x, 250.);
    }

    #[test]
    fn giant_exploman_replacement_finishes_the_current_landing_frame() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.start(73, 100000., 0, 0, 0);
        g.delay = 9999.;
        g.spawn(10, 200., 240., true);
        let u = &mut g.units[0];
        u.state = FLY;
        u.speed = 0.;
        u.y = u.ground - 1.;
        u.vy = 800.;
        g.step();
        assert_eq!((g.gold, g.kills), (100, 1));
        let u = g.units[0];
        assert_eq!((u.state, u.x, u.y, u.hp), (WALK, 200.75, 215., 1.));
        assert_eq!(u.animation, DT * 12.);
        assert_eq!(u.size, 0.7);
        assert_eq!(g.sound_masks[0], 1 << 10);
    }

    #[test]
    fn castle_hp_reset_does_not_revive_an_airborne_corpse() {
        let mut g = Game::default();
        g.units[0] = Unit {
            state: DEAD,
            corpse_flying: true,
            x: 410.,
            y: 311.,
            ground: 310.,
            vx: 0.5,
            vy: -10.,
            hp: -50.,
            ..Unit::default()
        };
        g.fly(0, DT);
        assert_eq!(g.units[0].hp, 1.);
        assert_eq!(g.units[0].state, DEAD);
        assert!(!g.units[0].corpse_flying);
        assert_eq!(g.units[0].y, 310.);
        assert_eq!(g.kills, 0);
        assert_eq!(g.sound_masks[0], 0);
    }

    #[test]
    fn wall_contact_resets_an_existing_corpses_death_pose_without_another_kill() {
        let mut g = Game::default();
        g.units[0] = Unit {
            state: DEAD,
            corpse_flying: true,
            x: 410.,
            y: 100.,
            vx: 1.,
            hp: -50.,
            clock: 1.,
            animation: 3.,
            ..Unit::default()
        };
        g.fly(0, DT);
        assert_eq!(g.units[0].hp, 0.);
        assert_eq!(g.units[0].pose(), 6);
        assert_eq!(g.units[0].animation, DT * STATS[0][5]);
        assert_eq!(g.kills, 0);
    }

    #[test]
    fn wall_and_ground_in_one_throw_reward_at_each_impact_position() {
        for kind in [0, 4] {
            let mut g = Game::default();
            g.config[0] = 120.;
            g.start(73, 100., 0, 0, 0);
            g.spawn_timer = 9999.;
            g.delay = 9999.;
            g.spawn(kind, 340., 240., false);
            g.units[0].y = 240.;
            assert!(g.pickup(340., 240.));
            g.drag(340., 210.);
            for _ in 0..7 {
                g.step();
            }
            g.units[0].vx = 900.;
            g.units[0].vy = 900.;
            g.release();
            g.step();
            assert_eq!(g.units[0].state, DEAD);
            assert!(!g.units[0].corpse_flying);
            assert_eq!(g.units[0].y, g.units[0].ground);
            assert_eq!(g.gold, 2 * g.units[0].reward);
            assert_eq!(g.kills, 2);
            if kind == 4 {
                assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 6);
                for layer in 0..3 {
                    assert_eq!(g.smokes[layer].y - g.smokes[layer + 3].y, 18.);
                }
                assert_eq!(g.fragments.iter().filter(|f| f.active).count(), 8);
            }
            g.step();
            assert_eq!(g.kills, 2);
        }
    }

    #[test]
    fn released_knight_lands_and_moves_on_the_native_recovery_frame() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.start(73, 100., 0, 0, 0);
        g.spawn_timer = 9999.;
        g.delay = 9999.;
        g.spawn(0, 170., 240., false);
        g.units[0].y = 130.;
        assert!(g.pickup(170., 130.));
        g.drag(170., 100.);
        for _ in 0..7 {
            g.step();
        }
        g.units[0].vx = 40.;
        g.units[0].vy = -100.;
        g.release();
        assert_eq!(g.units[0].state, FLY);
        assert_eq!(g.units[0].vy, -220.);
        for _ in 0..44 {
            g.step();
        }
        assert_eq!(g.units[0].state, FLY);
        g.step();
        assert_eq!(g.units[0].state, STUN);
        assert_eq!(g.units[0].hp, 70.);
        assert_eq!(g.units[0].animation, DT * 16.);
        for _ in 45..162 {
            g.step();
        }
        assert_eq!(g.units[0].state, STUN);
        let x = g.units[0].x;
        g.step();
        assert_eq!(g.units[0].state, WALK);
        assert_eq!(g.units[0].x, x + 1.);
        assert_eq!(g.units[0].animation, DT * 16.);
    }
    #[test]
    fn spawned_enemies_start_with_native_attack_readiness() {
        let mut g = Game::default();
        for kind in 0..11 {
            g.spawn(kind, 100., 240., false);
            assert_eq!(g.units[kind as usize].cooldown, -1.);
        }
    }
    #[test]
    fn gate_capture_recovers_and_ejects_through_real_input() {
        for kind in 0..11 {
            for freeze in [0., 1., 4.5] {
                let mut g = Game::default();
                g.config[0] = 120.;
                g.start(73, 100000., 0, 0, 0);
                g.spawn_timer = 9999.;
                g.delay = 9999.;
                g.spawn(kind, 233., 130., false);
                g.units[0].freeze_time = freeze;
                g.units[0].ability_delay = 99.;
                assert!(g.pickup(233., 130.));
                g.drag(233., 100.);
                for _ in 0..27 {
                    g.step();
                }
                g.release();
                assert_eq!(g.units[0].state, SACRIFICE);
                assert!(g.units[0].shield);
                assert_eq!(g.units[0].disarmed, kind == 2);
                for _ in 0..35 {
                    g.step();
                }
                assert_eq!(g.units[0].y, 300.);
                assert_eq!(g.units[0].pose(), if matches!(kind, 8 | 9) { 0 } else { 4 });
                for _ in 35..334 {
                    g.step();
                }
                assert_eq!(g.units[0].state, EJECTED);
                assert_eq!(g.units[0].pose(), 5);
                assert_eq!(g.sacrifices, 1);
            }
        }
    }
    #[test]
    fn dark_knight_escapes_a_real_hook_capture_without_a_sacrifice() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.start(73, 100., 0, 0, 0);
        g.spawn_timer = 9999.;
        g.delay = 9999.;
        g.spawn(3, 120., 75., false);
        g.units[0].animation = 0.75;
        assert!(g.pickup(120., 75.));
        g.release();
        assert_eq!(g.units[0].state, HOOKED);
        assert_eq!(g.units[0].pose(), 0);
        assert_eq!(g.units[0].animation, 0.75);
        for _ in 0..35 {
            g.step();
        }
        assert_eq!(g.units[0].state, HOOKED);
        g.step();
        assert_eq!(g.units[0].state, ESCAPE);
        assert_eq!(g.hook_unit, -1);
        assert!(
            g.hook_time > 0.6,
            "The dragon visit continues without its escaped captive"
        );
        for _ in 0..130 {
            g.step();
        }
        assert_eq!(g.sacrifices, 0);
    }
    #[test]
    fn wizard_can_be_interrupted_during_cast_and_targeted_by_weapons() {
        let mut g = Game::default();
        g.config[0] = 120.;
        g.spawn(6, 100., 240., false);
        g.units[0].ability_delay = -1.;
        g.step();
        assert_eq!(g.units[0].state, CAST);
        assert!(g.units[0].alive());
        assert!(g.pickup(g.units[0].x, g.units[0].y));
        assert_eq!(g.units[0].state, HELD);
        for _ in 0..30 {
            g.step();
        }
        assert!(!g.units[0].shield);
        assert_eq!(g.units[0].ability_time, 6.);
        assert!(g.units[0].hit(601));
    }
}
