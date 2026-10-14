import type {Metadata} from "next";
export const metadata: Metadata = {
  title:"Workplace Incident Report | Underchargers",
  description:"Workplace concern intake form. Public preview of the HR reporting workflow.",
  robots:{index:false,follow:false},
};
export default function PublicReportLayout({children}:{children:React.ReactNode}){return children;}
