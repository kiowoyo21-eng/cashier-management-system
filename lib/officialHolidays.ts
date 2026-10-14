/** Published PH government holiday reference dates for 2026–2027 (as of 2026-10-13).
 * Calendar reference ONLY. Official holiday pay depends on coverage, eligibility,
 * attendance, applicable rest-day rules, and later proclamations/advisories.
 * Government references remain read-only; HR-added company dates are separate.
 */
import type {HolidayRule} from "./payrollConfig";

export const governmentHolidaySources={
 y2026:"https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/7/99678", // Proclamation 1006
 fitr2026:"https://pco.gov.ph/news_releases/palace-declares-march-20-regular-holiday-nationwide-for-eidl-fitr/", // Proclamation 1189
 adha2026:"https://pco.gov.ph/news_releases/palace-declares-may-27-as-a-regular-holiday-for-eidl-adha-observance/", // Proclamation 1264
 aseanNcr2026:"https://dole.gov.ph/news/dole-issues-pay-rules-for-ncr-special-non-working-days-during-49th-asean-summit/", // Proclamation 1449; Labor Advisory 16/2026
 y2027:"https://pco.gov.ph/news_releases/pbbm-declares-2027-regular-and-special-holidays/" // Proclamation 1427
} as const;
export type GovernmentHoliday={date:string;name:string;type:HolidayRule["type"];scope:"Nationwide"|"NCR Only";source:keyof typeof governmentHolidaySources};
export const governmentHolidayDates:GovernmentHoliday[]=[
 {date:"2026-01-01",name:"New Year's Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-02-17",name:"Chinese New Year",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-02-25",name:"EDSA People Power Revolution Anniversary",type:"Special Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-03-20",name:"Eid'l Fitr",type:"Regular Holiday",scope:"Nationwide",source:"fitr2026"},
 {date:"2026-04-02",name:"Maundy Thursday",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-04-03",name:"Good Friday",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-04-04",name:"Black Saturday",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-04-09",name:"Araw ng Kagitingan",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-05-01",name:"Labor Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-05-27",name:"Eid'l Adha",type:"Regular Holiday",scope:"Nationwide",source:"adha2026"},
 {date:"2026-06-12",name:"Independence Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-08-21",name:"Ninoy Aquino Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-08-31",name:"National Heroes Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-11-01",name:"All Saints' Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-11-02",name:"All Souls' Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-11-16",name:"49th ASEAN Summit — NCR Day 1",type:"Special Non-Working Day",scope:"NCR Only",source:"aseanNcr2026"},
 {date:"2026-11-17",name:"49th ASEAN Summit — NCR Day 2",type:"Special Non-Working Day",scope:"NCR Only",source:"aseanNcr2026"},
 {date:"2026-11-18",name:"49th ASEAN Summit — NCR Day 3",type:"Special Non-Working Day",scope:"NCR Only",source:"aseanNcr2026"},
 {date:"2026-11-30",name:"Bonifacio Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-12-08",name:"Feast of the Immaculate Conception",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-12-24",name:"Christmas Eve",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2026-12-25",name:"Christmas Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-12-30",name:"Rizal Day",type:"Regular Holiday",scope:"Nationwide",source:"y2026"},
 {date:"2026-12-31",name:"Last Day of the Year",type:"Special Non-Working Day",scope:"Nationwide",source:"y2026"},
 {date:"2027-01-01",name:"New Year's Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-02-06",name:"Chinese New Year",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-02-25",name:"EDSA People Power Revolution Anniversary",type:"Special Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-03-25",name:"Maundy Thursday",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-03-26",name:"Good Friday",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-03-27",name:"Black Saturday",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-04-09",name:"Araw ng Kagitingan",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-05-01",name:"Labor Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-06-12",name:"Independence Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-08-21",name:"Ninoy Aquino Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-08-30",name:"National Heroes Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-11-01",name:"All Saints' Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-11-02",name:"All Souls' Day",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-11-30",name:"Bonifacio Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-12-08",name:"Feast of the Immaculate Conception",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-12-24",name:"Christmas Eve",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"},
 {date:"2027-12-25",name:"Christmas Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-12-30",name:"Rizal Day",type:"Regular Holiday",scope:"Nationwide",source:"y2027"},
 {date:"2027-12-31",name:"Last Day of the Year",type:"Special Non-Working Day",scope:"Nationwide",source:"y2027"}
];
// These are calendar reference entries, not payroll-approved adjustment records.
export const governmentHolidaysAsRules:HolidayRule[]=governmentHolidayDates.map((h)=>({
 id:`PH-GOV-${h.date}`,date:h.date,name:h.name,type:h.type,
 branch:h.scope==="Nationwide"?"All Branches":"NCR Only",
 baseline:h.type==="Regular Holiday"?200:h.type==="Special Non-Working Day"?130:100,
 department:"All Departments",departmentRate:null,employeeId:"",employeeRate:null,
 notes:`Official ${h.scope} calendar reference. Source: ${governmentHolidaySources[h.source]}. Actual pay requires eligible attendance, rest-day and DOLE rules.`
}));
export const governmentHolidaySourceFor=(id:string)=>{
 const item=governmentHolidayDates.find(h=>`PH-GOV-${h.date}`===id);
 return item?governmentHolidaySources[item.source]:null;
};
export function combinedHolidayReferences(custom:HolidayRule[]):HolidayRule[]{
 // Preserve existing company overrides for an official holiday (custom record wins).
 // Do not erase HR-entered policies or duplicate the official reference when matched.
 return [...custom,...governmentHolidaysAsRules.filter(h=>!custom.some(c=>
  c.date===h.date&&c.type===h.type&&c.name.trim().toLowerCase()===h.name.toLowerCase()
 ))];
}
