// import React, { Suspense, useEffect, useMemo, useRef } from 'react'
// import * as THREE from 'three'
// import { Canvas } from '@react-three/fiber'
// import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

// type Props = { modelUrl: string; viseme: string }

// // How open to make the mouth per viseme (tweak to taste)
// const VISEME_OPEN: Record<string, number> = {
//   X: 0.02,
//   A: 1.00,
//   B: 0.25,
//   C: 0.85,
//   D: 0.75,
//   E: 0.55,
//   F: 0.45,
//   G: 1.00,
//   H: 0.35,
//   L: 0.60,
// }

// // tuning
// const OPEN_GAIN = 1.35
// const EASE_POW = 0.9
// const LERP_MOUTH = 0.5
// const LERP_SMILE = 0.25

// const ATTACK_TC  = 0.16   // how fast it opens toward a bigger viseme
// const RELEASE_TC = 0.22   // how fast it closes toward a smaller viseme

// // head motion (subtle)
// const HEAD_YAW   = 0.10
// const HEAD_PITCH = 0.05
// const HEAD_ROLL  = 0.02
// const HEAD_BOB_Y = 0.015

// // eye motion
// const EYE_YAW_MAX   = 0.18
// const EYE_PITCH_MAX = 0.10
// const SACCADE_EVERY_MIN = 0.8
// const SACCADE_EVERY_MAX = 2.2
// const SACCADE_TIME      = 0.22

// // blink fallback (squash eyes a little if no eyelid morphs)
// const BLINK_EVERY_MIN = 3.5     // slower
// const BLINK_EVERY_MAX = 7.5
// const BLINK_DURATION  = 0.18    // longer
// const BLINK_CLOSED_Y  = 0.55    // 55% height (was 0.08 → too much)

// // helpers
// const clamp01 = (x:number)=>Math.max(0,Math.min(1,x))
// const lerp = (a:number,b:number,t:number)=>a+(b-a)*t
// const easeOutCubic = (t:number)=>1-Math.pow(1-t,3)

// export default function Avatar({ modelUrl, viseme }: Props) {
//   return (
//     <div style={{ width: 360, height: 360, borderRadius: '50%', border: '4px solid #3b82f6', overflow: 'hidden', background: '#111' }}>
//       {/* You can also try fov: 28 and position.z: 1.0 if you want tighter framing */}
//       <Canvas camera={{ position: [0, 0.12, 1.15], fov: 35 }}>
//         <ambientLight intensity={0.8} />
//         <directionalLight position={[2, 3, 2]} intensity={1.1} />
//         <Suspense fallback={null}>
//           <Head url={modelUrl} viseme={viseme} />
//         </Suspense>
//         <Environment preset="studio" />
//         {/* Target is a bit high to center on eyes/face */}
//         <OrbitControls enablePan={false} enableZoom={true} target={[0, 0.53, 0]} />
//       </Canvas>
//     </div>
//   )
// }

// function Head({ url, viseme }: { url: string; viseme: string }) {
//   const gltf = useGLTF(url) as any
//   const scene = useMemo(() => gltf?.scene?.clone(true), [gltf])

//   // refs for animation state
//   const tRef = useRef(0)
//   const lastMsRef = useRef(0)

//   // mouth targets found in scene (by name)
//   const mouthTargetsRef = useRef<Array<{ mesh:any; openIdx:number; smileIdx:number|null }>>([])
//   const mouthCurOpenRef = useRef(0)
//   const mouthTgtOpenRef = useRef(0)
//   const mouthCmdRef = useRef(0)

//   // eyes + blink state
//   const eyeLRef = useRef<THREE.Object3D|null>(null)
//   const eyeRRef = useRef<THREE.Object3D|null>(null)
//   const eyeGazeRef = useRef({ yaw: 0, pitch: 0 })
//   const eyeGazeStartRef = useRef({ yaw: 0, pitch: 0 })
//   const eyeGazeTargetRef = useRef({ yaw: 0, pitch: 0 })
//   const saccadeTimerRef = useRef(0)
//   const saccadeDurRef = useRef(SACCADE_TIME)
//   const nextSaccadeInRef = useRef(rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX))

