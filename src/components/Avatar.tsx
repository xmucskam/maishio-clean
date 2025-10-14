import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

type Props = { modelUrl: string; viseme: string; gain?: number }

// --- Viseme → openness map
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

// --- Tuning
const OPEN_GAIN = 1.35
const EASE_POW = 0.9
const LERP_MOUTH = 0.5
const LERP_SMILE = 0.25

// two-stage smoothing for mouth
const ATTACK_TC  = 0.16
const RELEASE_TC = 0.22

// head motion
const HEAD_YAW   = 0.10
const HEAD_PITCH = 0.05
const HEAD_ROLL  = 0.02
const HEAD_BOB_Y = 0.015

// gaze via ARKit eyeLook* morphs
const EYE_YAW_MAX   = 0.18
const EYE_PITCH_MAX = 0.10
const SACCADE_EVERY_MIN = 0.8
const SACCADE_EVERY_MAX = 2.2
const SACCADE_TIME      = 0.22

// blink via ARKit eyelid morphs
const BLINK_EVERY_MIN = 3.5
const BLINK_EVERY_MAX = 7.5
const BLINK_DURATION  = 0.18
const BLINK_MAX       = 1.0

// helpers
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x))
const lerp = (a:number,b:number,t:number)=>a+(b-a)*t
const easeOutCubic = (t:number)=>1-Math.pow(1-t,3)

