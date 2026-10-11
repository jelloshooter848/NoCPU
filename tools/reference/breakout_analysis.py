# SPDX-License-Identifier: GPL-3.0-or-later
"""Finite Breakout behavior gates from independently captured original RGB.

The source circuit rotates the original display clockwise and applies five
multiplicative overlays. The red-only observation raster is not a color oracle.
Threshold-named PPMs are bound to the frame actually emitted by each adapter.
"""
import array
import hashlib
import json
import statistics
import sys

WIDTH, HEIGHT = 324, 432
WHITE = (204, 204, 204)
BLUE = (10, 133, 194)
BRICK_COLORS = {(163, 30, 10), (194, 133, 10), (10, 133, 51), (194, 194, 41)}
# The adapters emit at most one requested snapshot per frame, in this order.
SNAPSHOTS_MS = (250, 399, 633, 799, 866, 999, 1000, 1132, 1166, 1232, 1316, 1382,
                1500, 1800, 2000, 2100, 2200, 2250, 2300, 2400, 2500, 2600, 2700,
                2750, 3000, 3200, 3250, 3300, 3400, 3500, 3600, 3700, 3750, 3800,
                3900, 4000, 4250, 4500, 4750, 5000, 5250, 5500, 5750, 6000, 6500,
                7500, 8000, 8500, 9000, 9500, 10000, 10500, 11000, 11500, 12000,
                13000, 15000, 20000, 30000, 45000, 60000, 80000, 110000, 130000, 170000)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(pixels):
    """Four-neighbor components of exact full-resolution source-color pixels."""
    remaining, result = set(pixels), []
    while remaining:
        first = remaining.pop()
        pending, part = [first], [first]
        while pending:
            x, y = pending.pop()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    pending.append(neighbor)
                    part.append(neighbor)
        xs, ys = [p[0] for p in part], [p[1] for p in part]
        result.append({'x': statistics.mean(xs), 'y': statistics.mean(ys),
                       'width': max(xs) - min(xs) + 1, 'height': max(ys) - min(ys) + 1,
                       'area': len(part), 'x_bounds': [min(xs), max(xs)], 'y_bounds': [min(ys), max(ys)]})
    return result


def image_rgb(path):
    header, dimensions, maximum, rgb = path.read_bytes().split(b'\n', 3)
    if header != b'P6' or dimensions != b'324 432' or maximum != b'255' or len(rgb) != WIDTH * HEIGHT * 3:
        raise ValueError('Malformed actual clockwise portrait full-color snapshot')
    return rgb


