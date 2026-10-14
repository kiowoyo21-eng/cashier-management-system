/**
 * Display-only routing guidance used by the frontend prototype.
 * The secure backend MUST derive recipients independently and enforce visibility.
 * Never authorize access, send mail, or accept a client-provided handler as trusted.
 */
export type IncidentRespondentType = "branch_manager" | "other_staff" | "unsure";
export type IncidentRouting = {
  handler: "HR" | "BM";
  hrCopied: boolean;
  confidentiality: "hr_only" | "bm_with_hr_oversight";
  heading: string;
  explanation: string;
};
export function getIncidentRouting(type: IncidentRespondentType): IncidentRouting {
  if (type === "other_staff") {
    return {
      handler: "BM",
      hrCopied: true,
      confidentiality: "bm_with_hr_oversight",
      heading: "Branch Manager • HR copied",
      explanation: "The relevant Branch Manager handles the initial review. HR receives a copy for oversight and can monitor progress. If the BM is involved, select the Branch Manager option instead.",
    };
  }
  return {
    handler: "HR",
    hrCopied: false,
    confidentiality: "hr_only",
    heading: "Direct to HR • BM excluded",
    explanation: type === "branch_manager"
      ? "The concern is about a Branch Manager, so it should be directed privately to HR. The reported BM must not see it, approve it, or be included in notifications."
      : "Because the reported person's role is unclear, HR should screen the report before deciding who may safely handle it. The BM should not receive it by default.",
  };
}
