import { adminClient, appUrl, HttpError } from './server.js'
import { emailConfigured, sendEmail, inviteEmail, resetEmail } from './email.js'

// Sends someone a link that signs them in and lands on "set your password".
//   kind: 'invite'   → new account (creates the auth user)
//         'reinvite' → account exists but was never used
//         'recovery' → forgotten password
export async function sendAccessLink(req, { email, name = '', inviter = '', kind }) {
  const sb = adminClient()
  const base = appUrl(req)
  const redirectTo = kind === 'recovery' ? `${base}/auth/reset` : `${base}/auth/accept`

  if (!emailConfigured()) {
    // Fallback: Supabase sends its own (customisable) template
    if (kind === 'invite') {
      const { error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: name } })
      if (error) throw new HttpError(400, error.message)
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw new HttpError(400, error.message)
    }
    return { via: 'supabase' }
  }

  const { data, error } = await sb.auth.admin.generateLink({
    type: kind === 'invite' ? 'invite' : 'recovery',
    email,
    options: { redirectTo, ...(kind === 'invite' ? { data: { full_name: name } } : {}) },
  })
  if (error) throw new HttpError(400, error.message)
  const link = data?.properties?.action_link
  if (!link) throw new HttpError(500, 'Could not create a sign-in link.')

  const mail = kind === 'recovery' ? resetEmail({ link }) : inviteEmail({ name, inviter, link })
  await sendEmail({ to: email, ...mail })
  return { via: 'resend', userId: data.user?.id }
}
