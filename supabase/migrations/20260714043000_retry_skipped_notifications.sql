update public.notification_queue
set
  status = 'failed',
  attempts = 0,
  due_at = now(),
  last_error = 'Push delivery will retry after the device identity is relinked.'
where status = 'skipped'
  and last_error in (
    'OneSignal has no active push subscription for this user',
    'OneSignal accepted the notification without a recipient'
  );
