// Exercise picture library (873 exercises, public-domain Free Exercise DB).
// The list lives in /exercises/library.json and is fetched only when needed,
// so it stays out of the main bundle.

let libPromise = null

export function loadLibrary() {
  if (!libPromise) {
    libPromise = fetch('/exercises/library.json')
      .then(r => { if (!r.ok) throw new Error(`library ${r.status}`); return r.json() })
      .then(list => ({ list, byId: Object.fromEntries(list.map(x => [x.id, x])) }))
      .catch(e => { libPromise = null; throw e })
  }
  return libPromise
}

// Common ways people write an exercise → the library entry that pictures it.
// Keys are normalised (see norm below).
const ALIAS = {
  'pushups': 'pushups', 'push ups': 'pushups', 'push up': 'pushups', 'pushup': 'pushups',
  'pull ups': 'pullups', 'pull up': 'pullups', 'pullup': 'pullups', 'pullups': 'pullups',
  'chin ups': 'chin_up', 'chin up': 'chin_up',
  'lat pulldown': 'wide_grip_lat_pulldown', 'lat pull down': 'wide_grip_lat_pulldown',
  'lat pulldown close grip': 'close_grip_front_lat_pulldown', 'close grip lat pulldown': 'close_grip_front_lat_pulldown',
  'flat dumbbell press': 'dumbbell_bench_press', 'flat dumbbell press chest': 'dumbbell_bench_press',
  'dumbbell press': 'dumbbell_bench_press', 'dumbbell bench press': 'dumbbell_bench_press', 'flat dumbbell bench press': 'dumbbell_bench_press',
  'bench press': 'barbell_bench_press_medium_grip', 'barbell bench press': 'barbell_bench_press_medium_grip', 'flat bench press': 'barbell_bench_press_medium_grip',
  'incline dumbbell press': 'incline_dumbbell_press', 'incline bench press': 'barbell_incline_bench_press_medium_grip',
  'dumbbell chest fly': 'dumbbell_flyes', 'chest fly': 'dumbbell_flyes', 'dumbbell fly': 'dumbbell_flyes', 'flat dumbbell fly': 'dumbbell_flyes',
  'pec deck': 'butterfly', 'machine fly': 'butterfly',
  'shoulder press': 'dumbbell_shoulder_press', 'dumbbell shoulder press': 'dumbbell_shoulder_press', 'seated dumbbell shoulder press': 'dumbbell_shoulder_press',
  'lateral raise': 'side_lateral_raise', 'lateral raises': 'side_lateral_raise', 'dumbbell lateral raise': 'side_lateral_raise', 'side raise': 'side_lateral_raise',
  'front raise': 'front_dumbbell_raise', 'rear delt fly': 'reverse_flyes',
  'bicep curl': 'dumbbell_bicep_curl', 'biceps curl': 'dumbbell_bicep_curl', 'dumbbell bicep curl': 'dumbbell_bicep_curl', 'dumbbell curl': 'dumbbell_bicep_curl',
  'barbell curl': 'barbell_curl', 'hammer curl': 'hammer_curls', 'hammer curls': 'hammer_curls', 'preacher curl': 'preacher_curl',
  'overhead dumbbell extension': 'standing_dumbbell_triceps_extension', 'overhead tricep extension': 'standing_dumbbell_triceps_extension',
  'overhead triceps extension': 'standing_dumbbell_triceps_extension', 'tricep extension': 'standing_dumbbell_triceps_extension',
  'rope pushdown': 'triceps_pushdown_rope_attachment', 'rope bar pushdown': 'triceps_pushdown_rope_attachment', 'rope tricep pushdown': 'triceps_pushdown_rope_attachment',
  'tricep pushdown': 'triceps_pushdown', 'triceps pushdown': 'triceps_pushdown', 'cable pushdown': 'triceps_pushdown',
  'skull crusher': 'ez_bar_skullcrusher', 'dips': 'dips_triceps_version', 'bench dips': 'bench_dips',
  'seated row': 'seated_cable_rows', 'cable row': 'seated_cable_rows', 'dumbbell row': 'one_arm_dumbbell_row', 'one arm dumbbell row': 'one_arm_dumbbell_row',
  'barbell row': 'bent_over_barbell_row', 'bent over row': 'bent_over_barbell_row', 'face pull': 'face_pull', 'face pulls': 'face_pull',
  'deadlift': 'barbell_deadlift', 'romanian deadlift': 'romanian_deadlift', 'rdl': 'romanian_deadlift',
  'squat': 'bodyweight_squat', 'squats': 'bodyweight_squat', 'bodyweight squat': 'bodyweight_squat', 'air squat': 'bodyweight_squat',
  'barbell squat': 'barbell_squat', 'back squat': 'barbell_squat', 'goblet squat': 'goblet_squat',
  'sumo squat': 'plie_dumbbell_squat', 'sumo squats': 'plie_dumbbell_squat',
  'lunges': 'bodyweight_walking_lunge', 'lunge': 'bodyweight_walking_lunge', 'walking lunges': 'bodyweight_walking_lunge', 'walking lunge': 'bodyweight_walking_lunge',
  'leg press': 'leg_press', 'leg extension': 'leg_extensions', 'leg extensions': 'leg_extensions', 'leg curl': 'lying_leg_curls',
  'calf raise': 'standing_calf_raises', 'calf raises': 'standing_calf_raises', 'glute bridge': 'butt_lift_bridge', 'hip thrust': 'barbell_hip_thrust',
  'plank': 'plank', 'side plank': 'push_up_to_side_plank', 'crunches': 'crunches', 'crunch': 'crunches', 'partial crunches': 'crunches',
  'leg raises': 'flat_bench_lying_leg_raise', 'leg raise': 'flat_bench_lying_leg_raise', 'lying leg raise': 'flat_bench_lying_leg_raise',
  'hanging leg raise': 'hanging_leg_raise', 'russian twist': 'russian_twist', 'mountain climbers': 'mountain_climbers',
  'cat cow': 'cat_stretch', 'cat camel': 'cat_stretch',
  'bird dog': 'superman', 'one leg and one arm raises': 'superman', 'opposite arm and leg raises': 'superman', 'superman': 'superman',
  'neck rotations': 'side_neck_stretch', 'neck stretch': 'side_neck_stretch',
  'shoulder rotations': 'shoulder_circles', 'shoulder circles': 'shoulder_circles', 'arm circles': 'arm_circles',
  'hip rotations': 'standing_hip_circles', 'hip rotation': 'standing_hip_circles', 'hip circles': 'standing_hip_circles',
  'ankle rotations': 'ankle_circles', 'ankle rotation': 'ankle_circles', 'ankle circles': 'ankle_circles',
  'leg stretch': 'standing_hamstring_and_calf_stretch', 'hamstring stretch': 'hamstring_stretch', 'quad stretch': 'quad_stretch',
  'bend down knee touch': 'standing_toe_touches', 'toe touch': 'standing_toe_touches', 'toe touches': 'standing_toe_touches',
  'arm extension stretch': 'overhead_stretch', 'arm extension stretches': 'overhead_stretch',
  'arm and shoulder stretch with pole': 'round_the_world_shoulder_stretch', 'shoulder stretch with pole': 'round_the_world_shoulder_stretch', 'shoulder stretch': 'shoulder_stretch',
  'child pose': 'childs_pose', 'childs pose': 'childs_pose',
  'cycling': 'bicycling_stationary', 'bicycle': 'bicycling_stationary', 'stationary bike': 'bicycling_stationary', 'bike': 'bicycling_stationary',
  'treadmill': 'walking_treadmill', 'walk': 'walking_treadmill', 'walking': 'walking_treadmill', 'run': 'running_treadmill', 'running': 'running_treadmill',
  'jogging': 'jogging_treadmill', 'skipping': 'rope_jumping', 'jump rope': 'rope_jumping', 'rowing': 'rowing_stationary',
  'jumping jacks': 'star_jump',
}

