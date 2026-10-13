import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpatialWorkspace } from '../../src/ui/SpatialWorkspace';

let allowed = true, deferNext = false;
let deferred: { resolve: () => void; reject: (error: Error) => void } | null = null;
function Harness() {
  const [profile, setProfile] = useState(1);
  const [pending, setPending] = useState(false);
  const context = useMemo(() => ({
    mode: 'auxiliumos-personal' as const,
    namespace: `synthetic-authority-browser-test-${profile}`,
    profileID: `synthetic-profile-${profile}`,
    assertAccess: async () => {
      if (deferNext) {
        deferNext = false; setPending(true);
        await new Promise<void>((resolve, reject) => { deferred = { resolve, reject }; });
      }
      if (!allowed) throw new Error('Synthetic authority was revoked');
    },
  }), [profile]);
  return <>
    <button onClick={() => { allowed = false; }}>Revoke synthetic authority</button>
    <button onClick={() => { deferNext = true; }}>Defer next authority check</button>
    <button onClick={() => { allowed = true; setProfile(profile + 1); }}>Switch synthetic profile</button>
    <button disabled={!pending} onClick={() => { deferred?.reject(new Error('Previous profile authority rejected')); deferred = null; setPending(false); }}>Reject deferred authority</button>
    <button disabled={!pending} onClick={() => { deferred?.resolve(); deferred = null; setPending(false); }}>Resolve deferred authority</button>
    <output aria-label="Synthetic profile">{profile}</output>
    <SpatialWorkspace context={context} />
  </>;
}
createRoot(document.getElementById('authority-root')!).render(<Harness />);
