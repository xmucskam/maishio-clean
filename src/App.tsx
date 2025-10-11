// import React, { useState, useRef } from 'react'
// import { chatComplete } from './lib/llm'

// type Cue = { 
//   start: number
//   end: number
//   value: string
// }

// export default function App() {
//   const [input, setInput] = useState('')
//   const [reply, setReply] = useState('')
//   const [busy, setBusy] = useState(false)
//   const [wavPath, setWavPath] = useState<string | null>(null)
//   const [cues, setCues] = useState<Cue[] | null>(null)
//   const [currentMouth, setCurrentMouth] = useState<string>('X')
  
//   const audioRef = useRef<HTMLAudioElement | null>(null)
//   const animationRef = useRef<number | null>(null)

//   async function send() {
//     if (!input.trim()) return
//     setBusy(true)
//     setReply('')
//     setWavPath(null)
//     setCues(null)
//     setCurrentMouth('X')

//     stopPlayback()

//     try {
//       console.log('[App] Sending to LLM:', input)
//       const text = await chatComplete([
//         { role: 'system', content: 'You are a helpful AI assistant. Keep responses concise and friendly.' },
//         { role: 'user', content: input }
//       ])
//       setReply(text)
//       console.log('[App] LLM response:', text)

//       console.log('[App] Generating speech...')
//       const { wav } = await window.api.invoke<{ wav: string }>('tts:make', text)
//       setWavPath(wav)
//       console.log('[App] Speech generated:', wav)

//       console.log('[App] Generating lip-sync...')
//       const lipCues = await window.api.invoke<Cue[]>('lipsync:make', { wavPath: wav })
//       setCues(lipCues)
//       console.log('[App] Lip-sync ready:', lipCues.length, 'cues')

//       await playWithLipSync(wav, lipCues)

//     } catch (e: any) {
//       console.error('[App] Error:', e)
//       setReply(`Error: ${e.message}`)
//     } finally {
//       setBusy(false)
//     }
//   }

//   async function playWithLipSync(wavPath: string, lipCues: Cue[]) {
//     const base64 = await window.api.invoke<string>('file:read', wavPath)
//     const dataUrl = `data:audio/wav;base64,${base64}`
    
//     const audio = new Audio(dataUrl)
//     audioRef.current = audio

//     return new Promise<void>((resolve, reject) => {
//       audio.onended = () => {
//         setCurrentMouth('X')
//         resolve()
//       }

//       audio.onerror = (e) => {
//         console.error('[App] Audio playback error:', e)
//         setCurrentMouth('X')
//         reject(new Error('Audio playback failed'))
//       }

//       audio.play().catch(reject)

//       const startTime = performance.now()
      
//       function updateMouth() {
//         if (!audio.paused && !audio.ended) {
//           const elapsed = (performance.now() - startTime) / 1000
          
//           const currentCue = lipCues.find(cue => 
//             elapsed >= cue.start && elapsed < cue.end
//           )
          
//           if (currentCue) {
//             setCurrentMouth(currentCue.value)
//           }
          
//           animationRef.current = requestAnimationFrame(updateMouth)
//         }
//       }
      
//       updateMouth()
//     })
//   }

//   function stopPlayback() {
//     if (audioRef.current) {
//       audioRef.current.pause()
//       audioRef.current = null
//     }
//     if (animationRef.current) {
//       cancelAnimationFrame(animationRef.current)
//       animationRef.current = null
//     }
//     setCurrentMouth('X')
//   }

//   function handleKeyPress(e: React.KeyboardEvent) {
//     if (e.key === 'Enter' && !e.shiftKey) {
//       e.preventDefault()
//       send()
//     }
//   }

//   return (
//     <div style={{ 
//       maxWidth: 720, 
//       margin: '2rem auto', 
//       fontFamily: 'system-ui, -apple-system, sans-serif',
//       padding: '0 1rem'
//     }}>
//       <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
//         Maishio — Local AI Avatar
//       </h1>

