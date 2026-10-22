// Representative fixed-step simulation, not recovered game logic.
#[derive(Clone, Copy)]
#[repr(C)]
struct Body { x: f64, y: f64, vx: f64, vy: f64, hp: f64, cooldown: f64 }
static mut BODIES: [Body; 512] = [Body{x:0.,y:0.,vx:0.,vy:0.,hp:0.,cooldown:0.};512];
static mut COUNT: usize = 0;
static mut TICK: u32 = 0;
fn random(seed: &mut u32) -> f64 {
    *seed ^= *seed << 13; *seed ^= *seed >> 17; *seed ^= *seed << 5;
    f64::from(*seed)/4294967296.
}
#[no_mangle]
pub unsafe extern "C" fn reset(count: usize, seed: u32) {
    COUNT=count.min(512); TICK=0; let mut seed=seed;
    for i in 0..COUNT { BODIES[i]=Body{x:random(&mut seed)*480.,y:random(&mut seed)*240.,vx:20.+random(&mut seed)*70.,vy:-random(&mut seed)*200.,hp:600.,cooldown:random(&mut seed)}; }
}
#[no_mangle]
pub unsafe extern "C" fn step(frames: u32) -> f64 {
    let dt=1./60.;
    for _ in 0..frames {
        TICK=TICK.wrapping_add(1);
        for i in 0..COUNT {
            let b=&mut BODIES[i];
            b.cooldown-=dt; b.x+=b.vx*dt; b.y+=b.vy*dt;
            if b.y<260. { b.vy+=900.*dt; }
            else { b.hp-=b.vy.abs()*0.7; b.y=260.; b.vy=0.; }
            if b.x>390. && b.cooldown<=0. { b.hp-=2.;b.cooldown=0.7;b.vx=0.; }
            if TICK.wrapping_add(i as u32)%97==0 { b.vy=-350.;b.vx=-50.; }
            if b.hp<0. || b.x< -80. {b.hp=600.;b.x=0.;b.y=260.;b.vx=40.;}
        }
        // A small area-effect workload: collision and damage within 32 moving blasts.
        for j in 0..32 {
            let x=f64::from((TICK.wrapping_mul(3).wrapping_add(j*31))%480);
            let y=f64::from(180+j%80);
            for i in 0..COUNT { let b=&mut BODIES[i];let dx=b.x-x;let dy=b.y-y;if dx*dx+dy*dy<400. {b.hp-=dt*4.;} }
        }
    }
    let mut sum=0.;for i in 0..COUNT { let b=BODIES[i];sum+=b.x+b.y+b.hp+b.vx+b.vy+b.cooldown; }sum
}
#[no_mangle]
pub unsafe extern "C" fn state_ptr() -> *const f64 { std::ptr::addr_of!(BODIES).cast() }
