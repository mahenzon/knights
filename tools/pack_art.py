"""Group unchanged image bytes for fewer mobile HTTP round trips."""
import re
from pathlib import Path

DIRECT = {'Icon.png', 'menu_big_button.png'}
COMMON = set('sun.png star.png castle_1.png castle_enter_rez.png icon_gold.png icon_sacrifice.png castle_progressbar.png castle_progress_blue.png castle_progress_yellow.png castle_progress_red.png flag.png skeleton.png horse_sceleton.png catapult_sceleton.png ballista_sceleton.png barrel.png catapult_stone.png wizard_fireball.png ballista_arrow.png wizard_shield_fx.png altar_dragon.png altar_hook.png reddrake_head.png reddrake_jaw.png hole_zad.png hole_krishka.png hole_per.png'.split())


def pack_art(source, output, data):
    groups = {}
    for path in sorted(source.iterdir()):
        if path.suffix not in {'.png','.jpg'}:continue
        name=path.name
        if name in {'menu_background.png','font_interface.png','menu_big_button.png','menu_big_button_active.png','menu_music_line.png','menu_roller_music.png','menu_checkbox.png','menu_checkbox_v.png','menu_checkbox_x.png'} or re.fullmatch(r'menu_b_(play|scores|options|help|credits)\.png',name):group='menu'
        elif name.startswith('shop_') or name == 'frame_name.png':group='shop'
        elif name in data['smokeSprites'] or name in data['fragmentSprites']:group='effects'
        elif name in COMMON or name in {'bottom_podlozhka.png','pause_pass.png','pause_act.png'} or name.startswith('castle_door_'):group='common'
        elif name.startswith('help_'):group='help'
        elif name.startswith(('map_','point_','button_i_')) or name == 'mapstar.png':group='map'
        elif match:=re.match(r'(?:background_0|back_)([1-4])',name):group='land-'+match[1]
        elif match:=re.match(r'b([2-4])_cloud_',name):group='land-'+match[1]
        elif name.startswith('cloud_'):group='land-1'
        elif enemy:=next((p for p in data['enemySprites'] if name.startswith(p+'_')),None):group=enemy
        elif re.match(r'(fireball|iceball|tower_pod_fireballs)',name):group='fireball'
        elif name == 'aim_ball.png' or re.match(r'(td_ballista|tower_pod_ballista)',name):group='weapon-ballista'
        elif name.startswith('jump_platform'):group='platform'
        elif re.match(r'(tower_pod_|stone_|column|upgrade_window_|castle_window|timer|gun_|freeze_gun_|flamer_)',name):group='devices'
        else:group='extras'
        groups.setdefault(group,[]).append(path)
    index={};files=[]
    (output/'art').mkdir(exist_ok=True)
    for group,paths in groups.items():
        content=bytearray()
        for path in paths:
            pixels=path.read_bytes()
            index[path.name]=[group,len(content),len(pixels)]
            content.extend(pixels)
        name=f'art/{group}.pack';(output/name).write_bytes(content);files.append(name)
    return index,files
