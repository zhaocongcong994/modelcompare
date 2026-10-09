// Keep credentials server-side; accept the user's existing local env spelling.
export function jevApiKey(env = process.env) {
  return env.TYPESAFE_API_KEY?.trim() || env.jev_key?.trim() || env.JEV_KEY?.trim() || '';
}
