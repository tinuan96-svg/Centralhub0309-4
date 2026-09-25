import {notFound} from 'next/navigation';
import HRClient from '../HRClient';
const enabledSections=new Set(['employees','attendance','shifts','leave','sponsor-compliance','payroll','payslips','pensions','hmrc-paye','reports','settings']);
export default async function HRDetailPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!enabledSections.has(section))notFound();
 return <HRClient section={section}/>;
}
