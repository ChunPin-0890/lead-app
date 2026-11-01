import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Lists agents in round-robin order and lets you switch each one online or offline.
// Only online, active agents receive new leads from the round-robin picker.
function AgentStatus() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    async function loadAgents() {
      const { data, error: loadError } = await supabase
        .from('agents')
        .select('id, name, rr_order, is_online, is_active')
        .order('rr_order')

      if (loadError) {
        setError(loadError.message)
      } else {
        setAgents(data)
        setError(null)
      }
      setLoading(false)
    }

    loadAgents()
  }, [reloadKey])

  async function toggleOnline(agent) {
    setSavingId(agent.id)
    setError(null)

    // Ask for the updated row back. Without an update policy, Supabase changes nothing
    // and reports no error, so an empty result means the save did not happen.
    const { data, error: updateError } = await supabase
      .from('agents')
      .update({ is_online: !agent.is_online })
      .eq('id', agent.id)
      .select('id')

    setSavingId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    if (!data || data.length === 0) {
      setError('Nothing was saved. The agents table may be missing an update policy for the anon key.')
      return
    }

    setReloadKey((key) => key + 1)
  }

  if (loading) return <p>Loading agents...</p>

  return (
    <section>
      <h2>Agents</h2>
      <p className="hint">In round-robin order. Only online, active agents get new leads.</p>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Name</th>
            <th>Status</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>{agent.rr_order}</td>
              <td>{agent.name}</td>
              <td>{agent.is_online ? 'Online' : 'Offline'}</td>
              <td>
                <button
                  type="button"
                  disabled={savingId === agent.id}
                  onClick={() => toggleOnline(agent)}
                >
                  {agent.is_online ? 'Set offline' : 'Set online'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default AgentStatus
