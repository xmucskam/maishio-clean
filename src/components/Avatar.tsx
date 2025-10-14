// components/Avatar.tsx
import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils' // <-- crucial for skinned meshes

type Props = {
  modelUrl: string
  viseme: string
  gain?: number
  /** choose which node rotates for idle/head motion */
  headRig?: 'scene' | 'neck' | 'head'
}

// ---------------- Viseme → openness map
const VISEME_OPEN: Record<string, number> = {
  X: 0.02, A: 1.00, B: 0.25, C: 0.85, D: 0.75, E: 0.55, F: 0.45, G: 1.00, H: 0.35, L: 0.60,
}

// ---------------- Tuning
const OPEN_GAIN = 1.35
const EASE_POW = 0.9
const LERP_MOUTH = 0.5
const LERP_SMILE = 0.25

// two-stage smoothing for mouth
const ATTACK_TC  = 0.16
const RELEASE_TC = 0.22

// head/neck motion amounts
const HEAD_YAW   = 0.01
const HEAD_PITCH = 0.001
const HEAD_ROLL  = 0.001
const HEAD_BOB_Y = 0.001

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

// ---------------- Idle animation tuning (uses your morphs)
const IDLE_BASE = {
  browUp: 0.05,
  browDown: 0.03,
  squint: 0.04,
  eyeWide: 0.03,
  press: 0.02,
  smile: 0.02,
  cheek: 0.03,
  jaw: 0.08,    // breathing amplitude
}
const IDLE_NOISE = {
  browHz: 0.12, squintHz: 0.18, pressHz: 0.10, smileHz: 0.08, cheekHz: 0.14
}
const MICRO_GESTURE = {
  everyMin: 4.0,
  everyMax: 9.0,
  dur: 0.42,
  amp: {
    browFlash: 0.45,
    press: 0.25,
    smirkL: 0.35,
    smirkR: 0.35,
    sneerL: 0.35,
    sneerR: 0.35,
  } as const,
}
type MicroKind = keyof typeof MICRO_GESTURE.amp
const MICRO_KINDS: MicroKind[] = ['browFlash','press','smirkL','smirkR','sneerL','sneerR']

// ---------------- helpers
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x))
const lerp = (a:number,b:number,t:number)=>a+(b-a)*t
const easeOutCubic = (t:number)=>1-Math.pow(1-t,3)
function rand(a:number,b:number){ return a + Math.random()*(b-a) }

// set to true briefly if you want to see gizmo on the rotated node
const DEBUG_AXES = false

export default function Avatar({ modelUrl, viseme, gain = 1, headRig = 'neck' }: Props) {
  return (
    <div
      style={{
        width: 360,
        height: 360,
        borderRadius: '50%',
        border: '4px solid #3b82f6',
        overflow: 'hidden',
        background: '#111'
      }}
    >
      <Canvas
        camera={{
          // eye-level camera (raised and aimed at eyes)
          position: [0, 0.55, 1.05],
          fov: 26,
          near: 0.01,
          far: 100
        }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.15} />
        <Suspense fallback={null}>
          <Head url={modelUrl} viseme={viseme} gain={gain} headRig={headRig} />
        </Suspense>
        <Environment preset="studio" />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          // eye target a bit higher for eye level
          target={[0, 0.45, 0]}
          minDistance={1.0}
          maxDistance={1.0}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  )
}

