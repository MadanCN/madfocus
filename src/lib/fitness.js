// Fitness: the training program, progression rules, food presets and post-workout messages.
// Exercise ids are stable: the same id on different days shares its history ("last did").

// type: 'weight' (kg × reps), 'bodyweight' (reps only), 'time' (seconds)
// unit: what the weight number means
const X = (id, name, muscle, sets, repMin, repMax, start, step, unit, rest, cue, type = 'weight') =>
  ({ id, name, muscle, sets, repMin, repMax, start, step, unit, rest, cue, type })

export const EXERCISES = {
  // Push
  bench:            X('bench', 'Barbell Bench Press', 'Chest', 3, 8, 10, 35, 2.5, 'kg total (incl. 20 kg bar)', 120, 'Shoulder blades pinched, feet planted, lower the bar to mid-chest.'),
  db_shoulder_press:X('db_shoulder_press', 'Seated Dumbbell Shoulder Press', 'Shoulders, front delts', 3, 8, 10, 10, 2.5, 'kg each hand', 90, 'Elbows slightly in front of you. Don’t arch your lower back.'),
  incline_db_press: X('incline_db_press', 'Incline Dumbbell Press (30°)', 'Upper chest, front delts', 3, 10, 12, 12.5, 2.5, 'kg each hand', 90, 'Bench on the 2nd or 3rd notch. Lower slowly to chest level.'),
  db_lateral:       X('db_lateral', 'Dumbbell Lateral Raise', 'Side delts', 3, 12, 15, 5, 2.5, 'kg each hand', 60, 'Lead with your elbows and stop at shoulder height. No swinging.'),
  tri_pushdown:     X('tri_pushdown', 'Cable Triceps Pushdown (rope)', 'Triceps', 3, 10, 12, 15, 2.5, 'kg on the stack', 60, 'Elbows pinned to your sides. Spread the rope at the bottom.'),
  incline_bench:    X('incline_bench', 'Incline Barbell Bench Press', 'Upper chest, front delts', 3, 8, 10, 25, 2.5, 'kg total (incl. bar)', 120, 'Low incline. Bar touches just below the collarbone.'),
  machine_chest:    X('machine_chest', 'Machine Chest Press', 'Chest', 3, 10, 12, 30, 5, 'kg on the stack', 90, 'Handles at mid-chest height. Squeeze at the end, control the return.'),
  arnold_press:     X('arnold_press', 'Dumbbell Arnold Press', 'Shoulders, front delts', 3, 10, 12, 7.5, 2.5, 'kg each hand', 90, 'Start palms facing you, rotate as you press up.'),
  cable_lateral:    X('cable_lateral', 'Cable Lateral Raise (one arm)', 'Side delts', 3, 12, 15, 5, 2.5, 'kg on the stack, each side', 60, 'Cable at hand height, raise out to the side to shoulder level.'),
  overhead_tri:     X('overhead_tri', 'Overhead Cable Triceps Extension', 'Triceps', 3, 10, 12, 12.5, 2.5, 'kg on the stack', 60, 'Face away from the cable, elbows pointing forward, full stretch.'),
  // Pull
  lat_pulldown:     X('lat_pulldown', 'Lat Pulldown (wide grip)', 'Back, lats', 3, 8, 10, 40, 2.5, 'kg on the stack', 120, 'Pull to the top of your chest, elbows down and back. No leaning far back.'),
  seated_row:       X('seated_row', 'Seated Cable Row', 'Mid back', 3, 10, 12, 35, 2.5, 'kg on the stack', 90, 'Chest up, pull to your belly button, squeeze shoulder blades.'),
  one_arm_row:      X('one_arm_row', 'One-arm Dumbbell Row', 'Lats', 3, 10, 12, 15, 2.5, 'kg, each side', 90, 'Knee and hand on the bench, pull the dumbbell to your hip.'),
  face_pull:        X('face_pull', 'Face Pull (rope)', 'Rear delts', 3, 12, 15, 15, 2.5, 'kg on the stack', 60, 'Cable at face height, pull to your forehead, elbows high.'),
  db_curl:          X('db_curl', 'Dumbbell Biceps Curl', 'Biceps', 3, 10, 12, 7.5, 2.5, 'kg each hand', 60, 'Elbows still, no swinging, slow on the way down.'),
  barbell_row:      X('barbell_row', 'Barbell Bent-over Row', 'Back', 3, 8, 10, 30, 2.5, 'kg total (incl. bar)', 120, 'Hinge to ~45°, flat back, pull the bar to your lower ribs.'),
  close_pulldown:   X('close_pulldown', 'Close-grip Lat Pulldown', 'Lats', 3, 10, 12, 35, 2.5, 'kg on the stack', 90, 'V-handle, pull to upper chest, lean back only slightly.'),
  machine_row:      X('machine_row', 'Chest-supported Machine Row', 'Mid back', 3, 10, 12, 30, 5, 'kg', 90, 'Chest on the pad the whole time. Pause and squeeze.'),
  rear_delt_fly:    X('rear_delt_fly', 'Bent-over Rear Delt Fly', 'Rear delts', 3, 12, 15, 5, 2.5, 'kg each hand', 60, 'Light weight, slight bend in elbows, raise out to the sides.'),
  hammer_curl:      X('hammer_curl', 'Hammer Curl', 'Biceps, forearms', 3, 10, 12, 7.5, 2.5, 'kg each hand', 60, 'Palms facing each other, elbows still.'),
  // Legs
  back_squat:       X('back_squat', 'Barbell Back Squat', 'Quads, glutes', 3, 8, 10, 30, 5, 'kg total (incl. bar)', 150, 'Brace your core, sit between your heels, knees follow your toes.'),
  rdl:              X('rdl', 'Romanian Deadlift (barbell)', 'Hamstrings, glutes', 3, 10, 12, 30, 5, 'kg total (incl. bar)', 120, 'Soft knees, push hips back, bar close to your legs, flat back.'),
  leg_press:        X('leg_press', 'Leg Press', 'Quads, glutes', 3, 12, 15, 60, 10, 'kg added to the sled', 90, 'Feet shoulder-width, don’t lock your knees at the top.'),
  seated_leg_curl:  X('seated_leg_curl', 'Seated Leg Curl', 'Hamstrings', 3, 12, 15, 25, 5, 'kg on the stack', 60, 'Pad just above the ankles, squeeze at the bottom.'),
  reverse_pec_deck: X('reverse_pec_deck', 'Reverse Pec Deck', 'Rear delts', 3, 12, 15, 20, 2.5, 'kg on the stack', 60, 'Face the pad, arms nearly straight, open out wide.'),
  goblet_squat:     X('goblet_squat', 'Goblet Squat', 'Quads, glutes', 3, 10, 12, 15, 2.5, 'kg (one dumbbell)', 90, 'Hold the dumbbell at your chest, sit deep, chest up.'),
  hip_thrust:       X('hip_thrust', 'Barbell Hip Thrust', 'Glutes', 3, 10, 12, 40, 5, 'kg total (incl. bar)', 90, 'Upper back on the bench, use a pad, squeeze glutes at the top.'),
  walking_lunge:    X('walking_lunge', 'Dumbbell Walking Lunge', 'Quads, glutes', 3, 10, 12, 7.5, 2.5, 'kg each hand (reps per leg)', 90, 'Long steps, back knee nearly touches the floor.'),
  leg_extension:    X('leg_extension', 'Leg Extension', 'Quads', 3, 12, 15, 25, 5, 'kg on the stack', 60, 'Pause for a second at the top.'),
  lying_leg_curl:   X('lying_leg_curl', 'Lying Leg Curl', 'Hamstrings', 3, 12, 15, 20, 5, 'kg on the stack', 60, 'Hips pressed into the pad, slow on the way down.'),
  // Abs
  plank:            X('plank', 'Plank', 'Core', 3, 30, 45, 0, 5, 'seconds', 45, 'Straight line from head to heels, squeeze glutes.', 'time'),
  side_plank:       X('side_plank', 'Side Plank (each side)', 'Obliques', 2, 25, 40, 0, 5, 'seconds per side', 30, 'Hips high, body in a straight line.', 'time'),
  hanging_knee_raise:X('hanging_knee_raise', 'Hanging Knee Raise', 'Lower abs', 3, 10, 15, 0, 0, 'reps', 45, 'No swinging. Curl your pelvis up, not just your knees.', 'bodyweight'),
  cable_crunch:     X('cable_crunch', 'Kneeling Cable Crunch', 'Abs', 3, 12, 15, 20, 2.5, 'kg on the stack', 45, 'Hips still, crunch your ribs toward your hips.'),
  dead_bug:         X('dead_bug', 'Dead Bug (reps per side)', 'Deep core', 3, 10, 12, 0, 0, 'reps', 45, 'Lower back pressed into the floor the whole time.', 'bodyweight'),
  lying_leg_raise:  X('lying_leg_raise', 'Lying Leg Raise', 'Lower abs', 3, 10, 15, 0, 0, 'reps', 45, 'Hands under your hips, lower slowly, don’t let your back arch.', 'bodyweight'),
  ab_wheel:         X('ab_wheel', 'Ab Wheel Rollout (from knees)', 'Abs', 3, 8, 12, 0, 0, 'reps', 45, 'Go only as far as you can without your hips sagging.', 'bodyweight'),
  russian_twist:    X('russian_twist', 'Russian Twist (total reps)', 'Obliques', 3, 16, 20, 0, 0, 'reps', 45, 'Lean back slightly, rotate from your ribs.', 'bodyweight'),
  // Posture (rounded upper back): open the chest, strengthen the upper back and neck
  band_pull_apart:  X('band_pull_apart', 'Band Pull-Apart', 'Upper back, rear delts', 2, 15, 20, 0, 0, 'reps', 30, 'Arms straight at shoulder height, pull the band to your chest, squeeze shoulder blades.', 'bodyweight'),
  external_rotation:X('external_rotation', 'Cable External Rotation (each arm)', 'Rotator cuff', 2, 12, 15, 2.5, 2.5, 'kg on the stack', 30, 'Elbow at 90° tucked to your side, rotate the forearm outward slowly. Very light.'),
  scap_pullup:      X('scap_pullup', 'Dead Hang + Scapular Pull-Up', 'Lower traps, lats', 2, 8, 10, 0, 0, 'reps', 45, 'Hang from the bar with straight arms, then pull your shoulder blades down and back without bending your elbows.', 'bodyweight'),
  superman:         X('superman', 'Superman Hold', 'Upper & lower back', 2, 20, 30, 0, 5, 'seconds', 30, 'Lie face down, lift arms and chest, thumbs up, chin tucked, squeeze shoulder blades.', 'time'),
  chin_tuck:        X('chin_tuck', 'Chin Tuck (5 s hold each)', 'Deep neck flexors', 2, 10, 12, 0, 0, 'reps', 20, 'Stand tall against a wall, pull your chin straight back (double chin), hold 5 s.', 'bodyweight'),
  chest_stretch:    X('chest_stretch', 'Doorway Chest Stretch (each side)', 'Chest, front shoulders', 2, 30, 45, 0, 5, 'seconds per side', 15, 'Forearm on the door frame at shoulder height, step through gently until you feel the stretch.', 'time'),
  cat_cow:          X('cat_cow', 'Cat-Cow', 'Upper-back mobility', 2, 10, 12, 0, 0, 'reps', 20, 'On all fours, round your back fully, then arch and lift your chest. Move slowly with your breath.', 'bodyweight'),
  bicycle_crunch:   X('bicycle_crunch', 'Bicycle Crunch (total reps)', 'Abs, obliques', 3, 20, 30, 0, 0, 'reps', 45, 'Slow and controlled, elbow toward the opposite knee.', 'bodyweight'),
}

