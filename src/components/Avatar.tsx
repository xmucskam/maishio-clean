// import React, { useEffect, useMemo } from 'react'
// import * as THREE from 'three'
// import { Canvas } from '@react-three/fiber'
// import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

// type Props = {
//   modelUrl: string
//   viseme: string // e.g. 'A','B','C','D','E','F','G','H','X','L' (Rhubarb)
// }

// /**
//  * Map Rhubarb visemes to approximate ARKit blendshapes.
//  * Tune these weights to your model. Keys must match (fuzzy) your morph target names.
//  */
// const VISEME_TO_ARKIT: Record<string, Record<string, number>> = {
//   // REST
//   X: { jawOpen: 0, mouthFunnel: 0, mouthPucker: 0, mouthSmileLeft: 0, mouthSmileRight: 0 },

//   // A: open mouth (AA)
//   A: { jawOpen: 0.65, mouthFunnel: 0.10 },

//   // B: M/B/P → closed lips
//   B: { jawOpen: 0.02, mouthPucker: 0.20 },

//   // C: “ch/j/sh/k” style
//   C: { jawOpen: 0.35, mouthFunnel: 0.35 },

//   // D: “t/d” / “e”-ish
//   D: { jawOpen: 0.30, mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 },

//   // E: “ee”
//   E: { jawOpen: 0.15, mouthSmileLeft: 0.35, mouthSmileRight: 0.35 },

//   // F: “f/v” (lower lip to teeth)
//   F: { jawOpen: 0.10, mouthFunnel: 0.10, mouthPucker: 0.30 },

//   // G: “o/u”
//   G: { jawOpen: 0.20, mouthFunnel: 0.45, mouthPucker: 0.25 },

//   // H: short neutral
//   H: { jawOpen: 0.10 },

//   // Optional: L (if Rhubarb ever emits it in your config)
//   L: { jawOpen: 0.25, mouthSmileLeft: 0.10, mouthSmileRight: 0.10 }
// }

// // names you may want to zero when switching visemes:
// const ALL_AR_KIT_KEYS = [
//   'jawOpen', 'mouthFunnel', 'mouthPucker',
//   'mouthSmileLeft', 'mouthSmileRight',
//   'mouthUpperUpLeft', 'mouthUpperUpRight'
// ]

// // fuzzy find a morph target in this mesh dict
// function findKey(dict: Record<string, number>, name: string) {
//   const n = name.toLowerCase()
//   let best: string | null = null
//   for (const k of Object.keys(dict)) {
//     if (k.toLowerCase() === n) return k
//     if (k.toLowerCase().includes(n)) best = k
//   }
//   return best
// }

// function applyVisemeToScene(scene: THREE.Object3D, viseme: string) {
//   const weights = VISEME_TO_ARKIT[viseme] ?? VISEME_TO_ARKIT['X']

//   scene.traverse(obj => {
//     const mesh = obj as any
//     if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return

//     const dict = mesh.morphTargetDictionary as Record<string, number>
//     const infl = mesh.morphTargetInfluences as number[]

//     // zero out the set we manage
//     for (const k of ALL_AR_KIT_KEYS) {
//       const key = findKey(dict, k)
//       if (key) infl[dict[key]] = 0
//     }

//     // set new weights
//     for (const [key, val] of Object.entries(weights)) {
//       const match = findKey(dict, key)
//       if (match) infl[dict[match]] = val
//     }

//     mesh.needsUpdate = true
//   })
// }

// function Head({ url, viseme }: { url: string; viseme: string }) {
//   const gltf = useGLTF(url) as any
//   const scene = useMemo(() => gltf.scene.clone(true), [gltf])

//   useEffect(() => {
//     if (!scene) return
//     applyVisemeToScene(scene, viseme)
//   }, [scene, viseme])

//   // basic placement; tweak for your model
//   return <primitive object={scene} position={[0, -1.2, 0]} />
// }

// export default function Avatar({ modelUrl, viseme }: Props) {
//   return (
//     <div style={{ width: 320, height: 320, borderRadius: '50%', border: '4px solid #3b82f6', overflow: 'hidden' }}>
//       <Canvas camera={{ position: [0, 0.2, 2.8], fov: 35 }}>
//         <ambientLight intensity={0.7} />
//         <directionalLight position={[2, 3, 2]} intensity={1.0} />
//         <Head url={modelUrl} viseme={viseme} />
//         <Environment preset="studio" />
//         <OrbitControls enablePan={false} enableZoom={false} />
//       </Canvas>
//     </div>
//   )
// }

// // drei cache for GLB
// useGLTF.preload('/character/face.glb')




import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

type Props = { modelUrl: string; viseme: string }

