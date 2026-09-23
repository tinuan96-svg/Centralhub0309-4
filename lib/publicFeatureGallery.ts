import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type PublicScreenshot = {
  src: string;
  title: string;
  alt: string;
};

export type PublicFeatureGalleryItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  howItWorks: string[];
  screenLabel: string;
  screens: PublicScreenshot[];
};

type ScreenshotCandidate = Omit<PublicScreenshot,'src'> & { file: string };
type FeatureCandidate = Omit<PublicFeatureGalleryItem,'screens'> & { screenshots: ScreenshotCandidate[] };

/**
 * Only files deliberately reviewed, redacted AND committed to public/home-demo
 * are ever shown. A protected app URL, external screenshot URL or raw Supabase
 * storage asset must NEVER be included as a public marketing image.
 */
const features: FeatureCandidate[] = [
  {
    id:'whatsapp', title:'WhatsApp & unified customer care', screenLabel:'Customer Care / Channels and Inbox',
    subtitle:'See customer conversations alongside operational context.',
    description:'CentralHub has customer-care channel configuration, a support inbox and automation workflows. Connections are store-scoped and require authorised provider setup.',
    howItWorks:['Connect an approved store messaging channel.','Review conversations and support tickets in the inbox.','Reply or use configured templates and review message status.'],
    screenshots:[
      {file:'whatsapp-inbox-demo.webp',title:'Unified support inbox',alt:'Reviewed CentralHub customer-care inbox screenshot with fictional conversations'},
      {file:'whatsapp-channels-demo.webp',title:'WhatsApp channel settings',alt:'Reviewed CentralHub channel connection screenshot with redacted account information'},
    ],
  },
  {
    id:'marketing', title:'Marketing platforms & campaign management', screenLabel:'Marketing / Integrations and Campaigns',
    subtitle:'Explore marketing tools without switching between dashboards.',
    description:'The marketing area includes provider connections, campaigns, promotions and audience tools. Google Ads, GA4, Merchant Center and Meta integrations require each store’s own authorisation and applicable provider configuration.',
    howItWorks:['Select your store and review the available providers.','Authorise supported integrations and configure campaigns.','Inspect campaign, ecommerce and traffic reports after data is connected.'],
    screenshots:[
      {file:'marketing-integrations-demo.webp',title:'Marketing integration centre',alt:'Reviewed CentralHub marketing provider connection screenshot showing demo account statuses'},
      {file:'marketing-campaigns-demo.webp',title:'Campaign workspace',alt:'Reviewed CentralHub marketing campaign screen with fictional campaign names and data'},
    ],
  },
  {
    id:'analytics', title:'Google Analytics & business insights', screenLabel:'Analytics / Overview',
    subtitle:'Turn connected reporting into a clearer business picture.',
    description:'Explore store-based traffic, sessions, orders, ecommerce reporting and operational insights. Analytics providers must be configured before external metrics can be shown.',
    howItWorks:['Connect the correct store analytics property.','Select a time range and a store.','Review visitor trends, order activity and business performance.'],
    screenshots:[
      {file:'analytics-overview-demo.webp',title:'Analytics overview',alt:'Reviewed CentralHub analytics overview screenshot containing invented reporting figures'},
      {file:'analytics-traffic-demo.webp',title:'Traffic and acquisition reports',alt:'Reviewed CentralHub GA4 traffic reporting screen using safe sample data'},
    ],
  },
  {
    id:'operations', title:'Orders, inventory & shipping', screenLabel:'Orders / Inventory / Fulfilment',
    subtitle:'Follow a sale from placement through dispatch.',
    description:'CentralHub includes order queues, product and stock management, picking, packing and shipment/tracking workspaces. External carrier services require configuration.',
    howItWorks:['Receive or create an order using a configured sales channel.','Manage stock and the picking and packing stages.','Prepare shipment and review dispatch or tracking details.'],
    screenshots:[
      {file:'orders-queue-demo.webp',title:'Order management',alt:'Reviewed CentralHub order queue screenshot containing only fictional customer data'},
      {file:'inventory-fulfilment-demo.webp',title:'Inventory and fulfilment',alt:'Reviewed CentralHub inventory or fulfilment screenshot containing only example stock and order data'},
    ],
  },
  {
    id:'finance', title:'Finance, banking & profitability', screenLabel:'Finance / Transactions and Profitability',
    subtitle:'Understand cashflow, costs and financial performance.',
    description:'The finance workspace covers transactions, reconciliation, expenses, payables, P&L, VAT and profitability. Bank/provider connections and financial classifications need their own configuration and review.',
    howItWorks:['Import or connect eligible transaction data.','Review transaction assignments and reconciliation results.','Explore expense, margin and profitability reporting.'],
    screenshots:[
      {file:'finance-reconciliation-demo.webp',title:'Bank reconciliation',alt:'Reviewed CentralHub transaction reconciliation screenshot using fictional transactions and balances'},
      {file:'finance-profitability-demo.webp',title:'Profitability analysis',alt:'Reviewed CentralHub profit dashboard screenshot containing invented business figures'},
    ],
  },
  {
    id:'ai-security', title:'NORA, intelligence & security monitoring', screenLabel:'Dashboard / AI and Security Radar',
    subtitle:'Surface actionable signals from one command centre.',
    description:'The dashboard features NORA-assisted workflows, security monitoring and operational intelligence. Live alerts, integrations and automated actions depend on configuration and authorised controls.',
    howItWorks:['Review sample alerts and operational insights.','Ask NORA for assistance where enabled and authorised.','Inspect security and site-health information before taking action.'],
    screenshots:[
      {file:'nora-assistant-demo.webp',title:'NORA assistant',alt:'Reviewed CentralHub NORA assistant screenshot with invented example conversation'},
      {file:'security-radar-demo.webp',title:'Security radar',alt:'Reviewed CentralHub security radar screenshot with artificial status data'},
    ],
  },
];

const approvedFile = (file:string):boolean => /^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(file);

/**
 * Evaluate from the Next.js server during rendering/build. Missing files are not
 * rendered as broken <img> tags or misrepresented as real screenshots.
 */
export function getPublicFeatureGallery():PublicFeatureGalleryItem[]{
  return features.map(({screenshots,...item})=>({
    ...item,
    screens:screenshots.filter(({file})=>approvedFile(file)&&existsSync(join(process.cwd(),'public','home-demo',file)))
      .map(({file,title,alt})=>({src:'/home-demo/'+file,title,alt})),
  }));
}
