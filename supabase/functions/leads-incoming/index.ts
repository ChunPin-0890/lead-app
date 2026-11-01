// Incoming lead endpoint.
// Deployed as the Edge Function "leads-incoming", so the URL is:
//   POST /functions/v1/leads-incoming
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { normalizePhone } from './phone.ts'

const COUNTRY_CODES = ['MY', 'SG']

// Supabase gives the function its project URL and service role key at runtime.
// They are never written into a file.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type LeadInput = {
  leadId: string
  name: string
  countryCode: string
  phone: string | null
  email: string | null
  source: string | null
  project: string | null
  budget: number | null
  message: string | null
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Compare the token without stopping at the first wrong character,
// so the response time does not reveal how much of the token matched.
function tokensMatch(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < given.length; i++) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return difference === 0
}

// A text field may be missing or empty. If it is present, it must be text.
function optionalText(value: unknown, field: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    errors.push(`${field} must be text`)
    return null
  }
  return value.trim()
}

// Check every field. Return the cleaned lead, or the list of problems.
function validatePayload(body: Record<string, unknown>): { lead?: LeadInput; errors: string[] } {
  const errors: string[] = []

  const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : ''
  if (!leadId) errors.push('leadId is required')

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) errors.push('name is required')

  // The country is needed to clean the phone number, so it is required
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
  if (!COUNTRY_CODES.includes(countryCode)) errors.push('countryCode must be MY or SG')

  const phone = optionalText(body.phone, 'phone', errors)
  const email = optionalText(body.email, 'email', errors)
  if (!phone && !email) errors.push('phone or email is required')
  if (email && !email.includes('@')) errors.push('email is not valid')

  // createdAt is checked but not stored: leads.created_at is set by the database
  if (typeof body.createdAt !== 'string' || Number.isNaN(Date.parse(body.createdAt))) {
    errors.push('createdAt must be an ISO date-time')
  }

  const source = optionalText(body.source, 'source', errors)
  const project = optionalText(body.project, 'project', errors)
  const message = optionalText(body.message, 'message', errors)

  let budget: number | null = null
  if (body.budget !== undefined && body.budget !== null) {
    if (typeof body.budget !== 'number' || !Number.isInteger(body.budget) || body.budget < 0) {
      errors.push('budget must be a whole number of 0 or more')
    } else {
      budget = body.budget
    }
  }

  if (errors.length > 0) return { errors }
  return {
    errors,
    lead: { leadId, name, countryCode, phone, email, source, project, budget, message },
  }
}

