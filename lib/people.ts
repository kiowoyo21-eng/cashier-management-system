import type {Branch} from "./mock";
export type Shop=Exclude<Branch,"All Shops">;
export type Person={id:string;name:string;branch:Shop;department:string;position:string;status:string;gender:string;hire:string;salaryType:"Daily"|"Monthly";rate:number};
/** Fully fictional 35-person scenario. Rates marked as examples, NOT approved pay records.
 * Operations: PHP 20,000/month; Office/Administration/Marketing: PHP 755/day QA reference;
 * Supervisors: PHP 30,000/month illustrative placeholder until HR supplies salary.
 */
export const employees:Person[]=[
 {"id":"UC-0001","name":"Gabriel Aquino","branch":"UC Mandaluyong","department":"Operations","position":"Automotive Mechanic","status":"Regular","gender":"Male","hire":"2024-01-12","salaryType":"Monthly","rate":20000},
 {"id":"UC-0002","name":"Daphne Mercado","branch":"UC Las Piñas","department":"Operations","position":"Senior Mechanic","status":"Regular","gender":"Female","hire":"2025-05-06","salaryType":"Monthly","rate":20000},
 {"id":"UC-0003","name":"Enzo Villanueva","branch":"UC Quezon City","department":"Operations","position":"Automotive Mechanic","status":"Regular","gender":"Male","hire":"2025-11-17","salaryType":"Monthly","rate":20000},
 {"id":"UC-0004","name":"Alvin Soriano","branch":"MM Mandaluyong","department":"Operations","position":"Service Advisor","status":"Regular","gender":"Male","hire":"2026-03-02","salaryType":"Monthly","rate":20000},
 {"id":"UC-0005","name":"Leona Castillo","branch":"UC Mandaluyong","department":"Operations","position":"Automotive Mechanic","status":"Regular","gender":"Female","hire":"2026-07-13","salaryType":"Monthly","rate":20000},
 {"id":"UC-0006","name":"Jericho Ramos","branch":"UC Las Piñas","department":"Operations","position":"Service Advisor","status":"Probationary","gender":"Male","hire":"2026-08-03","salaryType":"Monthly","rate":20000},
 {"id":"UC-0007","name":"Paula Garcia","branch":"UC Quezon City","department":"Operations","position":"Automotive Mechanic","status":"Probationary","gender":"Female","hire":"2026-08-24","salaryType":"Monthly","rate":20000},
 {"id":"UC-0008","name":"Miguel Serrano","branch":"MM Mandaluyong","department":"Operations","position":"Automotive Mechanic","status":"Regular","gender":"Male","hire":"2024-01-12","salaryType":"Monthly","rate":20000},
 {"id":"UC-0009","name":"Bryan Lim","branch":"UC Mandaluyong","department":"Operations","position":"Service Advisor","status":"Regular","gender":"Male","hire":"2025-05-06","salaryType":"Monthly","rate":20000},
 {"id":"UC-0010","name":"Jasmine Dizon","branch":"UC Las Piñas","department":"Operations","position":"Automotive Mechanic","status":"Regular","gender":"Female","hire":"2025-11-17","salaryType":"Monthly","rate":20000},
 {"id":"UC-0011","name":"Hannah Velasco","branch":"UC Quezon City","department":"Office","position":"Office Assistant","status":"Regular","gender":"Female","hire":"2026-03-02","salaryType":"Daily","rate":755},
 {"id":"UC-0012","name":"Nathan Bautista","branch":"MM Mandaluyong","department":"Office","position":"Receptionist","status":"Probationary","gender":"Male","hire":"2026-07-13","salaryType":"Daily","rate":755},
 {"id":"UC-0013","name":"Clara Fajardo","branch":"UC Mandaluyong","department":"Office","position":"Records Clerk","status":"Regular","gender":"Female","hire":"2026-08-03","salaryType":"Daily","rate":755},
 {"id":"UC-0014","name":"Diego Santos","branch":"UC Las Piñas","department":"Office","position":"Office Coordinator","status":"Probationary","gender":"Male","hire":"2026-08-24","salaryType":"Daily","rate":755},
 {"id":"UC-0015","name":"Elaine Torres","branch":"UC Quezon City","department":"Office","position":"Customer Relations Staff","status":"Regular","gender":"Female","hire":"2024-01-12","salaryType":"Daily","rate":755},
 {"id":"UC-0016","name":"Alyssa Rivera","branch":"MM Mandaluyong","department":"Administration","position":"Admin Assistant","status":"Regular","gender":"Female","hire":"2025-05-06","salaryType":"Daily","rate":755},
 {"id":"UC-0017","name":"Patrick Flores","branch":"UC Mandaluyong","department":"Administration","position":"HR Assistant","status":"Regular","gender":"Male","hire":"2025-11-17","salaryType":"Daily","rate":755},
 {"id":"UC-0018","name":"Katrina Mendoza","branch":"UC Las Piñas","department":"Administration","position":"Admin Coordinator","status":"Probationary","gender":"Female","hire":"2026-03-02","salaryType":"Daily","rate":755},
 {"id":"UC-0019","name":"Oscar Fernandez","branch":"UC Quezon City","department":"Administration","position":"Cashier","status":"Regular","gender":"Male","hire":"2026-07-13","salaryType":"Daily","rate":755},
 {"id":"UC-0020","name":"Therese Navarro","branch":"MM Mandaluyong","department":"Administration","position":"Administrative Staff","status":"Regular","gender":"Female","hire":"2026-08-03","salaryType":"Daily","rate":755},
 {"id":"UC-0021","name":"Nico Reyes","branch":"UC Mandaluyong","department":"Marketing","position":"Content Creator","status":"Probationary","gender":"Male","hire":"2026-08-24","salaryType":"Daily","rate":755},
 {"id":"UC-0022","name":"Beatrice Cruz","branch":"UC Las Piñas","department":"Marketing","position":"Video Editor","status":"Regular","gender":"Female","hire":"2024-01-12","salaryType":"Daily","rate":755},
 {"id":"UC-0023","name":"Chester Valdez","branch":"UC Quezon City","department":"Marketing","position":"Social Media Associate","status":"Regular","gender":"Male","hire":"2025-05-06","salaryType":"Daily","rate":755},
 {"id":"UC-0024","name":"Tina Pascual","branch":"MM Mandaluyong","department":"Marketing","position":"Marketing Assistant","status":"Probationary","gender":"Female","hire":"2025-11-17","salaryType":"Daily","rate":755},
 {"id":"UC-0025","name":"Marco Salazar","branch":"UC Mandaluyong","department":"Marketing","position":"Content Producer","status":"Regular","gender":"Male","hire":"2026-03-02","salaryType":"Daily","rate":755},
 {"id":"UC-0026","name":"Riza Padilla","branch":"UC Las Piñas","department":"Marketing","position":"Digital Marketing Staff","status":"Regular","gender":"Female","hire":"2026-07-13","salaryType":"Daily","rate":755},
 {"id":"UC-0027","name":"Felix Panganiban","branch":"UC Quezon City","department":"Marketing","position":"Creative Assistant","status":"Regular","gender":"Male","hire":"2026-08-03","salaryType":"Daily","rate":755},
 {"id":"UC-0028","name":"Celina Domingo","branch":"MM Mandaluyong","department":"Marketing","position":"Marketing Coordinator","status":"Probationary","gender":"Female","hire":"2026-08-24","salaryType":"Daily","rate":755},
 {"id":"UC-0029","name":"Ramon De Vera","branch":"UC Mandaluyong","department":"Marketing","position":"Photo & Video Staff","status":"Regular","gender":"Male","hire":"2024-01-12","salaryType":"Daily","rate":755},
 {"id":"UC-0030","name":"Isabel Tan","branch":"UC Las Piñas","department":"Marketing","position":"Marketing Associate","status":"Probationary","gender":"Female","hire":"2025-05-06","salaryType":"Daily","rate":755},
 {"id":"UC-0031","name":"Vincent Abad","branch":"UC Mandaluyong","department":"Branch Management","position":"Branch Supervisor","status":"Regular","gender":"Male","hire":"2025-11-17","salaryType":"Monthly","rate":30000},
 {"id":"UC-0032","name":"Bianca Rosales","branch":"UC Las Piñas","department":"Branch Management","position":"Branch Supervisor","status":"Regular","gender":"Female","hire":"2026-03-02","salaryType":"Monthly","rate":30000},
 {"id":"UC-0033","name":"Emilio Luna","branch":"UC Quezon City","department":"Branch Management","position":"Branch Supervisor","status":"Regular","gender":"Male","hire":"2026-07-13","salaryType":"Monthly","rate":30000},
 {"id":"UC-0034","name":"Francesca Uy","branch":"MM Mandaluyong","department":"Branch Management","position":"Branch Supervisor","status":"Regular","gender":"Female","hire":"2026-08-03","salaryType":"Monthly","rate":30000},
 {"id":"UC-0035","name":"Edwin Manalo","branch":"UC Mandaluyong","department":"Branch Management","position":"Branch Supervisor","status":"Probationary","gender":"Male","hire":"2026-08-24","salaryType":"Monthly","rate":30000},
];
export const shopNames:Shop[]=["UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"];
export const php=(n:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n);