// Warm-up and cool-down steps. img points at a demo in exercise-demos.json (null = no picture).
const W = (text, img = null) => ({ text, img })
const WARMUP = {
  push: [W('5 min brisk walk on the treadmill', 'walk_treadmill'), W('20 arm circles each way', 'arm_circles'), W('15 band pull-aparts (or light cable)', 'band_pull_apart'), W('Empty bar bench press × 12', 'bench')],
  pull: [W('5 min rowing machine or brisk walk', 'rowing'), W('10 elbows-back squeezes (open the chest)', 'elbows_back'), W('10 scapular pull-ups (or very light pulldown × 12)', 'scap_pullup'), W('10 cat-cows', 'cat_cow')],
  legs: [W('5 min stationary bike or brisk walk', 'bike'), W('15 bodyweight squats', 'bw_squat'), W('10 leg swings each leg', 'leg_swing'), W('10 glute bridges', 'glute_bridge')],
  rest: [W('2 min easy walking to start', 'walk_treadmill')],
}
const COOLDOWN = {
  push: [W('Doorway chest stretch, 30 s each side', 'chest_stretch'), W('Overhead triceps stretch, 30 s each side', 'triceps_stretch'), W('Child’s pose, 45 s', 'childs_pose'), W('Slow breathing, 1 min')],
  pull: [W('Upper-back stretch, 30 s', 'upper_back_stretch'), W('Biceps stretch, 30 s each side', 'biceps_stretch'), W('Cat-cow, 10 slow reps', 'cat_cow'), W('Slow breathing, 1 min')],
  legs: [W('Standing quad stretch, 30 s each leg', 'quad_stretch'), W('Hamstring stretch, 30 s each leg', 'hamstring_stretch'), W('Kneeling hip-flexor stretch, 30 s each side', 'hip_flexor'), W('Calf stretch against a wall, 30 s each', 'calf_stretch')],
  rest: [W('Spinal twist stretch, 30 s each side', 'spinal_stretch'), W('Hamstring stretch, 30 s each leg', 'hamstring_stretch'), W('Doorway chest stretch, 30 s each side', 'chest_stretch'), W('Child’s pose, 45 s', 'childs_pose')],
}