// Find the oldest lead with this normalized phone or email, if any
async function findLead(column: 'normalized_phone' | 'normalized_email', value: string) {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq(column, value)
    .order('id')
    .limit(1)
    .maybeSingle()
  return data
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Use POST' }, 405)
  }

  // 1. Check the token first, before reading the body
  const expected = Deno.env.get('INCOMING_LEAD_TOKEN') ?? ''
  const header = req.headers.get('Authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!expected || !tokensMatch(given, expected)) {
    // The body of an unauthenticated request is not stored, so strangers cannot fill the log
    await supabase.from('webhook_events').insert({
      raw_payload: {},
      result: 'unauthorized',
      error: 'Missing or wrong token',
    })
    return json({ error: 'Unauthorized' }, 401)
  }

  // 2. Read the body. Invalid JSON is still logged, so the attempt is visible
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    payload = null
  }
  const isObject = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
  const body = isObject ? (payload as Record<string, unknown>) : {}

  // 3. Log the raw event now, so it is kept even if a later step fails
  const { data: event, error: logError } = await supabase
    .from('webhook_events')
    .insert({ raw_payload: payload ?? { invalid_json: true }, result: 'received' })
    .select('id')
    .single()
  if (logError || !event) {
    return json({ error: 'Could not log the event' }, 500)
  }
  const eventId = event.id

  // Save the outcome in the log row, then send the response
  async function finish(
    result: string,
    status: number,
    responseBody: Record<string, unknown>,
    leadId: number | null = null,
    errorText: string | null = null,
  ) {
    await supabase
      .from('webhook_events')
      .update({ result, error: errorText, lead_id: leadId })
      .eq('id', eventId)
    return json(responseBody, status)
  }

  if (!isObject) {
    return finish('invalid', 400, { error: 'Body must be a JSON object' }, null, 'Body is not a JSON object')
  }

  // 4. A leadId we already have is refused before any other check
  if (typeof body.leadId === 'string' && body.leadId.trim()) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('external_lead_id', body.leadId.trim())
      .maybeSingle()
    if (existing) {
      return finish(
        'duplicate',
        409,
        { error: 'Duplicate', reason: 'This leadId was already received', leadId: existing.id },
        existing.id,
        'Duplicate leadId',
      )
    }
  }

  // 5. Check every field
  const { lead, errors } = validatePayload(body)
  if (!lead) {
    return finish('invalid', 400, { error: 'Invalid payload', details: errors }, null, errors.join('; '))
  }

  // 6. Clean the phone number using the countries table
  const { data: country } = await supabase
    .from('countries')
    .select('dial_code, trunk_prefix')
    .eq('code', lead.countryCode)
    .maybeSingle()
  if (!country) {
    return finish('invalid', 400, { error: 'Unknown country' }, null, 'Country not in countries table')
  }

  const normalizedPhone = lead.phone ? normalizePhone(lead.phone, country.dial_code, country.trunk_prefix) : null
  if (lead.phone && !normalizedPhone) {
    const message = `phone number is not valid for ${lead.countryCode}`
    return finish('invalid', 400, { error: 'Invalid payload', details: [message] }, null, message)
  }
  const normalizedEmail = lead.email ? lead.email.toLowerCase() : null

  // 7. Duplicate check on phone and email
  const phoneMatch = normalizedPhone ? await findLead('normalized_phone', normalizedPhone) : null
  const emailMatch = normalizedEmail ? await findLead('normalized_email', normalizedEmail) : null

  // Both match: the same person again, so no new lead is created
  if (phoneMatch && emailMatch) {
    return finish(
      'duplicate',
      409,
      { error: 'Duplicate', reason: 'Phone and email match an existing lead', leadId: phoneMatch.id },
      phoneMatch.id,
      'Phone and email match an existing lead',
    )
  }
  // One matches: create the lead so it gets an agent, but flag it as a possible duplicate
  const possibleDuplicateOf = phoneMatch?.id ?? emailMatch?.id ?? null

  // 8. Save the lead and assign it in one database call
  const { data: newLeadId, error: createError } = await supabase.rpc('create_lead_and_assign', {
    p_external_id: lead.leadId,
    p_name: lead.name,
    p_phone: lead.phone,
    p_email: lead.email,
    p_source: lead.source,
    p_project: lead.project,
    p_budget: lead.budget,
    p_message: lead.message,
  })
  if (createError) {
    // 23505 means another request with the same leadId got in first
    if (createError.code === '23505') {
      return finish('duplicate', 409, { error: 'Duplicate', reason: 'This leadId was already received' }, null, 'Duplicate leadId')
    }
    return finish('error', 500, { error: 'Could not create lead' }, null, createError.message)
  }

  // 9. The function above does not know the cleaned fields, so save them now
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      country_code: lead.countryCode,
      normalized_phone: normalizedPhone,
      normalized_email: normalizedEmail,
      possible_duplicate_of: possibleDuplicateOf,
    })
    .eq('id', newLeadId)
  if (updateError) {
    return finish(
      'error',
      500,
      { error: 'Lead created but cleaned fields were not saved', leadId: newLeadId },
      newLeadId,
      updateError.message,
    )
  }

  // 10. Report back, including which agent got the lead
  const { data: created } = await supabase
    .from('leads')
    .select('assigned_agent_id')
    .eq('id', newLeadId)
    .single()

  return finish(
    'accepted',
    201,
    {
      leadId: newLeadId,
      externalLeadId: lead.leadId,
      assignedAgentId: created?.assigned_agent_id ?? null,
      possibleDuplicateOf,
    },
    newLeadId,
  )
})
