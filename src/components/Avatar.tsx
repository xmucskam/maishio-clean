import React, { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils'

type AvatarConfig = {
  openGain: number
  easePow: number
  lerpMouth: number
  lerpSmile: number
  attackTc: number
  releaseTc: number
  oeuMinCutoff: number
  oeuBeta: number
  oeuDCutoff: number
  smileAssistHigh: number
  smileAssistMid: number
  headYaw: number
  headPitch: number
  headRoll: number
  headBobY: number
  idleIntensity: number
  blinkEveryMin: number
  blinkEveryMax: number
}

type Props = {
  modelUrl: string
  viseme: string
  gain?: number
  headRig?: 'scene' | 'neck' | 'head'
  config?: AvatarConfig
}

// ---------------- Defaults + static tables
const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  openGain: 0.85, easePow: 1.25, lerpMouth: 0.12, lerpSmile: 0.16,
  attackTc: 0.45, releaseTc: 0.85,
  oeuMinCutoff: 0.06, oeuBeta: 0.05, oeuDCutoff: 0.60,
  smileAssistHigh: 0.18, smileAssistMid: 0.10,
  headYaw: 0.01, headPitch: 0.001, headRoll: 0.001, headBobY: 0.001,
  idleIntensity: 1.0,
  blinkEveryMin: 3.5, blinkEveryMax: 7.5,
}

const DEFAULTS = {
  VISEME_OPEN: { X:0.02, A:0.70, B:0.22, C:0.62, D:0.55, E:0.42, F:0.35, G:0.72, H:0.28, L:0.46 },
  IDLE_BASE: {
    browUp: 0.05, browDown: 0.03, squint: 0.04, eyeWide: 0.03,
    press: 0.02, smile: 0.02, cheek: 0.03, jaw: 0.08,
  },
  IDLE_NOISE: { browHz:0.12, squintHz:0.18, pressHz:0.10, smileHz:0.08, cheekHz:0.14 },
  SACCADE: { everyMin:0.8, everyMax:2.2, time:0.22 },
  BLINK:   { duration:0.18, max:1.0 },
}

// ---------------- helpers
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x))
const lerp = (a:number,b:number,t:number)=>a+(b-a)*t
const easeOutCubic = (t:number)=>1-Math.pow(1-t,3)
function rand(a:number,b:number){ return a + Math.random()*(b-a) }

// ---- One Euro filter
class LowPass {
  private y = 0; private s = false
  constructor(private alpha: number) {}
  setAlpha(a:number){ this.alpha = a }
  filter(x:number){ this.y = this.s ? (this.alpha*x + (1-this.alpha)*this.y) : x; this.s = true; return this.y }
}
function alphaFromCutoff(cutoff:number, dt:number){
  const tau = 1.0 / (2*Math.PI*cutoff)
  return 1.0 / (1.0 + tau/dt)
}
class OneEuro {
  private xFilt = new LowPass(1)
  private dxFilt = new LowPass(1)
  private lastVal: number | null = null
  constructor(private minCutoff:number, private beta:number, private dCutoff:number){}
  filter(x:number, dt:number){
    const prev = this.lastVal ?? x
    const dx = (x - prev) / Math.max(1e-6, dt)
    const aD = alphaFromCutoff(this.dCutoff, dt)
    this.dxFilt.setAlpha(aD)
    const dxf = this.dxFilt.filter(dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(dxf)
    const aX = alphaFromCutoff(cutoff, dt)
    this.xFilt.setAlpha(aX)
    const out = this.xFilt.filter(x)
    this.lastVal = out
    return out
  }
}

const DEBUG_AXES = false

export default function Avatar({ modelUrl, viseme, gain = 1, headRig = 'neck', config }: Props) {
  const cfg = config ?? DEFAULT_AVATAR_CONFIG
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
      <Canvas camera={{ position: [0, 0.55, 1.05], fov: 26, near: 0.01, far: 100 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.15} />
        <Suspense fallback={null}>
          <Head url={modelUrl} viseme={viseme} gain={gain} headRig={headRig} cfg={cfg} />
        </Suspense>
        <Environment preset="studio" />
        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} target={[0, 0.45, 0]} minDistance={1.0} maxDistance={1.0} enableDamping dampingFactor={0.08}/>
      </Canvas>
    </div>
  )
}

