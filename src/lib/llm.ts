// type ChatMessage = { 
//   role: 'system' | 'user' | 'assistant'
//   content: string 
// }

// export async function chatComplete(
//   messages: ChatMessage[], 
//   opts?: {
//     temperature?: number
//     max_tokens?: number
//   }
// ): Promise<string> {
//   const res = await fetch('http://localhost:8080/v1/chat/completions', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       model: 'local',
//       messages,
//       temperature: opts?.temperature ?? 0.7,
//       max_tokens: opts?.max_tokens ?? 512,
//       stream: false
//     })
//   })

//   if (!res.ok) {
//     const text = await res.text()
//     throw new Error(`LLM error ${res.status}: ${text}`)
//   }

//   const data = await res.json()
//   return data.choices?.[0]?.message?.content ?? ''
// }



// lib/llm.ts
// export type Msg = { role: 'system'|'user'|'assistant'; content: string };

// export async function chatComplete(messages: Msg[]): Promise<string> {
//   // call your llama.cpp server here exactly as you already do,
//   // but send `messages` instead of only the last user turn
//   const res = await fetch('http://localhost:8080/v1/chat/completions', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       model: 'YourModel',
//       messages,
//       temperature: 0.7,
//       // tip: with llama.cpp you can also use: "cache_prompt": true
//     })
//   });
//   const data = await res.json();
//   return data?.choices?.[0]?.message?.content ?? '';
// }



export type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

// Adjust this to your local llama.cpp endpoint and model name
const LLM_URL = 'http://localhost:8080/v1/chat/completions'
const MODEL = '../models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf'

export async function chatComplete(messages: Msg[]): Promise<string> {
  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      // cache_prompt can speed up multi-turn with llama.cpp
      // cache_prompt: true
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`LLM HTTP ${res.status}: ${txt}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}
