import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
function outputText(response: any) {
  if (typeof response?.output_text === 'string') return response.output_text
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue
    for (const part of item?.content || []) if (part?.type === 'output_text' && typeof part.text === 'string') return part.text
  }
  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { template } = await req.json().catch(() => ({}))
    if (!template || !Array.isArray(template.components)) return json({ error: 'Template components are required' }, 400)

    const body = String(template.components.find((c: any) => String(c?.type || '').toUpperCase() === 'BODY')?.text || '')
    const issues: string[] = []
    const vars = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]))
    const maxVar = vars.length ? Math.max(...vars) : 0
    for (let i = 1; i <= maxVar; i++) if (!vars.includes(i)) issues.push(`Variable {{${i}}} is missing or variables are not sequential.`)
    if (body.length > 1024) issues.push('Body text exceeds the 1024 character limit.')
    if (!String(template.name || '').match(/^[a-z0-9_]+$/)) issues.push('Template name should use lowercase letters, numbers and underscores only.')

    const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
    if (!openaiKey) {
      return json({
        heuristic_issues: issues,
        ai_assessment: null,
        ai_available: false,
        safe_to_submit: issues.length === 0,
      })
    }

    const model = Deno.env.get('OPENAI_MODEL_TEMPLATE_VALIDATION')?.trim() || 'gpt-5.6-luna'
    const prompt = `Review this Meta WhatsApp message template for business-policy and category risks. Do not invent policy violations. Identify deceptive claims, prohibited goods/services, adult content, gambling, illegal drugs, unsafe financial claims, or a clear mismatch between the declared category and message purpose. Template name: ${String(template.name || '')}. Category: ${String(template.category || '')}. Body: ${body}`
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        input: prompt,
        max_output_tokens: 1200,
        text: {
          format: {
            type: 'json_schema',
            name: 'whatsapp_template_assessment',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                safe: { type: 'boolean' },
                findings: { type: 'array', items: { type: 'string' }, maxItems: 8 },
                policy_risks: { type: 'array', items: { type: 'string' }, maxItems: 8 },
                suggestion: { type: 'string' },
              },
              required: ['safe', 'findings', 'policy_risks', 'suggestion'],
            },
          },
        },
      }),
    })
    const apiBody = await response.json().catch(() => ({}))
    if (!response.ok) return json({ error: apiBody?.error?.message || `AI validation returned ${response.status}` }, 502)
    const text = outputText(apiBody)
    let assessment: any
    try { assessment = JSON.parse(text) } catch { return json({ error: 'AI validation returned invalid structured output' }, 502) }

    return json({
      heuristic_issues: issues,
      ai_assessment: assessment,
      ai_available: true,
      ai_model: model,
      safe_to_submit: issues.length === 0 && assessment.safe === true,
    })
  } catch (error: any) {
    console.error('[WhatsApp Template Validation]', error?.message || error)
    return json({ error: error?.message || 'Template validation failed' }, 500)
  }
})