//       <div style={{
//         width: 200,
//         height: 200,
//         margin: '0 auto 2rem',
//         border: '3px solid #4a9eff',
//         borderRadius: '50%',
//         display: 'flex',
//         alignItems: 'center',
//         justifyContent: 'center',
//         backgroundColor: '#2a2a2a',
//         fontSize: '4rem',
//         position: 'relative'
//       }}>
//         <div style={{ textAlign: 'center' }}>
//           <div style={{ fontSize: '3rem' }}>🤖</div>
//           <div style={{ 
//             fontSize: '2rem', 
//             marginTop: '-1rem',
//             fontWeight: 'bold',
//             color: busy ? '#ff6b6b' : '#4a9eff'
//           }}>
//             {currentMouth}
//           </div>
//         </div>
//       </div>

//       <textarea
//         value={input}
//         onChange={e => setInput(e.target.value)}
//         onKeyPress={handleKeyPress}
//         placeholder="Ask me anything..."
//         rows={4}
//         disabled={busy}
//         style={{ 
//           width: '100%', 
//           padding: '0.75rem',
//           fontSize: '1rem',
//           fontFamily: 'inherit',
//           border: '2px solid #4a9eff',
//           borderRadius: '8px',
//           resize: 'vertical',
//           backgroundColor: '#2a2a2a',
//           color: '#ffffff'
//         }}
//       />

//       <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
//         <button 
//           onClick={send} 
//           disabled={busy || !input.trim()}
//           style={{
//             padding: '0.75rem 1.5rem',
//             fontSize: '1rem',
//             backgroundColor: busy ? '#555' : '#4a9eff',
//             color: 'white',
//             border: 'none',
//             borderRadius: '6px',
//             fontWeight: '600'
//           }}
//         >
//           {busy ? 'Processing...' : 'Send'}
//         </button>
        
//         {audioRef.current && !audioRef.current.paused && (
//           <button 
//             onClick={stopPlayback}
//             style={{
//               padding: '0.75rem 1.5rem',
//               fontSize: '1rem',
//               backgroundColor: '#dc3545',
//               color: 'white',
//               border: 'none',
//               borderRadius: '6px',
//               fontWeight: '600'
//             }}
//           >
//             Stop
//           </button>
//         )}
//       </div>

//       {reply && (
//         <div style={{ 
//           marginTop: '1.5rem',
//           padding: '1rem',
//           backgroundColor: '#2a2a2a',
//           borderRadius: '8px',
//           border: '1px solid #4a9eff'
//         }}>
//           <strong>Response:</strong>
//           <pre style={{ 
//             whiteSpace: 'pre-wrap', 
//             marginTop: '0.5rem',
//             fontFamily: 'inherit'
//           }}>
//             {reply}
//           </pre>
//         </div>
//       )}

//       {(wavPath || cues) && (
//         <div style={{ 
//           marginTop: '1rem', 
//           fontSize: '0.875rem', 
//           opacity: 0.6,
//           padding: '0.5rem',
//           backgroundColor: '#2a2a2a',
//           borderRadius: '4px'
//         }}>
//           {wavPath && <div>🎵 Audio: {wavPath.split('/').pop()}</div>}
//           {cues && <div>👄 Lip-sync: {cues.length} cues loaded</div>}
//         </div>
//       )}
//     </div>
//   )
// }









// import React, { useState, useRef } from 'react'
// import { chatComplete } from './lib/llm'

// type Cue = {
//   start: number
//   end: number
//   value: string
// }

// export default function App() {
//   const [input, setInput] = useState('')
//   const [reply, setReply] = useState('')
//   const [busy, setBusy] = useState(false)
//   const [wavPath, setWavPath] = useState<string | null>(null)
//   const [cues, setCues] = useState<Cue[] | null>(null)
//   const [currentMouth, setCurrentMouth] = useState<string>('X')
//   const audioRef = useRef<HTMLAudioElement | null>(null)
//   const rafRef = useRef<number | null>(null)

//   function mouthForPhoneme(p: string) {
//     // keep it simple; adjust as you like
//     const v = p.toLowerCase()
//     if ('fv'.includes(v)) return 'F'
//     if ('pbm'.includes(v)) return 'M'
//     if ('l'.includes(v)) return 'L'
//     if ('oɔu'.includes(v)) return 'O'
//     if ('eeiy'.includes(v)) return 'E'
//     if ('aɑæ'.includes(v)) return 'A'
//     if (v === 'rest' || v === 'sil') return 'X'
//     return 'O'
//   }

