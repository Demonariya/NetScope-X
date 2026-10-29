import { describe, it, expect } from 'vitest';
import { NotificationQueue, MAX_SIMULTANEOUS_NOTIFICATIONS } from '../src/utils/notifications';

describe('NotificationQueue — Priority Six Requirements', () => {
  it('strictly caps the visible notifications at maximum 5', () => {
    expect(MAX_SIMULTANEOUS_NOTIFICATIONS).toBe(5);

    const queue = new NotificationQueue();

    // Add 10 unique notifications
    for (let i = 1; i <= 10; i++) {
      queue.add(`Notification #${i}`, `Detail message ${i}`, 'info');
    }

    const all = queue.getAll();
    expect(all.length).toBe(5);
    expect(queue.count()).toBe(5);

    // The 5 most recent notifications must be retained (#6, #7, #8, #9, #10)
    expect(all[0].title).toBe('Notification #6');
    expect(all[4].title).toBe('Notification #10');
  });

  it('guarantees adding 6 incoming notifications results in exactly 5 simultaneously visible notifications', () => {
    const queue = new NotificationQueue();

    queue.add('First', 'Msg', 'info');
    queue.add('Second', 'Msg', 'info');
    queue.add('Third', 'Msg', 'info');
    queue.add('Fourth', 'Msg', 'info');
    queue.add('Fifth', 'Msg', 'info');
    expect(queue.count()).toBe(5);

    // Adding the 6th notification must discard the 1st
    queue.add('Sixth', 'Msg', 'info');
    const visible = queue.getAll();
    expect(visible.length).toBe(5);
    expect(visible.map(n => n.title)).toEqual(['Second', 'Third', 'Fourth', 'Fifth', 'Sixth']);
  });

  it('deduplicates identical rapid notifications to prevent polling error spam', () => {
    const queue = new NotificationQueue();

    const first = queue.add('Network Error', 'Connection failed', 'error');
    expect(first).not.toBeNull();
    expect(queue.count()).toBe(1);

    // Identical error arriving immediately after must be suppressed
    const duplicate = queue.add('Network Error', 'Connection failed', 'error');
    expect(duplicate).toBeNull();
    expect(queue.count()).toBe(1);

    // Different error must still be added
    const different = queue.add('DNS Failure', 'Could not resolve host', 'error');
    expect(different).not.toBeNull();
    expect(queue.count()).toBe(2);
  });

  it('supports success, warning, error, and info variants with appropriate durations', () => {
    const queue = new NotificationQueue();

    const err = queue.add('Error Title', 'Error msg', 'error');
    const warn = queue.add('Warning Title', 'Warning msg', 'warning');
    const succ = queue.add('Success Title', 'Success msg', 'success');
    const inf = queue.add('Info Title', 'Info msg', 'info');

    expect(err?.type).toBe('error');
    expect(err?.durationMs).toBe(6000); // Critical errors stay longer

    expect(warn?.type).toBe('warning');
    expect(warn?.durationMs).toBe(5000);

    expect(succ?.type).toBe('success');
    expect(succ?.durationMs).toBe(3500);

    expect(inf?.type).toBe('info');
    expect(inf?.durationMs).toBe(3500);

    expect(queue.count()).toBe(4);
  });

  it('allows manual dismissal by ID', () => {
    const queue = new NotificationQueue();
    const item1 = queue.add('Item 1', undefined, 'info');
    const item2 = queue.add('Item 2', undefined, 'info');

    expect(queue.count()).toBe(2);
    if (item1) queue.remove(item1.id);

    expect(queue.count()).toBe(1);
    expect(queue.getAll()[0].title).toBe('Item 2');
  });

  it('clears all notifications cleanly', () => {
    const queue = new NotificationQueue();
    queue.add('A', undefined, 'info');
    queue.add('B', undefined, 'info');
    queue.clear();
    expect(queue.count()).toBe(0);
    expect(queue.getAll()).toEqual([]);
  });
});
