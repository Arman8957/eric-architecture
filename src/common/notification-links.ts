/**
 * Deep links for notifications.
 *
 * The targets are modals inside a dashboard page, not routes, so the link
 * carries the target as query params. The destination page reads them
 * (see `useProjectDeepLink` on the client), opens the project's details modal
 * on the named tab, and strips the params from the URL.
 *
 * Tab keys must match the modal's own tab keys exactly.
 */

/** Tabs in the staff-side ProjectDetailsModal. */
export type StaffProjectTab =
  | 'information'
  | 'meeting'
  | 'contracts'
  | 'management'
  | 'attachments';

/** Tabs in the client-side ClientProjectDetailsModal. */
export type ClientProjectTab = 'details' | 'proposals' | 'meetings' | 'attachments';

/** Opens a project on the staff dashboard, on the given tab. */
export const staffProjectLink = (
  projectRequestId: string,
  tab: StaffProjectTab = 'information',
) => `/dashboard?project=${projectRequestId}&tab=${tab}`;

/**
 * Opens a project on the client dashboard, on the given tab. Passing a
 * proposal id also opens that contract for review/signing straight away.
 */
export const clientProjectLink = (
  projectRequestId: string,
  tab: ClientProjectTab = 'details',
  proposalId?: string,
) =>
  `/user-dashboard?project=${projectRequestId}&tab=${tab}` +
  (proposalId ? `&proposal=${proposalId}` : '');
