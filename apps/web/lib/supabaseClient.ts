type DisabledFn = (...args: unknown[]) => never

type SupabaseClientStub = {
  from: DisabledFn
  channel: DisabledFn
  removeChannel: DisabledFn
}

const disabled: DisabledFn = () => {
  throw new Error('Supabase is not available in landslide-monitoring-v2. Use v2 api-service endpoints instead.')
}

export const supabase: SupabaseClientStub = {
  from: disabled,
  channel: disabled,
  removeChannel: disabled,
}