//   const blinkTimerRef = useRef(0)
//   const nextBlinkInRef = useRef(rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX))
//   const blinkingRef = useRef(false)
//   const blinkPhaseRef = useRef(0) // 0→1 over BLINK_DURATION

//   // optional: log morphs
//   useEffect(() => {
//     if (!scene) return
//     console.log('🔎 Dumping morph targets from model:')
//     scene.traverse((o: any) => {
//       if (o.isMesh && o.morphTargetDictionary) {
//         console.log(`Mesh "${o.name}":`, Object.keys(o.morphTargetDictionary))
//       }
//     })
//   }, [scene])

//   // normalize size & center
//   useEffect(() => {
//     if (!scene) return
//     const box = new THREE.Box3().setFromObject(scene)
//     const size = new THREE.Vector3()
//     const center = new THREE.Vector3()
//     box.getSize(size); box.getCenter(center)
//     const s = 1.6 / Math.max(size.x, size.y, size.z || 1)
//     scene.position.sub(center)
//     scene.scale.setScalar(s)
//   }, [scene])

//   // find mouth morphs and eyes
//   useEffect(() => {
//     if (!scene) return

//     // mouth
//     const found: Array<{ mesh:any; openIdx:number; smileIdx:number|null }> = []
//     scene.traverse((o: any) => {
//       if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
//       const dict = o.morphTargetDictionary as Record<string, number>
//       const openIdx  = dict['mouthOpen']
//       if (openIdx == null) return
//       const smileIdx = dict['mouthSmile'] ?? null
//       found.push({ mesh: o, openIdx, smileIdx })
//     })
//     mouthTargetsRef.current = found

//     // eyes
//     eyeLRef.current = scene.getObjectByName('EyeLeft') || findBySubstring(scene, 'EyeLeft')
//     eyeRRef.current = scene.getObjectByName('EyeRight') || findBySubstring(scene, 'EyeRight')
//     console.log('👀 Eyes:', eyeLRef.current?.name, eyeRRef.current?.name)

//     // make sure eyes start visible (reset any accidental scaling)
//     if (eyeLRef.current) (eyeLRef.current as any).scale.set(1,1,1)
//     if (eyeRRef.current) (eyeRRef.current as any).scale.set(1,1,1)

//     // start RAF
//     lastMsRef.current = performance.now()
//     let raf = 0
//     const tick = () => {
//       const now = performance.now()
//       const dt = Math.min(0.05, (now - lastMsRef.current) / 1000)
//       lastMsRef.current = now
//       tRef.current += dt

//       animateHead(dt)
//       animateMouth(dt)
//       animateEyes(dt)
//       animateBlink(dt)

//       raf = requestAnimationFrame(tick)
//     }
//     raf = requestAnimationFrame(tick)
//     return () => cancelAnimationFrame(raf)
//   }, [scene])

//   // update mouth target when viseme changes
//   useEffect(() => {
//     const raw = VISEME_OPEN[viseme] ?? 0
//     let targetOpen = Math.pow(raw, EASE_POW) * OPEN_GAIN
//     mouthTgtOpenRef.current = clamp01(targetOpen)
//   }, [viseme])

//   // --- animation implementations ---

//   function animateHead(dt: number) {
//     if (!scene) return
//     const t = tRef.current

//     // gentle idle sinusoids
//     const yaw   = HEAD_YAW   * Math.sin(t * 0.6)
//     const pitch = HEAD_PITCH * Math.sin(t * 0.8 + 1.3)
//     const roll  = HEAD_ROLL  * Math.sin(t * 0.5 + 0.7)
//     scene.rotation.set(pitch, yaw, roll)

//     // bob up/down; add slight emphasis with mouth openness (talking)
//     const openness = mouthCurOpenRef.current
//     scene.position.y = -0.2 + HEAD_BOB_Y * (Math.sin(t * 2.2) * 0.6 + openness * 0.4)
//   }

