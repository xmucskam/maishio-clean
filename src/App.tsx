import React, { useEffect, useRef, useState } from 'react'
import { chatComplete, type Msg } from './lib/llm'
import Avatar from './components/Avatar'

type Cue = { start: number; end: number; value: string }

const SYS: Msg = { role: 'system', content: 'You are a helpful and concise assistant.' }
const CHAT_KEY = 'maishio.chat.v1'
const MAX_TURNS = 12

function trimContext(msgs: Msg[]): Msg[] {
  const head = msgs[0]?.role === 'system' ? [msgs[0]] : [SYS]
  const tail = msgs.slice(-MAX_TURNS * 2)
  return [...head, ...tail]
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([SYS])
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [wavPath, setWavPath] = useState<string | null>(null)
  const [cues, setCues] = useState<Cue[] | null>(null)
  const [viseme, setViseme] = useState<string>('X')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // ------------------ RESTORE CHAT CONTEXT ------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY)
      if (raw) {
        const parsed: Msg[] = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(trimContext(parsed))
          const lastAssistant = [...parsed].reverse().find(m => m.role === 'assistant')
          if (lastAssistant) setReply(lastAssistant.content)
        }
      }
    } catch (err) {
      console.warn('[App] Could not restore chat history:', err)
    }
  }, [])

  // ------------------ SAVE CONTEXT ------------------
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(trimContext(messages)))
    } catch (err) {
      console.warn('[App] Could not save chat history:', err)
    }
  }, [messages])

  // ------------------ PLAYBACK CONTROL ------------------
  function cancelAnimation() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setViseme('X')
  }

  async function send() {
    if (!input.trim() || busy) return
    setBusy(true)
    setCues(null)
    setWavPath(null)

    const nextMsgs = trimContext([...messages, { role: 'user', content: input }])
    setMessages(nextMsgs)
    setInput('')

    try {
      console.log('[App] Sending to LLM:', input)
      const text = await chatComplete(nextMsgs)
      setReply(text)
      const withAssistant = trimContext([...nextMsgs, { role: 'assistant', content: text }])
      setMessages(withAssistant)

      // --- TTS + Lipsync ---
      if (window.api?.invoke) {
        console.log('[App] Generating speech...')
        const { wav } = await window.api.invoke<{ wav: string }>('tts:make', { text })
        setWavPath(wav)

console.log('[App] Generating lipsync...')
const lip = await window.api.invoke<any>('lipsync:make', { wavPath: wav })

// Rhubarb CLI JSON shape is usually { mouthCues: [...] }
const lipCues: Cue[] = Array.isArray(lip) ? lip
  : Array.isArray(lip?.mouthCues) ? lip.mouthCues
  : Array.isArray(lip?.cues) ? lip.cues
  : Array.isArray(lip?.data) ? lip.data
  : []

setCues(lipCues)
await playWithLipSync(wav, lipCues)



        // console.log('[App] Generating lipsync...')
        // const { cues } = await window.api.invoke<{ cues: Cue[] }>('lipsync:make', { wavPath: wav })
        // setCues(cues)

        // await playWithLipSync(wav, cues)
      } else {
        console.warn('[App] IPC not available; skipping TTS & lipsync.')
      }
    } catch (e: any) {
      console.error('[App] Error:', e)
      setReply(prev => prev || `Error: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  // async function playWithLipSync(wavPath: string, lipCues: Cue[]) {
  //   try {
  //     const base64 = await window.api!.invoke<string>('file:read', wavPath)
  //     const dataUrl = `data:audio/wav;base64,${base64}`

  //     const audio = new Audio(dataUrl)
  //     audioRef.current = audio
  //     cancelAnimation()

  //     const start = performance.now()
  //     function tick(now: number) {
  //       const t = (now - start) / 1000
  //       const cue = lipCues.find(c => t >= c.start && t <= c.end)
  //       const val = (cue?.value ?? 'X').toUpperCase()
  //       setViseme(val)
  //       rafRef.current = requestAnimationFrame(tick)
  //     }

  //     audio.onended = () => cancelAnimation()
  //     audio.play().catch(err => console.error('[App] Audio play error:', err))
  //     rafRef.current = requestAnimationFrame(tick)
  //   } catch (e) {
  //     console.error('[App] playWithLipSync error:', e)
  //   }
  // }
  async function playWithLipSync(wavPath: string, lipCuesRaw: any) {
  try {
    const base64 = await window.api!.invoke<string>('file:read', wavPath)
    const dataUrl = `data:audio/wav;base64,${base64}`

    // normalize + sort cues
    const cues: Cue[] = Array.isArray(lipCuesRaw) ? lipCuesRaw
      : Array.isArray(lipCuesRaw?.mouthCues) ? lipCuesRaw.mouthCues
      : Array.isArray(lipCuesRaw?.cues) ? lipCuesRaw.cues
      : Array.isArray(lipCuesRaw?.data) ? lipCuesRaw.data
      : []
    cues.sort((a, b) => a.start - b.start)

    const audio = new Audio(dataUrl)
    audioRef.current = audio
    cancelAnimation()

    const start = performance.now()
    let idx = 0

    function tick(now: number) {
      const t = (now - start) / 1000

      while (idx < cues.length && t > cues[idx].end) idx++

      let vis = 'X'
      if (idx < cues.length) {
        const c = cues[idx]
        if (t >= c.start && t <= c.end) vis = (c.value || 'X').toUpperCase()
      }

      setViseme(vis)
      rafRef.current = requestAnimationFrame(tick)
    }

    audio.onended = () => cancelAnimation()
    audio.onerror = () => cancelAnimation()

    await audio.play().catch(err => console.error('[App] Audio play error:', err))
    rafRef.current = requestAnimationFrame(tick)
  } catch (e) {
    console.error('[App] playWithLipSync error:', e)
  }
}



  function resetChat() {
    setMessages([SYS])
    setReply('')
    localStorage.removeItem(CHAT_KEY)
  }

  // ------------------ RENDER ------------------
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#151515',
      color: '#f2f2f2',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
        Maishio — Local AI Avatar
      </h1>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
        flexWrap: 'wrap'
      }}>
        {/* 3D Avatar */}
        <Avatar modelUrl="/character/face.glb" viseme={viseme} />

        {/* Text input / buttons */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            rows={4}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: 8,
              border: '1px solid #3b82f6',
              outline: 'none',
              background: '#1e1e1e',
              color: '#f2f2f2',
              resize: 'vertical'
            }}
          />
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={send}
              disabled={busy}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: 8,
                border: 0,
                background: busy ? '#4f46e5aa' : '#3b82f6',
                color: '#fff',
                cursor: busy ? 'default' : 'pointer',
                fontWeight: 600
              }}
            >
              {busy ? 'Working…' : 'Send'}
            </button>
            <button
              onClick={resetChat}
              disabled={busy}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: 8,
                border: 0,
                background: '#dc2626',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Reset
            </button>
            <button
  onClick={async () => {
    const seq = ['X','A','E','F','G','B','C','D','X']
    for (const v of seq) {
      setViseme(v)
      await new Promise(r => setTimeout(r, 400))
    }
  }}
  style={{ padding: '0.6rem 1rem', borderRadius: 8, border: 0, background: '#475569', color: '#fff', fontWeight: 600 }}
>
  Test Visemes
</button>

          </div>
        </div>
      </div>

      {/* Response */}
      <div style={{
        marginTop: '1.25rem',
        background: '#1e1e1e',
        borderRadius: 8,
        padding: '1rem',
        border: '1px solid #2a2a2a'
      }}>
        <strong>Response:</strong>
        <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
          {reply || (busy ? 'Thinking…' : '—')}
        </div>
      </div>

      {(wavPath || cues) && (
        <div style={{
          marginTop: '1rem',
          fontSize: '0.875rem',
          opacity: 0.75,
          padding: '0.5rem',
          backgroundColor: '#202020',
          borderRadius: 6
        }}>
          {wavPath && <div>🎵 Audio: {wavPath.split('/').pop()}</div>}
          {cues && <div>👄 Lip-sync: {cues.length} cues loaded</div>}
        </div>
      )}
    </div>
  )
}



