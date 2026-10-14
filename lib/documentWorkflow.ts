/** Shared document routing for the review-only HR frontend.
 * Routing does NOT imply that a real signed copy, secure file, or electronic signature exists.
 */
export type DocumentRoute = "applicant-upload" | "company-signature" | "internal-review";
export function documentRoute(name:string):DocumentRoute {
  const normalized=name.trim().toLowerCase();
  if(/\b(nda|non.disclosure|contract|company polic(?:y|ies)|general polic(?:y|ies)|code of conduct|employee handbook|consent|acknowledg|job offer|offer letter|accountability|notice to explain|notice of decision|notice of violation|disciplinary notice|clearance form|transfer memo|memorandum)\b/i.test(normalized)) return "company-signature";
  if(/\b(evaluation|approval worksheet|payroll register|investigation findings|internal report)\b/i.test(normalized)) return "internal-review";
  return "applicant-upload";
}
export function uploadRequirements<T extends {name:string;process?:DocumentRoute}>(items:T[]):T[]{return items.filter(r=>(r.process||documentRoute(r.name))==="applicant-upload")}
export function companyDocuments<T extends {name:string;process?:DocumentRoute}>(items:T[]):T[]{return items.filter(r=>(r.process||documentRoute(r.name))==="company-signature")}
export const commonCompanyDocuments=["Non-Disclosure Agreement (NDA)","General Policies","Employment Contract"];