//   function animateMouth(dt: number) {
//     const targets = mouthTargetsRef.current
//     if (!targets.length) return

//     const cur = mouthCurOpenRef.current
//     const tgt = mouthTgtOpenRef.current
//     const next = lerp(cur, tgt, LERP_MOUTH)
//     mouthCurOpenRef.current = next

//     const smileTarget =
//       tgt > 0.8 ? 0.25 :
//       tgt > 0.5 ? 0.14 :
//       0.02

//     for (const { mesh, openIdx, smileIdx } of targets) {
//       const infl = mesh.morphTargetInfluences as number[]
//       infl[openIdx] = next
//       if (smileIdx != null) infl[smileIdx] = lerp(infl[smileIdx] ?? 0, smileTarget, LERP_SMILE)
//       mesh.needsUpdate = true
//     }
//   }

//   function animateEyes(dt: number) {
//     const eyeL = eyeLRef.current as any
//     const eyeR = eyeRRef.current as any
//     if (!eyeL && !eyeR) return

//     // saccades
//     saccadeTimerRef.current += dt
//     if (saccadeTimerRef.current >= nextSaccadeInRef.current) {
//       saccadeTimerRef.current = 0
//       nextSaccadeInRef.current = rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX)
//       saccadeDurRef.current = SACCADE_TIME
//       eyeGazeStartRef.current = { ...eyeGazeRef.current }
//       eyeGazeTargetRef.current = {
//         yaw:   rand(-EYE_YAW_MAX, EYE_YAW_MAX),
//         pitch: rand(-EYE_PITCH_MAX, EYE_PITCH_MAX),
//       }
//     }

//     const r = clamp01(saccadeTimerRef.current / saccadeDurRef.current)
//     const s = easeOutCubic(r)
//     eyeGazeRef.current.yaw   = lerp(eyeGazeStartRef.current.yaw,   eyeGazeTargetRef.current.yaw,   s)
//     eyeGazeRef.current.pitch = lerp(eyeGazeStartRef.current.pitch, eyeGazeTargetRef.current.pitch, s)

//     if (eyeL) { eyeL.rotation.y = eyeGazeRef.current.yaw;   eyeL.rotation.x = eyeGazeRef.current.pitch }
//     if (eyeR) { eyeR.rotation.y = eyeGazeRef.current.yaw;   eyeR.rotation.x = eyeGazeRef.current.pitch }
//   }

//   function animateBlink(dt: number) {
//     const eyeL = eyeLRef.current as any
//     const eyeR = eyeRRef.current as any
//     if (!eyeL && !eyeR) return

//     if (!blinkingRef.current) {
//       blinkTimerRef.current += dt
//       if (blinkTimerRef.current >= nextBlinkInRef.current) {
//         blinkingRef.current = true
//         blinkPhaseRef.current = 0
//         blinkTimerRef.current = 0
//         nextBlinkInRef.current = rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX)
//       }
//     }

//     if (blinkingRef.current) {
//       blinkPhaseRef.current += dt / BLINK_DURATION
//       const p = blinkPhaseRef.current
//       // 0→1→0 curve
//       const k = p < 0.5 ? (p / 0.5) : (1 - (p - 0.5) / 0.5)
//       const closed = easeOutCubic(k)

//       // gentler squash so eyes stay visible
//       const yScale = THREE.MathUtils.lerp(1, BLINK_CLOSED_Y, closed)

//       if (eyeL) eyeL.scale.y = yScale
//       if (eyeR) eyeR.scale.y = yScale

//       if (p >= 1) {
//         blinkingRef.current = false
//         if (eyeL) eyeL.scale.y = 1
//         if (eyeR) eyeR.scale.y = 1
//       }
//     }
//   }

//   if (!scene) return null
//   return <primitive object={scene} position={[0, -0.2, 0]} />
// }

// useGLTF.preload('/character/face.glb')

