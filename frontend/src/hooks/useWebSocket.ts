"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  organizationId?: string;
  userId?: string;
  onTaskUpdate?: (data: any) => void;
  onNotification?: (data: any) => void;
  onGoalCreated?: (data: any) => void;
  onTaskCreated?: (data: any) => void;
  onTaskUpdated?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  user_id?: string;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const onTaskUpdateRef = useRef(options.onTaskUpdate);
  const onNotificationRef = useRef(options.onNotification);
  const onGoalCreatedRef = useRef(options.onGoalCreated);
  const onTaskCreatedRef = useRef(options.onTaskCreated);
  const onTaskUpdatedRef = useRef(options.onTaskUpdated);
  const onConnectRef = useRef(options.onConnect);
  const onDisconnectRef = useRef(options.onDisconnect);

  useEffect(() => { onTaskUpdateRef.current = options.onTaskUpdate; }, [options.onTaskUpdate]);
  useEffect(() => { onNotificationRef.current = options.onNotification; }, [options.onNotification]);
  useEffect(() => { onGoalCreatedRef.current = options.onGoalCreated; }, [options.onGoalCreated]);
  useEffect(() => { onTaskCreatedRef.current = options.onTaskCreated; }, [options.onTaskCreated]);
  useEffect(() => { onTaskUpdatedRef.current = options.onTaskUpdated; }, [options.onTaskUpdated]);
  useEffect(() => { onConnectRef.current = options.onConnect; }, [options.onConnect]);
  useEffect(() => { onDisconnectRef.current = options.onDisconnect; }, [options.onDisconnect]);

  const disconnect = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (wsRef.current) disconnect();

    const rawUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
    const baseWsUrl = rawUrl.replace(/^http/, "ws");

    let wsUrl = "";
    if (options.organizationId) {
      wsUrl = `${baseWsUrl}/ws/${options.organizationId}`;
      if (options.userId) wsUrl += `?user_id=${encodeURIComponent(options.userId)}`;
    } else if (options.userId) {
      wsUrl = `${baseWsUrl}/ws/user/${encodeURIComponent(options.userId)}`;
    }

    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      let closed = false;

      ws.onopen = () => {
        closed = false;
        retryRef.current = 0;
        setIsConnected(true);
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setLastMessage(msg);
          switch (msg.type) {
            case "task_update": onTaskUpdateRef.current?.(msg.data); break;
            case "notification": onNotificationRef.current?.(msg.data); break;
            case "goal_created": onGoalCreatedRef.current?.(msg.data); break;
            case "task_created": onTaskCreatedRef.current?.(msg.data); break;
            case "task_updated": onTaskUpdatedRef.current?.(msg.data); break;
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (closed) return;
        closed = true;
        setIsConnected(false);
        onDisconnectRef.current?.();
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
        retryRef.current += 1;
        timerRef.current = setTimeout(() => connect(), delay);
      };

      ws.onerror = () => { /* onclose will fire */ };

      wsRef.current = ws;
    } catch { /* WebSocket unsupported */ }
  }, [options.organizationId, options.userId, disconnect]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendTaskUpdate = useCallback((data: any) => {
    sendMessage({ type: "task_update", data });
  }, [sendMessage]);

  const sendNotification = useCallback((userId: string, data: any) => {
    sendMessage({ type: "notification", user_id: userId, data });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    return () => { disconnect(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [connect, disconnect]);

  return { isConnected, lastMessage, sendMessage, sendTaskUpdate, sendNotification, connect, disconnect };
}
