import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

type Entry = {
  meshName: string
  morphs: { name: string; index: number }[]
  count: number
}

export default function MorphDump({ modelUrl }: { modelUrl: string }) {
  return (
    <Suspense fallback={<pre style={box}>Loading…</pre>}>
      <Inner modelUrl={modelUrl} />
    </Suspense>
  )
}

function Inner({ modelUrl }: { modelUrl: string }) {
  const gltf = useGLTF(modelUrl) as any
  const scene = useMemo(() => gltf?.scene?.clone(true), [gltf])
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    if (!scene) return
    const out: Entry[] = []

    scene.traverse((o: any) => {
      if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) {
        const dict = o.morphTargetDictionary as Record<string, number>
        const names = Object.keys(dict).sort((a, b) => dict[a] - dict[b])
        const morphs = names.map(name => ({ name, index: dict[name] }))
        out.push({
          meshName: o.name || '(unnamed mesh)',
          morphs,
          count: o.morphTargetInfluences.length
        })
      }
    })

    // Console dump
    console.group(`🔎 Morph targets in ${modelUrl}`)
    if (!out.length) {
      console.log('No meshes with morph targets found.')
    } else {
      for (const e of out) {
        console.group(`Mesh: ${e.meshName} (count=${e.count})`)
        e.morphs.forEach(m => console.log(`${m.index}: ${m.name}`))
        console.groupEnd()
      }
    }
    console.groupEnd()

    setEntries(out)
  }, [scene, modelUrl])

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Morph targets for: <code>{modelUrl}</code>
      </div>
      {!entries.length ? (
        <div>No morph targets found.</div>
      ) : (
        entries.map((e, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>
              Mesh: <code>{e.meshName}</code> &nbsp;
              <span style={{ opacity: 0.7 }}>(count={e.count})</span>
            </div>
            <pre style={pre}>
{e.morphs.map(m => `${String(m.index).padStart(2,' ')}: ${m.name}`).join('\n')}
            </pre>
          </div>
        ))
      )}
    </div>
  )
}

useGLTF.preload('/character/face.glb')

const box: React.CSSProperties = {
  padding: 12,
  background: '#111',
  color: '#ddd',
  border: '1px solid #333',
  borderRadius: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.35,
  maxWidth: 720,
}

const pre: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre',
  overflowX: 'auto',
}

