use super::*;
use crate::test_support::game;

#[test]
fn barrel_can_explode_on_ground_and_castle_in_the_same_frame() {
    let mut g = game();
    g.add_projectile(4, 400., 259., 0., 1., 1.);
    let hp = g.hp;
    g.process_projectiles(DT);
    assert!(!g.projectiles[0].active);
    assert_eq!(g.projectiles[0].y, 258.);
    assert_eq!(g.hp, hp - 25.);
    assert_eq!(
        g.audio.events.iter().filter(|&&event| event == 481).count(),
        2
    );
}
#[test]
fn entry_platform_protection_allows_charred_blast_survivors() {
    // Replayed original platform + barrel: research/probe_ipad_findings.py.
    for kind in [10, 7] {
        let mut g = game();
        g.rng = 0;
        g.delay = 9999.;
        g.spawn(kind, -50., 240., false);
        g.units[0].y = 236.;
        g.units[0].ability_delay = 99.;
        g.equip(0, 7, 0, -50., 236.);
        g.devices[0].elapsed = 0.41;
        g.step();
        let launched = g.units[0];
        assert_eq!(launched.state, FLY);
        assert!(launched.immunity);
        let mut barrel = Projectile::purchased(4, 0, launched.x.trunc(), launched.y.trunc());
        barrel.held = false;
        barrel.age = barrel.lifetime - 0.01;
        g.projectiles[0] = barrel;
        g.step();
        let burned = g.units[0];
        assert!(burned.alive() && burned.burning && !burned.immunity);
        assert_eq!(burned.hp, launched.hp);
        for _ in 0..60 {
            g.step();
        }
        assert_eq!(g.units[0].alive(), kind == 7);
        if kind == 7 {
            assert!(g.units[0].burning);
        }
    }
}
#[test]
fn fireball_upgrade_blasts_preserve_native_expiry_and_velocity() {
    for tier in 0..3 {
        let mut g = game();
        g.spawn(0, 200., 240., false);
        let mut p = Projectile::purchased(2, tier, 200., 240.);
        p.held = false;
        p.age = 3.;
        p.vx = 50.;
        p.angle = 0.7;
        g.projectiles[0] = p;
        for blast in 0..=tier {
            g.weapon_sounds = 0;
            g.process_projectiles(DT);
            let p = g.projectiles[0];
            assert_eq!(g.weapon_sounds, 1 << 8);
            assert_eq!(p.active, blast < tier);
            assert!(p.age > 3., "native reactivation retains age");
            if p.active {
                assert_eq!(p.vx, if tier == 1 { 0. } else { 50. });
                assert_eq!(p.vy, if tier == 1 { -800. } else { -600. });
                assert_eq!(p.angle, if tier == 1 { 0. } else { 0.7 });
            }
            assert_eq!(g.gold, 10, "one reward despite repeated explosions");
        }
    }
}
#[test]
fn small_fireball_reads_the_barrel_reusing_its_slot_during_knockback() {
    let mut g = game();
    g.config[11] = 1.;
    g.rng = 0;
    g.delay = 9999.;
    for (kind, x) in [(2, 200.), (2, 250.), (0, 300.), (8, 360.)] {
        g.spawn(kind, x, 240., false);
    }
    let mut p = Projectile::purchased(2, 0, 200., 240.);
    p.held = false;
    p.age = 3.;
    g.projectiles[0] = p;
    g.step();
    assert_eq!((g.gold, g.score, g.kills), (65, 130, 4));
    assert_eq!(g.projectiles[0].kind, 4);
    assert!(g.projectiles[0].active);
    assert!(g.units[..4].iter().all(|u| u.state == DEAD));
    assert_eq!(g.smokes[6].x, 209.);
    assert_eq!(g.smokes[6].y, 233.);
}

