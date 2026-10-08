// Reusable activation decision helper, not yet wired into the static app.
// This does not authenticate actors, enforce RLS or confer professional authority.
export function evaluateActivation({ environment, synthetic = false, action, policy, decisions }) {
  const required = Object.hasOwn(policy.actions, action) ? policy.actions[action] : null;
  if (!required?.length) return { allowed: false, reason: 'unknown_action' };
  if (['development', 'test'].includes(environment)) return { allowed: synthetic === true, reason: synthetic ? 'synthetic_development_only' : 'real_data_not_authorized' };
  if (environment !== 'production') return { allowed: false, reason: 'unknown_environment' };
  const pending = required.filter(id => {
    const d = decisions.find(item => item.id === id);
    return !d || d.status !== 'approved' || d.production_enabled !== true || !d.approved_by || !d.approved_at || !d.approval_evidence;
  });
  return { allowed: pending.length === 0, reason: pending.length ? 'activation_decision_pending' : 'policy_activation_only', pending };
}
