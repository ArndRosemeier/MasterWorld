# Water flow check, PR #182 (7bacf9e) vs main (5bc4c52), WebGPU RTX 5070, 1280x800

Queries add `&hud&title=0&day=0`; `c*` shots also `&weather=clear` (the plain shots fell in rain).

| file | query |
|---|---|
| 1-/c1-river-20m-ne | `?fly&pos=-30450,58,34320&look=35,-20&hour=11` |
| 1-/c1-river-20m-sw | `?fly&pos=-30350,58,34160&look=215,-20&hour=11` |
| 2-/c2-river-bank-hero | `?pos=-30410,34231&look=55,-15&hour=11` (river flows ~42 deg, slope 0.0027) |
| 2-/c2-river-bank-hero-across | `?pos=-30410,34231&look=110,-15&hour=11` |
| 3-/c3-brookB-ground | `?pos=-29643,33865&look=180,-25&hour=11` |
| 3-/c3-steep-brook-6m | `?pos=-30663,34657&look=320,-25&hour=11` (brook slope 0.046, flows ~12 deg) |
| 3-/c3-steep-brook-2-6m | `?pos=-30714,34759&look=250,-25&hour=11` (slope 0.043) |
| 4-sea-beach | `?fly&pos=-33540,4,29800&look=150,-4&hour=15` |
| 5-/c5-river-mouth | `?fly&pos=-27235,22,31185&look=53,-20&hour=11` (town river reaches the sea near -27057,31047) |
| c5-river-mouth-top | `?fly&pos=-27080,120,31060&look=53,-89&hour=11` |
| 6-/c6-motion-* | 10 frames ~365 ms apart; motion/c7-* 12 frames ~250 ms apart (times in log.json) |

main/ = same views on main. compare/ = main left, PR right. experiment/ = PR with the ripple `If/Else` replaced by a plain `mix` (noIf.patch).
