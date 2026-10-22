"""Complete Easy/Hard native battles, using the existing bounded original-game harness."""
import hashlib
import json

from extract_enemies import IMAGE, ROOT
from extract_campaign import EXPECTED_DAYS
from probe_full_days import FullDayProbe, ACTOR_KEYS, DRAG_SCHEMA


def main():
    result = {
        'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
        'actor_keys': ACTOR_KEYS,
        'object_keys': [key for key, _, _ in DRAG_SCHEMA],
        'cases': [],
        'scope': 'Original full-day callbacks on Easy and Hard: two opening First Encounter '
                 'days and the final day of every castle. Ordinary starting equipment/HP. '
                 'Earlier late-castle setup is executed, its gameplay is skipped. '
                 'Synthetic ten-tick on-screen defender; no human balance proof. '
                 'Other full-days.json library, rendering, audio and menu-dwell limits apply.',
    }
    targets = [(0, 2, 1)] + [(level, 1, day) for level, day in enumerate(EXPECTED_DAYS)]
    partial = ROOT / 'research/difficulty-days.partial.json'
    for difficulty in (0, 2):
        for level, day_count, start_day in targets:
            case = FullDayProbe().run('campaign', level, True, day_count,
                                      start_day=start_day, difficulty=difficulty)
            assert all(day['initial']['config'][11] == difficulty for day in case['days'])
            result['cases'].append(case)
            partial.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    assert len(result['cases']) == 2 * len(targets)
    partial.replace(ROOT / 'research/difficulty-days.json')


if __name__ == '__main__':
    main()
