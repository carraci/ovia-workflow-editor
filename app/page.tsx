import data from '@/data/workflows.json';
import inventory from '@/data/inventory.json';
import Editor from '@/components/editor';
import type { Workflow } from '@/lib/types';
export default function Page(){
 const compact={...inventory,files:undefined,models:inventory.models.filter(m=>['User','Session','Cart','Address','Order','OrderRefund','ProductReview','Product','CareTicket','PrivacyRequest','OrderShipping'].includes(m.name))};
 return <Editor workflows={data.workflows as Workflow[]} meta={data.meta} inventory={compact} integrations={data.integrations}/>;
}
