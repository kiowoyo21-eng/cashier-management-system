import type {Metadata} from "next";
export const metadata:Metadata = {
  title:"Apply for a Job | Underchargers",
  description:"Underchargers job application form with resume/CV attachment field. Frontend preview only.",
  robots:{index:false,follow:false},
};
export default function PublicApplyLayout({children}:{children:React.ReactNode}){return children;}
