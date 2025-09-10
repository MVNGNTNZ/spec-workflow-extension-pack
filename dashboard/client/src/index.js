import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Context Providers
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

// Components
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Metrics from './pages/Metrics';
import Patterns from './pages/Patterns';
import Projects from './pages/Projects';
import Health from './pages/Health';
import Settings from './pages/Settings';
import LoadingSpinner from './components/LoadingSpinner';

// Styles
import './styles/index.css';
import './styles/dashboard.css';

/**
 * Test Validation Dashboard - React Application
 * 
 * A comprehensive dashboard for visualizing test validation metrics, pattern library
 * statistics, health scores, and cross-project analytics.
 * 
 * Features:
 * - Real-time metrics visualization with Chart.js
 * - Pattern library management and effectiveness tracking
 * - Multi-project comparative analysis
 * - Health monitoring and alerting
 * - WebSocket integration for live updates
 * - JWT-based authentication with auto-refresh
 * - Responsive design with dark/light theme support
 */

// Create React Query client with optimized configuration
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            cacheTime: 10 * 60 * 1000, // 10 minutes
            retry: (failureCount, error) => {
                // Don't retry on authentication errors
                if (error?.response?.status === 401 || error?.response?.status === 403) {
                    return false;
                }
                // Retry up to 3 times for other errors
                return failureCount < 3;
            },
            refetchOnWindowFocus: false,
            refetchOnMount: true,
        },
        mutations: {
            retry: 1,
        },
    },
});

/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */
const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner message="Checking authentication..." />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

/**
 * Public Route Component
 * Redirects to dashboard if user is already authenticated
 */
const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner message="Loading..." />;
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

/**
 * Main App Component
 * Handles routing and global application state
 */
const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AuthProvider>
                    <Router basename="/dashboard">
                        <WebSocketProvider>
                            <div className="app">
                                <Routes>
                                    {/* Public Routes */}
                                    <Route 
                                        path="/login" 
                                        element={
                                            <PublicRoute>
                                                <Login />
                                            </PublicRoute>
                                        } 
                                    />

                                    {/* Protected Routes */}
                                    <Route 
                                        path="/"
                                        element={
                                            <ProtectedRoute>
                                                <Layout />
                                            </ProtectedRoute>
                                        }
                                    >
                                        {/* Redirect root to dashboard */}
                                        <Route index element={<Navigate to="/dashboard" replace />} />
                                        
                                        {/* Main Dashboard */}
                                        <Route path="dashboard" element={<Dashboard />} />
                                        
                                        {/* Metrics and Analytics */}
                                        <Route path="metrics" element={<Metrics />} />
                                        <Route path="metrics/:project" element={<Metrics />} />
                                        
                                        {/* Pattern Library Management */}
                                        <Route path="patterns" element={<Patterns />} />
                                        <Route path="patterns/:scope" element={<Patterns />} />
                                        
                                        {/* Multi-Project View */}
                                        <Route path="projects" element={<Projects />} />
                                        
                                        {/* Health Monitoring */}
                                        <Route path="health" element={<Health />} />
                                        
                                        {/* Settings and Configuration */}
                                        <Route path="settings" element={<Settings />} />
                                        
                                        {/* Catch-all redirect */}
                                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                                    </Route>

                                    {/* Catch-all for unauthenticated users */}
                                    <Route path="*" element={<Navigate to="/login" replace />} />
                                </Routes>

                                {/* Global Components */}
                                <ToastContainer
                                    position="top-right"
                                    autoClose={5000}
                                    hideProgressBar={false}
                                    newestOnTop={false}
                                    closeOnClick
                                    rtl={false}
                                    pauseOnFocusLoss
                                    draggable
                                    pauseOnHover
                                    theme="colored"
                                />
                            </div>
                        </WebSocketProvider>
                    </Router>
                </AuthProvider>
            </ThemeProvider>

            {/* React Query DevTools (only in development) */}
            {process.env.NODE_ENV === 'development' && (
                <ReactQueryDevtools initialIsOpen={false} />
            )}
        </QueryClientProvider>
    );
};

/**
 * Application Bootstrap
 * Renders the app with error boundary
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Dashboard Error:', error, errorInfo);
        
        // Send error to monitoring service in production
        if (process.env.NODE_ENV === 'production') {
            // TODO: Implement error reporting service
            // errorReportingService.captureException(error, { extra: errorInfo });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-content">
                        <h1>Something went wrong</h1>
                        <p>The dashboard encountered an unexpected error.</p>
                        <details className="error-details">
                            <summary>Error Details</summary>
                            <pre>{this.state.error?.toString()}</pre>
                        </details>
                        <button 
                            onClick={() => window.location.reload()}
                            className="error-reload-btn"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Create root and render app
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);

// Performance monitoring
if (process.env.NODE_ENV === 'production') {
    // Measure and report performance metrics
    const reportWebVitals = (metric) => {
        console.log(metric);
        // TODO: Send to analytics service
        // analytics.track('Web Vital', metric);
    };

    // Import and use web vitals
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(reportWebVitals);
        getFID(reportWebVitals);
        getFCP(reportWebVitals);
        getLCP(reportWebVitals);
        getTTFB(reportWebVitals);
    });
}

// Service Worker Registration (for offline support)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/dashboard/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

export default App;