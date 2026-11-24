#!/usr/bin/env python3
"""Campus correction (Nov 2026, second round): there is no walk-through archway in the main
building's south link. Its 'a' tiles become solid building, and the south-link door moves to
where the guide path meets the building, so the path ends at an entrance."""
import json, pathlib

p = pathlib.Path('src/data/campus.json')
d = json.loads(p.read_text(encoding='utf-8'))
g = [list(r) for r in d['grid']]
arch = [(x, y) for y, r in enumerate(g) for x, c in enumerate(r) if c == 'a']
for x, y in arch:
    g[y][x] = '#'
d['grid'] = [''.join(r) for r in g]
d['legend'].pop('a', None)

main = next(b for b in d['buildings'] if b['id'] == 'main')
south = next(dr for dr in main['doors'] if dr['part'] == 'south link')
# The guide path reaches the facade at x = 77 (row 77 is the tile in front of the wall).
south['at'], south['front'], south['side'] = [77, 76], [77, 77], 'south'
assert g[76][77] == '#' and g[77][77] == '=', 'door must sit on the facade with the guide path in front'
main['tiles'] += len(arch)
d['notes'] = [n for n in d['notes'] if 'archway' not in n.lower()] + [
    'Nov 2026: the inferred archway through the south link does not exist; it is solid building, '
    'and the south-link door is where the guide path meets the facade.']
p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('archway tiles closed:', len(arch), '| south door now at', south['at'])
