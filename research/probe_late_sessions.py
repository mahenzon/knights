"""Native late-day battles; shared full-day harness, explicitly skipped preceding gameplay."""
import hashlib
import json
from extract_enemies import IMAGE, ROOT
from extract_campaign import EXPECTED_DAYS
from probe_full_days import FullDayProbe, ACTOR_KEYS, DRAG_SCHEMA


def main():
    targets = [('campaign', level, day) for level, day in enumerate(EXPECTED_DAYS)]
    targets += [(mode, 0, day) for mode in ('endless', 'madness') for day in (100, 10000)]
    result = dict(binary_sha256=hashlib.sha256(IMAGE).hexdigest(),
                  actor_keys=ACTOR_KEYS, object_keys=[key for key, off, fmt in DRAG_SCHEMA],
                  cases=[], scope='Same full-day harness and limits as full-days.json. '
                  'Run every earlier campaign day setup without playing; for Endless/Madness '
                  'initialize day1 and set the preceding day counter. Then execute '
                  'one complete late battle until natural result. Normal HP/difficulty and '
                  'starting inventory; synthetic defender. Not a full campaign playthrough.')
    for mode, level, day in targets:
        result['cases'].append(FullDayProbe().run(mode, level, True, 1, day))
        (ROOT / 'research/late-sessions.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    assert [(c['mode'], c['level'], c['start_day']) for c in result['cases']] == targets


if __name__ == '__main__':
    main()
