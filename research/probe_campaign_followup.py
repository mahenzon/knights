"""Small native fixtures for the browser's procedural-day orchestration."""
import json
import struct
from extract_campaign import Probe, ROOT, parse, EXPECTED_DAYS

def inventory_rules(image,meta):
    player=meta['symbols']['_Player'];exceptions=[];cases=0
    for difficulty in range(3):
        for castle,days in enumerate(EXPECTED_DAYS):
            p=Probe(image,meta);p.call(0x19b60,player);p.put(player+0x234,castle);p.put(player+0x70,difficulty);p.call(0x19a88,player)
            initial=list(struct.unpack('<40i',p.read(player+0x8c,160)))
            assert initial==[1 if castle==7 else 0]+[-1]*39
            assert p.integer(player+0x80)==p.integer(player+0x84)==0
            for day in range(days):
                inventory=[-1]*40
                for index,tier in [(0,3),(1,0),(2,0),(8,2),(9,2),(10,3),(11,2),(12,2)]:inventory[index]=tier
                p.u.mem_write(player+0x8c,struct.pack('<40i',*inventory));p.put(player+0x80,7777);p.put(player+0x84,777)
                p.call(0x198f0,player);p.call(0x379d4,castle,day)
                after=list(struct.unpack('<40i',p.read(player+0x8c,160)))
                expected=inventory.copy()
                if castle==7:expected[0]=1;exceptions.append({'castle':8,'day':day+1,'difficulty':difficulty,'forcedDoorTier':1})
                assert after==expected
                assert p.integer(player+0x80)==7777 and p.integer(player+0x84)==777
                cases+=1
    (ROOT/'research/campaign-inventory.json').write_text(json.dumps({'daysChecked':cases,'newGameDoorException':{'castle':8,'tier':1},'dailyInventoryOverrides':exceptions,'currenciesRetained':True},indent=2)+'\n')

def main():
    image=(ROOT/'research/Knights').read_bytes();meta=parse(image);out=[]
    for mode in ('campaign','endless','madness'):
        for difficulty in range(3):
            days=(0,2,3,9,14,29) if mode=='campaign' else (0,2,3,9,14,29,99,999,9998,9999)
            for day in days:
                for seed in (1,42):
                    p=Probe(image,meta);player=meta['symbols']['_Player'];p.call(0x19b60,player)
                    p.put(player+0x130,day+1);p.put(player+0x70,difficulty)
                    p.u.mem_write(player+0x88,bytes([mode!='campaign',mode=='madness']))
                    p.u.mem_write(player+0x238,b'\1')
                    previous=[10-i%11 for i in range(20)]
                    p.u.mem_write(player+0x184,struct.pack('<20i',*previous))
                    p.u.mem_write(player+0x178,struct.pack('<f',.073))
                    state=seed
                    def rng():
                        nonlocal state
                        state=(1103515245*state+12345)&0x7fffffff
                        return state
                    p.random_fixture=rng;p.random_values.clear();p.artefacts.clear()
                    p.call(0x379d4,9 if mode=='campaign' else 29,day)
                    result=p.capture_day(player,day)
                    keys=('dayNumber','durationSeconds','tripleSpawn','mirrorLevel','enemyTypeTable','wave','enemyModifiers','disabledShopCategories','artefactInitializers')
                    out.append({'mode':mode,'difficulty':['easy','normal','hard'][difficulty],'day':day+1,'seed':seed,'previousTable':previous,'prefixGrowth':struct.unpack('<f',struct.pack('<f',.073))[0],'randomCalls':len(p.random_values),'finalSeed':state,'config':{k:result[k] for k in keys}})
    (ROOT/'research/campaign-followup.json').write_text(json.dumps(out,indent=2)+'\n')
    inventory_rules(image,meta)
    print(f'Captured {len(out)} native procedural days across all modes and difficulties')

if __name__=='__main__':main()
