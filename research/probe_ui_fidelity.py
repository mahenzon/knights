"""Verify original purchase eligibility and recover the illustrated Help controls."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_shop import ShopProbe, SHOP
from probe_play_menu import PlayProbe, MENU


def purchases():
    p = ShopProbe()
    dialogs = []

    def dialog(u, *args):
        dialogs.append(u.reg_read(REGS[0]))
        p.ret(u)

    def no_dialog(u, *args):
        u.reg_write(REGS[0], 0)
        p.ret(u)

    p.u.hook_add(UC_HOOK_CODE, no_dialog, begin=0x33f84, end=0x33f84)
    p.u.hook_add(UC_HOOK_CODE, lambda u, *args: p.ret(u), begin=0x1cedc, end=0x1cedc)
    p.u.hook_add(UC_HOOK_CODE, dialog, begin=0x34f2c, end=0x34f2c)
    player = META['symbols']['_Player']
    items = json.loads((ROOT/'web/game-data.json').read_text())['shop']['items']
    cases = []
    for item in items:
        for scenario in ['new', 'owned', 'no_gold', 'no_sacrifices']:
            inventory = [-1] * 20
            if scenario == 'owned': inventory[item['inventoryIndex']] = item['upgradeIndex']
            gold = 0 if scenario == 'no_gold' else 100000
            souls = 0 if scenario == 'no_sacrifices' else 1000
            p.u.mem_write(player+0x8c, struct.pack('<20i', *inventory))
            p.u.mem_write(player+0x80, struct.pack('<2I', gold, souls))
            p.u.mem_write(player+0x22c, bytes(6))
            p.call(0x32cfc, [SHOP])
            p.u.mem_write(SHOP+0x20, bytes(4))
            p.call(0x32760, [SHOP, f32(0)])
            center = struct.unpack('<i', p.u.mem_read(META['symbols']['_ShopItems']+item['index']*0x164+0x14c,4))[0]
            p.u.mem_write(SHOP+0x20, struct.pack('<f',240-center))
            p.call(0x32760, [SHOP,f32(0)])
            center = struct.unpack('<i', p.u.mem_read(META['symbols']['_ShopItems']+item['index']*0x164+0x14c,4))[0]
            before = bytes(p.u.mem_read(player+0x80,92))
            dialogs.clear()
            point = SELF+0x90000
            p.u.mem_write(point,struct.pack('<2i',center,180))
            p.call(0x31e50,[SHOP,point])
            p.call(0x31e90,[SHOP,point])
            eligible = scenario != 'owned' and gold >= item['goldCost'] and souls >= item['sacrificeCost']
            assert bool(dialogs) == eligible, (item, scenario, dialogs)
            assert bytes(p.u.mem_read(player+0x80,92)) == before, 'Selection must never charge'
            cases.append({'item':item['index'],'scenario':scenario,'dialogs':dialogs[:]})
    return cases


def help_screen():
    p = PlayProbe()
    p.call(0x1fd64,[MENU])
    controls = p.controls[:]
    for ptr,name in p.surfaces.items():
        if name.startswith('help_'):p.surfaces[ptr]=name.replace('.png','.jpg')
    pages = []
    for page in range(5):
        p.call(0x1d8b4+page*20,[])
        p.trace=[]
        p.call(0x1e71c,[MENU,f32(0)])
        pages.append({'page':page,'draws':p.trace[:]})
    control = controls[0]
    surfaces = {name:ptr for ptr,name in p.surfaces.items()}
    text=SELF+0x73000
    p.u.mem_write(text,b'Exit\0')
    p.call(0x1d534,[MENU,*control['rect'][:3]],
           [control['rect'][3],control['type'],text,surfaces[control['normal']],surfaces[control['pressed']]])
    buttons=[]
    entrance=[]
    for frame in range(21):
        p.u.mem_write(MENU+6,bytes([frame==20]))
        p.trace=[]
        p.call(0x1d084,[MENU])
        if frame<20:entrance.append({'frame':frame+1,'draws':p.trace[:]})
        if frame>=19:buttons.append({'pressed':frame==20,'draws':p.trace[:]})
    return {'controls':controls,'pages':pages,'buttons':buttons,'entrance':entrance}


def hud():
    p=PlayProbe()
    p.call(0xacd4,[])
    p.u.mem_write(META['symbols']['_Land']+0x28c,struct.pack('<2f',100,100))
    p.u.mem_write(META['symbols']['_Player']+0x80,struct.pack('<2I',1234,56))
    p.trace=[]
    p.call(0x6acc,[f32(0)])
    return p.trace[:]


if __name__ == '__main__':
    result = {'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),
              'purchases':purchases(),'help':help_screen(),'hud':hud()}
    (ROOT/'research/ui-fidelity.json').write_text(json.dumps(result,indent=2)+'\n')
    print('Purchases:',len(result['purchases']),'native eligibility cases; no charge before confirmation')
    print('Help:',json.dumps(result['help']))
