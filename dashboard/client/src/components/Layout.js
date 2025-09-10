import React from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import './Layout.css';

/**
 * Layout Component
 * 
 * Provides the main application layout with navigation, header, and content area.
 * Includes responsive sidebar navigation, theme toggle, and user menu.
 */
const Layout = () => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { isConnected, connectionStatus } = useWebSocket();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const navigationItems = [
        {
            path: '/dashboard',
            name: 'Dashboard',
            icon: '📊',
            description: 'Overview and key metrics'
        },
        {
            path: '/metrics',
            name: 'Metrics',
            icon: '📈',
            description: 'Detailed analytics and trends'
        },
        {
            path: '/patterns',
            name: 'Patterns',
            icon: '🧩',
            description: 'Pattern library management'
        },
        {
            path: '/projects',
            name: 'Projects',
            icon: '📁',
            description: 'Multi-project comparison'
        },
        {
            path: '/health',
            name: 'Health',
            icon: '❤️',
            description: 'System health monitoring'
        },
        {
            path: '/settings',
            name: 'Settings',
            icon: '⚙️',
            description: 'Configuration and preferences'
        }
    ];

    return (
        <div className={`layout ${theme} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* Sidebar Navigation */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo">
                        <span className="logo-icon">🧪</span>
                        {!sidebarCollapsed && <span className="logo-text">Test Validation</span>}
                    </div>
                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? '→' : '←'}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navigationItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => 
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                            title={sidebarCollapsed ? item.name : item.description}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {!sidebarCollapsed && (
                                <div className="nav-content">
                                    <span className="nav-name">{item.name}</span>
                                    <span className="nav-description">{item.description}</span>
                                </div>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Connection Status */}
                {!sidebarCollapsed && (
                    <div className="sidebar-footer">
                        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                            <span className="status-indicator"></span>
                            <span className="status-text">
                                {isConnected ? 'Live Updates' : connectionStatus || 'Offline'}
                            </span>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <div className="main-content">
                {/* Header */}
                <header className="header">
                    <div className="header-left">
                        <h1 className="page-title">
                            {navigationItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}
                        </h1>
                        <div className="breadcrumb">
                            <span>Test Validation</span>
                            <span className="breadcrumb-separator">›</span>
                            <span>{navigationItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}</span>
                        </div>
                    </div>

                    <div className="header-right">
                        {/* Theme Toggle */}
                        <button
                            className="theme-toggle"
                            onClick={toggleTheme}
                            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                        >
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>

                        {/* Real-time Status */}
                        <div className={`realtime-status ${isConnected ? 'active' : 'inactive'}`}>
                            <span className="status-dot"></span>
                            <span className="status-label">
                                {isConnected ? 'Live' : 'Offline'}
                            </span>
                        </div>

                        {/* User Menu */}
                        <div className="user-menu">
                            <button className="user-button">
                                <div className="user-avatar">
                                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div className="user-info">
                                    <span className="user-name">{user?.username || 'Unknown'}</span>
                                    <span className="user-role">{user?.role || 'User'}</span>
                                </div>
                                <span className="dropdown-arrow">▼</span>
                            </button>

                            <div className="user-dropdown">
                                <div className="dropdown-header">
                                    <div className="user-details">
                                        <strong>{user?.username}</strong>
                                        <small>{user?.email}</small>
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button
                                    className="dropdown-item"
                                    onClick={() => navigate('/settings')}
                                >
                                    ⚙️ Settings
                                </button>
                                <button
                                    className="dropdown-item"
                                    onClick={handleLogout}
                                >
                                    🚪 Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;