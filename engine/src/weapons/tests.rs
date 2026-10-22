use super::*;
use crate::test_support::game;

fn enemy(g: &mut Game, i: usize, hp: f32) {
    g.spawn(0, 200., 200., false);
    g.units[i].x = 200.;
    g.units[i].y = 200.;
    g.units[i].hp = hp;
}
#[test]
fn original_aim_cooldowns_and_single_shot_types() {
    for (kind, tier, shot, cooldown, x, y) in [
        (6, 0, 0, 15., 392., 237.),
        (6, 3, 2, 15., 392., 237.),
        (6, 6, 1, 15., 392., 237.),
        (8, 0, 3, 10., 432., 142.),
        (8, 1, 3, 8., 432., 142.),
        (8, 2, 3, 6., 432., 142.),
    ] {
        let mut g = game();
        g.devices.fill(Device::default());
        assert!(g.equip(5, kind, tier, x, y));
        let (cx, cy) = if kind == 6 {
            (x + 35., y + 17.)
        } else {
            (x, y - 36.)
        };
        assert!(!g.pickup(cx, cy));
        g.devices[5].elapsed = cooldown;
        assert!(g.pickup(cx, cy));
        g.drag(0., y);
        g.release();
        assert_eq!(g.devices[5].elapsed, 0.);
        assert_eq!(g.missiles.iter().filter(|m| m.active).count(), 1);
        let m = g.missiles[0];
        assert_eq!(m.kind, shot);
        assert_eq!(m.vx, -600.);
        assert_eq!(m.vy, 0.);
        assert_eq!(
            (m.x, m.y),
            if kind == 6 { (410., 257.) } else { (446., 92.) }
        );
        for (py, expected) in [
            (-1000., if kind == 6 { 0.45 } else { 0.85 }),
            (1000., if kind == 6 { -0.4 } else { -0.8 }),
        ] {
            g.devices[5].elapsed = cooldown;
            assert!(g.pickup(cx, cy));
            g.drag(x - 1., py);
            assert_eq!(g.devices[5].angle, expected);
            g.release();
        }
    }
}
#[test]
fn nearest_device_can_block_ready_neighbor_and_strict_press_radius() {
    let mut g = game();
    g.devices.fill(Device::default());
    g.equip(0, 6, 0, 100., 100.);
    g.equip(1, 6, 0, 120., 100.);
    g.devices[1].elapsed = 15.;
    assert!(!g.pickup(145., 117.));
    g.devices[0].elapsed = 15.;
    assert!(g.pickup(145., 117.));
    assert!(g.devices[0].pressed);
    assert!(!g.devices[1].pressed);
    g.release();
    g.devices[1].active = false;
    g.devices[0].elapsed = 15.;
    assert!(!g.pickup(185., 117.));
    assert!(g.pickup(184., 117.));
    g.release();
    g.devices[0].elapsed = 15.;
    enemy(&mut g, 0, 600.);
    g.units[0].x = 135.;
    g.units[0].y = 117.;
    assert!(g.pickup(135., 117.));
    assert_eq!(g.held, 0);
    assert!(!g.devices[0].pressed);
}
#[test]
fn column_button_recharges_and_negative_position_survives_save() {
    let mut g = game();
    g.devices.fill(Device::default());
    g.equip(0, 4, 0, 405., 38.);
    for _ in 0..25 {
        g.process_devices(DT);
    }
    assert_eq!(g.devices[0].recoil, 20);
    g.devices[0].elapsed = 31.;
    for _ in 0..40 {
        g.process_devices(DT);
    }
    assert_eq!(g.devices[0].recoil, -20);
    g.save();
    let mut restored = game();
    assert!(restored.load(&g.snapshot));
    assert_eq!(restored.devices[0].recoil, -20);
    let saved = g.snapshot.clone();
    for (kind, recoil) in [(4_u32, -21_i32), (4, 21), (6, -1)] {
        let mut bad = saved.clone();
        bad[26184..26188].copy_from_slice(&kind.to_le_bytes());
        bad[26220..26224].copy_from_slice(&recoil.to_le_bytes());
        assert!(!restored.load(&bad));
        restored.save();
        assert_eq!(restored.snapshot, saved);
    }
}
#[test]
fn ballista_draw_precedes_reload_and_ready_flash_runs_once() {
    let mut g = game();
    g.devices.fill(Device::default());
    g.equip(0, 8, 1, 432., 142.);
    g.devices[0].elapsed = 8. - DT;
    g.devices[0].timer_pending = true;
    g.process_devices(DT);
    assert!(g.devices[0].draw_timer);
    assert_eq!(g.devices[0].draw_animation, 3.);
    assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 0);
    g.process_devices(DT);
    assert!(g.devices[0].draw_timer);
    assert!(!g.devices[0].timer_pending);
    assert_eq!(g.devices[0].draw_animation, 3.);
    assert_eq!(g.devices[0].animation, 3. - 11. * DT);
    assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 3);
    g.process_devices(DT);
    assert!(!g.devices[0].draw_timer);
    assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 3);
    g.devices[0].elapsed = 0.;
    g.devices[0].animation = 0.;
    g.process_devices(DT);
    assert_eq!(g.devices[0].draw_animation, 0.);
    assert_eq!(g.devices[0].animation, 11. * DT);
}

