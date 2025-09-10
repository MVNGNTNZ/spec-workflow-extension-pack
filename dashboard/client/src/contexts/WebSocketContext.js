import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';

/**
 * WebSocket Context
 * 
 * Manages WebSocket connection for real-time updates and notifications.
 */

const WebSocketContext = createContext();

export const WebSocketProvider = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [subscriptions, setSubscriptions] = useState(new Set());

    const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (!isAuthenticated || !user || socket) return;

        setConnectionStatus('connecting');

        const newSocket = io(SOCKET_URL, {
            auth: {
                token: localStorage.getItem('dashboard_access_token')
            },
            transports: ['websocket', 'polling']
        });

        newSocket.on('connect', () => {
            console.log('WebSocket connected');
            setIsConnected(true);
            setConnectionStatus('connected');
            setSocket(newSocket);
            toast.success('Real-time updates connected', { autoClose: 2000 });
        });

        newSocket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            setIsConnected(false);
            setConnectionStatus('disconnected');
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, don't reconnect
                setSocket(null);
            }
        });

        newSocket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            setConnectionStatus('error');
            toast.error('Failed to connect real-time updates', { autoClose: 3000 });
        });

        newSocket.on('update', (data) => {
            handleRealtimeUpdate(data);
        });

        newSocket.on('notification', (notification) => {
            handleNotification(notification);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, [isAuthenticated, user, socket, SOCKET_URL]);

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        if (socket) {
            socket.close();
            setSocket(null);
            setIsConnected(false);
            setConnectionStatus('disconnected');
            setSubscriptions(new Set());
        }
    }, [socket]);

    // Handle real-time updates
    const handleRealtimeUpdate = (data) => {
        console.log('Real-time update received:', data);

        // Emit custom events for components to listen to
        window.dispatchEvent(new CustomEvent('dashboard-update', { 
            detail: data 
        }));

        // Show toast notification for certain update types
        if (data.type === 'new-validation-result') {
            toast.info(`New validation result for ${data.result?.project || 'unknown project'}`, {
                autoClose: 3000
            });
        }
    };

    // Handle notifications
    const handleNotification = (notification) => {
        console.log('Notification received:', notification);

        const { type, message, level = 'info' } = notification;

        switch (level) {
            case 'error':
                toast.error(message);
                break;
            case 'warning':
                toast.warning(message);
                break;
            case 'success':
                toast.success(message);
                break;
            default:
                toast.info(message);
        }

        // Emit custom notification event
        window.dispatchEvent(new CustomEvent('dashboard-notification', {
            detail: notification
        }));
    };

    // Subscribe to specific update channels
    const subscribe = useCallback((channel) => {
        if (socket && isConnected) {
            socket.emit(`subscribe-${channel}`);
            setSubscriptions(prev => new Set([...prev, channel]));
            console.log(`Subscribed to ${channel}`);
        }
    }, [socket, isConnected]);

    // Unsubscribe from update channels
    const unsubscribe = useCallback((channel) => {
        if (socket && isConnected) {
            socket.emit(`unsubscribe-${channel}`);
            setSubscriptions(prev => {
                const newSet = new Set(prev);
                newSet.delete(channel);
                return newSet;
            });
            console.log(`Unsubscribed from ${channel}`);
        }
    }, [socket, isConnected]);

    // Send message through WebSocket
    const sendMessage = useCallback((event, data) => {
        if (socket && isConnected) {
            socket.emit(event, data);
        } else {
            console.warn('Cannot send message: WebSocket not connected');
        }
    }, [socket, isConnected]);

    // Connection management effects
    useEffect(() => {
        let cleanup;

        if (isAuthenticated && user) {
            cleanup = connect();
        } else {
            disconnect();
        }

        return cleanup;
    }, [isAuthenticated, user, connect, disconnect]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    // Auto-reconnection logic
    useEffect(() => {
        if (!isConnected && isAuthenticated && user && connectionStatus !== 'connecting') {
            const reconnectTimer = setTimeout(() => {
                console.log('Attempting to reconnect WebSocket...');
                connect();
            }, 5000); // Retry every 5 seconds

            return () => clearTimeout(reconnectTimer);
        }
    }, [isConnected, isAuthenticated, user, connectionStatus, connect]);

    const value = {
        socket,
        isConnected,
        connectionStatus,
        subscriptions: Array.from(subscriptions),
        
        // Actions
        connect,
        disconnect,
        subscribe,
        unsubscribe,
        sendMessage
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};

// Custom hook for subscribing to real-time updates
export const useRealtimeUpdates = (channels = []) => {
    const { subscribe, unsubscribe, isConnected } = useWebSocket();

    useEffect(() => {
        if (isConnected && channels.length > 0) {
            // Subscribe to all channels
            channels.forEach(channel => subscribe(channel));

            // Cleanup: unsubscribe on unmount
            return () => {
                channels.forEach(channel => unsubscribe(channel));
            };
        }
    }, [isConnected, channels, subscribe, unsubscribe]);
};

// Custom hook for listening to dashboard events
export const useDashboardEvents = (callback, dependencies = []) => {
    useEffect(() => {
        const handleUpdate = (event) => {
            callback(event.detail);
        };

        window.addEventListener('dashboard-update', handleUpdate);

        return () => {
            window.removeEventListener('dashboard-update', handleUpdate);
        };
    }, dependencies);
};