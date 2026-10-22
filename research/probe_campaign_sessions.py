"""Full native opening sessions for every remaining castle; uses the shared battle probe."""
import hashlib
import json
from extract_enemies import IMAGE, ROOT
from probe_full_days import FullDayProbe, ACTOR_KEYS, DRAG_SCHEMA


def main():
    result = dict(binary_sha256=hashlib.sha256(IMAGE).hexdigest(),
                  actor_keys=ACTOR_KEYS, object_keys=[key for key,off,fmt in DRAG_SCHEMA],
                  cases=[], scope='Same full-day harness and limits as full-days.json. '
                  'Every castle except First Encounter, up to two complete natural days, '
                  'ending on defeat if the synthetic defender loses. Normal HP/difficulty.')
    path=ROOT/'research/campaign-sessions.json'
    for level in range(1,12):
        result['cases'].append(FullDayProbe().run('campaign',level,True,2))
        path.write_text(json.dumps(result,separators=(',',':'))+'\n')
    assert [c['level'] for c in result['cases']]==list(range(1,12))


if __name__=='__main__':main()