export default function Avatar({ modelUrl, viseme, gain = 1 }: Props) {
  return (
    <div style={{ width: 360, height: 360, borderRadius: '50%', border: '4px solid #3b82f6', overflow: 'hidden', background: '#111' }}>
      {/* Fix disappearing eyes/glasses at close range: use a smaller near plane */}
      <Canvas camera={{ position: [0, 0.12, 1.15], fov: 28, near: 0.01, far: 100 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.15} />
        <Suspense fallback={null}>
          <Head url={modelUrl} viseme={viseme} gain={gain} />
        </Suspense>
        <Environment preset="studio" />
        {/* Keep user zoom but prevent getting too close (clipping) */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          target={[0, 0.53, 0]}
          minDistance={0.85}
          maxDistance={2.2}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  )
}

function Head({ url, viseme, gain }: { url: string; viseme: string; gain: number }) {
  const gltf = useGLTF(url) as any
  const scene = useMemo(() => gltf?.scene?.clone(true), [gltf])

  // time refs
  const tRef = useRef(0)
  const lastMsRef = useRef(0)

  // --- MOUTH refs
  const mouthTargetsRef = useRef<Array<{ mesh:any; idxMouthOpen:number|null; idxJawOpen:number|null; idxSmileL:number|null; idxSmileR:number|null }>>([])
  const mouthCmdRef = useRef(0)      // from viseme map
  const mouthTgtOpenRef = useRef(0)  // after attack/release
  const mouthCurOpenRef = useRef(0)  // after lerp

  // --- BLINK refs
  const blinkEnabledRef = useRef(false)
  const blinkTargetsRef = useRef<Array<{ mesh:any; idxL:number|null; idxR:number|null; idxBoth:number|null }>>([])
  const blinkTimerRef = useRef(0)
  const nextBlinkInRef = useRef(rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX))
  const blinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0)

  // --- GAZE via ARKit morphs
  const gazeTimerRef = useRef(0)
  const gazeDurRef = useRef(SACCADE_TIME)
  const nextGazeInRef = useRef(rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX))
  const gazeStartRef = useRef({ yaw: 0, pitch: 0 })
  const gazeTargetRef = useRef({ yaw: 0, pitch: 0 })
  const gazeRef = useRef({ yaw: 0, pitch: 0 })
  const eyeLookTargetsRef = useRef<Array<{
    mesh:any,
    L_in:number|null, L_out:number|null, L_up:number|null, L_down:number|null,
    R_in:number|null, R_out:number|null, R_up:number|null, R_down:number|null,
    eyesUp:number|null, eyesDown:number|null
  }>>([])

  // log morphs (debug)
  useEffect(() => {
    if (!scene) return
    console.log('🔎 Morph targets:')
    scene.traverse((o:any) => {
      if (o.isMesh && o.morphTargetDictionary) {
        console.log(`Mesh "${o.name}":`, Object.keys(o.morphTargetDictionary))
      }
    })
  }, [scene])

  // size & center
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

  // discover morph indices (+ fix glasses rendering)
  useEffect(() => {
    if (!scene) return

    // Make thin/transparent glasses behave better at close range
    scene.traverse((o:any) => {
      if (!o.isMesh) return
      const name = (o.name || '').toLowerCase()
      if (name.includes('glass')) {
        const mat = o.material as THREE.Material & { transparent?: boolean; depthWrite?: boolean; side?: number; opacity?: number }
        if (mat) {
          mat.transparent = true
          mat.depthWrite = false
          mat.side = THREE.DoubleSide
          if (typeof (mat as any).opacity === 'number' && (mat as any).opacity === 0) {
            (mat as any).opacity = 0.6 // ensure not fully invisible
          }
        }
        o.renderOrder = 2
        o.frustumCulled = false
      }
      // keep eyes rendered even if very close
      if (name.includes('eye')) {
        o.frustumCulled = false
      }
    })

    // --- MOUTH
    const mouthFound: typeof mouthTargetsRef.current = []
    scene.traverse((o:any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const d = o.morphTargetDictionary as Record<string, number>
      const idxMouthOpen = d['mouthOpen'] ?? d['jawOpen'] ?? null
      const idxJawOpen = d['jawOpen'] ?? null
      const idxSmileL = d['mouthSmileLeft'] ?? d['mouthSmile'] ?? null
      const idxSmileR = d['mouthSmileRight'] ?? d['mouthSmile'] ?? null
      if (idxMouthOpen != null || idxJawOpen != null)
        mouthFound.push({ mesh:o, idxMouthOpen, idxJawOpen, idxSmileL, idxSmileR })
    })
    mouthTargetsRef.current = mouthFound

    // --- BLINK (eyelids)
    const blinkers: typeof blinkTargetsRef.current = []
    scene.traverse((o:any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const d = o.morphTargetDictionary as Record<string, number>
      const idxL   = d['eyeBlinkLeft']  ?? null
      const idxR   = d['eyeBlinkRight'] ?? null
      const idxBoth= d['eyesClosed']    ?? d['blink'] ?? null
      if (idxL != null || idxR != null || idxBoth != null)
        blinkers.push({ mesh:o, idxL, idxR, idxBoth })
    })
    blinkTargetsRef.current = blinkers
    blinkEnabledRef.current = blinkers.length > 0
    console.log('🫣 Blink via ARKit morphs:', blinkEnabledRef.current, blinkers.map(b=>b.mesh.name))

    // --- EYE LOOK (gaze via morphs)
    const lookers: typeof eyeLookTargetsRef.current = []
    scene.traverse((o:any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const d = o.morphTargetDictionary as Record<string, number>
      const L_in   = d['eyeLookInLeft']   ?? null
      const L_out  = d['eyeLookOutLeft']  ?? null
      const L_up   = d['eyeLookUpLeft']   ?? null
      const L_down = d['eyeLookDownLeft'] ?? null
      const R_in   = d['eyeLookInRight']  ?? null
      const R_out  = d['eyeLookOutRight'] ?? null
      const R_up   = d['eyeLookUpRight']  ?? null
      const R_down = d['eyeLookDownRight']?? null
      const eyesUp   = d['eyesLookUp']    ?? null
      const eyesDown = d['eyesLookDown']  ?? null

      if (
        L_in!=null || L_out!=null || L_up!=null || L_down!=null ||
        R_in!=null || R_out!=null || R_up!=null || R_down!=null ||
        eyesUp!=null || eyesDown!=null
      ) {
        lookers.push({ mesh:o, L_in, L_out, L_up, L_down, R_in, R_out, R_up, R_down, eyesUp, eyesDown })
      }
    })
    eyeLookTargetsRef.current = lookers

    // start RAF
    lastMsRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastMsRef.current) / 1000)
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

  // viseme → mouth command (with external gain)
  useEffect(() => {
    const raw = VISEME_OPEN[viseme] ?? 0
    let cmd = Math.pow(raw, EASE_POW) * OPEN_GAIN * (gain ?? 1)
    mouthCmdRef.current = clamp01(cmd)
  }, [viseme, gain])

  // --- animation implementations ---

  function animateHead(dt: number) {
    if (!scene) return
    const t = tRef.current
    const yaw   = HEAD_YAW   * Math.sin(t * 0.6)
    const pitch = HEAD_PITCH * Math.sin(t * 0.8 + 1.3)
    const roll  = HEAD_ROLL  * Math.sin(t * 0.5 + 0.7)
    scene.rotation.set(pitch, yaw, roll)

    const openness = mouthCurOpenRef.current
    scene.position.y = -0.2 + HEAD_BOB_Y * (Math.sin(t * 2.2) * 0.6 + openness * 0.4)
  }

  function animateMouth(dt: number) {
    const targets = mouthTargetsRef.current
    if (!targets.length) return

    // Stage 1: attack/release smoothing for TARGET
    const cmd = mouthCmdRef.current
    const tgtPrev = mouthTgtOpenRef.current
    const tc = cmd > tgtPrev ? ATTACK_TC : RELEASE_TC
    const alpha = 1 - Math.exp(-dt / Math.max(1e-3, tc))
    const tgtNext = tgtPrev + (cmd - tgtPrev) * alpha
    mouthTgtOpenRef.current = clamp01(tgtNext)

    // Stage 2: smooth CURRENT toward TARGET
    const curPrev = mouthCurOpenRef.current
    const curNext = lerp(curPrev, mouthTgtOpenRef.current, LERP_MOUTH)
    mouthCurOpenRef.current = curNext

    const smileTarget =
      mouthTgtOpenRef.current > 0.8 ? 0.25 :
      mouthTgtOpenRef.current > 0.5 ? 0.14 : 0.02

    for (const { mesh, idxMouthOpen, idxJawOpen, idxSmileL, idxSmileR } of targets) {
      const infl = mesh.morphTargetInfluences as number[]
      if (idxMouthOpen != null) infl[idxMouthOpen] = curNext
      if (idxJawOpen   != null) infl[idxJawOpen]   = Math.min(1, curNext * 0.65)
      if (idxSmileL != null) infl[idxSmileL] = lerp(infl[idxSmileL] ?? 0, smileTarget, LERP_SMILE)
      if (idxSmileR != null) infl[idxSmileR] = lerp(infl[idxSmileR] ?? 0, smileTarget, LERP_SMILE)
      mesh.needsUpdate = true
    }
  }

  function animateEyes(dt: number) {
    // pick new gaze
    gazeTimerRef.current += dt
    if (gazeTimerRef.current >= nextGazeInRef.current) {
      gazeTimerRef.current = 0
      nextGazeInRef.current = rand(SACCADE_EVERY_MIN, SACCADE_EVERY_MAX)
      gazeDurRef.current = SACCADE_TIME
      gazeStartRef.current = { ...gazeRef.current }
      gazeTargetRef.current = {
        yaw:   rand(-EYE_YAW_MAX, EYE_YAW_MAX),
        pitch: rand(-EYE_PITCH_MAX, EYE_PITCH_MAX),
      }
    }

    // glide
    const r = clamp01(gazeTimerRef.current / gazeDurRef.current)
    const s = easeOutCubic(r)
    gazeRef.current.yaw   = lerp(gazeStartRef.current.yaw,   gazeTargetRef.current.yaw,   s)
    gazeRef.current.pitch = lerp(gazeStartRef.current.pitch, gazeTargetRef.current.pitch, s)

    // convert yaw/pitch → morph weights
    const yaw   = gazeRef.current.yaw
    const pitch = gazeRef.current.pitch

    const L_out_w = clamp01( Math.max(0,  yaw / EYE_YAW_MAX) )
    const L_in_w  = clamp01( Math.max(0, -yaw / EYE_YAW_MAX) )
    const R_in_w  = clamp01( Math.max(0,  yaw / EYE_YAW_MAX) )
    const R_out_w = clamp01( Math.max(0, -yaw / EYE_YAW_MAX) )
    const up_w    = clamp01( Math.max(0,  pitch / EYE_PITCH_MAX) )
    const down_w  = clamp01( Math.max(0, -pitch / EYE_PITCH_MAX) )

    for (const t of eyeLookTargetsRef.current) {
      const infl = t.mesh.morphTargetInfluences as number[]
      if (t.L_out  != null) infl[t.L_out]  = L_out_w
      if (t.L_in   != null) infl[t.L_in]   = L_in_w
      if (t.L_up   != null) infl[t.L_up]   = up_w
      if (t.L_down != null) infl[t.L_down] = down_w
      if (t.R_in   != null) infl[t.R_in]   = R_in_w
      if (t.R_out  != null) infl[t.R_out]  = R_out_w
      if (t.R_up   != null) infl[t.R_up]   = up_w
      if (t.R_down != null) infl[t.R_down] = down_w
      if (t.eyesUp   != null) infl[t.eyesUp]   = up_w
      if (t.eyesDown != null) infl[t.eyesDown] = down_w
      t.mesh.needsUpdate = true
    }
  }

  function animateBlink(dt: number) {
    if (!blinkEnabledRef.current) return
    const blinks = blinkTargetsRef.current
    if (!blinks.length) return

    if (!blinkingRef.current) {
      blinkTimerRef.current += dt
      if (blinkTimerRef.current >= nextBlinkInRef.current) {
        blinkingRef.current = true
        blinkPhaseRef.current = 0
        blinkTimerRef.current = 0
        nextBlinkInRef.current = rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX)
      }
    }

    if (blinkingRef.current) {
      blinkPhaseRef.current += dt / BLINK_DURATION
      const p = blinkPhaseRef.current
      const k = p < 0.5 ? (p / 0.5) : (1 - (p - 0.5) / 0.5)
      const closed = easeOutCubic(k) * BLINK_MAX

      for (const { mesh, idxL, idxR, idxBoth } of blinks) {
        const infl = mesh.morphTargetInfluences as number[]
        if (idxBoth != null) infl[idxBoth] = closed
        else {
          if (idxL != null) infl[idxL] = closed
          if (idxR != null) infl[idxR] = closed
        }
        mesh.needsUpdate = true
      }

      if (p >= 1) {
        blinkingRef.current = false
        for (const { mesh, idxL, idxR, idxBoth } of blinks) {
          const infl = mesh.morphTargetInfluences as number[]
          if (idxBoth != null) infl[idxBoth] = 0
          else {
            if (idxL != null) infl[idxL] = 0
            if (idxR != null) infl[idxR] = 0
          }
          mesh.needsUpdate = true
        }
      }
    }
  }

  if (!scene) return null
  return <primitive object={scene} position={[0, -0.2, 0]} />
}

useGLTF.preload('/character/face.glb')

// --- helpers ---
function rand(a:number,b:number){ return a + Math.random()*(b-a) }