// kind: 'walk' | 'run'; minutes is the starting target
export const DAYS = {
  push_a: { label: 'Push A', group: 'push', focus: 'Chest, front delts, shoulders', lifts: ['bench', 'db_shoulder_press', 'incline_db_press', 'db_lateral', 'tri_pushdown'], abs: ['plank', 'hanging_knee_raise'], posture: ['band_pull_apart', 'chest_stretch'],
    cardio: { kind: 'walk', name: 'Incline walk', minutes: 15, cap: 25, how: 'Treadmill incline 8–10%, 5–5.5 km/h. You should be able to talk.' } },
  pull_a: { label: 'Pull A', group: 'pull', focus: 'Back, biceps, rear delts', lifts: ['lat_pulldown', 'seated_row', 'one_arm_row', 'face_pull', 'db_curl'], abs: ['cable_crunch', 'dead_bug'], posture: ['scap_pullup', 'external_rotation'],
    cardio: { kind: 'run', name: 'Easy run', minutes: 15, cap: 40, how: 'Conversational pace. Walk breaks are fine. Building back to 5k.' } },
  legs_a: { label: 'Legs A', group: 'legs', focus: 'Legs, rear delts', lifts: ['back_squat', 'rdl', 'leg_press', 'seated_leg_curl', 'reverse_pec_deck'], abs: ['lying_leg_raise', 'side_plank'], posture: ['superman', 'chin_tuck'],
    cardio: { kind: 'walk', name: 'Easy walk (flat)', minutes: 10, cap: 20, how: 'Flat treadmill, 5 km/h. Flushes the legs out.' } },
  push_b: { label: 'Push B', group: 'push', focus: 'Chest, front delts, shoulders', lifts: ['incline_bench', 'machine_chest', 'arnold_press', 'cable_lateral', 'overhead_tri'], abs: ['ab_wheel', 'russian_twist'], posture: ['band_pull_apart', 'chest_stretch'],
    cardio: { kind: 'walk', name: 'Incline walk', minutes: 15, cap: 25, how: 'Treadmill incline 8–10%, 5–5.5 km/h.' } },
  pull_b: { label: 'Pull B', group: 'pull', focus: 'Back, biceps, rear delts', lifts: ['barbell_row', 'close_pulldown', 'machine_row', 'rear_delt_fly', 'hammer_curl'], abs: ['plank', 'bicycle_crunch'], posture: ['scap_pullup', 'external_rotation'],
    cardio: { kind: 'run', name: 'Easy run', minutes: 20, cap: 45, how: 'Conversational pace. Your longest run of the week.' } },
  legs_b: { label: 'Legs B', group: 'legs', focus: 'Legs, rear delts', lifts: ['goblet_squat', 'hip_thrust', 'walking_lunge', 'leg_extension', 'lying_leg_curl', 'face_pull'], abs: ['cable_crunch', 'side_plank'], posture: ['superman', 'chin_tuck'],
    cardio: { kind: 'walk', name: 'Easy walk (flat)', minutes: 10, cap: 20, how: 'Flat treadmill, 5 km/h.' } },
  rest: { label: 'Rest', group: 'rest', focus: 'Recovery', lifts: [], abs: [], posture: ['cat_cow', 'chin_tuck', 'superman', 'chest_stretch'],
    cardio: { kind: 'walk', name: 'Outdoor walk', minutes: 40, cap: 60, how: 'Easy pace outside, no gym. Aim for about 8–10k steps today. Do the posture routine at home.' } },
}
export const CYCLE = ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b', 'rest']
export const warmupFor = d => WARMUP[DAYS[d].group]
export const cooldownFor = d => COOLDOWN[DAYS[d].group]