//   function cancelAnimation() {
//     if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
//     rafRef.current = null
//     setCurrentMouth('X')
//   }

//   async function send() {
//     if (!input.trim() || busy) return
//     setBusy(true)
//     setCues(null)
//     setWavPath(null)

//     try {
//       console.log('[App] Sending to LLM:', input)
//       const text = await chatComplete([
//         { role: 'system', content: 'You are helpful and concise.' },
//         { role: 'user', content: input }
//       ])

//       // Always show the model reply in the UI
//       setReply(text)

//       // If IPC bridge is missing, skip audio gracefully
//       if (!window.api?.invoke) {
//         console.warn('[App] IPC not available; skipping TTS & lipsync.')
//         return
//       }

//       console.log('[App] Generating speech...')
//       const ttsResp = await window.api.invoke<{ wav: string }>('tts:make', { text })
//       setWavPath(ttsResp.wav)

//       console.log('[App] Generating lipsync...')
//       const lipResp = await window.api.invoke<{ cues: Cue[] }>('lipsync:make', { wavPath: ttsResp.wav })
//       setCues(lipResp.cues)

//       await playWithLipSync(ttsResp.wav, lipResp.cues)
//     } catch (e: any) {
//       console.error('[App] Error:', e)
//       // Keep the reply text; optionally append error note
//       setReply(prev => prev || `Error: ${e?.message ?? e}`)
//     } finally {
//       setBusy(false)
//     }
//   }

//   async function playWithLipSync(wavPath: string, lipCues: Cue[]) {
//     try {
//       const base64 = await window.api!.invoke<string>('file:read', wavPath)
//       const dataUrl = `data:audio/wav;base64,${base64}`

//       const audio = new Audio(dataUrl)
//       audioRef.current = audio

//       cancelAnimation()

//       const start = performance.now()
//       function tick(now: number) {
//         const t = (now - start) / 1000 // seconds
//         const cue = lipCues.find(c => t >= c.start && t <= c.end)
//         setCurrentMouth(mouthForPhoneme(cue?.value ?? 'rest'))
//         rafRef.current = requestAnimationFrame(tick)
//       }

//       audio.onended = () => cancelAnimation()
//       audio.play().catch(err => console.error('[App] Audio play error:', err))
//       rafRef.current = requestAnimationFrame(tick)
//     } catch (e) {
//       console.error('[App] playWithLipSync error:', e)
//     }
//   }

//   return (
//     <div style={{
//       minHeight: '100vh',
//       backgroundColor: '#151515',
//       color: '#f2f2f2',
//       padding: '2rem',
//       fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
//     }}>
//       <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
//         Maishio — Local AI Avatar
//       </h1>

//       {/* Avatar */}
//       <div style={{
//         display: 'flex',
//         alignItems: 'center',
//         gap: '2rem'
//       }}>
//         <div style={{
//           width: 260,
//           height: 260,
//           borderRadius: '50%',
//           border: '4px solid #3b82f6',
//           display: 'flex',
//           alignItems: 'center',
//           justifyContent: 'center',
//           fontSize: 96,
//           userSelect: 'none'
//         }}>
//           <div style={{ textAlign: 'center' }}>
//             <div style={{ fontSize: 72 }}>🤖</div>
//             <div style={{ fontSize: 48, marginTop: 6 }}>{currentMouth}</div>
//           </div>
//         </div>

//         {/* Input + Button */}
//         <div style={{ flex: 1 }}>
//           <textarea
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             placeholder="Type your message…"
//             rows={4}
//             style={{
//               width: '100%',
//               padding: '1rem',
//               borderRadius: 8,
//               border: '1px solid #3b82f6',
//               outline: 'none',
//               background: '#1e1e1e',
//               color: '#f2f2f2',
//               resize: 'vertical'
//             }}
//           />
//           <button
//             onClick={send}
//             disabled={busy}
//             style={{
//               marginTop: '0.75rem',
//               padding: '0.6rem 1rem',
//               borderRadius: 8,
//               border: 0,
//               background: busy ? '#4f46e5aa' : '#3b82f6',
//               color: '#fff',
//               cursor: busy ? 'default' : 'pointer',
//               fontWeight: 600
//             }}
//           >
//             {busy ? 'Working…' : 'Send'}
//           </button>
//         </div>
//       </div>