function Head({ url, viseme, gain, headRig }: { url: string; viseme: string; gain: number; headRig: 'scene'|'neck'|'head' }) {
  const gltf = useGLTF(url) as any

  // IMPORTANT: clone skinned model with SkeletonUtils so bones remain bound to meshes
  const scene = useMemo(() => (gltf?.scene ? cloneSkeleton(gltf.scene) : null), [gltf])

  // time refs
  const tRef = useRef(0)
  const lastMsRef = useRef(0)

  // ----- MOUTH refs
  const mouthTargetsRef = useRef<Array<{
    mesh:any; idxMouthOpen:number|null; idxJawOpen:number|null; idxSmileL:number|null; idxSmileR:number|null
  }>>([])
  const mouthCmdRef = useRef(0)
  const mouthTgtOpenRef = useRef(0)
  const mouthCurOpenRef = useRef(0)

  // ----- BLINK refs
  const blinkEnabledRef = useRef(false)
  const blinkTargetsRef = useRef<Array<{ mesh:any; idxL:number|null; idxR:number|null; idxBoth:number|null }>>([])
  const blinkTimerRef = useRef(0)
  const nextBlinkInRef = useRef(rand(BLINK_EVERY_MIN, BLINK_EVERY_MAX))
  const blinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0)

  // ----- GAZE refs
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

  // ----- IDLE refs (extended)
  const idleTargetsRef = useRef<Array<{
    mesh:any;
    // brows
    idxBrowInner:number|null; idxBrowOuterL:number|null; idxBrowOuterR:number|null;
    idxBrowDownL:number|null; idxBrowDownR:number|null;
    // eye squint / wide
    idxSquintL:number|null; idxSquintR:number|null;
    idxEyeWideL:number|null; idxEyeWideR:number|null;
    // cheek
    idxCheekSqL:number|null; idxCheekSqR:number|null;
    // mouth
    idxMouthPress:number|null; idxMouthPressL:number|null; idxMouthPressR:number|null;
    idxSmileL:number|null; idxSmileR:number|null;
    idxMouthStretchL:number|null; idxMouthStretchR:number|null;
    idxMouthRollLower:number|null; idxMouthRollUpper:number|null;
    idxMouthShrugLower:number|null; idxMouthShrugUpper:number|null;
    // nose
    idxNoseSneerL:number|null; idxNoseSneerR:number|null;
    // jaw
    idxJawOpen:number|null;
  }>>([])

  // micro-gesture controller
  const microTimerRef = useRef(0)
  const microNextInRef = useRef(rand(MICRO_GESTURE.everyMin, MICRO_GESTURE.everyMax))
  const microActiveRef = useRef<null | {t:number; kind:MicroKind}>(null)

  // head/neck bones & base rotations
  const headNodeRef = useRef<THREE.Object3D | null>(null)
  const neckNodeRef = useRef<THREE.Object3D | null>(null)
  const baseQuatMapRef = useRef(new Map<THREE.Object3D, THREE.Quaternion>())

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

  // discover morph indices + material fixes + bones + start RAF
  useEffect(() => {
    if (!scene) return

    // material niceties
    scene.traverse((o:any) => {
      if (!o.isMesh) return
      const name = (o.name || '').toLowerCase()
      if (name.includes('glass')) {
        const mat = o.material as THREE.Material & { transparent?: boolean; depthWrite?: boolean; side?: number; opacity?: number }
        if (mat) {
          mat.transparent = true
          mat.depthWrite = false
          mat.side = THREE.DoubleSide
          if (typeof (mat as any).opacity === 'number' && (mat as any).opacity === 0) (mat as any).opacity = 0.6
        }
        o.renderOrder = 2
        o.frustumCulled = false
      }
      if (name.includes('eye')) o.frustumCulled = false
    })

    // MOUTH
    const mouthFound: typeof mouthTargetsRef.current = []
    scene.traverse((o:any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const d = o.morphTargetDictionary as Record<string, number>
      const idxMouthOpen = d['mouthOpen'] ?? null
      const idxJawOpen   = d['jawOpen']   ?? null
      const idxSmileL    = d['mouthSmileLeft']  ?? null
      const idxSmileR    = d['mouthSmileRight'] ?? null
      if (idxMouthOpen != null || idxJawOpen != null)
        mouthFound.push({ mesh:o, idxMouthOpen, idxJawOpen, idxSmileL, idxSmileR })
    })
    mouthTargetsRef.current = mouthFound

    // BLINK
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

    // EYE LOOK
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
      if (L_in!=null||L_out!=null||L_up!=null||L_down!=null||R_in!=null||R_out!=null||R_up!=null||R_down!=null||eyesUp!=null||eyesDown!=null)
        lookers.push({ mesh:o, L_in, L_out, L_up, L_down, R_in, R_out, R_up, R_down, eyesUp, eyesDown })
    })
    eyeLookTargetsRef.current = lookers

    // IDLE discovery
    const idleFound: typeof idleTargetsRef.current = []
    scene.traverse((o:any) => {
      if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
      const d = o.morphTargetDictionary as Record<string, number>

      const idxBrowInner   = d['browInnerUp'] ?? null
      const idxBrowOuterL  = d['browOuterUpLeft']  ?? null
      const idxBrowOuterR  = d['browOuterUpRight'] ?? null
      const idxBrowDownL   = d['browDownLeft'] ?? null
      const idxBrowDownR   = d['browDownRight'] ?? null

      const idxSquintL     = d['eyeSquintLeft']  ?? null
      const idxSquintR     = d['eyeSquintRight'] ?? null
      const idxEyeWideL    = d['eyeWideLeft']    ?? null
      const idxEyeWideR    = d['eyeWideRight']   ?? null

      const idxCheekSqL    = d['cheekSquintLeft']  ?? null
      const idxCheekSqR    = d['cheekSquintRight'] ?? null

      const idxMouthPress  = d['mouthPress'] ?? null
      const idxMouthPressL = d['mouthPressLeft']  ?? null
      const idxMouthPressR = d['mouthPressRight'] ?? null
      const idxSmileL      = d['mouthSmileLeft']  ?? null
      const idxSmileR      = d['mouthSmileRight'] ?? null
      const idxMouthStretchL = d['mouthStretchLeft']  ?? null
      const idxMouthStretchR = d['mouthStretchRight'] ?? null
      const idxMouthRollLower = d['mouthRollLower'] ?? null
      const idxMouthRollUpper = d['mouthRollUpper'] ?? null
      const idxMouthShrugLower= d['mouthShrugLower'] ?? null
      const idxMouthShrugUpper= d['mouthShrugUpper'] ?? null

      const idxNoseSneerL  = d['noseSneerLeft']  ?? null
      const idxNoseSneerR  = d['noseSneerRight'] ?? null

      const idxJawOpen     = d['jawOpen'] ?? null

      if (
        idxBrowInner!=null || idxBrowOuterL!=null || idxBrowOuterR!=null || idxBrowDownL!=null || idxBrowDownR!=null ||
        idxSquintL!=null || idxSquintR!=null || idxEyeWideL!=null || idxEyeWideR!=null ||
        idxCheekSqL!=null || idxCheekSqR!=null ||
        idxMouthPress!=null || idxMouthPressL!=null || idxMouthPressR!=null ||
        idxSmileL!=null || idxSmileR!=null || idxMouthStretchL!=null || idxMouthStretchR!=null ||
        idxMouthRollLower!=null || idxMouthRollUpper!=null || idxMouthShrugLower!=null || idxMouthShrugUpper!=null ||
        idxNoseSneerL!=null || idxNoseSneerR!=null || idxJawOpen!=null
      ) {
        idleFound.push({
          mesh:o,
          idxBrowInner, idxBrowOuterL, idxBrowOuterR, idxBrowDownL, idxBrowDownR,
          idxSquintL, idxSquintR, idxEyeWideL, idxEyeWideR,
          idxCheekSqL, idxCheekSqR,
          idxMouthPress, idxMouthPressL, idxMouthPressR,
          idxSmileL, idxSmileR,
          idxMouthStretchL, idxMouthStretchR,
          idxMouthRollLower, idxMouthRollUpper,
          idxMouthShrugLower, idxMouthShrugUpper,
          idxNoseSneerL, idxNoseSneerR,
          idxJawOpen
        })
      }
    })
    idleTargetsRef.current = idleFound

    // --- Find head/neck bones (search scene & each SkinnedMesh.skeleton)
    function findBoneByNames(root: THREE.Object3D, names: string[]): THREE.Bone | null {
      let found: THREE.Bone | null = null

      // 1) any Bone in scene with matching name
      root.traverse((o: any) => {
        if (found) return
        if (o.type === 'Bone' && names.includes(o.name)) found = o
      })

      // 2) fall back: look into skeletons explicitly
      if (!found) {
        root.traverse((o: any) => {
          if (found) return
          if (o.isSkinnedMesh && o.skeleton) {
            for (const b of o.skeleton.bones) {
              if (names.includes(b.name)) { found = b as THREE.Bone; break }
            }
          }
        })
      }

      return found
    }

    const HEAD_NAMES = ['Head','head','Wolf3D_Head','CC_Base_Head','mixamorigHead','mixamorig:Head']
    const NECK_NAMES = ['Neck','neck','Wolf3D_Neck','CC_Base_Neck','mixamorigNeck','mixamorig:Neck']

    headNodeRef.current = findBoneByNames(scene, HEAD_NAMES)
    neckNodeRef.current = findBoneByNames(scene, NECK_NAMES)

    // remember base quaternions so we rotate additively
    for (const node of [scene, headNodeRef.current, neckNodeRef.current]) {
      if (node && !baseQuatMapRef.current.has(node)) {
        baseQuatMapRef.current.set(node, node.quaternion.clone())
      }
    }

    // DEBUG: confirm
    function fullPath(o: THREE.Object3D | null) {
      if (!o) return '(null)'
      const names: string[] = []
      let p: THREE.Object3D | null = o
      while (p) { names.push(p.name || p.type); p = p.parent as any }
      return names.reverse().join(' / ')
    }
    console.log('✅ headNode:', headNodeRef.current?.name, 'path:', fullPath(headNodeRef.current))
    console.log('✅ neckNode:', neckNodeRef.current?.name, 'path:', fullPath(neckNodeRef.current))

    if (DEBUG_AXES) {
      const axes = new THREE.AxesHelper(0.15)
      axes.renderOrder = 9999
      ;(axes as any).raycast = () => null
      let targetForAxes: THREE.Object3D = scene
      if (headRig === 'neck' && neckNodeRef.current) targetForAxes = neckNodeRef.current
      else if (headRig === 'head' && headNodeRef.current) targetForAxes = headNodeRef.current
      targetForAxes.add(axes)
    }

    // start RAF loop
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
      animateIdle(dt)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, headRig])

  // viseme input
  useEffect(() => {
    const raw = VISEME_OPEN[viseme] ?? 0
    let cmd = Math.pow(raw, EASE_POW) * OPEN_GAIN * (gain ?? 1)
    mouthCmdRef.current = clamp01(cmd)
  }, [viseme, gain])

  // ---------------- animations
  function animateHead(dt: number) {
    if (!scene) return
    const t = tRef.current

    // gentle idle head motion
    const yaw   = HEAD_YAW   * Math.sin(t * 0.6)
    const pitch = HEAD_PITCH * Math.sin(t * 0.8 + 1.3)
    const roll  = HEAD_ROLL  * Math.sin(t * 0.5 + 0.7)

    // choose node to rotate
    let target: THREE.Object3D = scene
    if (headRig === 'neck' && neckNodeRef.current) target = neckNodeRef.current
    else if (headRig === 'head' && headNodeRef.current) target = headNodeRef.current

    // apply rotation ADDITIVELY (preserve bind pose)
    const baseQ = baseQuatMapRef.current.get(target) ?? target.quaternion
    const qYaw   = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    const qPitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0))
    const qRoll  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll))
    target.quaternion.copy(baseQ).multiply(qYaw).multiply(qPitch).multiply(qRoll)

    // subtle vertical bob only on root
    const openness = mouthCurOpenRef.current
    scene.position.y = -0.2 + HEAD_BOB_Y * (Math.sin(t * 2.2) * 0.6 + openness * 0.4)
  }

  function animateMouth(dt: number) {
    const targets = mouthTargetsRef.current
    if (!targets.length) return

    // Stage 1: attack/release smoothing
    const cmd = mouthCmdRef.current
    const tgtPrev = mouthTgtOpenRef.current
    const tc = cmd > tgtPrev ? ATTACK_TC : RELEASE_TC
    const alpha = 1 - Math.exp(-dt / Math.max(1e-3, tc))
    const tgtNext = tgtPrev + (cmd - tgtPrev) * alpha
    mouthTgtOpenRef.current = clamp01(tgtNext)

    // Stage 2: lerp current toward target
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
    }
  }

  function animateEyes(dt: number) {
    // saccade timer
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
        }
      }
    }
  }

  // ----------- Natural idle (uses your morphs)
  function animateIdle(dt: number) {
    const targets = idleTargetsRef.current
    if (!targets.length) return

    // Suppress most idle while speaking
    const open = mouthCurOpenRef.current
    const idleScale = 1 - clamp01(open * 1.2)
    // keep breathing even when speaking (reduced)
    const breathScale = 0.4 + 0.6 * idleScale

    const t = tRef.current

    // base drifts (low amplitude, layered sines)
    const browUp   = IDLE_BASE.browUp   * (0.6 + 0.4*Math.sin(t*IDLE_NOISE.browHz*2*Math.PI) + 0.2*Math.sin(t*0.07))
    const browDown = IDLE_BASE.browDown * (0.5 + 0.5*Math.sin(t*0.09))
    const squint   = IDLE_BASE.squint   * (0.55+ 0.45*Math.sin(t*IDLE_NOISE.squintHz*2*Math.PI))
    const eyeWide  = IDLE_BASE.eyeWide  * (0.45+ 0.55*Math.sin(t*0.15 + 0.8))
    const pressW   = IDLE_BASE.press    * (0.6 + 0.4*Math.sin(t*IDLE_NOISE.pressHz*2*Math.PI))
    const smileW   = IDLE_BASE.smile    * (0.55+ 0.45*Math.sin(t*IDLE_NOISE.smileHz*2*Math.PI + 0.6))
    const cheekW   = IDLE_BASE.cheek    * (0.6 + 0.4*Math.sin(t*IDLE_NOISE.cheekHz*2*Math.PI + 1.2))

    // breathing jaw (~0.22 Hz)
    const jaw = clamp01( (0.5 + 0.5*Math.sin(t*0.44*2*Math.PI)) * IDLE_BASE.jaw ) * breathScale

    // micro-gestures
    if (!microActiveRef.current) {
      microTimerRef.current += dt
      if (microTimerRef.current >= microNextInRef.current) {
        microTimerRef.current = 0
        microNextInRef.current = rand(MICRO_GESTURE.everyMin, MICRO_GESTURE.everyMax)
        microActiveRef.current = { t: 0, kind: MICRO_KINDS[(Math.random()*MICRO_KINDS.length)|0] }
      }
    }
    let micro = { brow:0, press:0, smirkL:0, smirkR:0, sneerL:0, sneerR:0 }
    if (microActiveRef.current) {
      const s = microActiveRef.current
      s.t += dt
      const r = clamp01(s.t / MICRO_GESTURE.dur)
      const tri = r < 0.5 ? (r/0.5) : (1 - (r-0.5)/0.5)
      const k = easeOutCubic(tri)
      const amp = MICRO_GESTURE.amp[s.kind]
      switch (s.kind) {
        case 'browFlash': micro.brow  = amp*k; break
        case 'press':     micro.press = amp*k; break
        case 'smirkL':    micro.smirkL= amp*k; break
        case 'smirkR':    micro.smirkR= amp*k; break
        case 'sneerL':    micro.sneerL= amp*k; break
        case 'sneerR':    micro.sneerR= amp*k; break
      }
      if (r >= 1) microActiveRef.current = null
    }

    // outputs (scaled)
    const browUpW   = clamp01((browUp + micro.brow) * idleScale)
    const browDownW = clamp01(browDown * idleScale * 0.8)
    const squintW   = clamp01(squint * idleScale)
    const eyeWideW  = clamp01(eyeWide * idleScale * (0.6 + 0.4*(1 - squintW)))
    const pressOut  = clamp01((pressW + micro.press) * idleScale)
    const smileL    = clamp01((smileW + micro.smirkL*0.6) * idleScale)
    const smileR    = clamp01((smileW + micro.smirkR*0.6) * idleScale)
    const cheekL    = clamp01((cheekW + micro.smirkL*0.5) * idleScale)
    const cheekR    = clamp01((cheekW + micro.smirkR*0.5) * idleScale)
    const sneerL    = clamp01(micro.sneerL * idleScale)
    const sneerR    = clamp01(micro.sneerR * idleScale)

    for (const t of targets) {
      const infl = t.mesh.morphTargetInfluences as number[]

      // brows
      if (t.idxBrowInner  != null) infl[t.idxBrowInner]  = browUpW * 1.0
      if (t.idxBrowOuterL != null) infl[t.idxBrowOuterL] = browUpW * 0.7
      if (t.idxBrowOuterR != null) infl[t.idxBrowOuterR] = browUpW * 0.7
      if (t.idxBrowDownL  != null) infl[t.idxBrowDownL]  = browDownW * 0.6
      if (t.idxBrowDownR  != null) infl[t.idxBrowDownR]  = browDownW * 0.6

      // eyes
      if (t.idxSquintL != null) infl[t.idxSquintL] = squintW
      if (t.idxSquintR != null) infl[t.idxSquintR] = squintW
      if (t.idxEyeWideL!= null) infl[t.idxEyeWideL]= eyeWideW
      if (t.idxEyeWideR!= null) infl[t.idxEyeWideR]= eyeWideW

      // cheeks
      if (t.idxCheekSqL != null) infl[t.idxCheekSqL] = cheekL
      if (t.idxCheekSqR != null) infl[t.idxCheekSqR] = cheekR

      // mouth
      if (t.idxMouthPress != null) infl[t.idxMouthPress] = pressOut
      else {
        if (t.idxMouthPressL != null) infl[t.idxMouthPressL] = pressOut * 0.9
        if (t.idxMouthPressR != null) infl[t.idxMouthPressR] = pressOut * 0.9
      }
      if (t.idxSmileL != null) infl[t.idxSmileL] = smileL
      if (t.idxSmileR != null) infl[t.idxSmileR] = smileR

      if (t.idxMouthStretchL != null) infl[t.idxMouthStretchL] = (pressOut*0.35 + smileL*0.25)
      if (t.idxMouthStretchR != null) infl[t.idxMouthStretchR] = (pressOut*0.35 + smileR*0.25)

      if (t.idxMouthRollLower != null) infl[t.idxMouthRollLower] = pressOut * 0.25
      if (t.idxMouthRollUpper != null) infl[t.idxMouthRollUpper] = pressOut * 0.18

      if (t.idxMouthShrugLower != null) infl[t.idxMouthShrugLower] = (1-idleScale)*0.02
      if (t.idxMouthShrugUpper != null) infl[t.idxMouthShrugUpper] = (1-idleScale)*0.02

      // nose sneer
      if (t.idxNoseSneerL != null) infl[t.idxNoseSneerL] = sneerL
      if (t.idxNoseSneerR != null) infl[t.idxNoseSneerR] = sneerR

      // breathing jaw (doesn't fight speech; we take max)
      if (t.idxJawOpen != null) infl[t.idxJawOpen] = Math.max(infl[t.idxJawOpen] ?? 0, jaw)
    }
  }

  if (!scene) return null
  return <primitive object={scene} position={[0, -0.2, 0]} />
}

useGLTF.preload('/character/face.glb')


