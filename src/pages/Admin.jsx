import React, { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  UserPlus, Download, ShieldCheck, Search, Ban, RotateCcw, Trash2, Send, CheckCircle2, XCircle, Mail, Table2, BarChart3, ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sb } from '../lib/supabase'
import { api } from '../lib/api'
import { EMAIL_RE } from '../lib/validate'
import { Dialog, Menu, Seg, Empty, PageLoader, useToast, useConfirm } from '../components/ui'
import { AuthLayout, MfaChallenge, MfaEnroll, FormError } from '../components/auth'
import { fmtNum, fmtMinutes, plural } from '../lib/utils'

// ═══════════════════════════════════════════════════════════════
//  Gate: admin role + two-step verified session (aal2)
// ═══════════════════════════════════════════════════════════════
export default function Admin() {
  const { isAdmin, aal, refresh, loading } = useAuth()
  const [factors, setFactors] = useState(null)
  useEffect(() => { if (isAdmin) sb.auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp || []).filter(f => f.status === 'verified'))) }, [isAdmin])

  if (loading) return <PageLoader />
  if (!isAdmin) return <Navigate to="/" replace />
  if (aal.currentLevel !== 'aal2') {
    if (factors === null) return <PageLoader />
    return (
      <div>
        {factors.length
          ? <AuthLayout embedded title="Confirm it’s you" lead="The admin console needs a code from your authenticator app, every session.">
              <MfaChallenge onVerified={refresh} />
            </AuthLayout>
          : <AuthLayout embedded title="Turn on two-step verification" lead="Administrators must use an authenticator app. It takes a minute, and protects every account on the platform.">
              <MfaEnroll onDone={refresh} />
            </AuthLayout>}
      </div>
    )
  }
  return <Console />
}

