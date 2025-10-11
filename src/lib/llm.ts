type ChatMessage = { 
  role: 'system' | 'user' | 'assistant'
  content: string 
}

export async function chatComplete(
  messages: ChatMessage[], 
  opts?: {
    temperature?: number
    max_tokens?: number
  }
): Promise<string> {
  const res = await fetch('http://localhost:8080/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local',
      messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.max_tokens ?? 512,
      stream: false
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
