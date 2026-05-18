"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  organizationId?: string;
  userId?: string;
  onTaskUpdate?: (data: any) => void;
  onNotification?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface WebSocketMessage {
  type: string;
  data?: any;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const { organizationId, userId, onTaskUpdate, onNotification, onConnect, onDisconnect } = options;

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    let wsUrl = "";
    
    if (organizationId) {
      wsUrl = `${API_URL.replace("http", "ws")}/ws/${organizationId}${userId ? `?user_id=${userId}` : ""}`;
    } else if (userId) {
      wsUrl = `${API_URL.replace("http", "ws")}/ws/user/${userId}`;
    }
    
    if (!wsUrl) return;
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        setIsConnected(true);
        onConnect?.();
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
          
          if (message.type === "task_update" && onTaskUpdate) {
            onTaskUpdate(message.data);
          } else if (message.type === "notification" && onNotification) {
            onNotification(message.data);
          }
        } catch {
          console.error("Failed to parse WebSocket message");
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        onDisconnect?.();
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
    }
  }, [organizationId, userId, onTaskUpdate, onNotification, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendTaskUpdate = useCallback((taskData: any) => {
    sendMessage({ type: "task_update", data: taskData });
  }, [sendMessage]);

  const sendNotification = useCallback((userId: string, notificationData: any) => {
    sendMessage({ type: "notification", user_id: userId, data: notificationData });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    sendTaskUpdate,
    sendNotification,
    connect,
    disconnect,
  };
}