import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SpatialWorkspace } from '../spatial-generated/spatial-workspace.js';
import { useRuntime } from '../lib/runtime';
import '../spatial-generated/spatial-workspace.css';

// This route is inside the existing AuthGate. The callback checks current server
// identity again; router state or a URL identifier is never project authority.
export function SpatialPage() {
  const { api, state } = useRuntime();
  const profileID = state.status === 'ready' ? state.context.profileId : '';
  const development = state.status === 'ready' && state.context.development;
  const scope = useMemo(() => ({ api, profileID, development }), [api, profileID, development]);
  const committedScope = useRef(scope);
  useLayoutEffect(() => { committedScope.current = scope; }, [scope]);
  const [revokedScope, setRevokedScope] = useState<typeof scope | null>(null);
  const assertAccess = useCallback(async () => {
    try {
      const current = await api.loadRuntimeContext();
      if (current.status !== 'ready' || current.context.profileId !== profileID || !current.context.development) throw new Error('Spatial access changed. Reopen the workspace after signing in.');
    } catch (error) {
      // A previous account's late rejection must neither hide this account nor
      // overwrite a denial already recorded for its current scope.
      if (committedScope.current === scope) setRevokedScope(scope);
      throw error;
    }
  }, [api, profileID, scope]);
  const context = useMemo(() => ({ mode: 'auxiliumos-personal' as const,
    namespace: `auxiliumos:spatial:v1:profile:${profileID}:personal`, profileID, assertAccess }), [profileID, assertAccess]);
  if (!profileID || !development || revokedScope === scope) return <div className="status-card" role="alert"><h1>Spatial access unavailable</h1><p>Current account access could not be verified. Reopen Spatial after refreshing your workspace access.</p></div>;
  return <section aria-label="Auxilium Spatial"><div className="status-card"><h1>Spatial</h1><p>Personal synthetic layouts on this browser. Full editing, geometric navigation and exports are available below.</p><p>These drafts are not attached to an authorized project. Project access is not yet connected in AuxiliumOS; no client record or published document is created here.</p></div><SpatialWorkspace key={context.namespace} context={context} /></section>;
}