// ---------- Rhubarb -> ARKit-ish mouth recipe
type MouthRecipe = Partial<{
  jawOpen:number, mouthFunnel:number, mouthPucker:number, mouthClose:number,
  mouthPress:number, mouthRollLower:number, mouthRollUpper:number,
  mouthShrugLower:number, mouthShrugUpper:number,
  mouthSmileLeft:number, mouthSmileRight:number,
  mouthStretchLeft:number, mouthStretchRight:number,
  mouthUpperUpLeft:number, mouthUpperUpRight:number,
  mouthLowerDownLeft:number, mouthLowerDownRight:number
}>
const VISEME_RECIPE: Record<string, MouthRecipe> = {
  X: { mouthClose: 0.12, mouthPress: 0.06, jawOpen: 0.02 },
  A: { jawOpen: 0.95, mouthFunnel: 0.20, mouthUpperUpLeft: 0.18, mouthUpperUpRight: 0.18 },
  B: { jawOpen: 0.30, mouthStretchLeft: 0.55, mouthStretchRight: 0.55, mouthSmileLeft: 0.20, mouthSmileRight: 0.20 },
  C: { jawOpen: 0.22, mouthPucker: 0.85, mouthFunnel: 0.45 },
  D: { jawOpen: 0.48, mouthFunnel: 0.65 },
  E: { jawOpen: 0.10, mouthPress: 0.18, mouthClose: 0.22 },
  F: { jawOpen: 0.22, mouthRollUpper: 0.40, mouthUpperUpLeft: 0.30, mouthUpperUpRight: 0.30 },
  G: { jawOpen: 0.04, mouthClose: 0.85, mouthPress: 0.28 },
  H: { jawOpen: 0.16, mouthLowerDownLeft: 0.45, mouthLowerDownRight: 0.45, mouthPress: 0.18 },
  L: { jawOpen: 0.22, mouthRollUpper: 0.40, mouthUpperUpLeft: 0.30, mouthUpperUpRight: 0.30 },
}

function AvatarCanvasFallback(){ return null }