// --- Viseme → ARKit weights (tune later) ---
const VISEME_TO_ARKIT: Record<string, Record<string, number>> = {
  X: { jawOpen: 0, mouthFunnel: 0, mouthPucker: 0, mouthSmileLeft: 0, mouthSmileRight: 0 },
  A: { jawOpen: 0.65, mouthFunnel: 0.10 },
  B: { jawOpen: 0.02, mouthPucker: 0.20 }, // M/B/P (closed lips)
  C: { jawOpen: 0.35, mouthFunnel: 0.35 },
  D: { jawOpen: 0.30, mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 },
  E: { jawOpen: 0.15, mouthSmileLeft: 0.35, mouthSmileRight: 0.35 },
  F: { jawOpen: 0.10, mouthPucker: 0.30 },
  G: { jawOpen: 0.20, mouthFunnel: 0.45, mouthPucker: 0.25 },
  H: { jawOpen: 0.10 },
  L: { jawOpen: 0.25, mouthSmileLeft: 0.10, mouthSmileRight: 0.10 },
}
const CONTROLLED_KEYS = Array.from(
  new Set(Object.values(VISEME_TO_ARKIT).flatMap(o => Object.keys(o)))
)

// normalize morph names to compare
function norm(s: string) {
  return s
    .replace(/^blendshape[_.]/i, '')
    .replace(/^blendshapes[_.]/i, '')
    .replace(/^bs[_.-]/i, '')
    .replace(/^arkit[_.-]/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

type Binding = { mesh: THREE.Mesh, index: number }
type BindMap = Record<string, Binding[]> // arkitKey -> bindings

// build a binding map from scene meshes to ARKit keys
function buildBindings(root: THREE.Object3D): BindMap {
  const map: BindMap = {}
  root.traverse((o: any) => {
    if (!o.isMesh || !o.morphTargetDictionary || !o.morphTargetInfluences) return
    const dict = o.morphTargetDictionary as Record<string, number>
    const names = Object.keys(dict)

    // DEBUG: list raw keys once
    console.groupCollapsed(`[Avatar] Morph targets in ${o.name || '(unnamed mesh)'}`)
    console.log(names)
    console.groupEnd()

    for (const raw of names) {
      const n = norm(raw)
      for (const ar of CONTROLLED_KEYS) {
        if (n.includes(norm(ar))) {
          (map[ar] ||= []).push({ mesh: o, index: dict[raw] })
        }
      }
    }
  })
  return map
}

const SMOOTH = 0.35
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function Head({ url, viseme }: { url: string; viseme: string }) {
  const gltf = useGLTF(url) as any
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  const bindingsRef = useRef<BindMap | null>(null)
  const [boundOnce, setBoundOnce] = useState(false)

  useEffect(() => {
    if (!scene || boundOnce) return
    const b = buildBindings(scene)
    bindingsRef.current = b
    setBoundOnce(true)
    // If no bindings, warn so you know to adjust mapping
    if (Object.keys(b).length === 0) {
      console.warn('[Avatar] No ARKit keys matched. Check morph names in console and update mapping.')
    } else {
      console.log('[Avatar] Bound keys:', Object.keys(b))
    }
  }, [scene, boundOnce])

  useEffect(() => {
    if (!scene || !bindingsRef.current) return
    const weights = VISEME_TO_ARKIT[viseme] || VISEME_TO_ARKIT['X']

    // zero controlled keys smoothly
    for (const key of CONTROLLED_KEYS) {
      const binds = bindingsRef.current[key]
      if (!binds) continue
      for (const { mesh, index } of binds) {
        const infl = mesh.morphTargetInfluences!
        infl[index] = lerp(infl[index] ?? 0, 0, SMOOTH)
        mesh.needsUpdate = true
      }
    }

    // apply viseme weights smoothly
    for (const [key, val] of Object.entries(weights)) {
      const binds = bindingsRef.current[key]
      if (!binds) continue
      for (const { mesh, index } of binds) {
        const infl = mesh.morphTargetInfluences!
        infl[index] = lerp(infl[index] ?? 0, val, SMOOTH)
        mesh.needsUpdate = true
      }
    }
  }, [scene, viseme])

  return <primitive object={scene} position={[0, -1.2, 0]} />
}

export default function Avatar({ modelUrl, viseme }: Props) {
  return (
    <div style={{ width: 320, height: 320, borderRadius: '50%', border: '4px solid #3b82f6', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 0.2, 2.2], fov: 35 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={1.0} />
        <Head url={modelUrl} viseme={viseme} />
        <Environment preset="studio" />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  )
}

useGLTF.preload('/character/face.glb')
