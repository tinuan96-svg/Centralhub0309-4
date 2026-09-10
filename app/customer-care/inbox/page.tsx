import InboxClient from './InboxClient';
import styles from './whatsapp-inbox.module.css';

export default function InboxPage({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div id="support-inbox-page" className={styles.shell}>
      <InboxClient params={params} searchParams={searchParams} />
    </div>
  );
}