#[test]
fn world_frame_uses_three_missile_substeps() {
    let mut g = game();
    g.delay = 9999.;
    g.spawn(0, 200., 240., false);
    g.missiles[0] = Missile::new(1, 0, 200., 244., 0., 0.);
    g.step();
    assert_eq!(g.units[0].hp, 0.);
    assert!(g.units[0].alive());
    assert_eq!(g.gold, 0);
    g.step();
    assert_eq!(g.units[0].hp, -300.);
    assert_eq!((g.gold, g.kills), (10, 1));
}

#[test]
fn native_cannon_overlap_death_order_and_piercing_repeated_hits() {
    for hp in [600., 3000.] {
        let mut g = game();
        enemy(&mut g, 0, hp);
        enemy(&mut g, 1, hp);
        g.missiles[0] = Missile::new(0, 0, 200., 200., 0., 0.);
        g.missiles[0].gravity = 0.;
        g.process_missiles(DT);
        assert_eq!(g.units[0].hp, if hp == 600. { -200. } else { 1400. });
        assert_eq!(g.units[1].hp, g.units[0].hp);
        assert_eq!(g.kills, if hp == 600. { 2 } else { 0 });
        assert!(!g.missiles[0].active);
    }
    for kind in [1, 3] {
        let mut g = game();
        enemy(&mut g, 0, 600.);
        g.missiles[0] = Missile::new(kind, 0, 200., 200., 0., 0.);
        g.missiles[0].gravity = 0.;
        g.process_missiles(DT);
        assert_eq!(g.units[0].hp, 300.);
        g.process_missiles(DT);
        assert_eq!(g.units[0].hp, 0.);
        assert!(g.units[0].alive());
        assert!(g.missiles[0].active);
    }
}
#[test]
fn all_missile_expiry_splashes_and_ground_boundaries() {
    for kind in 0..4 {
        let mut g = game();
        enemy(&mut g, 0, 1000.);
        g.missiles[0] = Missile::new(kind, 0, 200., 184., 0., 0.);
        g.missiles[0].age = g.missiles[0].lifetime;
        g.process_missiles(DT);
        assert!(!g.missiles[0].active);
        assert_eq!(g.units[0].hp, 200.);
    }
    for (kind, tier, limit) in [(0, 0, 285.), (3, 2, 270.)] {
        for offset in [0., 1.] {
            let mut g = game();
            g.missiles[0] = Missile::new(kind, tier, 200., limit + offset, 0., 0.);
            g.missiles[0].gravity = 0.;
            g.process_missiles(DT);
            assert_eq!(g.missiles[0].active, offset == 0.);
        }
    }
    let mut g = game();
    g.missiles[0] = Missile::new(3, 1, 200., 400., 0., 0.);
    g.process_missiles(DT);
    assert!(g.missiles[0].active);
}
#[test]
fn freezer_halts_knight_and_timer_waits_during_pickup_and_flight() {
    let mut g = game();
    enemy(&mut g, 0, 600.);
    g.units[0].shield = true;
    g.missiles[0] = Missile::new(2, 0, 200., 200., 0., 0.);
    g.process_missiles(DT);
    assert_eq!(g.units[0].hp, 600.);
    assert_eq!(g.units[0].freeze_time, 3.5);
    assert!(!g.units[0].shield);
    g.missiles[0].active = false;
    g.step();
    assert_eq!(g.units[0].x, 200.);
    let timer = g.units[0].freeze_time;
    assert!(g.pickup(200., 200.));
    g.step();
    assert_eq!(g.units[0].freeze_time, timer);
    g.release();
    g.step();
    assert_eq!(g.units[0].freeze_time, timer);
    g.units[0].state = WALK;
    g.units[0].freeze_time = DT / 2.;
    g.step();
    assert_eq!(g.units[0].freeze_time, 0.);
    assert!(g.units[0].x > 200.);
}
#[test]
fn platform_native_radius_interval_exploman_exclusion_and_immunity() {
    for tier in 0..2 {
        let mut g = game();
        g.equip(6, 7, tier, 200., 200.);
        for (i, kind, offset) in [(0, 0, 29.), (1, 0, 30.), (2, 2, 0.)] {
            g.spawn(kind, 200. + offset, 200., false);
            g.units[i].x = 200. + offset;
            g.units[i].y = 200.;
        }
        g.process_devices(0.4);
        assert_eq!(g.units[0].state, WALK);
        g.process_devices(0.001);
        let u = g.units[0];
        assert_eq!(u.state, FLY);
        assert!(u.immunity);
        assert_eq!(g.units[1].state, WALK);
        assert_eq!(g.units[2].state, WALK);
        let min_vx = if tier == 0 { 151. } else { 51. };
        let max_vy = if tier == 0 { -370. } else { -670. };
        assert!(u.vx >= min_vx && u.vx <= min_vx + 49.);
        assert!(u.vy <= max_vy && u.vy >= max_vy - 119.);
        g.units[0].hit(500);
        assert_eq!(g.units[0].hp, u.hp);
        assert!(!g.units[0].immunity);
        assert_eq!(g.devices[6].elapsed, 0.);
    }
}
#[test]
fn weapon_save_replay_v3_migration_and_invalid_device_are_atomic() {
    let mut a = game();
    a.equip(5, 6, 0, 392., 237.);
    a.devices[5].elapsed = 15.;
    assert!(a.pickup(427., 254.));
    a.drag(200., 240.);
    a.release();
    enemy(&mut a, 0, 600.);
    a.freeze_unit(0, 3.5);
    a.equip(6, 7, 1, 50., 200.);
    a.step();
    a.save();
    let mut b = game();
    assert!(b.load(&a.snapshot));
    for _ in 0..40 {
        assert_eq!(a.step(), b.step());
    }
    a.save();
    b.save();
    assert_eq!(a.snapshot, b.snapshot);
    let mut bad = a.snapshot.clone();
    let devices = 25380 + CAPACITY * 4;
    bad[devices + 4..devices + 8].copy_from_slice(&99_u32.to_le_bytes());
    assert!(!b.load(&bad));
    b.save();
    assert_eq!(a.snapshot, b.snapshot);
    let mut old = game();
    old.end_fade = -400.; // Version 3 predates the entrance fade.
    old.step();
    old.save();
    let mut v3 = old.snapshot[..25380].to_vec();
    v3[4..8].copy_from_slice(&3_u32.to_le_bytes());
    assert!(b.load(&v3));
    b.save();
    // Version 3 has no transient ordering cache to preserve.
    let prefix = old.snapshot.len()
        - (crate::ORDER_WORDS + crate::FRAME_WORDS + crate::STRIDE + 3 * DEVICES + CAPACITY + 1)
            * 4;
    assert_eq!(old.snapshot[..prefix], b.snapshot[..prefix]);
    assert!(!a.equip(DEVICES, 6, 0, 0., 0.));
    assert!(!a.equip(5, 6, 99, 0., 0.));
    assert!(!a.equip(5, 6, 0, f32::NAN, 0.));
}
