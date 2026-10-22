//! Snapshot serialization, migrations and state validation.
use super::*;

impl Game {
    pub(super) fn save(&mut self) {
        let mut values = Vec::<u32>::with_capacity(6500);
        values.extend([0x4b4e5253, 22]);
        values.extend(self.config.map(f32::to_bits));
        values.extend([
            self.table_len as u32,
            self.gold,
            self.sacrifices,
            self.score,
            self.kills,
            self.tick,
            self.rng,
            self.status,
            self.held as u32,
        ]);
        values.extend(
            [
                self.hp,
                self.max_hp,
                self.time,
                self.pressure,
                self.delay,
                self.spawn_timer,
                self.prefix,
            ]
            .map(f32::to_bits),
        );
        values.extend([self.hook_time, self.gate_open, self.gate_time].map(f32::to_bits));
        values.extend([self.gate_unit as u32, self.hook_unit as u32]);
        values.extend(self.table);
        for u in self.units {
            values.extend([
                u.state,
                u.kind,
                u.reward,
                u.damage,
                u.ability_done as u32
                    | (u.ability_active as u32) << 1
                    | (u.corpse_flying as u32) << 2,
                u.shield as u32,
                u.immunity as u32,
            ]);
            values.extend(
                [
                    u.x,
                    u.y,
                    u.ground,
                    u.vx,
                    u.vy,
                    u.hp,
                    u.speed,
                    u.saved_speed,
                    u.mass,
                    u.size,
                    u.clock,
                    u.animation,
                    u.target_x,
                    u.target_y,
                    u.min_y,
                    u.cooldown,
                    u.alpha,
                    u.ability_delay,
                    u.ability_time,
                    u.range,
                ]
                .map(f32::to_bits),
            );
        }
        values.extend(
            self.units
                .map(|u| u.disarmed as u32 | (u.burning as u32) << 1),
        );
        for p in self.projectiles {
            values.extend(p.words());
        }
        values.extend(self.units.map(|u| u.freeze_time.to_bits()));
        for d in self.devices {
            values.extend(d.words());
        }
        for m in self.missiles {
            values.extend(m.words());
        }
        for p in self.projectiles {
            values.extend(p.drag_words());
        }
        values.extend(self.devices.map(|d| d.drag_slot as u32));
        values.push(self.attack_range_offset.to_bits());
        values.extend(
            [
                self.hook_alpha,
                self.gate_amplitude,
                self.gate_burst_y,
                self.gate_lid_y,
                self.gate_lid_angle,
                self.end_fade,
                self.end_time,
            ]
            .map(f32::to_bits),
        );
        values.extend([self.gate_burst as u32, self.gate_ready as u32, self.ending]);
        for s in self.smokes {
            values.extend(s.words());
        }
        for s in self.fragments {
            values.extend(s.words());
        }
        for s in self.smokes {
            values.extend([s.vx.to_bits(), s.vy.to_bits()]);
        }
        values.extend(self.missiles.map(|m| m.smoke_timer.to_bits()));
        values.push(self.door.broken as u32);
        values.extend(self.door.words());
        values.extend(self.tremble.words());
        values.extend(self.order.words());
        values.extend(self.frame.words());
        values.extend(self.frame.gate_actor.map(f32::to_bits));
        values.extend(self.units.map(|u| u.angle.to_bits()));
        values.extend(self.units.map(|u| u.held_pose.unwrap_or(11)));
        for d in &self.devices {
            values.extend([
                d.draw_animation.to_bits(),
                d.timer_pending as u32,
                d.draw_timer as u32,
            ]);
        }
        values.push(self.wave_skip);
        values.extend(self.units.map(|u| u.held_recovery.to_bits()));
        self.snapshot.clear();
        for value in values {
            self.snapshot.extend(value.to_le_bytes());
        }
    }
    pub(super) fn load(&mut self, bytes: &[u8]) -> bool {
        const V2_LEN: usize = (2 + 12 + 9 + 7 + 5 + CAPACITY + CAPACITY * 27) * 4;
        const V3_LEN: usize = V2_LEN + (CAPACITY + PROJECTILES * PROJECTILE_WORDS) * 4;
        const V4_LEN: usize =
            V3_LEN + (CAPACITY + DEVICES * DEVICE_WORDS + MISSILES * MISSILE_WORDS) * 4;
        const V5_LEN: usize = V4_LEN + (PROJECTILES * DRAG_WORDS + DEVICES) * 4;
        const V6_LEN: usize = V5_LEN + 4;
        const V7_LEN: usize = V6_LEN + SCENE_WORDS * 4;
        const V9_LEN: usize = V7_LEN + SMOKES * SMOKE_WORDS * 4;
        const V10_LEN: usize = V9_LEN + FRAGMENTS * FRAGMENT_WORDS * 4;
        const V11_LEN: usize = V10_LEN + (SMOKES * 2 + MISSILES) * 4;
        const V12_LEN: usize = V11_LEN + 4;
        const V13_LEN: usize = V12_LEN + DOOR_EXTRA_WORDS * 4;
        const V14_LEN: usize = V13_LEN + TREMBLE_WORDS * 4;
        const V15_LEN: usize = V14_LEN + ORDER_WORDS * 4;
        const V16_LEN: usize = V15_LEN + FRAME_WORDS * 4;
        const V17_LEN: usize = V16_LEN + STRIDE * 4;
        const V18_LEN: usize = V17_LEN + CAPACITY * 4;
        const V19_LEN: usize = V18_LEN + CAPACITY * 4;
        const V20_LEN: usize = V19_LEN + DEVICES * 3 * 4;
        const V21_LEN: usize = V20_LEN + 4;
        const V22_LEN: usize = V21_LEN + CAPACITY * 4;
        if ![
            V2_LEN, V3_LEN, V4_LEN, V5_LEN, V6_LEN, V7_LEN, V9_LEN, V10_LEN, V11_LEN, V12_LEN,
            V13_LEN, V14_LEN, V15_LEN, V16_LEN, V17_LEN, V18_LEN, V19_LEN, V20_LEN, V21_LEN,
            V22_LEN,
        ]
        .contains(&bytes.len())
        {
            return false;
        }
        let mut words = bytes
            .chunks_exact(4)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()));
        if words.next() != Some(0x4b4e5253) {
            return false;
        }
        let version = words.next().unwrap();
        if !((version == 2 && bytes.len() == V2_LEN)
            || (version == 3 && bytes.len() == V3_LEN)
            || (version == 4 && bytes.len() == V4_LEN)
            || (version == 5 && bytes.len() == V5_LEN)
            || (version == 6 && bytes.len() == V6_LEN)
            || ((version == 7 || version == 8) && bytes.len() == V7_LEN)
            || (version == 9 && bytes.len() == V9_LEN)
            || (version == 10 && bytes.len() == V10_LEN)
            || (version == 11 && bytes.len() == V11_LEN)
            || (version == 12 && bytes.len() == V12_LEN)
            || (version == 13 && bytes.len() == V13_LEN)
            || (version == 14 && bytes.len() == V14_LEN)
            || (version == 15 && bytes.len() == V15_LEN)
            || (version == 16 && bytes.len() == V16_LEN)
            || (version == 17 && bytes.len() == V17_LEN)
            || (version == 18 && bytes.len() == V18_LEN)
            || (version == 19 && bytes.len() == V19_LEN)
            || (version == 20 && bytes.len() == V20_LEN)
            || (version == 21 && bytes.len() == V21_LEN)
            || (version == 22 && bytes.len() == V22_LEN))
        {
            return false;
        }
        let mut next = Game {
            fix_ballista_gate: self.fix_ballista_gate,
            ..Game::default()
        };
        for v in &mut next.config {
            *v = f32::from_bits(words.next().unwrap());
        }
        next.table_len = words.next().unwrap() as usize;
        next.gold = words.next().unwrap();
        next.sacrifices = words.next().unwrap();
        next.score = words.next().unwrap();
        next.kills = words.next().unwrap();
        next.tick = words.next().unwrap();
        next.rng = words.next().unwrap();
        next.status = words.next().unwrap();
        next.held = words.next().unwrap() as i32;
        let mut f = || f32::from_bits(words.next().unwrap());
        next.hp = f();
        next.max_hp = f();
        next.time = f();
        next.pressure = f();
        next.delay = f();
        next.spawn_timer = f();
        next.prefix = f();
        next.hook_time = f();
        next.gate_open = f();
        next.gate_time = f();
        next.gate_unit = words.next().unwrap() as i32;
        next.hook_unit = words.next().unwrap() as i32;
        for v in &mut next.table {
            *v = words.next().unwrap();
        }
        for u in &mut next.units {
            u.state = words.next().unwrap();
            u.kind = words.next().unwrap();
            u.reward = words.next().unwrap();
            u.damage = words.next().unwrap();
            let ability_flags = words.next().unwrap();
            if ability_flags
                > if version >= 11 {
                    7
                } else if version >= 8 {
                    3
                } else {
                    1
                }
            {
                return false;
            }
            u.ability_done = ability_flags & 1 != 0;
            u.ability_active = ability_flags & 2 != 0;
            u.corpse_flying = ability_flags & 4 != 0;
            u.shield = words.next().unwrap() != 0;
            u.immunity = words.next().unwrap() != 0;
            let mut f = || f32::from_bits(words.next().unwrap());
            u.x = f();
            u.y = f();
            u.ground = f();
            u.vx = f();
            u.vy = f();
            u.hp = f();
            u.speed = f();
            u.saved_speed = f();
            u.mass = f();
            u.size = f();
            u.clock = f();
            u.animation = f();
            u.target_x = f();
            u.target_y = f();
            u.min_y = f();
            u.cooldown = f();
            u.alpha = f();
            u.ability_delay = f();
            u.ability_time = f();
            u.range = f();
            if version < 8 {
                u.ability_active = u.ability_time > 0.;
                if u.kind < 11 {
                    let limit = data::ANIMATION_LIMITS[u.kind as usize][u.pose()];
                    u.animation = (u.animation * STATS[u.kind as usize][5]).min(limit).max(0.);
                }
                if u.state > ESCAPE {
                    return false;
                }
            }
        }
        if version >= 3 {
            for u in &mut next.units {
                let flags = words.next().unwrap();
                if flags > 3 {
                    return false;
                }
                u.disarmed = flags & 1 != 0;
                u.burning = flags & 2 != 0;
            }
            for p in &mut next.projectiles {
                let w = std::array::from_fn(|_| words.next().unwrap());
                let Some(value) = Projectile::from_words(w) else {
                    return false;
                };
                *p = value;
            }
        }
        if version >= 4 {
            for u in &mut next.units {
                u.freeze_time = f32::from_bits(words.next().unwrap());
            }
            for d in &mut next.devices {
                let Some(value) =
                    Device::from_words(std::array::from_fn(|_| words.next().unwrap()))
                else {
                    return false;
                };
                *d = value;
            }
            for m in &mut next.missiles {
                let Some(value) =
                    Missile::from_words(std::array::from_fn(|_| words.next().unwrap()))
                else {
                    return false;
                };
                *m = value;
            }
        } else {
            next.equip(0, 0, 0, 35., 30.);
            next.equip(1, 3, 0, 173., 210.);
        }
        if version >= 5 {
            for p in &mut next.projectiles {
                if !p.load_drag_words(std::array::from_fn(|_| words.next().unwrap())) {
                    return false;
                }
            }
            for d in &mut next.devices {
                d.drag_slot = words.next().unwrap() as i32;
            }
        }
        if version >= 6 {
            next.attack_range_offset = f32::from_bits(words.next().unwrap());
        }
        if version >= 7 {
            next.hook_alpha = f32::from_bits(words.next().unwrap());
            next.gate_amplitude = f32::from_bits(words.next().unwrap());
            next.gate_burst_y = f32::from_bits(words.next().unwrap());
            next.gate_lid_y = f32::from_bits(words.next().unwrap());
            next.gate_lid_angle = f32::from_bits(words.next().unwrap());
            next.end_fade = f32::from_bits(words.next().unwrap());
            next.end_time = f32::from_bits(words.next().unwrap());
            let burst = words.next().unwrap();
            let ready = words.next().unwrap();
            if burst > 1 || ready > 1 {
                return false;
            }
            next.gate_burst = burst != 0;
            next.gate_ready = ready != 0;
            next.ending = words.next().unwrap();
        } else {
            next.hook_alpha = if next.hook_time >= 2.7 {
                0.
            } else {
                (next.tick as f32 * 10.).min(255.)
            };
            next.gate_lid_y = 227. + next.gate_open;
            next.gate_ready = next.gate_open >= 22.;
        }
        if version >= 9 {
            for s in &mut next.smokes {
                let w = std::array::from_fn(|_| words.next().unwrap());
                let Some(loaded) = Smoke::from_words(w) else {
                    return false;
                };
                *s = loaded;
            }
        }
        if version >= 10 {
            for s in &mut next.fragments {
                let w = std::array::from_fn(|_| words.next().unwrap());
                let Some(loaded) = Fragment::from_words(w) else {
                    return false;
                };
                *s = loaded;
            }
        }
        if version >= 11 {
            for s in &mut next.smokes {
                s.vx = f32::from_bits(words.next().unwrap());
                s.vy = f32::from_bits(words.next().unwrap());
                if ![s.vx, s.vy].iter().all(|v| (-10000. ..=10000.).contains(v)) {
                    return false;
                }
            }
            for m in &mut next.missiles {
                m.smoke_timer = f32::from_bits(words.next().unwrap());
                if !(-11. ..=1.).contains(&m.smoke_timer) {
                    return false;
                }
            }
        }
        if version >= 12 {
            let broken = words.next().unwrap();
            if broken > 1 {
                return false;
            }
            next.door.broken = broken != 0;
        }
        if version >= 13 {
            if !next
                .door
                .load(std::array::from_fn(|_| words.next().unwrap()))
            {
                return false;
            }
        } else {
            // Older saves omitted impacts; retain elapsed time instead of inventing a fresh flash.
            next.door.age = next.time;
            next.door.frame_flags =
                (next.door.broken as u32) << 1 | ((next.time - DT).max(0.) < 0.1) as u32;
        }
        if version >= 14
            && !next
                .tremble
                .load(std::array::from_fn(|_| words.next().unwrap()))
        {
            return false;
        }
        if !next.valid() {
            return false;
        }
        if version >= 15 {
            if !next
                .order
                .load(std::array::from_fn(|_| words.next().unwrap()))
            {
                return false;
            }
        } else {
            // Old snapshots lack sort history; rebuild once and restart its refresh interval.
            next.rebuild_order();
            next.order.frame = next.order.entries;
        }
        if version >= 16
            && !next
                .frame
                .load(std::array::from_fn(|_| words.next().unwrap()))
        {
            return false;
        }
        if version >= 17 {
            if !next
                .frame
                .load_gate(std::array::from_fn(|_| words.next().unwrap()))
            {
                return false;
            }
        } else if next.frame.gate_unit >= 0 {
            let start = next.frame.gate_unit as usize * STRIDE;
            next.frame
                .gate_actor
                .copy_from_slice(&next.frame.actors[start..start + STRIDE]);
        }
        if version >= 18 {
            for u in &mut next.units {
                u.angle = f32::from_bits(words.next().unwrap());
                if !u.angle.is_finite() || u.angle.abs() >= 1e7 {
                    return false;
                }
            }
        } else {
            // The formerly unused direction column contained1; old saves have no rotation history.
            for row in next.frame.actors[..CAPACITY * STRIDE].chunks_exact_mut(STRIDE) {
                row[9] = 0.;
            }
            next.frame.gate_actor[9] = 0.;
        }
        if version >= 19 {
            for u in &mut next.units {
                let pose = words.next().unwrap();
                if pose > 11 {
                    return false;
                }
                u.held_pose = (pose < 11).then_some(pose);
            }
        }
        if version >= 20 {
            for d in &mut next.devices {
                d.draw_animation = f32::from_bits(words.next().unwrap());
                let pending = words.next().unwrap();
                let visible = words.next().unwrap();
                if pending > 1 || visible > 1 || !d.valid() {
                    return false;
                }
                d.timer_pending = pending != 0;
                d.draw_timer = visible != 0;
            }
        }
        next.wave_skip = if version >= 21 {
            words.next().unwrap()
        } else {
            10 - next.tick % 10
        };
        if next.wave_skip > 10 {
            return false;
        }
        for u in &mut next.units {
            // Old held saves lost recovery time; keep their pose until the scared transition.
            u.held_recovery = if version >= 22 {
                f32::from_bits(words.next().unwrap())
            } else if matches!(u.state, HELD | HOOKED) && u.pose() == 4 {
                0.2
            } else {
                0.
            };
            if !u.held_recovery.is_finite() {
                return false;
            }
        }
        // Resume without an orphaned pointer after app suspension.
        // A gate opening for its captive is autonomous, not a held touch.
        let gate_hover = next
            .devices
            .map(|d| d.kind == 3 && d.pressed && next.held < 0);
        for d in &mut next.devices {
            d.pressed = false;
        }
        next.release();
        for (d, hover) in next.devices.iter_mut().zip(gate_hover) {
            d.pressed = hover;
        }
        *self = next;
        true
    }
    pub(super) fn valid(&self) -> bool {
        if ![
            self.hook_alpha,
            self.gate_amplitude,
            self.gate_burst_y,
            self.gate_lid_y,
            self.gate_lid_angle,
            self.end_fade,
            self.end_time,
        ]
        .iter()
        .all(|x| x.is_finite())
            || !(0. ..=255.).contains(&self.hook_alpha)
            || !(0. ..=1.).contains(&self.gate_amplitude)
            || !(-1200. ..=0.).contains(&self.gate_burst_y)
            || self.gate_lid_y.abs() > 1500.
            || self.gate_lid_angle.abs() > 1.
            || !(-400. ..=255.).contains(&self.end_fade)
            || !(0. ..=10.).contains(&self.end_time)
            || self.ending > 2
        {
            return false;
        }
        if !self.config.iter().all(|x| x.is_finite())
            || !self.attack_range_offset.is_finite()
            || self.attack_range_offset.abs() > 1000.
            || self.config[0] <= 0.0
            || self.config[11] < 0.0
            || self.config[11] > 2.0
            || self.table_len == 0
            || self.table_len > CAPACITY
            || self.table.iter().any(|x| *x > 10)
            || self.status > 2
            || self.held < -1
            || self.held >= CAPACITY as i32
            || ![
                self.hp,
                self.max_hp,
                self.time,
                self.pressure,
                self.delay,
                self.spawn_timer,
                self.prefix,
            ]
            .iter()
            .all(|x| x.is_finite())
            || self.max_hp <= 0.0
            || self.max_hp > 1e6
            // Attacks continue during defeat; earlier snapshots may only carry status, not ending.
            || (self.hp < 0.0 && self.ending != 2 && self.status != 2)
            || self.time < 0.0
        {
            return false;
        }
        if ![self.hook_time, self.gate_open, self.gate_time]
            .iter()
            .all(|x| x.is_finite())
            || self.gate_unit < -1
            || self.gate_unit >= CAPACITY as i32
            || self.hook_unit < -1
            || self.hook_unit >= CAPACITY as i32
        {
            return false;
        }
        self.projectiles.iter().all(Projectile::valid)
            && self.devices.iter().all(Device::valid)
            && self.missiles.iter().all(Missile::valid)
            && self.units.iter().all(|u| {
                u.state <= CAST
                    && u.kind < 11
                    && u.freeze_time >= 0.0
                    && u.freeze_time <= 4.5
                    && u.reward <= 10000
                    && u.damage <= 10000
                    && [
                        u.x,
                        u.y,
                        u.ground,
                        u.vx,
                        u.vy,
                        u.hp,
                        u.speed,
                        u.saved_speed,
                        u.mass,
                        u.size,
                        u.clock,
                        u.animation,
                        u.target_x,
                        u.target_y,
                        u.min_y,
                        u.cooldown,
                        u.alpha,
                        u.ability_delay,
                        u.ability_time,
                        u.range,
                        u.freeze_time,
                    ]
                    .iter()
                    .all(|x| x.is_finite())
                    && (u.state == 0
                        || (u.mass > 0.0 && u.mass <= 10.0 && u.size > 0.0 && u.size <= 10.0))
            })
    }
}
