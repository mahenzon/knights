const fs = require('node:fs');
const assert = require('node:assert/strict');
const createUnicorn = require('./unicorn/unicorn_arm.js');
(async () => {
 const uc = await createUnicorn();
 const e = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM);
 const meta=JSON.parse(fs.readFileSync('research/macho.json','utf8'));
 const binary=fs.readFileSync('research/Knights');
 e.mem_map(0x1000,0x1ff000,uc.PROT_ALL);e.mem_map(0x1000000,0x100000,uc.PROT_ALL);
 for(const s of meta.segments)if(s.fileSize)e.mem_write(s.address,binary.subarray(s.fileOffset,s.fileOffset+s.fileSize));
 e.reg_write_i32(uc.ARM_REG_C1_C0_2,0xf<<20);e.reg_write_i32(uc.ARM_REG_FPEXC,0x40000000);
 const ret=()=>e.reg_write_i32(uc.ARM_REG_PC,e.reg_read_i32(uc.ARM_REG_LR));
 e.hook_add(uc.HOOK_CODE,ret,{},0x2ce80,0x2ce80);
 e.hook_add(uc.HOOK_CODE,(e,address)=>{
  const name=meta.imports[Number(address)];
  if(name==='_rand')e.reg_write_i32(uc.ARM_REG_R0,123456);
  else if(name==='_strcpy'){
   const d=e.reg_read_i32(uc.ARM_REG_R0),s=e.reg_read_i32(uc.ARM_REG_R1);
   const b=e.mem_read(s,500);e.mem_write(d,b.slice(0,b.indexOf(0)+1));
  }else throw new Error('Unhandled import '+name);
  ret();
 },{},0xaa0b8,0xaa9b8);
 const call=(address,args)=>{
  e.reg_write_i32(uc.ARM_REG_SP,0x10f0000);e.reg_write_i32(uc.ARM_REG_LR,0x10ff000);
  args.forEach((v,i)=>e.reg_write_i32(uc.ARM_REG_R0+i,v));
  e.emu_start(address,0x10ff000,0,1000000);
  assert.equal(e.reg_read_i32(uc.ARM_REG_PC),0x10ff000,'instruction limit');
 };
 const start=performance.now();
 call(0x19b60,[meta.symbols._Player]);
 for(let level=0;level<3;level++)call(0x379d4,[level,0]);
 const result=Buffer.from(e.mem_read(meta.symbols._Player,0x23c));
 assert.deepEqual(result,fs.readFileSync('research/player-after-init.bin'));
 console.log('PASS: original ARM campaign initializers execute in WebAssembly; byte-identical player state to native Unicorn. Time:',(performance.now()-start).toFixed(1),'ms');
 e.close();
})().catch(error=>{console.error(String(error));process.exitCode=1});
