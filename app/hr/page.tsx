import {redirect} from 'next/navigation';
/** Keep the previous HR entry URL working without duplicating HR state. */
export default function HRLegacyEntry(){redirect('/hr-payroll');}
