// RED-phase stub — no menu, no logout.
// GREEN renders header with user menu and a logout that calls supabase.auth.signOut.
type Props = {
  displayName: string | null;
};

export function Header(_props: Props) {
  return <header><p>placeholder</p></header>;
}
