#!/usr/bin/env python3
"""Campus corrections from the user (Nov 2026):
1. Building 1 (the long north wing) is not academic: it is its own building, Event Hall.
2. It is not connected to the main building (doors 3, 4, 5): remove the narrow link.
3. Remove the red ribbon path.
Removed tiles take the most common walkable surface around them."""
import json, collections, pathlib

p = pathlib.Path('src/data/campus.json')
d = json.loads(p.read_text(encoding='utf-8'))
g = [list(r) for r in d['grid']]
W, H = d['size']
walk = {k for k, v in d['legend'].items() if v['walkable']}

def fill(tiles, forbid):
    """Give each tile the most common neighbouring walkable surface (not in forbid)."""
    todo = set(tiles)
    while todo:
        done = []
        for (x, y) in todo:
            c = collections.Counter()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if (dx or dy) and 0 <= nx < W and 0 <= ny < H and (nx, ny) not in todo:
                        ch = g[ny][nx]
                        if ch in walk and ch not in forbid:
                            c[ch] += 1
            if c:
                done.append(((x, y), c.most_common(1)[0][0]))
        if not done:
            raise SystemExit(f'cannot fill {sorted(todo)[:5]}')
        for (x, y), ch in done:
            g[y][x] = ch
            todo.discard((x, y))

# 1-2. The link between the north wing (ends at row 45) and the east wing (starts at row 55).
link = [(x, y) for y in range(46, 55) for x in range(78, 83) if g[y][x] == '#']
fill(link, forbid={'a', 'r'})
# 3. The red ribbon.
ribbon = [(x, y) for y in range(H) for x in range(W) if g[y][x] == 'r']
fill(ribbon, forbid={'r', 'a', 'w'})
d['grid'] = [''.join(r) for r in g]
d['legend'].pop('r', None)

def flood(seed):
    seen, stack = set(), [tuple(seed)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H) or g[y][x] not in '#a':
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return seen

def bbox(t):
    xs, ys = [x for x, _ in t], [y for _, y in t]
    return [min(xs), min(ys), max(xs), max(ys)]

old = next(b for b in d['buildings'] if b['id'] == 'main')
event = {
    'id': 'event_hall', 'name': 'Event Hall', 'nameConfirmed': True, 'seed': [82, 35],
    'doors': [dict(old['doors'][0], leadsTo=None, part='west side')],
}
main = dict(old, name='Main academic complex: east wing, south link and west wing around the tree courtyard (name to confirm)',
            seed=[85, 60], doors=old['doors'][1:])
for b in (event, main):
    t = flood(b['seed'])
    b['bbox'], b['tiles'] = bbox(t), len(t)
    assert all(tuple(dr['at']) in t for dr in b['doors']), b['id']
assert not flood(event['seed']) & flood(main['seed']), 'still connected'
i = d['buildings'].index(old)
d['buildings'][i:i + 1] = [main, event]
# Order the keys the way the rest of the file does.
d['buildings'] = [{k: b[k] for k in ('id', 'name', 'nameConfirmed', 'seed', 'bbox', 'tiles', 'doors') if k in b} for b in d['buildings']]

# Classes are not held in Event Hall: Calculus moves to the main building's east-wing door (4),
# and Prof. Bezout waits outside it on the guide path.
for dr in main['doors']:
    if dr['part'].startswith('east wing'):
        dr['leadsTo'] = 'lecture_hall'
        front = dr['front']
for n in d['npcs']:
    if n['prof'] == 'prof_bezout':
        n['at'] = [front[0], front[1] - 2]
        assert g[n['at'][1]][n['at'][0]] in walk

d['notes'] = [n for n in d['notes'] if 'ONE building' not in n] + [
    'Nov 2026 corrections from a CAU student: the long north wing is Event Hall, a separate building, '
    'not connected to the main complex; the red ribbon path was removed. The reference plan in reference/ predates these.']
p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('link tiles removed:', len(link), '| ribbon tiles removed:', len(ribbon))
print('event_hall', event['bbox'], event['tiles'], '| main', main['bbox'], main['tiles'])
print('Bezout now at', [n for n in d['npcs'] if n['prof'] == 'prof_bezout'][0]['at'])
