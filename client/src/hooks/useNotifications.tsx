/**
 * Notification System
 * Provides toast notifications and system alerts
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Notification types
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  // Convenience methods
  info: (title: string, message?: string) => string;
  success: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Default durations by type (in ms)
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  info: 5000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'createdAt'>) => {
      const id = generateId();
      const duration = notification.duration ?? DEFAULT_DURATIONS[notification.type];

      const newNotification: Notification = {
        ...notification,
        id,
        createdAt: Date.now(),
        dismissible: notification.dismissible ?? true,
      };

      setNotifications((prev) => [...prev, newNotification]);

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, duration);
      }

      return id;
    },
    [removeNotification]
  );

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods
  const info = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'info', title, message });
    },
    [addNotification]
  );

  const success = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'success', title, message });
    },
    [addNotification]
  );

  const warning = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'warning', title, message });
    },
    [addNotification]
  );

  const error = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'error', title, message });
    },
    [addNotification]
  );

  const value: NotificationContextValue = {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    info,
    success,
    warning,
    error,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// Notification display component
export function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'info':
        return 'fa-info-circle';
      case 'success':
        return 'fa-check-circle';
      case 'warning':
        return 'fa-exclamation-triangle';
      case 'error':
        return 'fa-times-circle';
    }
  };

  const getStyles = (type: NotificationType) => {
    switch (type) {
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
    }
  };

  const getIconStyles = (type: NotificationType) => {
    switch (type) {
      case 'info':
        return 'text-blue-500';
      case 'success':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg border shadow-lg ${getStyles(notification.type)} animate-in slide-in-from-right-5`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <i className={`fas ${getIcon(notification.type)} ${getIconStyles(notification.type)} text-lg mt-0.5`}></i>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{notification.title}</p>
              {notification.message && (
                <p className="text-sm mt-1 opacity-90">{notification.message}</p>
              )}
              {notification.action && (
                <button
                  onClick={notification.action.onClick}
                  className="text-sm font-medium mt-2 underline hover:no-underline"
                >
                  {notification.action.label}
                </button>
              )}
            </div>
            {notification.dismissible && (
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-current opacity-50 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default useNotifications;
