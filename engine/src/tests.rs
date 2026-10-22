use super::*;
use crate::test_support::game;

#[test]
fn exact_zero_hp_survives() {
    let mut u = Unit {
        state: WALK,
        hp: 600.0,
        ..Unit::default()
    };
    assert!(!u.hit(600));
    assert_eq!(u.hp, 0.0);
    assert!(u.hit(1));
}
#[test]
fn recovery_survives_repickup_and_hooked_save_without_reusing_held_time() {
    let mut g = game();
    g.spawn(0, 100., 240., false);
    g.units[0].state = STUN;
    g.units[0].speed = 0.;
    g.units[0].clock = 0.05;
    assert!(g.pickup(100., 240.));
    g.step();
    let remaining = g.units[0].held_recovery;
    assert!(remaining > 0. && remaining < 0.05);
    g.release();
    assert!(g.pickup(g.units[0].x, g.units[0].y));
    assert_eq!(g.units[0].held_recovery, remaining);
    assert_eq!(g.units[0].clock, 0.);
    g.units[0].x = 120.;
    g.units[0].y = 75.;
    g.units[0].target_x = 120.;
    g.units[0].target_y = 45.;
    g.release();
    assert_eq!(g.units[0].state, HOOKED);
    g.save();
    let saved = g.snapshot.clone();
    let mut restored = game();
    assert!(restored.load(&saved));
    for _ in 0..9 {
        g.step();
        restored.step();
        assert_eq!(g.units[0], restored.units[0]);
    }
    g.save();
    restored.save();
    assert_eq!(g.snapshot, restored.snapshot);
    for slot in [0, CAPACITY - 1] {
        let mut bad = saved.clone();
        let offset = 62852 + slot * 4;
        bad[offset..offset + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(!restored.load(&bad));
        restored.save();
        assert_eq!(g.snapshot, restored.snapshot);
    }
    let mut old = saved[..62852].to_vec();
    old[4..8].copy_from_slice(&21_u32.to_le_bytes());
    assert!(restored.load(&old));
    assert_eq!(restored.units[0].state, HOOKED);
    assert_eq!(restored.units[0].pose(), 4);
    restored.step();
    assert_eq!(restored.units[0].pose(), 4);
    for _ in 0..8 {
        restored.step();
    }
    assert_eq!(restored.units[0].pose(), 2);
}
#[test]
fn flight_matches_original_probe() {
    let u = Unit {
        state: FLY,
        x: 100.0,
        y: 100.0,
        vx: 100.0,
        vy: -200.0,
        ground: 244.0,
        hp: 600.0,
        ..Unit::default()
    };
    let mut g = Game::default();
    g.units[0] = u;
    g.fly(0, 0.1);
    let u = g.units[0];
    assert_eq!((u.x, u.y, u.vx, u.vy), (110.0, 90.0, 100.0, -100.0));
}
#[test]
fn surviving_leftward_throw_does_not_mirror_recovered_walker() {
    let mut g = game();
    g.spawn(0, 100., 240., false);
    g.units[0].state = FLY;
    g.units[0].y = 239.;
    g.units[0].vx = -70.;
    g.units[0].vy = 100.;
    for _ in 0..120 {
        g.step();
    }
    assert_eq!(g.units[0].state, WALK);
    assert!(g.units[0].vx < 0. && g.units[0].speed > 0.);
    g.draw_ptr();
    assert_eq!(g.draw[HEADER + 9], 0.);
    g.units[0].kind = 2;
    g.units[0].speed = -100.;
    g.draw_ptr();
    assert_eq!(
        g.draw[HEADER + 9],
        0.,
        "Exploman's retreat artwork already faces left"
    );
}
#[test]
fn campaign_range_clamps_and_absent_altar_cannot_capture() {
    let mut g = game();
    g.attack_range_offset = -50.;
    g.spawn(0, 120., 240., false);
    assert_eq!(g.units[0].range, 0.);
    g.attack_range_offset = 50.;
    g.spawn(0, 200., 240., false);
    assert_eq!(g.units[1].range, STATS[0][6] + 50.);
    g.devices.fill(Device::default());
    g.units[0].y = 75.;
    assert!(g.pickup(120., 75.));
    g.units[0].target_y = 45.;
    g.release();
    assert_eq!(g.units[0].state, FLY);
    assert_eq!(g.hook_unit, -1);
    g.save();
    let mut restored = game();
    assert!(restored.load(&g.snapshot));
    assert_eq!(restored.attack_range_offset, 50.);
    let mut v5 = g.snapshot.clone();
    v5.truncate(
        v5.len()
            - (SMOKES * 2
                + MISSILES
                + FRAGMENTS * FRAGMENT_WORDS
                + SMOKES * SMOKE_WORDS
                + SCENE_WORDS
                + DOOR_EXTRA_WORDS
                + TREMBLE_WORDS
                + ORDER_WORDS
                + FRAME_WORDS
                + STRIDE
                + 3 * CAPACITY
                + 3 * DEVICES
                + 3)
                * 4,
    );
    v5[4..8].copy_from_slice(&5_u32.to_le_bytes());
    assert!(restored.load(&v5));
    assert_eq!(restored.attack_range_offset, 0.);
}
#[test]
fn clamp_precedes_gravity() {
    let u = Unit {
        state: FLY,
        y: -1000.0,
        vx: 2000.0,
        vy: 2000.0,
        ground: 244.0,
        hp: 600.0,
        ..Unit::default()
    };
    let mut g = Game::default();
    g.units[0] = u;
    g.fly(0, 0.1);
    let u = g.units[0];
    assert_eq!((u.vx, u.vy), (900.0, 1000.0));
}
#[test]
fn release_preserves_original_offset() {
    let mut u = Unit {
        state: HELD,
        x: 100.0,
        y: 244.0,
        vx: 100.0,
        vy: -100.0,
        target_x: 100.0,
        target_y: 214.0,
        ..Unit::default()
    };
    u.release();
    assert_eq!((u.vx, u.vy), (100.0, -220.0));
}
#[test]
fn off_centre_drag_uses_previous_contact_not_actor_position() {
    let mut g = game();
    g.spawn(0, 100., 240., false);
    let y = g.units[0].y;
    assert!(g.pickup(108.9, y - 12.));
    g.drag(108.9, y - 35.);
    assert_eq!(g.units[0].vx, 0.);
    assert_eq!(g.units[0].vy, -92. / 0.9);
    g.drag(117.2, y - 35.);
    assert_eq!(g.units[0].vx, 22.5 / 0.9);
}
#[test]
fn grabbing_carrier_keeps_native_first_frame_retreat() {
    let mut g = game();
    g.spawn(2, 25.450094, 216.5, false);
    g.units[0].speed = 63.;
    g.units[0].saved_speed = 63.;
    assert!(g.pickup(33., 225.));
    g.step();
    assert_eq!(g.units[0].state, HELD);
    assert_eq!(g.units[0].pose(), 8);
    assert!((g.units[0].x - 23.200062).abs() < 0.0001);
    g.step();
    assert_eq!(g.units[0].speed, 0.);
}
#[test]
fn wizard_can_attack_on_the_frame_its_shield_animation_finishes() {
    let mut g = game();
    g.spawn(6, 300., 240., false);
    let u = &mut g.units[0];
    u.state = CAST;
    u.speed = 0.;
    u.animation = data::ANIMATION_LIMITS[6][10];
    g.step();
    assert!(g.units[0].shield);
    assert_eq!(g.units[0].state, ATTACK);
    assert_eq!(g.units[0].animation, 0.);
}
#[test]
fn drop_kills_and_awards_once() {
    let mut g = game();
    g.spawn(0, 100.0, 240.0, false);
    g.units[0].state = FLY;
    g.units[0].y = -20.0;
    g.units[0].speed = 0.0;
    for _ in 0..70 {
        g.step();
    }
    assert_eq!(g.gold, 10);
    assert_eq!(g.kills, 1);
}
#[test]
fn fatal_impact_plays_death_and_surviving_impact_plays_crash() {
    for (hp, death, crash) in [(600.0, 1, 0), (1000.0, 0, 1)] {
        let mut g = game();
        g.spawn(0, 100., 240., false);
        let u = &mut g.units[0];
        u.state = FLY;
        u.y = u.ground - 1.;
        u.vy = 700.;
        u.hp = hp;
        u.speed = 0.;
        g.step();
        assert_eq!(g.sound_masks[1], death);
        assert_eq!(g.sound_masks[0], crash);
    }
}
#[test]
fn shield_blocks_pickup_but_not_damage() {
    let mut g = game();
    g.spawn(6, 100.0, 240.0, false);
    g.units[0].shield = true;
    assert!(!g.pickup(100.0, 244.0));
    assert!(g.units[0].hit(601));
}
#[test]
fn snapshot_resumes_identically_and_rejects_corruption() {
    let mut a = game();
    for _ in 0..400 {
        a.step();
    }
    a.save();
    let mut b = game();
    assert!(b.load(&a.snapshot));
    for _ in 0..300 {
        assert_eq!(a.step(), b.step());
    }
    a.save();
    b.save();
    assert_eq!(a.snapshot, b.snapshot);
    let old = b.snapshot.clone();
    let mut bad = old.clone();
    bad[0] = 0;
    assert!(!b.load(&bad));
    b.save();
    assert_eq!(b.snapshot, old);
}
#[test]
fn day_start_preserves_native_wave_countdowns() {
    let mut g = game();
    g.config[9] = 0.5;
    g.delay = -1.;
    g.step();
    assert_eq!(g.wave_skip, 10);
    assert_eq!(g.spawn_timer, 0.5);
    g.step();
    let forced = g.spawn_timer;
    g.start(73, 100., 0, 0, 0);
    assert_eq!(g.wave_skip, 9);
    assert_eq!(g.spawn_timer, forced);
    g.config[9] = -1.;
    g.step();
    assert_eq!(g.spawn_timer, forced, "Disabled countdown does not advance");
}
#[test]
fn day_finishes_after_native_transition_with_enemies_alive() {
    let mut g = game();
    // Exercise a steady-state ending independently of the entrance fade.
    g.end_fade = -400.;
    g.config[0] = 0.02;
    g.spawn(0, 100.0, 240.0, false);
    g.step();
    g.step();
    assert_eq!((g.ending, g.status), (1, 0));
    assert_eq!(g.active(), 1);
    let x = g.units[0].x;
    for _ in 0..488 {
        g.step();
    }
    assert_eq!(g.status, 0);
    assert!(g.units[0].x > x);
    g.step();
    assert_eq!(g.status, 1);
    assert_eq!(g.end_fade, 255.);
    let t = g.time;
    g.step();
    assert_eq!(g.time, t);
}
#[test]
fn defeat_damage_during_transition_can_be_saved_and_restored() {
    let mut g = game();
    g.hp = 1.;
    g.spawn(0, 290., 240., false);
    for _ in 0..600 {
        g.step();
        if g.ending == 2 && g.hp < 0. {
            break;
        }
    }
    assert_eq!((g.ending, g.status), (2, 0));
    assert!(
        g.hp < 0.,
        "enemies keep attacking during the defeat transition"
    );
    g.save();
    let mut restored = game();
    assert!(restored.load(&g.snapshot));
    while g.status == 0 {
        g.step();
        restored.step();
    }
    assert_eq!(g.status, 2);
    g.save();
    restored.save();
    assert_eq!(g.snapshot, restored.snapshot);
    assert!(restored.load(&g.snapshot), "terminal defeat also reloads");

    let mut invalid = game();
    invalid.hp = -1.;
    invalid.save();
    assert!(
        !restored.load(&invalid.snapshot),
        "a live battle cannot have negative health"
    );
    invalid.ending = 1;
    invalid.status = 1;
    invalid.save();
    assert!(
        !restored.load(&invalid.snapshot),
        "victory cannot have negative health"
    );
}
#[test]
fn knight_picked_up_after_victory_can_still_be_sacrificed() {
    let mut g = game();
    g.end_fade = -400.; // This fixture starts after the entrance fade.
    g.config[0] = 0.02;
    g.spawn(0, 180., 240., false);
    for _ in 0..90 {
        g.step();
    }
    assert_eq!((g.ending, g.status, g.sacrifices), (1, 0, 0));
    assert!(g.pickup(g.units[0].x, g.units[0].y));
    g.drag(120., 45.);
    for _ in 0..60 {
        g.step();
    }
    g.release();
    assert_eq!(g.units[0].state, HOOKED);
    while g.status == 0 {
        g.step();
    }
    assert_eq!((g.status, g.sacrifices, g.gold), (1, 1, 0));
}
#[test]
fn last_second_sacrifices_finish_and_survive_save() {
    for gate in [false, true] {
        let mut g = game();
        g.end_fade = -400.; // This fixture starts just before a normal day ends.
        g.config[0] = 1.;
        g.time = 0.99;
        g.spawn(0, if gate { 233. } else { 120. }, 240., false);
        if gate {
            g.units[0].y = 130.;
            g.gate_open = 22.;
            g.gate_ready = true;
            assert!(g.pickup(233., 130.));
            g.drag(233., 100.);
        } else {
            g.units[0].y = 75.;
            assert!(g.pickup(120., 75.));
            g.units[0].target_y = 45.;
        }
        g.release();
        g.step();
        assert_eq!((g.status, g.ending, g.sacrifices), (0, 1, 0));
        g.save();
        let mut restored = game();
        assert!(restored.load(&g.snapshot));
        for _ in 0..489 {
            assert_eq!(g.step(), restored.step());
        }
        assert_eq!((g.status, g.sacrifices, g.gold), (1, 1, 0));
        g.save();
        restored.save();
        assert_eq!(g.snapshot, restored.snapshot);
    }
}
#[test]
fn altar_awards_sacrifice_without_kill_gold() {
    let mut g = game();
    g.spawn(0, 120.0, 240.0, false);
    g.units[0].y = 75.0;
    assert!(g.pickup(120.0, 75.0));
    g.units[0].target_y = 45.0;
    g.release();
    assert_eq!(g.units[0].state, HOOKED);
    for _ in 0..156 {
        g.step();
    }
    assert_eq!(g.sacrifices, 0);
    g.step();
    assert_eq!(g.sacrifices, 1);
    assert_eq!((g.gold, g.score, g.kills), (0, 0, 0));
}
#[test]
fn landed_skeleton_keeps_its_last_animation_frame() {
    let mut g = game();
    g.delay = 9999.;
    g.spawn(1, 200., 264., false);
    g.units[0].y = 264.;
    g.units[0].state = EJECTED;
    g.units[0].shield = true;
    g.units[0].speed = 0.;
    g.units[0].ground = 265.;
    g.units[0].vy = 100.;
    g.units[0].animation = 0.5;
    g.step();
    assert_eq!(g.units[0].y, 265.);
    let landed = g.units[0];
    assert!(landed.animation > 0.5);
    g.step();
    assert_eq!(g.units[0].animation, landed.animation);
    assert_eq!(g.units[0].cooldown, landed.cooldown);
    assert!(g.units[0].alpha < landed.alpha);
}
#[test]
fn hell_gate_requires_hover_and_digestion() {
    let mut g = game();
    g.spawn(0, 233.0, 240.0, false);
    g.units[0].y = 130.0;
    assert!(g.pickup(233.0, 130.0));
    g.drag(233., 100.);
    for _ in 0..26 {
        g.step();
    }
    assert!(g.gate_open < 22.0);
    g.step();
    assert_eq!(g.gate_open, 22.0);
    g.release();
    assert_eq!(g.units[0].state, SACRIFICE);
    for _ in 0..331 {
        g.step();
    }
    assert_eq!(g.sacrifices, 0);
    for _ in 0..3 {
        g.step();
    }
    assert_eq!(g.sacrifices, 1);
    assert_eq!((g.gold, g.score), (0, 0));
    assert_eq!(g.units[0].state, EJECTED);
}
#[test]
fn breached_door_moves_dying_actors_until_their_fade() {
    let mut g = game();
    g.delay = 9999.;
    g.spawn(8, 230., 251., false);
    assert!(g.units[0].hit(10000));
    g.reward(0);
    g.door.broken = true;
    g.step();
    let x = g.units[0].x;
    g.step();
    assert_eq!(g.units[0].x, x + 100. * DT);
    g.units[0].animation = data::ANIMATION_LIMITS[8][6].trunc();
    let x = g.units[0].x;
    g.step();
    assert_eq!(g.units[0].x, x);
    assert!(g.units[0].alpha < 1.);
}
#[test]
fn airborne_death_lands_and_repeats_native_reward_without_wall_sticking() {
    let mut g = game();
    g.spawn(0, 200., 240., false);
    let u = &mut g.units[0];
    u.state = FLY;
    u.y = 100.;
    u.vx = 120.;
    u.vy = -250.;
    assert!(u.hit(10000));
    assert!(u.corpse_flying);
    g.reward(0);
    for _ in 0..50 {
        g.step();
    }
    assert_eq!((g.gold, g.kills), (20, 2));
    assert_eq!(g.units[0].state, DEAD);
    assert!(!g.units[0].corpse_flying);
    for _ in 0..48 {
        g.step();
    }
    assert_eq!(g.units[0].state, 0);

    let mut g = game();
    g.spawn(0, 345., 240., false);
    let u = &mut g.units[0];
    u.state = FLY;
    u.y = 100.;
    u.vx = 600.;
    u.hp = 1.;
    g.step();
    assert_eq!((g.units[0].vx, g.units[0].vy), (-70., 0.));
    assert!(g.units[0].corpse_flying);
    assert_eq!(g.gold, 10);
    g.step();
    assert_eq!(
        g.gold, 10,
        "The fatal wall hit must not recur on the next tick"
    );
}
#[test]
fn explosive_knight_leaves_effects_without_a_corpse() {
    let mut g = game();
    g.spawn(10, 200., 240., false);
    assert!(g.units[0].hit(10000));
    g.reward(0);
    assert_eq!((g.units[0].state, g.kills, g.gold), (0, 1, 50));
    assert_eq!(g.smokes.iter().filter(|s| s.active).count(), 4);
}
#[test]
fn hell_gate_skeleton_keeps_its_pose_after_landing() {
    let mut g = game();
    g.delay = 9999.;
    g.spawn(0, 150., 265., false);
    let u = &mut g.units[0];
    u.state = EJECTED;
    u.y = 264.;
    u.ground = 265.;
    u.vx = -56.;
    u.vy = 739.;
    u.alpha = 655. / 255.;
    g.step();
    assert_eq!(g.units[0].state, EJECTED);
    assert_eq!(g.units[0].pose(), 5);
    assert_eq!(g.units[0].y, 265.);
    let x = g.units[0].x;
    for _ in 0..87 {
        g.step();
        assert_eq!(g.units[0].state, EJECTED);
        assert_eq!(g.units[0].x, x);
    }
    g.step();
    assert_eq!(g.units[0].state, 0);
    assert_eq!((g.gold, g.score, g.kills), (0, 0, 0));
}