function Head({ url, viseme, gain, headRig, cfg }: { url: string; viseme: string; gain: number; headRig: 'scene'|'neck'|'head'; cfg: AvatarConfig }) {
  const gltf = useGLTF(url) as any
  const scene = useMemo(() => (gltf?.scene ? cloneSkeleton(gltf.scene) : null), [gltf])

  // time
  const tRef = useRef(0)
  const lastMsRef = useRef(0)

  // ----- MOUTH
  const mouthTargetsRef = useRef<Array<{ mesh:any; idxMouthOpen:number|null; idxJawOpen:number|null; idxSmileL:number|null; idxSmileR:number|null }>>([])
  const mouthCmdRef = useRef(0)
  const mouthTgtOpenRef = useRef(0)
  const mouthCurOpenRef = useRef(0)
  const euroRef = useRef<OneEuro | null>(null)

  // viseme crossfade controller
  const visemeRef = useRef<string>('X')
  const lastVisemeRef = useRef<string>('X')
  const visemeBlendRef = useRef(1) // 0..1

  // ----- BLINK
  const blinkEnabledRef = useRef(false)
  const blinkTargetsRef = useRef<Array<{ mesh:any; idxL:number|null; idxR:number|null; idxBoth:number|null }>>([])
  const blinkTimerRef = useRef(0)
  const nextBlinkInRef = useRef(rand(cfg.blinkEveryMin, cfg.blinkEveryMax))
  const blinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0)

  // ----- GAZE
  const gazeTimerRef = useRef(0)
  const gazeDurRef = useRef(DEFAULTS.SACCADE.time)
  const nextGazeInRef = useRef(rand(DEFAULTS.SACCADE.everyMin, DEFAULTS.SACCADE.everyMax))
  const gazeStartRef = useRef({ yaw: 0, pitch: 0 })
  const gazeTargetRef = useRef({ yaw: 0, pitch: 0 })
  const gazeRef = useRef({ yaw: 0, pitch: 0 })
  const eyeLookTargetsRef = useRef<Array<{ mesh:any, L_in:number|null, L_out:number|null, L_up:number|null, L_down:number|null, R_in:number|null, R_out:number|null, R_up:number|null, R_down:number|null, eyesUp:number|null, eyesDown:number|null }>>([])

  // ----- IDLE (extended)
  const idleTargetsRef = useRef<Array<{ mesh:any;
    idxBrowInner:number|null; idxBrowOuterL:number|null; idxBrowOuterR:number|null; idxBrowDownL:number|null; idxBrowDownR:number|null;
    idxSquintL:number|null; idxSquintR:number|null; idxEyeWideL:number|null; idxEyeWideR:number|null;
    idxCheekSqL:number|null; idxCheekSqR:number|null;
    idxMouthPress:number|null; idxMouthPressL:number|null; idxMouthPressR:number|null;
    idxSmileL:number|null; idxSmileR:number|null;
    idxMouthStretchL:number|null; idxMouthStretchR:number|null;
    idxMouthRollLower:number|null; idxMouthRollUpper:number|null;
    idxMouthShrugLower:number|null; idxMouthShrugUpper:number|null;
    idxMouthClose:number|null; idxMouthPucker:number|null; idxMouthFunnel:number|null;
    idxMouthUpperUpL:number|null; idxMouthUpperUpR:number|null; idxMouthLowerDownL:number|null; idxMouthLowerDownR:number|null;
    idxNoseSneerL:number|null; idxNoseSneerR:number|null; idxJawOpen:number|null;
  }>>([])

  // micro-gesture
  type MicroKind = 'browFlash'|'press'|'smirkL'|'smirkR'|'sneerL'|'sneerR'
  const MICRO_GESTURE = { everyMin: 4.0, everyMax: 9.0, dur: 0.42 } as const
  const MICRO_KINDS: MicroKind[] = ['browFlash','press','smirkL','smirkR','sneerL','sneerR']
  const microTimerRef = useRef(0)
  const microNextInRef = useRef(rand(MICRO_GESTURE.everyMin, MICRO_GESTURE.everyMax))
  const microActiveRef = useRef<null | {t:number; kind:MicroKind}>(null)

  // bones
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

  // discover morph indices + bones + start RAF
  useEffect(() => {
    if (!scene) return

    // One Euro init
    euroRef.current = new OneEuro(cfg.oeuMinCutoff, cfg.oeuBeta, cfg.oeuDCutoff)

    // material niceties
    scene.traverse((o:any) => {
      if (!o.isMesh) return
      const name = (o.name || '').toLowerCase()
      const rawMat = o.material
      const mats: any[] = Array.isArray(rawMat) ? rawMat : [rawMat]
      if (name.includes('glass')) {
        mats.forEach((m) => {
          if (!m) return
          m.transparent = true
          m.depthWrite = false
          m.side = THREE.DoubleSide
          if (typeof m.opacity === 'number' && m.opacity === 0) m.opacity = 0.6
        })
        o.renderOrder = 2
        o.frustumCulled = false
      }
      if (name.includes('eye')) o.frustumCulled = false
    })

    // MOUTH (primary)
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

    // IDLE + extended mouth shapes
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

      const idxMouthClose      = d['mouthClose'] ?? null
      const idxMouthPucker     = d['mouthPucker'] ?? null
      const idxMouthFunnel     = d['mouthFunnel'] ?? null
      const idxMouthUpperUpL   = d['mouthUpperUpLeft'] ?? null
      const idxMouthUpperUpR   = d['mouthUpperUpRight'] ?? null
      const idxMouthLowerDownL = d['mouthLowerDownLeft'] ?? null
      const idxMouthLowerDownR = d['mouthLowerDownRight'] ?? null

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
        idxMouthClose!=null || idxMouthPucker!=null || idxMouthFunnel!=null ||
        idxMouthUpperUpL!=null || idxMouthUpperUpR!=null || idxMouthLowerDownL!=null || idxMouthLowerDownR!=null ||
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
          idxMouthClose, idxMouthPucker, idxMouthFunnel,
          idxMouthUpperUpL, idxMouthUpperUpR, idxMouthLowerDownL, idxMouthLowerDownR,
          idxNoseSneerL, idxNoseSneerR,
          idxJawOpen
        })
      }
    })
    idleTargetsRef.current = idleFound

    // --- Find head/neck bones
    function findBoneByNames(root: THREE.Object3D, names: string[]): THREE.Bone | null {
      let found: THREE.Bone | null = null
      root.traverse((o: any) => { if (!found && o.type === 'Bone' && names.includes(o.name)) found = o })
      if (!found) {
        root.traverse((o: any) => {
          if (o.isSkinnedMesh && o.skeleton) {
            for (const b of o.skeleton.bones) if (names.includes(b.name)) { found = b as THREE.Bone; break }
          }
        })
      }
      return found
    }
    const HEAD_NAMES = ['Head','head','Wolf3D_Head','CC_Base_Head','mixamorigHead','mixamorig:Head']
    const NECK_NAMES = ['Neck','neck','Wolf3D_Neck','CC_Base_Neck','mixamorigNeck','mixamorig:Neck']
    headNodeRef.current = findBoneByNames(scene, HEAD_NAMES)
    neckNodeRef.current = findBoneByNames(scene, NECK_NAMES)

    for (const node of [scene, headNodeRef.current, neckNodeRef.current]) {
      if (node && !baseQuatMapRef.current.has(node)) {
        baseQuatMapRef.current.set(node, node.quaternion.clone())
      }
    }

    if (DEBUG_AXES) {
      const axes = new THREE.AxesHelper(0.15)
      axes.renderOrder = 9999
      ;(axes as any).raycast = () => null
      let targetForAxes: THREE.Object3D = scene
      if (headRig === 'neck' && neckNodeRef.current) targetForAxes = neckNodeRef.current
      else if (headRig === 'head' && headNodeRef.current) targetForAxes = headNodeRef.current
      targetForAxes.add(axes)
    }

    lastMsRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastMsRef.current) / 1000)
      lastMsRef.current = now
      tRef.current += dt

      animateHead(dt)
      animateIdle(dt)
      animateMouth(dt)
      animateEyes(dt)
      animateBlink(dt)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, headRig, cfg.oeuMinCutoff, cfg.oeuBeta, cfg.oeuDCutoff])

  // viseme input — start a longer blend (≈220 ms)
  useEffect(() => {
    const v = (viseme || 'X').toUpperCase()
    if (v !== lastVisemeRef.current) {
      lastVisemeRef.current = v
      visemeBlendRef.current = 0
    }
  }, [viseme])

  function animateHead(dt: number) {
    if (!scene) return
    const t = tRef.current

    const yaw   = cfg.headYaw   * Math.sin(t * 0.6)
    const pitch = cfg.headPitch * Math.sin(t * 0.8 + 1.3)
    const roll  = cfg.headRoll  * Math.sin(t * 0.5 + 0.7)

    let target: THREE.Object3D = scene
    if (headRig === 'neck' && neckNodeRef.current) target = neckNodeRef.current
    else if (headRig === 'head' && headNodeRef.current) target = headNodeRef.current

    const baseQ = baseQuatMapRef.current.get(target) ?? target.quaternion
    const qYaw   = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    const qPitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0))
    const qRoll  = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll))
    target.quaternion.copy(baseQ).multiply(qYaw).multiply(qPitch).multiply(qRoll)

    const openness = mouthCurOpenRef.current
    scene.position.y = -0.2 + cfg.headBobY * (Math.sin(t * 2.2) * 0.6 + openness * 0.4)
  }

  function animateMouth(dt: number) {
    // longer viseme cross-fade (~220 ms)
    visemeBlendRef.current = Math.min(1, visemeBlendRef.current + dt / 0.22)
    const curV = visemeRef.current
    const nextV = lastVisemeRef.current

    const openOf = (v:string) => {
      const raw = (DEFAULTS.VISEME_OPEN as any)[v] ?? 0
      return clamp01(Math.pow(raw, cfg.easePow) * cfg.openGain * (gain ?? 1))
    }
    const cmdPrev = openOf(curV)
    const cmdNext = openOf(nextV)
    const cmd = lerp(cmdPrev, cmdNext, visemeBlendRef.current)
    mouthCmdRef.current = clamp01(cmd)

    if (visemeBlendRef.current >= 1) visemeRef.current = nextV

    // Stage 1: asymmetric TC
    const tgtPrev = mouthTgtOpenRef.current
    const tc = mouthCmdRef.current > tgtPrev ? cfg.attackTc : cfg.releaseTc
    const alpha = 1 - Math.exp(-dt / Math.max(1e-3, tc))
    const tgt = clamp01(tgtPrev + (mouthCmdRef.current - tgtPrev) * alpha)

    // Stage 2: light visual lerp
    const preFilter = lerp(mouthCurOpenRef.current, tgt, cfg.lerpMouth)

    // Stage 3: One Euro filter (anti-jitter)
    if (!euroRef.current) euroRef.current = new OneEuro(cfg.oeuMinCutoff, cfg.oeuBeta, cfg.oeuDCutoff)
    const filtered = euroRef.current.filter(preFilter, Math.max(1e-3, dt))
    mouthTgtOpenRef.current = tgt
    mouthCurOpenRef.current = filtered

    // smile assist
    const smileAssist =
      mouthTgtOpenRef.current > 0.8 ? cfg.smileAssistHigh :
      mouthTgtOpenRef.current > 0.5 ? cfg.smileAssistMid  : 0.02

    // Primary mouth targets — direct assignment
    for (const { mesh, idxMouthOpen, idxJawOpen, idxSmileL, idxSmileR } of mouthTargetsRef.current) {
      const infl = mesh.morphTargetInfluences as number[]
      if (idxMouthOpen != null) infl[idxMouthOpen] = mouthCurOpenRef.current
      if (idxJawOpen   != null) infl[idxJawOpen]   = mouthCurOpenRef.current * 0.52
      if (idxSmileL != null) infl[idxSmileL] = lerp(infl[idxSmileL] ?? 0, smileAssist, cfg.lerpSmile)
      if (idxSmileR != null) infl[idxSmileR] = lerp(infl[idxSmileR] ?? 0, smileAssist, cfg.lerpSmile)
    }

    // Extra ARKit-ish shapes
    const v = nextV
    const recipe = VISEME_RECIPE[v] || VISEME_RECIPE['X']
    const scaleByOpen = (x:number) => clamp01( x * (0.50 + 0.22 * mouthCurOpenRef.current) )

    for (const t of idleTargetsRef.current) {
      const infl = t.mesh.morphTargetInfluences as number[]
      const set = (idx:number|null, val:number)=>{ if (idx!=null) infl[idx] = val }

      set(t.idxMouthFunnel,     scaleByOpen(recipe.mouthFunnel ?? 0))
      set(t.idxMouthPucker,     scaleByOpen(recipe.mouthPucker ?? 0))
      set(t.idxMouthPress,      scaleByOpen(recipe.mouthPress ?? 0))
      set(t.idxMouthRollLower,  scaleByOpen(recipe.mouthRollLower ?? 0))
      set(t.idxMouthRollUpper,  scaleByOpen(recipe.mouthRollUpper ?? 0))
      set(t.idxMouthShrugLower, scaleByOpen(recipe.mouthShrugLower ?? 0))
      set(t.idxMouthShrugUpper, scaleByOpen(recipe.mouthShrugUpper ?? 0))
      set(t.idxSmileL,          scaleByOpen(recipe.mouthSmileLeft ?? 0))
      set(t.idxSmileR,          scaleByOpen(recipe.mouthSmileRight ?? 0))
      set(t.idxMouthStretchL,   scaleByOpen(recipe.mouthStretchLeft ?? 0))
      set(t.idxMouthStretchR,   scaleByOpen(recipe.mouthStretchRight ?? 0))
      set(t.idxJawOpen,         clamp01(recipe.jawOpen ?? 0))
      if (t.idxMouthPress != null && recipe.mouthClose != null)
        infl[t.idxMouthPress] = Math.max(infl[t.idxMouthPress], clamp01(recipe.mouthClose) * 0.8)
      set(t.idxMouthUpperUpL,   clamp01(recipe.mouthUpperUpLeft  ?? 0))
      set(t.idxMouthUpperUpR,   clamp01(recipe.mouthUpperUpRight ?? 0))
      set(t.idxMouthLowerDownL, clamp01(recipe.mouthLowerDownLeft  ?? 0))
      set(t.idxMouthLowerDownR, clamp01(recipe.mouthLowerDownRight ?? 0))
    }
  }

  function animateEyes(dt: number) {
    gazeTimerRef.current += dt
    if (gazeTimerRef.current >= nextGazeInRef.current) {
      gazeTimerRef.current = 0
      nextGazeInRef.current = rand(DEFAULTS.SACCADE.everyMin, DEFAULTS.SACCADE.everyMax)
      gazeDurRef.current = DEFAULTS.SACCADE.time
      gazeStartRef.current = { ...gazeRef.current }
      gazeTargetRef.current = { yaw: rand(-0.18, 0.18), pitch: rand(-0.10, 0.10) }
    }
    const r = clamp01(gazeTimerRef.current / gazeDurRef.current)
    const s = easeOutCubic(r)
    gazeRef.current.yaw   = lerp(gazeStartRef.current.yaw,   gazeTargetRef.current.yaw,   s)
    gazeRef.current.pitch = lerp(gazeStartRef.current.pitch, gazeTargetRef.current.pitch, s)

    const yaw   = gazeRef.current.yaw
    const pitch = gazeRef.current.pitch

    const L_out_w = clamp01( Math.max(0,  yaw / 0.18) )
    const L_in_w  = clamp01( Math.max(0, -yaw / 0.18) )
    const R_in_w  = clamp01( Math.max(0,  yaw / 0.18) )
    const R_out_w = clamp01( Math.max(0, -yaw / 0.18) )
    const up_w    = clamp01( Math.max(0,  pitch / 0.10) )
    const down_w  = clamp01( Math.max(0, -pitch / 0.10) )

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
        nextBlinkInRef.current = rand(cfg.blinkEveryMin, cfg.blinkEveryMax)
      }
    }

    if (blinkingRef.current) {
      blinkPhaseRef.current += dt / DEFAULTS.BLINK.duration
      const p = blinkPhaseRef.current
      const k = p < 0.5 ? (p / 0.5) : (1 - (p - 0.5) / 0.5)
      const closed = easeOutCubic(k) * DEFAULTS.BLINK.max

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

  function animateIdle(dt: number) {
    const targets = idleTargetsRef.current
    if (!targets.length) return

    const open = mouthCurOpenRef.current
    const idleIntensity = cfg.idleIntensity
    const idleScale = (1 - clamp01(open * 1.2)) * idleIntensity
    const breathScale = 0.4 + 0.6 * idleScale

    const t = tRef.current

    const browUp   = DEFAULTS.IDLE_BASE.browUp   * (0.6 + 0.4*Math.sin(t*DEFAULTS.IDLE_NOISE.browHz*2*Math.PI) + 0.2*Math.sin(t*0.07))
    const browDown = DEFAULTS.IDLE_BASE.browDown * (0.5 + 0.5*Math.sin(t*0.09))
    const squint   = DEFAULTS.IDLE_BASE.squint   * (0.55+ 0.45*Math.sin(t*DEFAULTS.IDLE_NOISE.squintHz*2*Math.PI))
    const eyeWide  = DEFAULTS.IDLE_BASE.eyeWide  * (0.45+ 0.55*Math.sin(t*0.15 + 0.8))
    const pressW   = DEFAULTS.IDLE_BASE.press    * (0.6 + 0.4*Math.sin(t*DEFAULTS.IDLE_NOISE.pressHz*2*Math.PI))
    const smileW   = DEFAULTS.IDLE_BASE.smile    * (0.55+ 0.45*Math.sin(t*DEFAULTS.IDLE_NOISE.smileHz*2*Math.PI + 0.6))
    const cheekW   = DEFAULTS.IDLE_BASE.cheek    * (0.6 + 0.4*Math.sin(t*DEFAULTS.IDLE_NOISE.cheekHz*2*Math.PI + 1.2))

    const jaw = clamp01( (0.5 + 0.5*Math.sin(t*0.44*2*Math.PI)) * DEFAULTS.IDLE_BASE.jaw ) * breathScale

    if (!microActiveRef.current) {
      microTimerRef.current += dt
      if (microTimerRef.current >= microNextInRef.current) {
        microTimerRef.current = 0
        microNextInRef.current = rand(MICRO_GESTURE.everyMin, MICRO_GESTURE.everyMax)
        const kinds: MicroKind[] = MICRO_KINDS
        microActiveRef.current = { t: 0, kind: kinds[(Math.random()*kinds.length)|0] }
      }
    }
    let micro = { brow:0, press:0, smirkL:0, smirkR:0, sneerL:0, sneerR:0 }
    if (microActiveRef.current) {
      const s = microActiveRef.current
      s.t += dt
      const r = clamp01(s.t / MICRO_GESTURE.dur)
      const tri = r < 0.5 ? (r/0.5) : (1 - (r-0.5)/0.5)
      const k = easeOutCubic(tri)
      switch (s.kind) {
        case 'browFlash': micro.brow  = 0.45*k; break
        case 'press':     micro.press = 0.25*k; break
        case 'smirkL':    micro.smirkL= 0.35*k; break
        case 'smirkR':    micro.smirkR= 0.35*k; break
        case 'sneerL':    micro.sneerL= 0.35*k; break
        case 'sneerR':    micro.sneerR= 0.35*k; break
      }
      if (r >= 1) microActiveRef.current = null
    }

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

      if (t.idxBrowInner  != null) infl[t.idxBrowInner]  = browUpW * 1.0
      if (t.idxBrowOuterL != null) infl[t.idxBrowOuterL] = browUpW * 0.7
      if (t.idxBrowOuterR != null) infl[t.idxBrowOuterR] = browUpW * 0.7
      if (t.idxBrowDownL  != null) infl[t.idxBrowDownL]  = browDownW * 0.6
      if (t.idxBrowDownR  != null) infl[t.idxBrowDownR]  = browDownW * 0.6

      if (t.idxSquintL != null) infl[t.idxSquintL] = squintW
      if (t.idxSquintR != null) infl[t.idxSquintR] = squintW
      if (t.idxEyeWideL!= null) infl[t.idxEyeWideL]= eyeWideW
      if (t.idxEyeWideR!= null) infl[t.idxEyeWideR]= eyeWideW

      if (t.idxCheekSqL != null) infl[t.idxCheekSqL] = cheekL
      if (t.idxCheekSqR != null) infl[t.idxCheekSqR] = cheekR

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

      if (t.idxNoseSneerL != null) infl[t.idxNoseSneerL] = sneerL
      if (t.idxNoseSneerR != null) infl[t.idxNoseSneerR] = sneerR

      if (t.idxJawOpen != null) infl[t.idxJawOpen] = Math.max(infl[t.idxJawOpen] ?? 0, jaw)
    }
  }

  if (!scene) return <AvatarCanvasFallback />
  return <primitive object={scene} position={[0, -0.2, 0]} />
}

useGLTF.preload('/character/face.glb')

