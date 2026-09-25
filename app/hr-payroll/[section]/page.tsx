import {notFound} from 'next/navigation';
import HRClient,{HR_SECTIONS} from '../HRClient';
export default async function HRDetailPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!HR_SECTIONS.some(([key])=>key===section)||section==='dashboard')notFound();
 return <HRClient section={section}/>;
}