// // --- small helpers ---
// function findBySubstring(root: THREE.Object3D, needle: string): THREE.Object3D | null {
//   let found: THREE.Object3D | null = null
//   root.traverse(obj => {
//     if (found) return
//     if (obj.name && obj.name.toLowerCase().includes(needle.toLowerCase())) {
//       found = obj
//     }
//   })
//   return found
// }
// function rand(a:number,b:number){ return a + Math.random()*(b-a) }



import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

type Props = { modelUrl: string; viseme: string }

// How open to make the mouth per viseme (tweak to taste)
const VISEME_OPEN: Record<string, number> = {
  X: 0.02,
  A: 1.00,
  B: 0.25,
  C: 0.85,
  D: 0.75,
  E: 0.55,
  F: 0.45,
  G: 1.00,
  H: 0.35,
  L: 0.60,
}

// tuning
const OPEN_GAIN = 1.35
const EASE_POW = 0.9
const LERP_MOUTH = 0.5
const LERP_SMILE = 0.25

// two-stage mouth smoothing (attack/release → then lerp)
const ATTACK_TC  = 0.16   // s, open faster
const RELEASE_TC = 0.22   // s, close a bit slower

// head motion (subtle)
const HEAD_YAW   = 0.10
const HEAD_PITCH = 0.05
const HEAD_ROLL  = 0.02
const HEAD_BOB_Y = 0.015

// eye motion
const EYE_YAW_MAX   = 0.18
const EYE_PITCH_MAX = 0.10
const SACCADE_EVERY_MIN = 0.8
const SACCADE_EVERY_MAX = 2.2
const SACCADE_TIME      = 0.22

// blink fallback (squash eyes a little if no eyelid morphs)
const BLINK_EVERY_MIN = 3.5
const BLINK_EVERY_MAX = 7.5
const BLINK_DURATION  = 0.18
const BLINK_CLOSED_Y  = 0.55 // keep eyes visible

// helpers
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x))
const lerp = (a:number,b:number,t:number)=>a+(b-a)*t
const easeOutCubic = (t:number)=>1-Math.pow(1-t,3)

