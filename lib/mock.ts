export type Role = "Super Admin" | "HR" | "BM";
export type Branch = "All Shops" | "UC Mandaluyong" | "UC Las Piñas" | "UC Quezon City" | "MM Mandaluyong";
export const branches: Branch[] = ["All Shops","UC Mandaluyong","UC Las Piñas","UC Quezon City","MM Mandaluyong"];
export const modules = [
 {id:"dashboard",name:"Dashboard",icon:"LayoutDashboard",count:0},
 {id:"employees",name:"Employee 201 Files",icon:"FolderOpen",count:8},
 {id:"submissions",name:"Submit Employee Documents",icon:"FileUp",count:0},
 {id:"lifecycle",name:"Recruitment & Hiring",icon:"Workflow",count:5},
 {id:"payroll",name:"Payroll Management",icon:"Wallet",count:3},
 {id:"leave",name:"Leave Management",icon:"CalendarCheck",count:2},
 {id:"ir",name:"Incident Reports",icon:"FileWarning",count:4},
 {id:"assets",name:"Assets & Devices",icon:"Laptop",count:2},
 {id:"compliance",name:"Government Compliance",icon:"Landmark",count:7},
 {id:"documents",name:"Documents & Templates",icon:"Files",count:0},
 {id:"filters",name:"Reports & Analytics",icon:"SlidersHorizontal",count:0},
 {id:"audit",name:"Audit Logs",icon:"ScrollText",count:2},
 {id:"settings",name:"Settings",icon:"Settings",count:0}
] as const;
export type ModuleId = typeof modules[number]["id"] | "loans"; // internal legacy alert key; loans workspace now belongs under payroll
export const permissions: Record<Role, ModuleId[]> = {
 "Super Admin":modules.map(m=>m.id),
 "HR": ["dashboard","employees","lifecycle","payroll","leave","ir","assets","compliance","documents","filters","audit","settings"],
 "BM": ["dashboard","submissions","lifecycle","leave","ir","settings"]
};
export const demoAccounts = [{username:"admin",password:"admin12345",role:"Super Admin" as Role},{username:"hraccount",password:"hraccount12345",role:"HR" as Role},{username:"bmaccount",password:"bm12345",role:"BM" as Role}];
export const activity=[
 {module:"Payroll",text:"Payroll calculation preview requested",user:"HR Sample",date:"Oct 11, 2026"},
 {module:"Employee 201",text:"Onboarding requirement flagged",user:"HR Sample",date:"Oct 10, 2026"},
 {module:"Incident Reports",text:"Case assigned to Branch Manager",user:"System Example",date:"Oct 09, 2026"}
];
