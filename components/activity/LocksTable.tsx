import type { ActivityLock } from '@/features/activity/activity.service'
import styles from './ActivityPage.module.css'

export function LocksTable({ locks }: { locks: ActivityLock[] }) {
  if (locks.length === 0) {
    return <div className={styles.empty}>No locks.</div>
  }
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>pid</th>
            <th>granted</th>
            <th>mode</th>
            <th>locktype</th>
            <th>relation</th>
            <th>xid</th>
            <th>vxid</th>
            <th>user</th>
            <th>application</th>
            <th>state</th>
            <th>query</th>
          </tr>
        </thead>
        <tbody>
          {locks.map((lock, index) => (
            <tr key={`${lock.pid ?? 'null'}-${index}`} className={lock.granted ? '' : styles.rowBlocked}>
              <td>{lock.pid ?? ''}</td>
              <td>{lock.granted ? 'yes' : 'no'}</td>
              <td>{lock.mode ?? ''}</td>
              <td>{lock.locktype ?? ''}</td>
              <td>{lock.relation_name ?? ''}</td>
              <td>{lock.transaction_id ?? ''}</td>
              <td>{lock.virtualtransaction ?? ''}</td>
              <td>{lock.user ?? ''}</td>
              <td>{lock.application_name ?? ''}</td>
              <td>{lock.state ?? ''}</td>
              <td className={styles.queryCell}>
                <div className={styles.queryTruncated}>{lock.query ?? ''}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
