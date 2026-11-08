import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function useSession() {
  const [state, setState] = useState({ session: null, ready: false })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }))
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setState({ session, ready: true }))
    return () => data.subscription.unsubscribe()
  }, [])

  return state
}