// ═══════════════════════════════════════════════════════════════
//  Console
// ═══════════════════════════════════════════════════════════════
function Console() {
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState(null)
  const [invites, setInvites] = useState(null)
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')
  const [inviting, setInviting] = useState(false)
  const toast = useToast()

  async function load() {
    const [o, u, i, a] = await Promise.all([
      sb.rpc('admin_overview'), sb.rpc('admin_users'),
      sb.from('invitations').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    if (o.error || u.error) { setError(o.error?.message || u.error?.message); return }
    setOverview(o.data); setUsers(u.data || []); setInvites(i.data || []); setAudit(a.data || [])
  }
  useEffect(() => { load() }, [])

  async function exportCsv() {
    try {
      const res = await api('admin/export', { method: 'GET', raw: true })
      const blob = await res.blob()
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `madfocus-users-${new Date().toISOString().slice(0, 10)}.csv` })
      a.click(); URL.revokeObjectURL(a.href)
      toast('User list downloaded')
    } catch (e) { toast(e.message, 'error') }
  }

  if (error) return (
    <div className="max-w-[640px] mx-auto px-4 pt-16">
      <Empty icon={ShieldAlert} title="Couldn’t load the admin console" body={error} action={<button onClick={() => { setError(''); load() }} className="btn btn-primary">Try again</button>} />
    </div>
  )
  if (!overview) return <PageLoader />
  const pendingApproval = users.filter(u => u.status === 'pending').length

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 pt-8 md:pt-12">
      <header className="flex flex-wrap items-end gap-4 mb-6">
        <div className="mr-auto">
          <h1 className="h-page">Admin console</h1>
          <p className="text-[13.5px] text-muted mt-1.5 inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-good" /> Verified with two-step. You see counts, never anyone’s content.</p>
        </div>
        <button onClick={exportCsv} className="btn btn-outline"><Download size={16} /> Export CSV</button>
        <button onClick={() => setInviting(true)} className="btn btn-primary"><UserPlus size={16} /> Invite people</button>
      </header>

      <div className="mb-8 overflow-x-auto">
        <Seg label="Section" value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'people', label: `People ${users.length}` },
          { value: 'invites', label: `Invitations ${invites.filter(i => i.status === 'sent').length || ''}`.trim() },
          { value: 'activity', label: 'Activity' },
        ]} />
      </div>

      {pendingApproval > 0 && tab !== 'people' && (
        <button onClick={() => setTab('people')} className="w-full text-left panel p-4 mb-6 flex items-center gap-3 shadow-[inset_0_0_0_1.5px_var(--c-warn)]">
          <ShieldAlert size={18} className="text-warn" />
          <span className="flex-1 text-[14px]">{plural(pendingApproval, 'person is', 'people are')} waiting for approval. They signed up without an invitation.</span>
          <span className="text-[13px] text-accent font-medium">Review</span>
        </button>
      )}

      {tab === 'overview' && <Overview o={overview} />}
      {tab === 'people' && <People users={users} reload={load} />}
      {tab === 'invites' && <Invites invites={invites} reload={load} />}
      {tab === 'activity' && <Activity audit={audit} />}

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onDone={load} />
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────
function Overview({ o }) {
  const [asTable, setAsTable] = useState(false)
  const u = o.users, g = o.usage
  const tiles = [
    { label: 'People', value: u.total, sub: [u.pending && `${u.pending} pending`, u.suspended && `${u.suspended} suspended`].filter(Boolean).join(', ') || 'all active' },
    { label: 'Active this week', value: u.active_7d, sub: `${u.active_30d} in the last 30 days` },
    { label: 'Joined this month', value: u.new_30d, sub: 'last 30 days' },
    { label: 'Open invitations', value: u.invites_open, sub: 'not yet accepted' },
  ]
  const usage = [
    ['Tasks created', fmtNum(g.tasks), g.tasks ? `${Math.round((g.tasks_done / g.tasks) * 100)}% completed` : ''],
    ['Habits', fmtNum(g.habits), `${fmtNum(g.habit_checkins)} check-ins`],
    ['Goals', fmtNum(g.goals), ''],
    ['Journal entries', fmtNum(g.journal_entries), ''],
    ['Notes', fmtNum(g.notes), ''],
    ['Books', fmtNum(g.books), `${fmtNum(g.books_finished)} finished`],
    ['Reading time', fmtMinutes(g.reading_minutes), ''],
    ['Focus time', fmtMinutes(g.focus_minutes), ''],
    ['Words written', fmtNum(g.words_written), ''],
  ]
  const daily = o.daily || []

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Key numbers" className="panel grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line-soft overflow-hidden">
        {tiles.map(t => (
          <div key={t.label} className="p-5">
            <p className="text-[13px] text-muted">{t.label}</p>
            <p className="font-serif text-[36px] leading-none mt-2 tnum">{fmtNum(t.value)}</p>
            <p className="text-[12.5px] text-faint mt-2">{t.sub}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="trend-h">
        <div className="flex items-center gap-3 mb-3">
          <h2 id="trend-h" className="h-section mr-auto">Last 30 days</h2>
          <Seg label="View" value={asTable ? 'table' : 'chart'} onChange={v => setAsTable(v === 'table')}
            options={[{ value: 'chart', label: 'Chart', icon: <BarChart3 size={14} /> }, { value: 'table', label: 'Table', icon: <Table2 size={14} /> }]} />
        </div>
        {asTable ? <DailyTable daily={daily} /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Bars title="Sign-ups" data={daily} k="signups" />
            <Bars title="Active people" data={daily} k="active" average hint="Created a task, checked a habit, journaled or focused" />
            <Bars title="Tasks created" data={daily} k="tasks" />
          </div>
        )}
      </section>

      <section aria-labelledby="usage-h">
        <h2 id="usage-h" className="h-section mb-3">Usage across all accounts</h2>
        <div className="panel grid grid-cols-2 md:grid-cols-3 divide-line-soft overflow-hidden">
          {usage.map(([l, v, s], i) => (
            <div key={l} className="p-5 border-line-soft" style={{ borderTopWidth: i >= 2 ? 1 : 0, borderLeftWidth: i % 3 ? 1 : 0 }}>
              <p className="text-[13px] text-muted">{l}</p>
              <p className="text-[22px] font-semibold mt-1 tnum">{v}</p>
              {s && <p className="text-[12.5px] text-faint mt-0.5">{s}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Bars({ title, data, k, hint, average }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map(d => d[k] || 0))
  const total = data.reduce((a, d) => a + (d[k] || 0), 0)
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const h = 120
  return (
    <figure className="panel p-5">
      <figcaption className="flex items-baseline gap-2">
        <span className="text-[14px] font-semibold">{title}</span>
        <span className="text-[13px] text-muted ml-auto tnum">{hover !== null ? `${fmt(data[hover].date)}: ${fmtNum(data[hover][k])}` : average ? `${(total / Math.max(1, data.length)).toFixed(1)} a day on average` : `${fmtNum(total)} total`}</span>
      </figcaption>
      {hint && <p className="text-[12px] text-faint mt-0.5">{hint}</p>}
      <div className="relative mt-4" style={{ height: h }} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map(f => <div key={f} className="absolute inset-x-0 border-t border-line-soft" style={{ bottom: h * f }} aria-hidden />)}
        <span className="absolute -top-1 left-0 text-[11px] text-faint tnum -translate-y-full">{fmtNum(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label={`${title}: ${fmtNum(total)} over the last 30 days`}>
          {data.map((d, i) => (
            <div key={d.date} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
              <div className="w-full rounded-t-[4px] transition-opacity duration-100"
                style={{ height: d[k] ? `${Math.max(3, (d[k] / max) * 100)}%` : 2, background: d[k] ? 'var(--c-chart)' : 'var(--c-line)', opacity: hover === null || hover === i ? 1 : 0.45 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-faint tnum">
        <span>{fmt(data[0]?.date)}</span><span>{fmt(data[14]?.date)}</span><span>Today</span>
      </div>
    </figure>
  )
}

function DailyTable({ daily }) {
  return (
    <div className="panel overflow-auto max-h-[420px]">
      <table className="w-full text-[13.5px] tnum">
        <thead className="sticky top-0 bg-surface"><tr className="text-left text-muted">
          <th className="font-medium px-4 py-3">Date</th><th className="font-medium px-4 py-3 text-right">Sign-ups</th>
          <th className="font-medium px-4 py-3 text-right">Active people</th><th className="font-medium px-4 py-3 text-right">Tasks created</th>
        </tr></thead>
        <tbody>
          {[...daily].reverse().map(d => (
            <tr key={d.date} className="border-t border-line-soft">
              <td className="px-4 py-2.5">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
              <td className="px-4 py-2.5 text-right">{d.signups}</td><td className="px-4 py-2.5 text-right">{d.active}</td><td className="px-4 py-2.5 text-right">{d.tasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── People ─────────────────────────────────────────────────────
const STATUS_STYLE = {
  active:    { label: 'Active', fg: 'var(--c-good)', bg: 'var(--c-good-soft)' },
  pending:   { label: 'Needs approval', fg: 'var(--c-warn)', bg: 'var(--c-warn-soft)' },
  suspended: { label: 'Suspended', fg: 'var(--c-danger)', bg: 'var(--c-danger-soft)' },
}
function ago(ts) {
  if (!ts) return '—'
  const d = (Date.now() - new Date(ts)) / 1000
  if (d < 3600) return 'Just now'
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function People({ users, reload }) {
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()

  const list = useMemo(() => users.filter(u =>
    (filter === 'all' || u.status === filter || (filter === 'never' && !u.last_sign_in_at)) &&
    (!q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.full_name || '').toLowerCase().includes(q.toLowerCase()))
  ), [users, q, filter])

  async function act(u, action, opts = {}) {
    if (opts.confirm) { const ok = await confirm(opts.confirm); if (!ok) return }
    try { await api('admin/users', { body: { action, userId: u.id } }); toast(opts.done); reload() }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <section aria-label="People">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or email" className="input pl-9" aria-label="Search people" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter">
          {[['all', 'All'], ['active', 'Active'], ['pending', 'Needs approval'], ['suspended', 'Suspended'], ['never', 'Never signed in']].map(([k, l]) => (
            <button key={k} className="pick h-8 text-[13px]" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="text-[14px] text-muted py-8">No one matches.</p> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13.5px]">
            <thead><tr className="text-left text-muted text-[12.5px]">
              <th className="font-medium px-4 py-3">Person</th><th className="font-medium px-3 py-3">Status</th>
              <th className="font-medium px-3 py-3">Joined</th><th className="font-medium px-3 py-3">Last active</th>
              {['Tasks', 'Habits', 'Goals', 'Notes', 'Books', 'Journal'].map(h => <th key={h} className="font-medium px-3 py-3 text-right">{h}</th>)}
              <th className="w-12" />
            </tr></thead>
            <tbody>
              {list.map(u => {
                const st = STATUS_STYLE[u.status] || STATUS_STYLE.pending
                const self = u.id === me.id
                const neverIn = !u.last_sign_in_at
                return (
                  <tr key={u.id} className="border-t border-line-soft">
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[260px]">{u.full_name || u.email.split('@')[0]}{self && <span className="text-faint font-normal"> (you)</span>}</p>
                      <p className="text-[12.5px] text-muted truncate max-w-[260px]">{u.email}</p>
                      <div className="flex gap-1.5 mt-1">
                        {u.role === 'admin' && <span className="chip h-5 text-[11px]">Admin</span>}
                        {u.has_mfa && <span className="chip h-5 text-[11px]" title="Two-step verification on"><ShieldCheck size={11} /> 2-step</span>}
                        {neverIn && <span className="chip h-5 text-[11px]">{u.invited ? 'Invited, not signed in' : 'Never signed in'}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="chip h-6" style={{ color: st.fg, background: st.bg }}>{st.label}</span></td>
                    <td className="px-3 py-3 text-muted tnum whitespace-nowrap">{new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="px-3 py-3 text-muted tnum whitespace-nowrap">{ago(u.last_seen_at || u.last_sign_in_at)}</td>
                    {['tasks', 'habits', 'goals', 'notes', 'books', 'journal_entries'].map(k => <td key={k} className="px-3 py-3 text-right tnum">{fmtNum(Number(u[k]))}</td>)}
                    <td className="px-2 py-3 text-right">
                      {!self && u.role !== 'admin' && (
                        <Menu label={`Actions for ${u.email}`} items={[
                          u.status === 'pending' && { label: 'Approve', icon: <CheckCircle2 size={15} />, onClick: () => act(u, 'approve', { done: `${u.email} approved` }) },
                          neverIn && { label: 'Resend invitation', icon: <Send size={15} />, onClick: () => act(u, 'resend_invite', { done: 'Invitation sent again' }) },
                          u.status === 'active' && { label: 'Suspend', icon: <Ban size={15} />, onClick: () => act(u, 'suspend', { done: `${u.email} suspended`, confirm: { title: `Suspend ${u.email}?`, body: 'They’re signed out and can’t sign in or see their data until you reactivate them. Nothing is deleted.', confirmLabel: 'Suspend' } }) },
                          u.status === 'suspended' && { label: 'Reactivate', icon: <RotateCcw size={15} />, onClick: () => act(u, 'reactivate', { done: `${u.email} reactivated` }) },
                          { divider: true },
                          { label: 'Delete account', icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleting(u) },
                        ]} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12.5px] text-faint mt-3">Admin accounts can only be changed in the database. Counts update when you reload.</p>
      <DeleteUser user={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload() }} />
    </section>
  )
}

function DeleteUser({ user, onClose, onDone }) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { setTyped(''); setError('') }, [user?.id])
  async function submit(e) {
    e.preventDefault()
    if (typed.trim().toLowerCase() !== user.email.toLowerCase() || busy) return
    setBusy(true); setError('')
    try { await api('admin/users', { body: { action: 'delete', userId: user.id, confirmEmail: typed.trim() } }); toast(`${user.email} deleted`); onDone() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={!!user} onClose={onClose} title="Delete this account?" width={460}>
      {user && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-[14px] text-muted leading-relaxed">
            This permanently deletes <span className="text-ink font-medium">{user.email}</span> and all of their data: {plural(Number(user.tasks), 'task')}, {plural(Number(user.notes), 'note')}, {plural(Number(user.journal_entries), 'journal entry', 'journal entries')} and more. It can’t be undone. Suspending is reversible if you’re not sure.
          </p>
          <div>
            <label className="label" htmlFor="del-email">Type their email to confirm</label>
            <input id="del-email" className="input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus placeholder={user.email} />
          </div>
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={typed.trim().toLowerCase() !== user.email.toLowerCase() || busy} className="btn btn-danger">{busy ? 'Deleting' : 'Delete account'}</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

// ── Invitations ────────────────────────────────────────────────
function Invites({ invites, reload }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [show, setShow] = useState('sent')
  const list = invites.filter(i => show === 'all' || i.status === show)

  async function resend(i) {
    try {
      const { results } = await api('admin/invite', { body: { emails: [i.email], fullName: i.full_name } })
      const r = results[0]
      toast(r.status === 'failed' ? r.message : r.status === 'member' ? `${i.email} already has an account` : 'Invitation sent again', r.status === 'failed' ? 'error' : undefined)
      reload()
    } catch (e) { toast(e.message, 'error') }
  }
  async function revoke(i) {
    const ok = await confirm({ title: `Revoke the invitation for ${i.email}?`, body: 'Their link stops working. If they never signed in, the placeholder account is removed too.', confirmLabel: 'Revoke' })
    if (!ok) return
    try { await api('admin/users', { body: { action: 'revoke_invite', invitationId: i.id } }); toast('Invitation revoked'); reload() }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <section aria-label="Invitations">
      <div className="flex gap-1.5 mb-4" role="group" aria-label="Filter invitations">
        {[['sent', 'Open'], ['accepted', 'Accepted'], ['revoked', 'Revoked'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className="pick h-8 text-[13px]" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-[14px] text-muted py-8">{show === 'sent' ? 'No open invitations.' : 'Nothing here.'}</p> : (
        <div className="panel p-1.5">
          {list.map(i => (
            <div key={i.id} className="row">
              <Mail size={16} className="text-faint flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] truncate">{i.email}{i.full_name && <span className="text-muted">, {i.full_name}</span>}</p>
                <p className="text-[12.5px] text-faint">
                  {i.status === 'accepted' ? `Accepted ${ago(i.accepted_at)}` : i.status === 'revoked' ? 'Revoked' : `Sent ${ago(i.last_sent_at)}${i.send_count > 1 ? `, ${i.send_count} times` : ''}`}
                </p>
              </div>
              {i.status === 'sent' && (
                <>
                  <button onClick={() => resend(i)} className="btn btn-quiet btn-sm"><Send size={14} /> Resend</button>
                  <button onClick={() => revoke(i)} className="btn btn-quiet btn-sm text-danger"><XCircle size={14} /> Revoke</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Activity ───────────────────────────────────────────────────
const ACTIONS = {
  'user.invite': 'invited', 'invite.resend': 'resent an invitation to', 'invite.revoke': 'revoked the invitation for',
  'user.suspend': 'suspended', 'user.reactivate': 'reactivated', 'user.approve': 'approved', 'user.delete': 'deleted the account of',
  'users.export': 'exported the user list:', 'account.delete': 'deleted their own account',
}
function Activity({ audit }) {
  if (!audit.length) return <p className="text-[14px] text-muted py-8">Admin actions will be recorded here.</p>
  return (
    <section aria-label="Activity" className="panel p-1.5">
      {audit.map(a => (
        <div key={a.id} className="row items-start py-3">
          <span className="text-[12.5px] text-faint tnum w-[120px] flex-shrink-0 pt-0.5">{new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <p className="text-[13.5px] flex-1 min-w-0 break-words">
            <span className="font-medium">{a.actor_email || 'System'}</span> {ACTIONS[a.action] || a.action} <span className="text-muted">{a.action === 'account.delete' ? '' : a.target}</span>
          </p>
          {a.ip && <span className="text-[12px] text-faint hidden md:inline">{a.ip}</span>}
        </div>
      ))}
    </section>
  )
}

// ── Invite dialog ──────────────────────────────────────────────
function InviteDialog({ open, onClose, onDone }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setText(''); setName(''); setResults(null); setError('') } }, [open])

  const emails = [...new Set(text.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))]
  const invalid = emails.filter(e => !EMAIL_RE.test(e))

  async function submit(e) {
    e.preventDefault()
    if (!emails.length || invalid.length || busy) return
    setBusy(true); setError('')
    try {
      const r = await api('admin/invite', { body: { emails, fullName: emails.length === 1 ? name : '' } })
      setResults(r.results); onDone()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const ICON = { invited: CheckCircle2, resent: Send, member: CheckCircle2, invalid: XCircle, failed: XCircle }
  const TONE = { invited: 'var(--c-good)', resent: 'var(--c-good)', member: 'var(--c-muted)', invalid: 'var(--c-danger)', failed: 'var(--c-danger)' }

  return (
    <Dialog open={open} onClose={onClose} title={results ? 'Invitations' : 'Invite people'} width={520}>
      {results ? (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col">
            {results.map(r => {
              const I = ICON[r.status]
              return (
                <li key={r.email} className="flex items-center gap-3 min-h-[44px] border-b border-line-soft text-[14px]">
                  <I size={17} style={{ color: TONE[r.status] }} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{r.email}</span>
                  <span className="text-[12.5px] text-muted">{r.message}</span>
                </li>
              )
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setResults(null)} className="btn btn-outline">Invite more</button>
            <button onClick={onClose} className="btn btn-primary">Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="inv-emails">Email addresses</label>
            <textarea id="inv-emails" data-autofocus className="input min-h-[110px]" value={text} onChange={e => setText(e.target.value)}
              placeholder={'ana@company.com\nravi@company.com'} />
            <p className="text-[12.5px] mt-1.5" style={{ color: invalid.length ? 'var(--c-danger)' : 'var(--c-faint)' }}>
              {invalid.length ? `Check ${invalid.slice(0, 2).join(', ')}${invalid.length > 2 ? '…' : ''}` : emails.length ? `${plural(emails.length, 'person', 'people')} will get a branded email with a link to set their password.` : 'Separate with commas or new lines. Up to 50 at a time.'}
            </p>
          </div>
          {emails.length === 1 && (
            <div>
              <label className="label" htmlFor="inv-name">Their name <span className="text-faint font-normal">(optional)</span></label>
              <input id="inv-name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
            </div>
          )}
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={!emails.length || invalid.length > 0 || busy} className="btn btn-primary"><Send size={15} /> {busy ? 'Sending' : `Send ${emails.length > 1 ? emails.length + ' invitations' : 'invitation'}`}</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
