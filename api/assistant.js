import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { question, context } = req.body
  if (!question) return res.status(400).json({ error: 'No question provided' })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: `You are a sharp, motivating personal productivity coach inside "Mad Focus" — the user's personal productivity app. You have full access to their live data.

Rules:
- Be direct and concise (2–4 sentences unless detail is genuinely needed)
- Reference specific numbers and names from their data
- Be encouraging but honest — don't sugarcoat lack of progress
- Never make up data that isn't in the context
- Today is ${context?.date || new Date().toISOString().slice(0, 10)}

User's live data:
${JSON.stringify(context, null, 2)}`,
      messages: [{ role: 'user', content: question }],
    })

    res.json({ reply: message.content[0].text })
  } catch (err) {
    console.error('[assistant]', err.message)
    res.status(500).json({ error: 'AI request failed', detail: err.message })
  }
}
