/** Presentation fields only. Values are unsaved and never operational records. */
export type DraftField = { label: string; kind?: 'text' | 'multiline' | 'date' | 'quantity' | 'money' | 'select'; options?: string[] };
export type ScreenPattern = 'editor' | 'review' | 'schedule' | 'checklist' | 'conversation' | 'report' | 'history' | 'integration' | 'audit';
export type ScreenDefinition = { title: string; pattern: ScreenPattern; fields: DraftField[]; repeat?: { label: string; fields: DraftField[] }; checks?: string[]; consequence?: string };
const text = (...labels: string[]): DraftField[] => labels.map(label => ({ label }));
const notes = (...labels: string[]): DraftField[] => labels.map(label => ({ label, kind: 'multiline' }));
const dates = (...labels: string[]): DraftField[] => labels.map(label => ({ label, kind: 'date' }));
const review = (title: string, fields: string[], checks: string[], consequence = 'Request review'): ScreenDefinition => ({ title, pattern: 'review', fields: text(...fields), checks, consequence });
export const moduleScreens: Record<string, ScreenDefinition[]> = {
 scope: [
  { title: 'Prepare scope draft', pattern: 'editor', fields: [...text('Project request reference', 'Facility / area'), ...notes('Inclusions', 'Exclusions', 'Assumptions', 'Limitations', 'Sampling decision', 'Accepted recommendations', 'Declined recommendations')], repeat: { label: 'Deliverables', fields: text('Deliverable', 'Acceptance evidence') }, consequence: 'Save scope revision' },
  review('Review an exact revision', ['Scope revision reference', 'Qualified reviewer'], ['Confirm the exact scope revision', 'Review inclusions and exclusions', 'Identify unresolved assumptions', 'Separate sampling and commercial authority']),
  { title: 'Prepare a change request', pattern: 'editor', fields: [...text('Current approved revision'), ...notes('Requested change', 'Reason for change', 'Work affected', 'Schedule and cost considerations')], consequence: 'Submit change request' },
 ],
 projects: [
  { title: 'Project planning', pattern: 'editor', fields: [...text('Project reference', 'Authorization reference', 'Scope revision', 'Facility', 'Accountable owner'), ...notes('Handoff notes')], consequence: 'Save project plan' },
  { title: 'Work order schedule', pattern: 'schedule', fields: [...text('Project reference'), ...notes('Scheduling constraints')], repeat: { label: 'Planned work orders', fields: [...text('Work order title', 'Assigned person', 'Facility / area'), ...dates('Planned date'), ...notes('Permitted instructions')] }, consequence: 'Schedule work orders' },
  { title: 'Deliverables and closeout', pattern: 'checklist', fields: [...text('Project reference', 'Accountable reviewer'), ...notes('Handoff evidence', 'Exceptions and outstanding work')], repeat: { label: 'Deliverables', fields: text('Deliverable reference', 'Evidence reference') }, checks: ['Required deliverables identified', 'Work order evidence reviewed', 'Exceptions recorded', 'Client handoff prepared'], consequence: 'Submit for closeout' },
 ],
 programs: [
  { title: 'Prepare program coverage', pattern: 'editor', fields: text('Program name', 'Client account reference', 'MSA reference'), repeat: { label: 'Facility coverage', fields: [...text('Facility reference', 'Coverage description'), ...dates('Activation date')] }, consequence: 'Save program' },
  { title: 'Effective periods', pattern: 'schedule', fields: [...text('Program revision'), ...dates('Effective from', 'Effective until'), ...notes('Period notes')], repeat: { label: 'Facility activation periods', fields: [...text('Facility reference'), ...dates('Start date', 'End date')] }, consequence: 'Save effective period' },
  review('Commercial framework review', ['MSA revision', 'Rate card reference', 'Commercial authority'], ['Confirm effective agreement revision', 'Check covered facilities', 'Review response expectations', 'Confirm commercial authority'], 'Submit framework review'),
 ],
 portfolios: [
  { title: 'Prepare portfolio', pattern: 'editor', fields: [...text('Portfolio name', 'Client account reference', 'Regional grouping'), ...notes('Portfolio notes')], consequence: 'Save portfolio' },
  { title: 'Facility relationships', pattern: 'editor', fields: text('Portfolio reference'), repeat: { label: 'Facility relationships', fields: text('Facility reference', 'Regional grouping', 'Relationship notes') }, consequence: 'Save relationships' },
  { title: 'Executive reporting brief', pattern: 'report', fields: [...text('Portfolio reference', 'Approved audience'), ...dates('Period start', 'Period end'), ...notes('Reporting questions', 'Released source references')], consequence: 'Generate executive view' },
 ],
 readiness: [
  { title: 'Prepare site passport', pattern: 'editor', fields: [...text('Facility reference', 'Site champion', 'Accountable contact'), ...notes('Response map', 'Access information')], repeat: { label: 'Critical assets', fields: text('Asset reference', 'Area', 'Operational context') }, consequence: 'Save site passport' },
  { title: 'Readiness review', pattern: 'checklist', fields: [...text('Facility reference', 'Reviewer'), ...notes('Evidence references')], checks: ['Site contacts reviewed', 'Access information reviewed', 'Response map reviewed', 'Critical asset information reviewed'], repeat: { label: 'Recorded gaps', fields: [...text('Deficiency', 'Accountable owner'), ...dates('Due date'), ...notes('Evidence / next action')] }, consequence: 'Submit readiness review' },
  { title: 'Recurring work plan', pattern: 'schedule', fields: text('Facility reference'), repeat: { label: 'Planned activities', fields: [...text('Activity', 'Accountable owner', 'Recurrence notes'), ...dates('Next planned date')] }, consequence: 'Save recurring plan' },
 ],
 estimates: [
  { title: 'Prepare ROM estimate', pattern: 'editor', fields: [...text('Scope revision', 'Currency'), { label: 'Planning range lower', kind: 'money' }, { label: 'Planning range upper', kind: 'money' }], repeat: { label: 'Planning items', fields: [...text('Description', 'Unit'), { label: 'Quantity', kind: 'quantity' }, { label: 'Planning unit amount', kind: 'money' }] }, consequence: 'Save estimate revision' },
  { title: 'Estimate assumptions', pattern: 'editor', fields: [...text('Estimate revision'), ...notes('Labor basis', 'Direct cost basis', 'Travel assumptions', 'Uncertainty and exclusions')], consequence: 'Save assumptions' },
  review('Cap review', ['Estimate revision', 'Recommended cap reference', 'Granted cap reference', 'Commercial reviewer'], ['Confirm estimate basis', 'Review planning uncertainty', 'Separate recommended and granted caps', 'Confirm spending authority'], 'Request cap decision'),
 ],
 approvals: [
  { title: 'Prepare authorization request', pattern: 'editor', fields: [...text('Agreement reference', 'Scope revision', 'Authorized signer', 'Payer'), ...notes('Terms reference', 'Rate basis reference')], consequence: 'Request authorization' },
  review('Exact-revision agreement review', ['Agreement revision', 'Scope revision', 'Signer reference', 'Payer reference'], ['Read exact agreement revision', 'Verify signer authority', 'Confirm payer and commercial basis', 'Check effective amendments'], 'Sign exact revision'),
  { title: 'Prepare amendment', pattern: 'editor', fields: [...text('Effective agreement revision', 'Change authorization reference'), ...notes('Proposed amendment', 'Reason', 'Affected terms')], consequence: 'Submit amendment' },
 ],
 sampling: [
  { title: 'Prepare sampling plan', pattern: 'editor', fields: [...text('Scope revision', 'Facility / area', 'Qualified reviewer'), ...notes('Sampling strategy', 'Professional review questions')], repeat: { label: 'Planned locations', fields: text('Location reference', 'Sample identifier', 'Method reference') }, consequence: 'Submit sampling plan' },
  { title: 'Prepare custody record', pattern: 'editor', fields: text('Sampling plan revision'), repeat: { label: 'Custody entries', fields: [...text('Sample identifier', 'From custodian', 'To custodian'), ...dates('Transfer date'), ...notes('Transfer evidence')] }, consequence: 'Save custody record' },
  review('Laboratory evidence review', ['Sampling plan revision', 'Laboratory report reference', 'Qualified reviewer'], ['Check sample identification', 'Review custody evidence', 'Keep laboratory results distinct from interpretation', 'Record professional interpretation separately']),
 ],
 messages: [
  { title: 'Prepare conversation', pattern: 'conversation', fields: [...text('Linked record reference', 'Recipient reference', 'Subject'), { label: 'Communication route', kind: 'select', options: ['Technical', 'Billing', 'Scheduling', 'Urgent', 'Vendor'] }, ...notes('Message')], consequence: 'Send message' },
  { title: 'Prepare follow-up request', pattern: 'editor', fields: [...text('Conversation reference', 'Responsible person'), { label: 'Request type', kind: 'select', options: ['Question', 'Clarification', 'Task', 'Change request draft'] }, ...notes('Request'), ...dates('Requested response date')], consequence: 'Submit follow-up' },
  { title: 'Communication routing', pattern: 'editor', fields: [...text('Linked record reference'), ...notes('Technical contact', 'Billing contact', 'Scheduling contact', 'Urgent escalation contact', 'Vendor contact')], consequence: 'Save communication route' },
 ],
 vendors: [
  { title: 'Prepare assigned work', pattern: 'schedule', fields: text('Work order reference', 'Vendor reference', 'Accountable contact'), repeat: { label: 'Assignment plan', fields: [...text('Assignment title'), ...dates('Due date'), ...notes('Permitted instructions')] }, consequence: 'Assign vendor work' },
  { title: 'Closeout evidence', pattern: 'checklist', fields: [...text('Assignment reference'), ...notes('Completion evidence', 'Exceptions')], checks: ['Assigned instructions reviewed', 'Required evidence identified', 'Exceptions recorded'], consequence: 'Submit completion evidence' },
  { title: 'Company credentials', pattern: 'editor', fields: text('Vendor reference', 'Company name'), repeat: { label: 'Credential references', fields: [...text('Credential type', 'Evidence reference'), ...dates('Expiry date')] }, consequence: 'Save credential references' },
 ],
 finance: [
  { title: 'Prepare financial entry', pattern: 'editor', fields: [...text('Authorization reference', 'Source transaction reference', 'Currency'), { label: 'Record basis', kind: 'select', options: ['Commitment', 'Incurred cost'] }, { label: 'Amount', kind: 'money' }, ...notes('Entry notes')], consequence: 'Record entry' },
  { title: 'Prepare invoice review', pattern: 'editor', fields: [...text('Invoice reference', 'Payer reference', 'Source transaction reference', 'Currency'), { label: 'Invoice amount', kind: 'money' }, ...dates('Invoice date'), ...notes('Review notes')], consequence: 'Submit invoice review' },
  { title: 'Reserve and export brief', pattern: 'report', fields: [...text('Reserve record reference', 'Source transaction reference', 'Permitted export audience'), ...notes('Export purpose')], consequence: 'Export financial records' },
 ],
 reports: [
  { title: 'Define service report', pattern: 'report', fields: [...text('Report name', 'Metric definition', 'Denominator definition'), ...dates('Period start', 'Period end'), ...notes('Source references')], consequence: 'Generate report' },
  { title: 'Prepare QBR package', pattern: 'editor', fields: [...text('Package title', 'Approved audience'), ...dates('Period start', 'Period end'), ...notes('Review questions')], repeat: { label: 'Package sections', fields: text('Section title', 'Released source reference', 'Next action') }, consequence: 'Request package review' },
  { title: 'Definitions and sources', pattern: 'editor', fields: [...text('Definition name'), ...notes('Calculation definition', 'Denominator', 'Source records', 'Missing-value handling')], consequence: 'Save report definition' },
 ],
 ai: [
  { title: 'Prepare assistance question', pattern: 'conversation', fields: [...text('Linked record reference'), ...notes('Question')], repeat: { label: 'Permitted source references', fields: text('Source reference', 'Exact revision') }, consequence: 'Request assistance' },
  review('Human review', ['Assistance request reference', 'Source citation references', 'Reviewer'], ['Verify source access and exact revisions', 'Check citations', 'Review suggested wording', 'Keep professional and commercial decisions separate'], 'Adopt reviewed draft'),
  { title: 'Adoption history', pattern: 'history', fields: [] },
 ],
 audit: [
  { title: 'Event trail', pattern: 'audit', fields: [...text('Object reference', 'Actor reference', 'Operation'), ...dates('From date', 'To date')], consequence: 'Search permitted events' },
  { title: 'Correlation search', pattern: 'audit', fields: text('Correlation UUID', 'Object reference'), consequence: 'Find related events' },
  { title: 'Governed audit access', pattern: 'history', fields: [] },
 ],
 integrations: [
  { title: 'Moldo connection', pattern: 'integration', fields: [] },
  { title: 'Source provenance', pattern: 'integration', fields: [] },
  { title: 'Synchronization status', pattern: 'integration', fields: [] },
 ],
};