//       {/* Reply box */}
//       <div style={{
//         marginTop: '1.25rem',
//         background: '#1e1e1e',
//         borderRadius: 8,
//         padding: '1rem',
//         border: '1px solid #2a2a2a'
//       }}>
//         <strong>Response:</strong>
//         <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
//           {reply || (busy ? 'Thinking…' : '—')}
//         </div>
//       </div>

//       {/* Debug info */}
//       {(wavPath || cues) && (
//         <div style={{
//           marginTop: '1rem',
//           fontSize: '0.875rem',
//           opacity: 0.75,
//           padding: '0.5rem',
//           backgroundColor: '#202020',
//           borderRadius: 6
//         }}>
//           {wavPath && <div>🎵 Audio: {wavPath.split('/').pop()}</div>}
//           {cues && <div>👄 Lip-sync: {cues.length} cues loaded</div>}
//         </div>
//       )}
//     </div>
//   )
// }


import React, { useEffect, useRef, useState } from 'react'
import { chatComplete, type Msg } from './lib/llm'

type Cue = {
  start: number
  end: number
  value: string
}

// System message — defines the assistant’s role
const SYS: Msg = { role: 'system', content: 'You are a helpful and concise assistant.' }
const CHAT_KEY = 'maishio.chat.v1'
const MAX_TURNS = 12 // keep last N user+assistant pairs

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
  const [currentMouth, setCurrentMouth] = useState<string>('X')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // Load chat history
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

  // Save chat history
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(trimContext(messages)))
    } catch (err) {
      console.warn('[App] Could not save chat history:', err)
    }
  }, [messages])

  function cancelAnimation() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setCurrentMouth('X')
  }

  function mouthForPhoneme(p: string) {
    const v = p.toLowerCase()
    if ('fv'.includes(v)) return 'F'
    if ('pbm'.includes(v)) return 'M'
    if ('l'.includes(v)) return 'L'
    if ('oɔu'.includes(v)) return 'O'
    if ('eeiy'.includes(v)) return 'E'
    if ('aɑæ'.includes(v)) return 'A'
    if (v === 'rest' || v === 'sil') return 'X'
    return 'O'
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

      // TTS & lipsync (only if available)
      if (window.api?.invoke) {
        console.log('[App] Generating speech...')
        const { wav } = await window.api.invoke<{ wav: string }>('tts:make', { text })
        setWavPath(wav)

        console.log('[App] Generating lipsync...')
        const { cues } = await window.api.invoke<{ cues: Cue[] }>('lipsync:make', { wavPath: wav })
        setCues(cues)

        await playWithLipSync(wav, cues)
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

  async function playWithLipSync(wavPath: string, lipCues: Cue[]) {
    try {
      const base64 = await window.api!.invoke<string>('file:read', wavPath)
      const dataUrl = `data:audio/wav;base64,${base64}`

      const audio = new Audio(dataUrl)
      audioRef.current = audio

      cancelAnimation()

      const start = performance.now()
      function tick(now: number) {
        const t = (now - start) / 1000
        const cue = lipCues.find(c => t >= c.start && t <= c.end)
        setCurrentMouth(mouthForPhoneme(cue?.value ?? 'rest'))
        rafRef.current = requestAnimationFrame(tick)
      }

      audio.onended = () => cancelAnimation()
      audio.play().catch(err => console.error('[App] Audio play error:', err))
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

      {/* Avatar + Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <div style={{
          width: 260,
          height: 260,
          borderRadius: '50%',
          border: '4px solid #3b82f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 96,
          userSelect: 'none'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72 }}>🤖</div>
            <div style={{ fontSize: 48, marginTop: 6 }}>{currentMouth}</div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
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
          </div>
        </div>
      </div>

      {/* Reply */}
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

      {/* Debug info */}
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