// The day after the most recent finished session (missed days don't skip anything)
export function nextDay(sessions) {
  const last = [...sessions].filter(s => s.finished_at).sort((a, b) => (b.date + b.finished_at).localeCompare(a.date + a.finished_at))[0]
  if (!last || !CYCLE.includes(last.day_type)) return CYCLE[0]
  return CYCLE[(CYCLE.indexOf(last.day_type) + 1) % CYCLE.length]
}

// ── Progression (double progression) ───────────────────────────
// history: [{ date, sets: [{ weight, reps }] }] newest first, for this exercise
const round = (n, step) => step ? Math.max(0, Math.round(n / step) * step) : n
export function suggest(ex, history) {
  const last = history[0]
  if (!last || !last.sets.length) {
    if (ex.type === 'time') return { weight: 0, target: ex.repMin, note: `Hold for ${ex.repMin} s each set. Add 5 s when it gets easy.` }
    if (ex.type === 'bodyweight') return { weight: 0, target: ex.repMin, note: `Aim for ${ex.repMin}–${ex.repMax} clean reps.` }
    return { weight: ex.start, target: ex.repMax, first: true,
      note: `Start at ${ex.start} kg. If ${ex.repMax} reps feel easy with 3+ reps to spare, go up ${ex.step} kg next set. If you can’t reach ${ex.repMin}, drop a little.` }
  }
  const sets = last.sets
  const top = Math.max(...sets.map(s => s.weight || 0))
  const working = sets.filter(s => (s.weight || 0) === top)
  const allMax = sets.length >= ex.sets && working.length >= ex.sets && working.every(s => s.reps >= ex.repMax)
  const anyMiss = working.some(s => s.reps < ex.repMin)

  if (ex.type === 'time' || ex.type === 'bodyweight') {
    const best = Math.max(...sets.map(s => s.reps || 0))
    const inc = ex.type === 'time' ? 5 : 2, u = ex.type === 'time' ? ' s' : ''
    if (allMax) return { weight: 0, target: best + inc, up: true, note: `Every set hit ${ex.repMax}${u} or more (best ${best}${u}). Push to ${best + inc}${u} today.` }
    return { weight: 0, target: Math.min(ex.repMax, best + 1), note: `Last best: ${best}${ex.type === 'time' ? ' s' : ''}. Beat it by one.` }
  }
  if (allMax) return { weight: round(top + ex.step, ex.step), target: ex.repMin, up: true, note: `All sets hit ${ex.repMax} reps last time. Go up to ${round(top + ex.step, ex.step)} kg and aim for ${ex.repMin}+.` }
  if (anyMiss) {
    const prev = history[1]
    const prevTop = prev ? Math.max(...prev.sets.map(s => s.weight || 0)) : null
    const prevMiss = prev && prevTop === top && prev.sets.filter(s => (s.weight || 0) === top).some(s => s.reps < ex.repMin)
    if (prevMiss) return { weight: round(top * 0.9, ex.step), target: ex.repMax, down: true, note: `Two sessions below ${ex.repMin} reps at ${top} kg. Drop to ${round(top * 0.9, ex.step)} kg and build back up. That’s normal.` }
    return { weight: top, target: ex.repMin, note: `Stay at ${top} kg. Get ${ex.repMin}+ reps on every set before going up.` }
  }
  const total = working.reduce((a, s) => a + s.reps, 0)
  return { weight: top, target: ex.repMax, note: `Stay at ${top} kg and add a rep or two (last time ${total} reps in total). At ${ex.repMax} on every set, you go up.` }
}

