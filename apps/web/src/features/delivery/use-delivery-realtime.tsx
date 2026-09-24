import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { DeliveryRealtimeEvent } from '@hungrybox/shared';
import { useAuth } from '../../auth/auth-context';

function realtimeUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  if (base.startsWith('http')) {
    return `${base.replace(/\/$/, '')}/realtime`;
  }
  return `${window.location.origin}/realtime`;
}

export interface UseDeliveryRealtimeResult {
  lastEvent: DeliveryRealtimeEvent | null;
  connected: boolean;
  refetchKey: number;
}

/**
 * Lightweight Socket.IO client for the delivery namespace. REST stays authoritative;
 * this hook only mirrors events and bumps `refetchKey` so screens can re-fetch.
 */
export function useDeliveryRealtime(): UseDeliveryRealtimeResult {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [lastEvent, setLastEvent] = useState<DeliveryRealtimeEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    try {
      const socket = io(realtimeUrl(), {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 2,
        timeout: 4000,
      });
      socketRef.current = socket;
      socket.on('connect', () => {
        if (!disposed) setConnected(true);
      });
      socket.on('disconnect', () => {
        if (!disposed) setConnected(false);
      });
      socket.on('delivery.assignment.created', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.assignment.accepted', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.assignment.rejected', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.assignment.cancelled', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.picked_up', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.out_for_delivery', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.delivered', (event: DeliveryRealtimeEvent) => {
        setLastEvent(event);
        setRefetchKey((key) => key + 1);
      });
      socket.on('delivery.location.updated', () => {
        setRefetchKey((key) => key + 1);
      });
      return () => {
        disposed = true;
        socket.disconnect();
        socketRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [token]);

  return { lastEvent, connected, refetchKey };
}

export function RealtimeIndicator(): JSX.Element {
  const { connected } = useDeliveryRealtime();
  return (
    <span
      className={
        connected
          ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700'
          : 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700'
      }
    >
      <span
        className={
          connected ? 'h-1.5 w-1.5 rounded-full bg-emerald-600' : 'h-1.5 w-1.5 rounded-full bg-amber-500'
        }
        aria-hidden="true"
      />
      {connected ? 'Live' : 'Syncing'}
    </span>
  );
}