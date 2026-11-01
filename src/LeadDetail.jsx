import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost']

// Shows one lead. The "acting as" agent is the one recorded on every status change and note.
function LeadDetail({ leadId, agents, actingAsId, onBack }) {
  const [lead, setLead] = useState(null)
  const [notes, setNotes] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [assignToId, setAssignToId] = useState('')
  const [noteText, setNoteText] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadLead() {
      // Fetch the lead and its notes together; notes come back newest first
      const [leadResult, notesResult] = await Promise.all([
        supabase
          .from('leads')
          .select('id, name, phone, email, source, project, budget, message, status, agents(name)')
          .eq('id', leadId)
          .single(),
        supabase
          .from('lead_notes')
          .select('id, body, created_at, agents(name)')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      ])

      const failure = leadResult.error || notesResult.error
      if (failure) {
        setError(failure.message)
        return
      }
      setLead(leadResult.data)
      setNotes(notesResult.data)
      setError(null)
    }

    loadLead()
  }, [leadId, reloadKey])

  // Status changes and notes need someone in "Acting as"; stop early if nobody is picked
  function needActor() {
    if (!actingAsId) {
      setError('Pick an agent in "Acting as" at the top of the page first.')
      return false
    }
    return true
  }

  function saved(text) {
    setMessage(text)
    setReloadKey((key) => key + 1)
  }

  async function changeStatus(newStatus) {
    if (!needActor()) return
    setError(null)

    const { error: updateError } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)
    if (updateError) {
      setError(updateError.message)
      return
    }

    // Write the change to the history table
    const { error: historyError } = await supabase.from('lead_status_history').insert({
      lead_id: leadId,
      from_status: lead.status,
      to_status: newStatus,
      changed_by_agent_id: actingAsId,
    })
    if (historyError) {
      setError(historyError.message)
      return
    }

    saved('Status saved.')
  }

  async function assignLead() {
    setError(null)

    // The database function sets the agent, writes the assignment history, and notifies the agent
    const { error: assignError } = await supabase.rpc('assign_lead_manually', {
      p_lead_id: leadId,
      p_agent_id: Number(assignToId),
    })
    if (assignError) {
      setError(assignError.message)
      return
    }

    setAssignToId('')
    saved('Lead assigned.')
  }

  async function addNote(event) {
    event.preventDefault()
    const body = noteText.trim()
    if (!body || !needActor()) return
    setError(null)

    const { error: noteError } = await supabase.from('lead_notes').insert({
      lead_id: leadId,
      author_agent_id: actingAsId,
      body,
    })
    if (noteError) {
      setError(noteError.message)
      return
    }

    setNoteText('')
    saved('Note added.')
  }

  return (
    <section>
      <button type="button" onClick={onBack}>
        Back to leads
      </button>

      {!actingAsId && (
        <p className="hint">Pick an agent in "Acting as" to change the status or add a note.</p>
      )}
      {error && <p className="error">{error}</p>}
      {message && !error && <p className="success">{message}</p>}

      {!lead ? (
        !error && <p>Loading lead...</p>
      ) : (
        <>
          <h2>{lead.name}</h2>
          <dl className="details">
            <dt>Phone</dt>
            <dd>{lead.phone ?? '-'}</dd>
            <dt>Email</dt>
            <dd>{lead.email ?? '-'}</dd>
            <dt>Source</dt>
            <dd>{lead.source ?? '-'}</dd>
            <dt>Project</dt>
            <dd>{lead.project ?? '-'}</dd>
            <dt>Budget</dt>
            <dd>{lead.budget ?? '-'}</dd>
            <dt>Message</dt>
            <dd>{lead.message ?? '-'}</dd>
          </dl>

          <div className="row">
            <label>
              Status{' '}
              <select
                value={lead.status}
                disabled={!actingAsId}
                onChange={(event) => changeStatus(event.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row">
            <span>Assigned to: {lead.agents?.name ?? 'Unassigned'}</span>
            <label>
              Assign to{' '}
              <select value={assignToId} onChange={(event) => setAssignToId(event.target.value)}>
                <option value="">Choose an agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.is_online ? '' : ' (offline)'}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!assignToId} onClick={assignLead}>
              Assign
            </button>
          </div>

          <h3>Notes</h3>
          <form onSubmit={addNote} className="note-form">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={3}
              placeholder="Write a note"
              disabled={!actingAsId}
            />
            <button type="submit" disabled={!actingAsId || !noteText.trim()}>
              Add note
            </button>
          </form>

          {notes.length === 0 ? (
            <p>No notes yet.</p>
          ) : (
            <ul className="notes">
              {notes.map((note) => (
                <li key={note.id}>
                  <p>{note.body}</p>
                  <small>
                    {note.agents?.name ?? 'Unknown agent'} · {new Date(note.created_at).toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

export default LeadDetail
