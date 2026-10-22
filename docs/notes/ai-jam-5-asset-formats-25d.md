---
type: note
title: "Last Ember: ground-truth formats of cave_tileset.json and all_characters_atlas_v1.json"
description: "Verified facts (python3 json + pure-python PNG decode, 2026-10-22) about the two user-supplied art files, resolving contradictory earlier explorer reports (71 vs 94 frames, ores absent, isometric)."
tags: [ai-jam-5, assets, reference, ultrathink-high, fable, reasoning]
timestamp: 2026-10-22T20:35:00+02:00
---

# Asset formats (verified)

## cave_tileset.json / .png

- PNG 512x512 RGBA8, 23 940 B, sha256 in `meta.png_sha256` = `4624a54a7de26fb7d60c2b2911e8d8ba4fab5df34ce6376f756aec50c3f06300`. `meta`: padding 2, extrude 1, filter nearest, frame_count 94. `validation` all true.
- `frames` is a dict (TexturePacker hash form): `{frame:{x,y,w,h}, rotated:false, trimmed:false, spriteSourceSize, sourceSize, anchor:[ax,ay], category, ...extras}`.
- Categories: floor 10 (`floor_0..9`, 24x24, anchor [0,0], world_step [24,24]); wall_cap 19 (`cap_00..cap_15`, `cap_fill_1..3`, 32x32); wall_face 7 (`face_fill_0..3`, `face_left`, `face_right`, `face_pillar`, 32x48, draw_offset_from_cap [0,32]); corner_cutout 4 (`inner_cutout_0..3` = NE,SE,SW,NW, operation erase_wall_alpha); corner_rim 4 (`inner_rim_0..3`, source_over); wall_composite 4 (`wall_full_0..3`, 32x80); overlay_ground 22 (`ground_pebbles_01-03`, `ground_rubble_01-03`, `ground_rock_01-02`, `ground_moss_01-02` 32x32 anchor [16,24]; `ground_vine_01` 32x32 a[16,22]; `ground_vine_02` 64x32 a[32,22]; `ground_crack_01-04` 32x32 a[16,16]; `ground_crack_large_01..06` 96x64 .. 128x96); overlay_wall 24 (`wall_vine_01-03` 32x64 a[16,32]; `wall_vine_04` 64x64 a[32,32]; `wall_roots_01-02` 32x64 a[16,32]; `wall_moss_01-03`, `wall_crack_01-03` 32x64 a[16,48]; ores `wall_{copper,sodium,strontium,resin}_01..03` 32x48 a[16,24], fields `resource`, `variant`, orientation "South only").
- `assembly`: cap_bits N1 E2 S4 W8, bit = open floor neighbour (same as `src/render/tiles.ts` mask); corner_order NE,SE,SW,NW (same as `inner`); draw_order floor → ground overlays → caps and faces → erase cutout then rim → wall overlays and south ores → actors; anchor_rule "draw position = anchor position − frame anchor"; orientation "Fixed South camera; no sprite rotation".
- Pixels: caps opaque near-black rock; open edges have a 2–3 px ragged transparent bite; `cap_04` (S open) is fully opaque because the face carries the south edge. Faces: ~8 px dark lip then lit rock; bottom row ragged. Floors are flat noisy brown with no edges, so a 24 px repeating pattern under 32 px caps is seamless.

## all_characters_atlas_v1.json / .png

- PNG 4096x2048 RGBA8, 361 072 B. `format` = `gamejam-character-atlas-v1`, frame 64x64, pivot (32,32), `direction_order` north, northeast, east, southeast, south, southwest, west, northwest. 4 characters, 33 animation sets, 1232 frames. `palette_panel_rect` {0,1760,4096,288} and label rows are opaque: only draw frame rects.
- Record: `animations[]` with `id`, `character`, `animation`, `rect` (block), `frame_count_per_direction`, `fps`, `loop`, `gameplay_frame_durations_ms`, `directions{dir:[{index, rect{x,y,w,h}, anchor, duration_ms, visible_bounds|null, pose, flame_center_anchor?}]}`, `palette_id`, `source_metadata` (torch_lit, torch_release_frame, hold_last_frame).
- Sets: player death_with_unlit_torch 6f, death_without_torch 6f, dodge_roll_no_torch 8f@10, hurt_{lit_torch_base,no_torch,unlit_torch} 2f@8, idle_{lit_torch_base,no_torch,unlit_torch} 4f@4 loop, material_change_lit_torch_base 9f@6, pickup_lit_torch_base 18f@6, run_lit_torch_base 4f@10 loop, run_without_torch 4f@10 loop, swing_lit_torch_base 4f@6, walk_lit_torch_base 4f@6 loop; devourer attack 4f [350,80,240,450] ms, death 6f, hurt 2f, idle 4f@250 ms loop, walk_backward/forward 4f@167 ms; lurker death 6f, idle 4f, sprint 4f@100 ms, walk_backward/forward 4f, look_reference 1f; stalker death 6f, hit 4f, idle 4f, leap 4f@125 ms, walk_backward/forward 4f. No walk/run with unlit torch.
- Palettes: flame_base `#e75332/#ffa43b/#ffe68a`; copper `#159447/#45d963/#c1ffb1`; sodium `#c6a008/#ffe133/#fff6b0`; strontium `#890f24/#c52236/#ff5a61`; swap exact RGB on lit player frames only, preserve alpha, nearest sampling.
- Visible bounds (south idle): player x18..45 y11..56 (feet 24 px below pivot); devourer 45x47; lurker 18x27 (y30..57); stalker 20x46 (y16..62). Flame anchor south idle ≈ (20.2, 20.8) frame-local.

## Related

- [[ADR-123-2-5d-view]] · [[architecture-assets-sprites]] · [[architecture-assets-pipeline]] · [[session-state]]