export default function Avatar({ modelUrl, viseme }: Props) {
  return (
    <div style={{ width: 360, height: 360, borderRadius: '50%', border: '4px solid #3b82f6', overflow: 'hidden', background: '#111' }}>
      <Canvas camera={{ position: [0, 0.12, 1.15], fov: 35 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <Suspense fallback={null}>
          <Head url={modelUrl} viseme={viseme} />
        </Suspense>
        <Environment preset="studio" />
        <OrbitControls enablePan={false} enableZoom={true} target={[0, 0.53, 0]} />
      </Canvas>
    </div>
  )
}

function Head({ url, viseme }: { url: string; viseme: string }) {
  const gltf = useGLTF(url) as any
  const scene = useMemo(() => gltf?.scene?.clone(true), [gltf])

  // refs for animation state
  const tRef = useRef(0)
  const lastMsRef = useRef(0)

  // mouth targets found in scene (by name)
  const mouthTargetsRef = useRef<Array<{ mesh:any; openIdx:number; smileIdx:number|null }>>([])
  const mouthCmdRef = useRef(0)      // command from viseme map (pre-smoothing)
  const mouthTgtOpenRef = useRef(0)  // target after attack/release smoothing
  const mouthCurOpenRef = useRef(0)  // current influence value (post-lerp smoothing)

  // eyes + blink state
  const eyeLRef = useRef<THREE.Object3D|null>(null)
  const eyeRRef = useRef<THREE.Object3D|null>(null)
  const eyeGazeRef = useRef({ yaw: 0, pitch: 0 })
  const eyeGazeStartRef = useRef({ yaw: 0, pitch: 0 })
  const eyeGazeTargetRef = useRef({ yaw: 0, pitch: 0 })
  const saccadeTimerRef = useRef(0)
  const saccadeDurRef = useRef(SACCADE_TIME)
  const nextSaccadeInRef = useRef(rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX))

  const blinkTimerRef = useRef(0)
  const nextBlinkInRef = useRef(rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX))
  const blinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0) // 0→1 over BLINK_DURATION

  // optional: log morphs
  useEffect(() => {
    if (!scene) return
    console.log('🔎 Dumping morph targets from model:')
    scene.traverse((o: any) => {
      if (o.isMesh && o.morphTargetDictionary) {
        console.log(`Mesh "${o.name}":`, Object.keys(o.morphTargetDictionary))
      }
    })
  }, [scene])

  // normalize size & center
  useEffect(() => {
    if (!scene) return
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size); box.getCenter(center)
    const s = 1.6 / Math.max(size.x, size.y, size.z || 1)
    scene.position.sub(center)
    scene.scale.setScalar(s)
  }, [scene])

  // find mouth morphs and eyes
  useEffect(() => {
    if (!scene) return

    // mouth
    const found: Array<{ mesh:any; openIdx:number; smileIdx:number|null }> = []
    scene.traverse((o: any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const dict = o.morphTargetDictionary as Record<string, number>
      const openIdx  = dict['mouthOpen']
      if (openIdx == null) return
      const smileIdx = dict['mouthSmile'] ?? null
      found.push({ mesh: o, openIdx, smileIdx })
    })
    mouthTargetsRef.current = found

    // eyes (look for nodes named exactly or containing EyeLeft/EyeRight)
    eyeLRef.current = scene.getObjectByName('EyeLeft') || findBySubstring(scene, 'EyeLeft')
    eyeRRef.current = scene.getObjectByName('EyeRight') || findBySubstring(scene, 'EyeRight')
    console.log('👀 Eyes:', eyeLRef.current?.name, eyeRRef.current?.name)

    // reset eye scale to normal
    if (eyeLRef.current) (eyeLRef.current as any).scale.set(1,1,1)
    if (eyeRRef.current) (eyeRRef.current as any).scale.set(1,1,1)

    // start RAF
    lastMsRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastMsRef.current) / 1000) // clamp big steps
      lastMsRef.current = now
      tRef.current += dt

      animateHead(dt)
      animateMouth(dt)
      animateEyes(dt)
      animateBlink(dt)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene])

  // update mouth command when viseme changes (tick will smooth it)
  useEffect(() => {
    const raw = VISEME_OPEN[viseme] ?? 0
    let cmd = Math.pow(raw, EASE_POW) * OPEN_GAIN
    mouthCmdRef.current = clamp01(cmd)
  }, [viseme])

  // --- animation implementations ---

  function animateHead(dt: number) {
    if (!scene) return
    const t = tRef.current

    // gentle idle sinusoids
    const yaw   = HEAD_YAW   * Math.sin(t * 0.6)
    const pitch = HEAD_PITCH * Math.sin(t * 0.8 + 1.3)
    const roll  = HEAD_ROLL  * Math.sin(t * 0.5 + 0.7)
    scene.rotation.set(pitch, yaw, roll)

    // bob up/down; add slight emphasis with mouth openness (talking)
    const openness = mouthCurOpenRef.current
    scene.position.y = -0.2 + HEAD_BOB_Y * (Math.sin(t * 2.2) * 0.6 + openness * 0.4)
  }

  function animateMouth(dt: number) {
    const targets = mouthTargetsRef.current
    if (!targets.length) return

    // --- Stage 1: attack/release smoothing for TARGET (slew limiter) ---
    const cmd = mouthCmdRef.current
    const tgtPrev = mouthTgtOpenRef.current
    const tc = cmd > tgtPrev ? ATTACK_TC : RELEASE_TC
    const alpha = 1 - Math.exp(-dt / Math.max(1e-3, tc))   // TC → per-frame alpha
    const tgtNext = tgtPrev + (cmd - tgtPrev) * alpha
    mouthTgtOpenRef.current = clamp01(tgtNext)

    // --- Stage 2: smooth CURRENT toward TARGET (existing behavior) ---
    const curPrev = mouthCurOpenRef.current
    const curNext = lerp(curPrev, mouthTgtOpenRef.current, LERP_MOUTH)
    mouthCurOpenRef.current = curNext

    const smileTarget =
      mouthTgtOpenRef.current > 0.8 ? 0.25 :
      mouthTgtOpenRef.current > 0.5 ? 0.14 :
      0.02

    for (const { mesh, openIdx, smileIdx } of targets) {
      const infl = mesh.morphTargetInfluences as number[]
      infl[openIdx] = curNext
      if (smileIdx != null) infl[smileIdx] = lerp(infl[smileIdx] ?? 0, smileTarget, LERP_SMILE)
      mesh.needsUpdate = true
    }
  }

  function animateEyes(dt: number) {
    const eyeL = eyeLRef.current as any
    const eyeR = eyeRRef.current as any
    if (!eyeL && !eyeR) return

    // saccades (choose a new gaze target every 0.8–2.2s)
    saccadeTimerRef.current += dt
    if (saccadeTimerRef.current >= nextSaccadeInRef.current) {
      saccadeTimerRef.current = 0
      nextSaccadeInRef.current = rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX)
      saccadeDurRef.current = SACCADE_TIME

      // new target (bounded)
      eyeGazeStartRef.current = { ...eyeGazeRef.current }
      eyeGazeTargetRef.current = {
        yaw:   rand(-EYE_YAW_MAX, EYE_YAW_MAX),
        pitch: rand(-EYE_PITCH_MAX, EYE_PITCH_MAX),
      }
    }

    // glide toward target
    const r = clamp01(saccadeTimerRef.current / saccadeDurRef.current)
    const s = easeOutCubic(r)
    eyeGazeRef.current.yaw   = lerp(eyeGazeStartRef.current.yaw,   eyeGazeTargetRef.current.yaw,   s)
    eyeGazeRef.current.pitch = lerp(eyeGazeStartRef.current.pitch, eyeGazeTargetRef.current.pitch, s)

    // apply rotations (Y = yaw, X = pitch)
    if (eyeL) { eyeL.rotation.y = eyeGazeRef.current.yaw;   eyeL.rotation.x = eyeGazeRef.current.pitch }
    if (eyeR) { eyeR.rotation.y = eyeGazeRef.current.yaw;   eyeR.rotation.x = eyeGazeRef.current.pitch }
  }

  function animateBlink(dt: number) {
    const eyeL = eyeLRef.current as any
    const eyeR = eyeRRef.current as any
    if (!eyeL && !eyeR) return

    if (!blinkingRef.current) {
      blinkTimerRef.current += dt
      if (blinkTimerRef.current >= nextBlinkInRef.current) {
        // start a blink
        blinkingRef.current = true
        blinkPhaseRef.current = 0
        blinkTimerRef.current = 0
        nextBlinkInRef.current = rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX)
      }
    }

    if (blinkingRef.current) {
      blinkPhaseRef.current += dt / BLINK_DURATION
      const p = blinkPhaseRef.current

      // symmetric close+open with a fast curve
      const k = p < 0.5 ? (p / 0.5) : (1 - (p - 0.5) / 0.5) // 0→1→0
      const closed = easeOutCubic(k)
      const yScale = THREE.MathUtils.lerp(1, BLINK_CLOSED_Y, closed)

      if (eyeL) eyeL.scale.y = yScale
      if (eyeR) eyeR.scale.y = yScale

      if (p >= 1) {
        blinkingRef.current = false
        if (eyeL) eyeL.scale.y = 1
        if (eyeR) eyeR.scale.y = 1
      }
    }
  }

  if (!scene) return null
  return <primitive object={scene} position={[0, -0.2, 0]} />
}

useGLTF.preload('/character/face.glb')

// --- small helpers ---
function findBySubstring(root: THREE.Object3D, needle: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse(obj => {
    if (found) return
    if (obj.name && obj.name.toLowerCase().includes(needle.toLowerCase())) {
      found = obj
    }
  })
  return found
}
function rand(a:number,b:number){ return a + Math.random()*(b-a) }