export function setLabel(ex, s) {
  if (ex.type === 'time') return `${s.reps}s`
  if (ex.type === 'bodyweight') return `${s.reps}`
  return `${s.weight}×${s.reps}`
}

// ── Session stats + supportive message ─────────────────────────
export function sessionStats(dayType, sets, prevBest, cardio) {
  const day = DAYS[dayType]
  const ids = [...day.lifts, ...day.abs, ...(day.posture || [])]
  const planned = ids.reduce((a, id) => a + EXERCISES[id].sets, 0)
  const done = sets.filter(s => s.done && s.reps > 0)
  const volume = Math.round(done.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0))
  const prs = []
  for (const id of day.lifts) {
    const ex = EXERCISES[id]
    if (ex.type !== 'weight') continue
    const mine = done.filter(s => s.exercise_id === id)
    if (!mine.length || !prevBest[id]) continue
    const top = Math.max(...mine.map(s => s.weight))
    const repsAtTop = Math.max(...mine.filter(s => s.weight === top).map(s => s.reps))
    const pb = prevBest[id]
    if (top > pb.weight || (top === pb.weight && repsAtTop > pb.reps)) prs.push(`${ex.name} ${top} kg × ${repsAtTop}`)
  }
  const cardioTarget = cardio?.target || day.cardio.minutes
  return { planned, done: done.length, completion: planned ? done.length / planned : (cardio?.minutes >= cardioTarget ? 1 : 0),
    volume, prs, cardioMin: Number(cardio?.minutes) || 0, cardioKm: Number(cardio?.km) || 0, cardioTarget }
}

