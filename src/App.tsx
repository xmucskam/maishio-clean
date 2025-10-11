import React, { useState, useRef } from 'react'
import { chatComplete } from './lib/llm'

type Cue = { 
  start: number
  end: number
  value: string
}

export default function App() {
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [wavPath, setWavPath] = useState<string | null>(null)
  const [cues, setCues] = useState<Cue[] | null>(null)
  const [currentMouth, setCurrentMouth] = useState<string>('X')
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationRef = useRef<number | null>(null)

  async function send() {
    if (!input.trim()) return
    setBusy(true)
    setReply('')
    setWavPath(null)
    setCues(null)
    setCurrentMouth('X')

    stopPlayback()

    try {
      console.log('[App] Sending to LLM:', input)
      const text = await chatComplete([
        { role: 'system', content: 'You are a helpful AI assistant. Keep responses concise and friendly.' },
        { role: 'user', content: input }
      ])
      setReply(text)
      console.log('[App] LLM response:', text)

      console.log('[App] Generating speech...')
      const { wav } = await window.api.invoke<{ wav: string }>('tts:make', text)
      setWavPath(wav)
      console.log('[App] Speech generated:', wav)

      console.log('[App] Generating lip-sync...')
      const lipCues = await window.api.invoke<Cue[]>('lipsync:make', { wavPath: wav })
      setCues(lipCues)
      console.log('[App] Lip-sync ready:', lipCues.length, 'cues')

      await playWithLipSync(wav, lipCues)

    } catch (e: any) {
      console.error('[App] Error:', e)
      setReply(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function playWithLipSync(wavPath: string, lipCues: Cue[]) {
    const base64 = await window.api.invoke<string>('file:read', wavPath)
    const dataUrl = `data:audio/wav;base64,${base64}`
    
    const audio = new Audio(dataUrl)
    audioRef.current = audio

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        setCurrentMouth('X')
        resolve()
      }

      audio.onerror = (e) => {
        console.error('[App] Audio playback error:', e)
        setCurrentMouth('X')
        reject(new Error('Audio playback failed'))
      }

      audio.play().catch(reject)

      const startTime = performance.now()
      
      function updateMouth() {
        if (!audio.paused && !audio.ended) {
          const elapsed = (performance.now() - startTime) / 1000
          
          const currentCue = lipCues.find(cue => 
            elapsed >= cue.start && elapsed < cue.end
          )
          
          if (currentCue) {
            setCurrentMouth(currentCue.value)
          }
          
          animationRef.current = requestAnimationFrame(updateMouth)
        }
      }
      
      updateMouth()
    })
  }

  function stopPlayback() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setCurrentMouth('X')
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ 
      maxWidth: 720, 
      margin: '2rem auto', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '0 1rem'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Maishio — Local AI Avatar
      </h1>

      <div style={{
        width: 200,
        height: 200,
        margin: '0 auto 2rem',
        border: '3px solid #4a9eff',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2a2a2a',
        fontSize: '4rem',
        position: 'relative'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🤖</div>
          <div style={{ 
            fontSize: '2rem', 
            marginTop: '-1rem',
            fontWeight: 'bold',
            color: busy ? '#ff6b6b' : '#4a9eff'
          }}>
            {currentMouth}
          </div>
        </div>
      </div>

      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Ask me anything..."
        rows={4}
        disabled={busy}
        style={{ 
          width: '100%', 
          padding: '0.75rem',
          fontSize: '1rem',
          fontFamily: 'inherit',
          border: '2px solid #4a9eff',
          borderRadius: '8px',
          resize: 'vertical',
          backgroundColor: '#2a2a2a',
          color: '#ffffff'
        }}
      />

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={send} 
          disabled={busy || !input.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: busy ? '#555' : '#4a9eff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600'
          }}
        >
          {busy ? 'Processing...' : 'Send'}
        </button>
        
        {audioRef.current && !audioRef.current.paused && (
          <button 
            onClick={stopPlayback}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600'
            }}
          >
            Stop
          </button>
        )}
      </div>

      {reply && (
        <div style={{ 
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#2a2a2a',
          borderRadius: '8px',
          border: '1px solid #4a9eff'
        }}>
          <strong>Response:</strong>
          <pre style={{ 
            whiteSpace: 'pre-wrap', 
            marginTop: '0.5rem',
            fontFamily: 'inherit'
          }}>
            {reply}
          </pre>
        </div>
      )}

      {(wavPath || cues) && (
        <div style={{ 
          marginTop: '1rem', 
          fontSize: '0.875rem', 
          opacity: 0.6,
          padding: '0.5rem',
          backgroundColor: '#2a2a2a',
          borderRadius: '4px'
        }}>
          {wavPath && <div>🎵 Audio: {wavPath.split('/').pop()}</div>}
          {cues && <div>👄 Lip-sync: {cues.length} cues loaded</div>}
        </div>
      )}
    </div>
  )
}