#[test]
fn freezing_bolt_preserves_native_distance_bug_and_protected_states() {
    let mut g = game();
    for (i, x) in [14399., 14400., 14401., 100., 100., 100.]
        .iter()
        .enumerate()
    {
        g.spawn(if i == 5 { 6 } else { 0 }, *x, 240., false);
        g.units[i].y = 240.;
    }
    g.units[3].state = HELD;
    g.units[4].state = FLY;
    g.units[5].shield = true;
    let mut p = Projectile::purchased(2, 3, 0., 240.);
    p.held = false;
    p.age = 3.;
    g.projectiles[0] = p;
    g.process_projectiles(DT);
    assert_eq!(
        g.units.map(|u| u.freeze_time)[..6],
        [4.5, 0., 0., 0., 0., 4.5]
    );
    assert!(!g.units[5].shield);
    assert_eq!(g.gold, 0);
    assert_eq!(g.weapon_sounds, 0);
}
#[test]
fn column_retires_after_native_two_three_four_impacts() {
    for tier in 0..3 {
        let mut g = game();
        let mut p = Projectile::purchased(1, tier, 200., 100.);
        p.held = false;
        g.projectiles[0] = p;
        for impact in 1..=tier + 2 {
            g.projectiles[0].y = 163.;
            g.projectiles[0].vy = 500.;
            g.process_projectiles(0.);
            assert_eq!(g.projectiles[0].counter, impact as i32);
            assert_eq!(g.projectiles[0].finished, impact == tier + 2);
        }
        for _ in 0..150 {
            g.process_projectiles(DT);
        }
        assert!(!g.projectiles[0].active);
    }
}
#[test]
fn purchased_pool_exhaustion_and_held_save_are_safe() {
    let mut g = game();
    for i in 0..PROJECTILES {
        assert_eq!(g.add_purchased_object(2, 0, 200., 100.), i as i32);
    }
    let pool = g.projectiles;
    assert_eq!(g.add_purchased_object(0, 0, 200., 100.), -1);
    assert_eq!(g.projectiles, pool);
    g.save();
    let mut restored = game();
    assert!(restored.load(&g.snapshot));
    for p in restored.projectiles {
        assert!(!p.held);
        assert_eq!(p.vy, 420.);
    }
}
#[test]
fn v5_extra_validation_is_atomic_and_v4_still_loads() {
    let mut g = game();
    g.add_purchased_object(2, 0, 200., 100.);
    g.release();
    g.save();
    let original = g.snapshot.clone();
    let extra = original.len()
        - (PROJECTILES * DRAG_WORDS
            + DEVICES
            + 1
            + crate::SCENE_WORDS
            + crate::SMOKES * crate::SMOKE_WORDS
            + crate::SMOKES * 2
            + crate::MISSILES
            + crate::FRAGMENTS * crate::FRAGMENT_WORDS
            + crate::DOOR_EXTRA_WORDS
            + crate::TREMBLE_WORDS
            + crate::ORDER_WORDS
            + crate::FRAME_WORDS
            + crate::STRIDE
            + 3 * CAPACITY
            + 3 * DEVICES
            + 2)
            * 4;
    for (offset, value) in [
        (extra, 4),
        (extra + 4, f32::NAN.to_bits()),
        (extra + 16, 2),
        (extra + PROJECTILES * DRAG_WORDS * 4, 30),
    ] {
        let mut bad = original.clone();
        bad[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(!g.load(&bad));
        g.save();
        assert_eq!(g.snapshot, original);
    }
    let mut old = game();
    old.end_fade = -400.; // Version 4 predates the entrance fade.
    old.add_projectile(4, 100., 100., 0., 50., 0.8);
    old.save();
    let mut v4 = old.snapshot.clone();
    v4.truncate(extra);
    v4[4..8].copy_from_slice(&4_u32.to_le_bytes());
    assert!(g.load(&v4));
    // Version 4 had no drag-slot field; the reader initializes every slot to none.
    for d in &mut old.devices {
        d.drag_slot = -1;
    }
    old.save();
    g.save();
    assert_eq!(&g.snapshot[..48248], &old.snapshot[..48248]);
    // Legacy saves reconstruct presentation order; the next periodic refresh converges.
    for _ in 0..13 {
        assert_eq!(g.step(), old.step());
    }
    old.save();
    g.save();
    assert_eq!(g.snapshot, old.snapshot);
}
#[test]
fn recovered_castle_boundaries_and_arrow_single_impact() {
    for (kind, threshold, damage) in [
        (4, 390., 25.),
        (5, 373., 15.),
        (6, 355., 2.),
        (7, 344., 20.),
    ] {
        for offset in [-1., 0., 1.] {
            let mut g = game();
            let mut p = Projectile::new(kind, threshold + offset, 100., 0.8, 123456);
            if kind == 7 {
                p.target_x = threshold;
            }
            g.projectiles[0] = p;
            g.process_projectiles(0.0);
            assert_eq!(g.hp, 100. - if offset > 0. { damage } else { 0. });
            assert_eq!(g.projectiles[0].active, offset <= 0. || kind == 7);
            if kind == 7 && offset > 0. {
                assert_eq!(g.projectiles[0].x, threshold);
                for _ in 0..30 {
                    g.process_projectiles(DT);
                }
                assert_eq!(g.hp, 100. - damage);
            }
        }
    }
}
#[test]
fn projectiles_delay_castle_damage_until_impact() {
    for (kind, damage) in [(2, 25.), (4, 15.), (5, 20.), (6, 2.)] {
        let mut g = game();
        g.spawn(kind, 100., 240., false);
        g.attack(0);
        assert_eq!(g.hp, 100.);
        for _ in 0..75 {
            g.process_projectiles(DT);
        }
        assert_eq!(g.hp, 100. - damage);
    }
}
#[test]
fn barrel_catching_pauses_age_and_drops_without_fling() {
    let mut g = game();
    g.add_projectile(4, 100., 100., 350., -200., 0.8);
    assert!(!g.pickup_projectile(120., 100.));
    assert!(g.pickup_projectile(80., 100.));
    g.drag_projectiles(180., 50.);
    for _ in 0..120 {
        g.process_projectiles(DT);
    }
    let p = g.projectiles[0];
    assert_eq!(p.age, 0.);
    assert!((p.x - 200.).abs() < 0.001);
    assert_eq!((p.vx, p.vy), (0., 0.));
    g.release();
    g.process_projectiles(DT);
    assert!(!g.projectiles[0].held);
    assert_eq!(g.projectiles[0].vx, 0.);
    assert!(g.projectiles[0].vy > 0.);
}
#[test]
fn native_bounce_expiry_and_top_exit() {
    for kind in [4, 5] {
        let mut g = game();
        g.add_projectile(kind, 100., 259., 0., 500., 0.8);
        g.process_projectiles(0.);
        assert_eq!((g.projectiles[0].y, g.projectiles[0].vy), (258., -200.));
    }
    for y in [-141., 100.] {
        let mut g = game();
        g.spawn(0, 100., 240., false);
        g.units[0].y = y;
        g.add_projectile(4, 100., y, 0., 0., 0.8);
        g.projectiles[0].age = 31.;
        g.process_projectiles(0.);
        assert_eq!(g.kills, if y < -140. { 0 } else { 1 });
    }
}
#[test]
fn splash_strict_radius_and_protected_drag() {
    let mut g = game();
    for (i, x) in [229., 230., 231., 100.].iter().enumerate() {
        g.spawn(0, *x, 240., false);
        g.units[i].y = 100.;
    }
    g.units[3].state = HELD;
    g.hit_splash(100., 100., 600, 130, false);
    assert_eq!(g.units[0].hp, 0.);
    assert_eq!(g.units[1].hp, 600.);
    assert_eq!(g.units[2].hp, 600.);
    assert_eq!(g.units[3].hp, 600.);
    g.hit_splash(100., 100., 1, 130, false);
    assert_eq!(g.kills, 1);
}
#[test]
fn native_cannon_impulse_and_no_repeat_launch() {
    let mut g = game();
    g.spawn(0, 200., 240., false);
    g.units[0].y = 240.;
    g.explode(200., 290., 1.7, 220, 0., 5.);
    assert!(g.units[0].vx.abs() < 0.0001);
    assert!((g.units[0].vy + 927.).abs() < 0.001);
    let u = g.units[0];
    g.explode(200., 290., 1.7, 220, 0., 5.);
    assert_eq!(g.units[0], u);
}
#[test]
fn barrel_drop_happens_only_once_on_pickup_or_explosion() {
    let mut g = game();
    g.spawn(2, 100., 240., false);
    assert!(g.pickup(100., g.units[0].y));
    assert_eq!(g.projectiles.iter().filter(|p| p.active).count(), 1);
    assert_eq!(g.units[0].saved_speed, 86.);
    g.release();
    g.pickup(100., g.units[0].y);
    assert_eq!(g.projectiles.iter().filter(|p| p.active).count(), 1);
    assert_eq!(g.units[0].saved_speed, 86.);
}
#[test]
fn machine_death_chain_rewards_once() {
    let mut g = game();
    for (i, (kind, x)) in [(4, 200.), (5, 250.), (0, 300.)].iter().enumerate() {
        g.spawn(*kind, *x, 200., false);
        g.units[i].y = 200.;
    }
    // Original fixture explosive_creep_chains: the knight needs the second blast.
    assert!(g.units[0].hit(301));
    g.reward(0);
    assert_eq!(g.kills, 3);
    assert_eq!(g.gold, 110);
    g.hit_splash(100., 240., 1000, 80, true);
    assert_eq!(g.gold, 110);
}
#[test]
fn snapshot_preserves_in_flight_weapons_and_rejects_invalid_projectiles() {
    let mut a = game();
    for (i, kind) in [2, 4, 5, 6].iter().enumerate() {
        a.spawn(*kind, 100., 240., false);
        a.attack(i);
    }
    for _ in 0..10 {
        a.step();
    }
    a.save();
    let mut b = game();
    assert!(b.load(&a.snapshot));
    for _ in 0..70 {
        assert_eq!(a.step(), b.step());
    }
    a.save();
    b.save();
    assert_eq!(a.snapshot, b.snapshot);
    let mut bad = b.snapshot.clone();
    let p = (2 + 12 + 9 + 7 + 5 + CAPACITY + CAPACITY * 27 + CAPACITY) * 4;
    bad[p..p + 4].copy_from_slice(&1_u32.to_le_bytes());
    bad[p + 4..p + 8].copy_from_slice(&99_u32.to_le_bytes());
    assert!(!b.load(&bad));
    b.save();
    assert_eq!(a.snapshot, b.snapshot);
}
#[test]
fn first_day_v2_saves_migrate_without_losing_progress() {
    let mut a = game();
    for _ in 0..400 {
        a.step();
    }
    a.save();
    let mut old = a.snapshot.clone();
    old.truncate((2 + 12 + 9 + 7 + 5 + CAPACITY + CAPACITY * 27) * 4);
    old[4..8].copy_from_slice(&2_u32.to_le_bytes());
    for (i, u) in a.units.iter().enumerate() {
        let offset = (235 + i * 27 + 18) * 4;
        let elapsed = u.animation / STATS[u.kind as usize][5];
        old[offset..offset + 4].copy_from_slice(&elapsed.to_le_bytes());
    }
    let mut b = game();
    assert!(b.load(&old));
    // Old saves did not store device timers; noninteractive altar/gate timers are immaterial.
    for d in &mut a.devices {
        d.elapsed = 0.;
    }
    a.save();
    b.save();
    // Version 2 has no transient ordering cache to preserve.
    let prefix = a.snapshot.len()
        - (crate::ORDER_WORDS
            + crate::FRAME_WORDS
            + crate::STRIDE
            + 3 * CAPACITY
            + 3 * DEVICES
            + 1)
            * 4;
    assert_eq!(a.snapshot[..prefix], b.snapshot[..prefix]);
}
#[test]
fn pointer_priority_matches_original_creep_then_first_barrel() {
    let mut g = game();
    g.add_projectile(4, 100., 240., 0., 0., 0.8);
    g.add_projectile(4, 100., 240., 0., 0., 0.8);
    g.spawn(0, 100., 240., false);
    assert!(g.pickup(100., 240.));
    assert_eq!(g.held, 0);
    assert!(g.projectiles.iter().all(|p| !p.held));
    g.units[0].x = 300.;
    g.release();
    assert!(g.pickup(100., 240.));
    assert!(g.projectiles[0].held);
    assert!(!g.projectiles[1].held);
}