const pickOne = a => a[Math.floor(Math.random() * a.length)]
export function supportiveMessage(stats, dayType, weekCount) {
  const label = DAYS[dayType].label
  const c = stats.completion
  let title, body
  if (dayType === 'rest') {
    title = stats.cardioMin >= stats.cardioTarget ? 'Recovery done right' : 'Rest is training too'
    body = pickOne([
      'Muscles grow on rest days. You moved, you recovered, and tomorrow you start a new cycle.',
      'A rest day with a walk is exactly how fat loss works: steady, not dramatic. Good call.',
    ])
  } else if (c >= 0.95 && stats.prs.length) {
    title = pickOne(['That was a strong one', 'New personal bests', 'You got stronger today'])
    body = `Every set of ${label} done, plus ${stats.prs.length === 1 ? 'a new best' : `${stats.prs.length} new bests`}. This is what consistency looks like: small jumps, week after week.`
  } else if (c >= 0.95) {
    title = pickOne(['Full session, nothing skipped', 'Every set done', 'Clean work today'])
    body = pickOne([
      `${label} done from start to finish. You turned up and did the work. That’s the whole secret.`,
      `All ${stats.done} sets done. Not every day needs a record, it needs to happen. It happened.`,
    ])
  } else if (c >= 0.7) {
    title = pickOne(['Solid session', 'Good work'])
    body = `${stats.done} of ${stats.planned} sets. Most of the work, done well, on a busy week. Better than a perfect plan that never happens.`
  } else if (c >= 0.35) {
    title = 'You showed up, and that counts'
    body = `A shorter ${label} today, ${stats.done} sets. Some days are like that. You kept the streak alive, and that matters more.`
  } else {
    title = 'Something beats nothing'
    body = 'You still went. On a hard day, that’s the win. Sleep well and the next one will feel better.'
  }
  const extras = []
  if (stats.cardioMin > 0) extras.push(`${stats.cardioMin} min of ${DAYS[dayType].cardio.kind === 'run' ? 'running' : 'walking'}${stats.cardioKm ? `, ${stats.cardioKm} km` : ''} on top. That’s the fat-loss part.`)
  if (weekCount >= 4) extras.push(`${weekCount} sessions this week. You’re building a real habit.`)
  return { title, body, extras }
}

