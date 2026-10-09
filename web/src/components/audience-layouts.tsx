import type { ReactNode } from 'react';
export type Audience = 'simple-client' | 'enterprise' | 'internal-management' | 'assigned-vendor';
/** Supply only a server-verified audience and permission-filtered children at the integration boundary. */
export type AudienceLayoutProps = { verifiedAudience: Audience | null; contextLabel: string; primary: ReactNode; secondary?: ReactNode; requiredWork?: ReactNode };
function AudienceLayout({ audience, verifiedAudience, contextLabel, primary, secondary, requiredWork }: AudienceLayoutProps & { audience: Audience }) {
 if (verifiedAudience !== audience) return <section className="audience-unavailable" role="status"><h2>Access not available</h2><p>Your assigned workspace must be confirmed before opening this view.</p></section>;
 return <section className={`audience-layout audience-${audience}`} aria-label={contextLabel}><header><h2>{contextLabel}</h2></header>{requiredWork && <section className="required-work" aria-label="Required work">{requiredWork}</section>}<div className="audience-columns"><div>{primary}</div>{secondary && <aside>{secondary}</aside>}</div></section>;
}
export const SimpleClientLayout = (props: AudienceLayoutProps) => <AudienceLayout {...props} audience="simple-client" />;
export const EnterpriseLayout = (props: AudienceLayoutProps) => <AudienceLayout {...props} audience="enterprise" />;
export const InternalManagementLayout = (props: AudienceLayoutProps) => <AudienceLayout {...props} audience="internal-management" />;
export const AssignedVendorLayout = (props: AudienceLayoutProps) => <AudienceLayout {...props} audience="assigned-vendor" />;