def image_pixels(path):
    rgb = image_rgb(path)
    return {(i % WIDTH, i // WIDTH): tuple(rgb[i * 3:i * 3 + 3]) for i in range(WIDTH * HEIGHT)}


def bottom_up_fnv(rgb):
    value, stride = 14695981039346656037, WIDTH * 3
    for y in range(HEIGHT - 1, -1, -1):
        for byte in rgb[y * stride:(y + 1) * stride]:
            value = ((value ^ byte) * 1099511628211) & ((1 << 64) - 1)
    return value


def snapshot_positions(path, read_rows):
    frames = read_rows(path / 'frames.csv')
    emitted, index = {}, 0
    for frame_index, frame in enumerate(frames):
        if frame['frame'] != str(frame_index):
            raise ValueError('Missing/duplicate/noncanonical frame index in snapshot binding')
        at = int(frame['time_ps'])
        if index < len(SNAPSHOTS_MS) and at >= SNAPSHOTS_MS[index] * 10**9:
            emitted[SNAPSHOTS_MS[index]] = frame
            index += 1
    actual = {}
    for image in path.glob('*ms.ppm'):
        milliseconds = int(image.stem[:-2])
        if image.name != f'{milliseconds}ms.ppm' or milliseconds in actual:
            raise ValueError('Duplicate/noncanonical source snapshot name')
        actual[milliseconds] = image
    if set(actual) != set(emitted):
        raise ValueError('Selected snapshot set does not match actual adapter frame presentation')
    observations = []
    for milliseconds in sorted(actual):
        image = actual[milliseconds]
        frame = emitted[milliseconds]
        fnv = bottom_up_fnv(image_rgb(image))
        if str(fnv) != frame['fnv1a64']:
            raise ValueError(f'Snapshot RGB bytes differ from actual frame {frame["frame"]} at {frame["time_ps"]}ps')
        pixels = image_pixels(image)
        # Original side wall occupies x0..4 and x293..297. Keep real endpoint
        # clipping while isolating the seven-row paddle from a disconnected ball.
        paddles = [p for p in components({xy for xy, color in pixels.items()
                                         if 5 <= xy[0] <= 292 and 382 <= xy[1] <= 388 and color == BLUE})
                   if p['height'] == 7 and 1 <= p['width'] <= 20]
        balls = [p for p in components({xy for xy, color in pixels.items()
                                       if 6 <= xy[0] <= 289 and 174 <= xy[1] <= 407 and color == WHITE})
                 if 3 <= p['width'] <= 6 and 3 <= p['height'] <= 5]
        bricks = {xy for xy, color in pixels.items()
                  if 5 <= xy[0] <= 292 and 116 <= xy[1] <= 171 and color in BRICK_COLORS}
        observations.append({'requested_ms': milliseconds, 'time_ps': int(frame['time_ps']),
                             'frame': int(frame['frame']), 'bottom_up_RGB_fnv1a64': str(fnv),
                             'image': image.name, 'sha256': digest(image),
                             'paddle': paddles[0] if len(paddles) == 1 else None,
                             'ball': balls[0] if len(balls) == 1 else None,
                             'brick_pixels': len(bricks),
                             'palette': [list(color) for color in sorted(set(pixels.values()))]})
    (path / 'snapshot-positions.json').write_text(json.dumps(observations, indent=2) + '\n')
    return observations


def at_snapshot(rows, milliseconds):
    matches = [row for row in rows if row['requested_ms'] == milliseconds]
    if len(matches) != 1:
        raise ValueError(f'Missing/duplicate full-color source snapshot at {milliseconds}ms')
    return matches[0]


def active_at(telemetry, time):
    previous = [row for row in telemetry if int(row['time_ps']) <= time]
    return bool(previous) and previous[-1]['active'] == '1'


def active_through(telemetry, begin, end):
    return active_at(telemetry, begin) and all(row['active'] == '1' for row in telemetry
                                              if begin <= int(row['time_ps']) <= end)


def event_groups(events, signal, value, gap_ps=10**9):
    groups = []
    for row in events:
        if int(row['signal']) != signal or int(row['value']) != value:
            continue
        time = int(row['time_ps'])
        if not groups or time - groups[-1][-1] > gap_ps:
            groups.append([])
        groups[-1].append(time)
    return groups


def analyze_epoch(path, scenario, common, *, original=False):
    pong, media = common.pong, common.game_media
    configuration = json.loads((path.parent / 'configuration.json').read_text())
    expected = {'game': 'breakout', 'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']}
    configuration_matches = configuration == expected and all(type(configuration.get(k)) is type(v) for k, v in expected.items())
    switches_path = path.parent / 'breakout-switches.json'
    switches = json.loads(switches_path.read_text()) if switches_path.exists() else None
    expected_switches = {'bonus_credit': scenario['dip'] & 15, 'cabinet_type': (scenario['dip'] >> 4) & 1,
                         'coinage': (scenario['dip'] >> 5) & 1, 'ball_count': (scenario['dip'] >> 6) & 1}
    replay = pong.read_replay(common.ROOT / scenario['replay'])
    duration = replay[-1][0]
    telemetry, inputs, events, frames = [pong.read_rows(path / name) for name in ('telemetry.csv', 'inputs.csv', 'events.csv', 'frames.csv')]
    if not telemetry or not inputs or not frames:
        raise ValueError('Missing actual Breakout state/input/frame evidence')
    if len((path / 'frames.gray').read_bytes()) != len(frames) * 160 * 120:
        raise ValueError('Incomplete red-only observation raster')
    pcm_bytes = (path / 'audio.s16le').read_bytes()
    if len(pcm_bytes) % 2:
        raise ValueError('Odd signed-16 PCM byte count')
    pcm = array.array('h', pcm_bytes)
    if sys.byteorder != 'little':
        pcm.byteswap()
    coverage = media.media_coverage(frames, len(pcm), duration, 'breakout', pcm_byte_count=len(pcm_bytes),
                                    scenario=scenario if configuration_matches else None,
                                    replay=replay if configuration_matches else None)
    snapshots = snapshot_positions(path, pong.read_rows)
    skews = [int(row['applied_ps']) - int(row['requested_ps']) for row in inputs]
    valid_events = all(int(row['signal']) in range(100, 106) and int(row['value']) in (0, 1) for row in events)
    ordered_events = all(int(a['time_ps']) <= int(b['time_ps']) for a, b in zip(events, events[1:]))
    checks = {'selected_game_configuration_matches_capture': configuration_matches,
              'source_activity_matches_raw_attract_n': all(row['active'] == row['attract_n'] for row in telemetry),
              'recorded_inputs_match_declared_replay': pong.validate_recorded_inputs(inputs, replay),
              'input_schedule_skew_bounded': bool(skews) and min(skews) >= 0 and max(skews) < 10**7,
              'full_scenario_completed': int(telemetry[-1]['time_ps']) >= duration and inputs[-1]['action'] == 'recreate',
              'source_event_names_polarities_and_order': valid_events and ordered_events,
              'not_active_before_explicit_inputs': not active_at(telemetry, 150 * 10**9),
              'original_portrait_color_snapshots_present': bool(snapshots),
              'bonus_award_scope_explicitly_unexercised': scenario.get('bonus_award_exercised') is False}
    checks.update(coverage['checks'])
    if original or switches is not None:
        checks['four_original_named_DIP_readbacks_match_packed_options'] = switches == expected_switches and all(
            type(switches.get(key)) is int for key in expected_switches)
    expected_active = scenario['expected_active']
    checks['explicit_start_credit_result_matches_original'] = active_at(telemetry, 1500 * 10**9) is expected_active
    pcm_context = common.active_pcm(pcm, telemetry)
    if expected_active:
        checks['nontrivial_pcm_during_source_active_gameplay'] = any(
            row['samples'] >= 48000 and row['maximum'] - row['minimum'] > 500 and row['transitions'] > 100 for row in pcm_context)
        serve = [int(row['time_ps']) for row in events if row['signal'] == '103' and row['value'] == '0']
        checks['held_serve_and_authentic_delayed_startup_release'] = any(action == 'serve' and value == 1 for _, action, value in replay) \
            and bool(serve) and 3300 * 10**9 <= serve[0] < 3302 * 10**9
    else:
        checks['insufficient_credit_start2_never_activates'] = all(row['active'] == '0' for row in telemetry)
    kind, observations = scenario['kind'], {}
    if kind == 'controls':
        middle, left, right = [at_snapshot(snapshots, ms) for ms in (2100, 2750, 3500)]
        poses = [row['paddle'] for row in (middle, left, right)]
        checks['shared_horizontal_axis_sign_and_rendered_motion'] = None not in poses and poses[1]['x'] < poses[0]['x'] - 70 \
            and poses[2]['x'] > poses[0]['x'] + 70 and active_through(telemetry, middle['time_ps'], right['time_ps'])
        if scenario['dip'] == 112:
            checks['actual_asymmetric_endpoint_clipping_preserved'] = None not in poses and poses[1]['x_bounds'] == [5, 9] \
                and poses[2]['x_bounds'] == [274, 292]
        palette = {tuple(color) for color in right['palette']}
        checks['five_multiplicative_original_overlay_colors'] = BRICK_COLORS | {BLUE} <= palette
        observations['controls'] = {'middle': middle, 'left': left, 'right': right}
    if kind == 'rally':
        groups = [group for group in event_groups(events, 101, 0) if group[0] > 3300 * 10**9
                  and active_through(telemetry, group[0] - 2 * 10**9, group[-1] + 2 * 10**9)]
        before, near, after, later = [at_snapshot(snapshots, ms) for ms in (3750, 4250, 4500, 5000)]
        poses = [row['ball'] for row in (before, near, after, later)]
        contact = groups[0] if groups else []
        checks['genuine_active_paddle_contact_group'] = bool(contact) and near['time_ps'] < contact[0] < after['time_ps']
        checks['actual_ball_reverses_at_active_paddle_contact'] = None not in poses and poses[1]['y'] > poses[0]['y'] + 40 \
            and poses[3]['y'] < poses[2]['y'] - 40 and active_through(telemetry, before['time_ps'], later['time_ps'])
        brick_events = [int(row['time_ps']) for row in events if row['signal'] == '100' and row['value'] == '1'
                        and contact and int(row['time_ps']) > contact[-1] and active_at(telemetry, int(row['time_ps']))]
        pre, post = [at_snapshot(snapshots, ms) for ms in (6000, 6500)]
        brick_time = brick_events[0] if brick_events else None
        prior_scores = [row for row in telemetry if brick_time is not None and int(row['time_ps']) <= brick_time
                        and row['active'] == '1']
        prior_score = int(prior_scores[-1]['score1']) if prior_scores else None
        score_rows = [row for row in telemetry if brick_time is not None and brick_time <= int(row['time_ps']) <= brick_time + 2 * 10**9
                      and row['active'] == '1' and prior_score is not None and int(row['score1']) > prior_score]
        checks['active_brick_contact_and_nonstartup_score_progression'] = brick_time is not None \
            and pre['time_ps'] < brick_time < post['time_ps'] and bool(score_rows)
        pre_pixels, post_pixels = image_pixels(path / pre['image']), image_pixels(path / post['image'])
        removed = {xy for xy, color in pre_pixels.items() if 5 <= xy[0] <= 292 and 116 <= xy[1] <= 171
                   and color in BRICK_COLORS and post_pixels[xy] == (0, 0, 0)}
        added = {xy for xy, color in post_pixels.items() if 5 <= xy[0] <= 292 and 116 <= xy[1] <= 171
                 and color in BRICK_COLORS and pre_pixels[xy] == (0, 0, 0)}
        checks['actual_play_removes_source_brick_pixels'] = removed == {(x, y) for x in range(191, 209) for y in range(166, 171)} \
            and not added and pre['brick_pixels'] - post['brick_pixels'] == 90 \
            and active_through(telemetry, pre['time_ps'], post['time_ps'])
        earlier = at_snapshot(snapshots, 5750)
        checks['actual_ball_reverses_at_active_brick_contact'] = all(row['ball'] is not None for row in (earlier, pre, post)) \
            and earlier['ball']['y'] > pre['ball']['y'] + 20 and post['ball']['y'] > pre['ball']['y'] + 5
        observations['played_contacts'] = {'paddle_group_ps': contact, 'group_is_one_contact_observation': True,
                                           'brick_rise_ps': brick_time, 'prior_active_score1': prior_score, 'score_rows': score_rows,
                                           'removed_brick_pixels': len(removed), 'before': pre, 'after': post}
    if kind == 'end_restart':
        active_edges = [(int(row['time_ps']), int(row['value'])) for row in events if row['signal'] == '105']
        endings = [at for at, value in active_edges if value == 0 and at > 1500 * 10**9]
        begin, end = [ms * 10**9 for ms in scenario['end_window_ms']]
        restarts = [at for at, value in active_edges if value == 1 and at >= scenario['restart_ms'] * 10**9]
        checks['configured_three_or_five_ball_source_game_end'] = len(endings) == 1 and begin <= endings[0] <= end
        checks['post_end_separate_coin_and_explicit_start_restarts'] = bool(endings) and len(restarts) == 1 \
            and scenario['restart_ms'] * 10**9 <= restarts[0] <= (scenario['restart_ms'] + 20) * 10**9 \
            and all(row['active'] == '0' for row in telemetry if endings[0] + 2 * 10**9 < int(row['time_ps']) < scenario['restart_ms'] * 10**9)
        observations['end_restart'] = {'configured_balls': scenario['balls_option'], 'active_edges': active_edges}
    if kind == 'two_player':
        player_edges = [(int(row['time_ps']), int(row['value'])) for row in events if row['signal'] == '104']
        turns = [(a[0], b[0]) for a, b in zip(player_edges, player_edges[1:])
                 if a[1] == 1 and b[1] == 0 and b[0] - a[0] > 10**12 and active_through(telemetry, a[0], b[0] - 2 * 10**9)]
        checks['start2_real_alternating_player_turns'] = bool(turns)
        checks['cabinet_source_behavior_bound_to_active_turns'] = (active_at(telemetry, 29000 * 10**9)
                                                                     if scenario['cabinet'] == 'normal'
                                                                     else not active_at(telemetry, 25000 * 10**9))
        observations['two_player'] = {'cabinet': scenario['cabinet'], 'actual_player2_intervals_ps': turns}
    evidence = {'game': 'breakout', 'settings': scenario, 'captured_configuration': configuration,
                'original_named_switches': switches, 'checks': checks, 'media': coverage, 'snapshots': snapshots,
                'observations': observations, 'active_pcm': pcm_context, 'passed': all(checks.values()),
                'limitations': ['Bonus-credit award threshold was not reached; option mapping/readback/reset remains covered.',
                                'Raw credit Q_n and raw ball-counter bits are not normalized game activity or remaining balls.',
                                'Generated PCM and software observations do not establish physical installation, controls or audible speakers.']}
    (path / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    return evidence