// ── Food ───────────────────────────────────────────────────────
export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snacks' }, { id: 'dinner', label: 'Dinner' },
]
// Approximate values per serving
export const FOOD_PRESETS = [
  { name: 'Chapati / roti', qty: '1 medium', kcal: 110, protein: 3 },
  { name: 'White rice, cooked', qty: '1 cup (150 g)', kcal: 195, protein: 4 },
  { name: 'Dal', qty: '1 katori (150 g)', kcal: 150, protein: 9 },
  { name: 'Sambar', qty: '1 katori', kcal: 100, protein: 4 },
  { name: 'Curd', qty: '1 katori (100 g)', kcal: 60, protein: 3.5 },
  { name: 'Ragi mudde', qty: '1 ball (150 g)', kcal: 160, protein: 4 },
  { name: 'Idli', qty: '1 piece', kcal: 60, protein: 2 },
  { name: 'Plain dosa', qty: '1', kcal: 170, protein: 4 },
  { name: 'Upma', qty: '1 plate', kcal: 250, protein: 6 },
  { name: 'Poha', qty: '1 plate', kcal: 270, protein: 5 },
  { name: 'Egg, boiled', qty: '1 whole', kcal: 75, protein: 6 },
  { name: 'Egg whites', qty: '3', kcal: 50, protein: 11 },
  { name: 'Chicken breast, cooked', qty: '100 g', kcal: 165, protein: 31 },
  { name: 'Chicken curry', qty: '1 katori', kcal: 250, protein: 20 },
  { name: 'Paneer', qty: '50 g', kcal: 150, protein: 9 },
  { name: 'Soya chunks, dry', qty: '30 g', kcal: 105, protein: 16 },
  { name: 'Whey protein', qty: '1 scoop', kcal: 120, protein: 24 },
  { name: 'Toned milk', qty: '200 ml', kcal: 120, protein: 6 },
  { name: 'Oats, dry', qty: '40 g', kcal: 150, protein: 5 },
  { name: 'Peanuts', qty: '30 g', kcal: 170, protein: 7 },
  { name: 'Banana', qty: '1 medium', kcal: 105, protein: 1 },
  { name: 'Tea with milk & sugar', qty: '1 cup', kcal: 70, protein: 2 },
]
export const DEFAULT_TARGETS = { kcal_target: 2000, protein_target: 140 }