const SYN = [
  [/\bdumb(?:b)?el(?:l)?s?\b|\bdumble?s?\b|\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bstre(?:t)?ch(?:es)?\b|\bstrech(?:es)?\b/g, 'stretch'],
  [/\bextention\b/g, 'extension'],
  [/\brises\b/g, 'raises'],
  [/\bliht\b/g, 'light'],
  [/\bbicep\b/g, 'biceps'],
  [/\btricep\b/g, 'triceps'],
  [/\bflye?s?\b|\bflys\b/g, 'fly'],
  [/\bpull downs?\b/g, 'pulldown'],
  [/\bpush downs?\b/g, 'pushdown'],
  [/&/g, ' and '],
]

export function norm(s) {
  let x = String(s || '').toLowerCase()
  x = x.replace(/\(.*?\)/g, ' ')          // drop "(just slightly up)"
  x = x.replace(/[’'`]/g, '')
  for (const [re, to] of SYN) x = x.replace(re, to)
  return x.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOP = new Set(['the', 'a', 'an', 'with', 'and', 'on', 'of', 'to', 'each', 'side', 'sides', 'slightly', 'just', 'up', 'light', 'etc', 'body', 'weight', 'bodyweight', 'only', 'set', 'sets', 'reps', 'kg', 'min', 'mins', 'minutes', 'hand', 'hands', 'both'])
const stem = t => t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t
const tokens = s => norm(s).split(' ').filter(t => t && !STOP.has(t) && !/^\d+$/.test(t)).map(stem)

// Best library entry for a free-text exercise name, or null when nothing fits well.
export function matchExercise(name, lib) {
  if (!lib || !name) return null
  const n = norm(name)
  const alias = ALIAS[n] || ALIAS[n.replace(/\bdumbbell\b/g, '').replace(/\s+/g, ' ').trim()]
  if (alias && lib.byId[alias]) return lib.byId[alias]
  const q = tokens(name)
  if (!q.length) return null
  if (!lib._tok) lib._tok = lib.list.map(x => [x, new Set(tokens(x.name))])
  let best = null, bestScore = 0
  for (const [x, ts] of lib._tok) {
    let hit = 0
    for (const t of q) if (ts.has(t)) hit++
    if (!hit) continue
    const score = hit / q.length - 0.04 * Math.max(0, ts.size - hit)
    if (score > bestScore) { best = x; bestScore = score }
  }
  return bestScore >= 0.6 ? best : null
}

// Search for the picker: every query word must appear in the name, muscle or equipment.
export function searchLibrary(query, lib, limit = 40) {
  if (!lib) return []
  const q = norm(query).split(' ').filter(Boolean)
  if (!q.length) return []
  const out = []
  for (const x of lib.list) {
    const hay = norm(`${x.name} ${(x.m || []).join(' ')} ${x.e || ''} ${x.c || ''}`)
    if (q.every(t => hay.includes(t))) {
      const nameHit = q.every(t => norm(x.name).includes(t))
      out.push([nameHit ? 0 : 1, x.name.length, x])
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(r => r[2])
}
