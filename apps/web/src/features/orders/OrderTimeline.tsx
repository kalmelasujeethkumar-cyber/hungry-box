import type { JSX } from 'react';
import type { OrderEventDto, OrderStatus } from '@hungrybox/shared';
import { formatDateTime } from '../../lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STEPS } from './order-status';

export default function OrderTimeline({
  status,
  events,
}: {
  status: OrderStatus;
  events: OrderEventDto[];
}): JSX.Element {
  if (status === 'CANCELLED') {
    return <CancelledTimeline events={events} />;
  }

  if (!ORDER_STATUS_STEPS.includes(status as (typeof ORDER_STATUS_STEPS)[number])) {
    return (
      <p className="text-sm text-slate-500">Status: {ORDER_STATUS_LABELS[status] ?? status}</p>
    );
  }

  const currentIndex = ORDER_STATUS_STEPS.indexOf(status as (typeof ORDER_STATUS_STEPS)[number]);

  return (
    <ol className="space-y-0">
      {ORDER_STATUS_STEPS.map((step, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const event = events.find((item) => item.toStatus === step);
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={
                  reached
                    ? 'h-3 w-3 rounded-full border-2 border-brand-orange bg-brand-orange'
                    : 'h-3 w-3 rounded-full border-2 border-slate-300 bg-white'
                }
                aria-hidden="true"
              />
              {index < ORDER_STATUS_STEPS.length - 1 ? (
                <span
                  className={
                    index < currentIndex
                      ? 'w-0.5 flex-1 bg-brand-orange'
                      : 'w-0.5 flex-1 bg-slate-200'
                  }
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className={reached ? 'pb-6' : 'pb-6 opacity-45'}>
              <p
                className={
                  isCurrent
                    ? 'text-sm font-bold text-brand-navy'
                    : 'text-sm font-semibold text-slate-700'
                }
              >
                {ORDER_STATUS_LABELS[step]}
                {isCurrent ? ' · current' : ''}
              </p>
              {event ? (
                <time className="mt-0.5 block text-xs text-slate-500">
                  {formatDateTime(event.at)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CancelledTimeline({ events }: { events: OrderEventDto[] }): JSX.Element {
  const cancelEvent = events.find((event) => event.kind === 'ORDER_CANCELLED');
  const cancelledFrom = cancelEvent?.fromStatus;
  const lastIndex = cancelledFrom
    ? ORDER_STATUS_STEPS.indexOf(cancelledFrom as (typeof ORDER_STATUS_STEPS)[number])
    : -1;

  return (
    <ol className="space-y-0">
      {ORDER_STATUS_STEPS.map((step, index) => {
        if (lastIndex >= 0 && index > lastIndex) return null;
        const reached = index <= lastIndex;
        const event = events.find((item) => item.toStatus === step);
        return (
          <li key={step} className="flex gap-3">
            <span
              className={
                reached ? 'h-3 w-3 rounded-full bg-brand-orange' : 'h-3 w-3 rounded-full bg-white'
              }
              aria-hidden="true"
            />
            <div className={reached ? 'pb-6' : 'pb-6 opacity-45'}>
              <p className="text-sm font-semibold text-slate-700">{ORDER_STATUS_LABELS[step]}</p>
              {event ? (
                <time className="mt-0.5 block text-xs text-slate-500">
                  {formatDateTime(event.at)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
      <li className="flex gap-3">
        <span className="h-3 w-3 rounded-full bg-brand-navy" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-brand-navy">Cancelled</p>
          <time className="mt-0.5 block text-xs text-slate-500">
            {cancelEvent ? formatDateTime(cancelEvent.at) : ''}
          </time>
        </div>
      </li>
    </ol>
  );
}
