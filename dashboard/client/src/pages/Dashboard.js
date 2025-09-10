import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeUpdates, useDashboardEvents } from '../contexts/WebSocketContext';
import LoadingSpinner from '../components/LoadingSpinner';
import './Dashboard.css';

/**
 * Main Dashboard Page
 * 
 * Displays key metrics, health status, and real-time updates.
 */
const Dashboard = () => {
    const { authenticatedFetch } = useAuth();
    const [selectedProject, setSelectedProject] = useState('');
    const [timeframe, setTimeframe] = useState(7);

    // Subscribe to real-time updates
    useRealtimeUpdates(['metrics-updates', 'pattern-updates']);

    // Listen for dashboard events
    useDashboardEvents((data) => {
        // Refetch dashboard data when updates occur
        if (data.type === 'new-validation-result' || data.type === 'metrics-updated') {
            dashboardQuery.refetch();
        }
    }, []);

    // Fetch dashboard data
    const dashboardQuery = useQuery({
        queryKey: ['dashboard', selectedProject, timeframe],
        queryFn: async () => {
            const params = new URLSearchParams({
                timeframe: timeframe.toString()
            });
            
            if (selectedProject) {
                params.set('project', selectedProject);
            }

            const response = await authenticatedFetch(
                `http://localhost:3001/api/metrics/dashboard?${params}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch dashboard data');
            }

            return response.json();
        },
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    if (dashboardQuery.isLoading) {
        return <LoadingSpinner message="Loading dashboard..." />;
    }

    if (dashboardQuery.error) {
        return (
            <div className="dashboard-error">
                <h2>Error loading dashboard</h2>
                <p>{dashboardQuery.error.message}</p>
                <button onClick={() => dashboardQuery.refetch()}>
                    Try Again
                </button>
            </div>
        );
    }

    const { dashboard } = dashboardQuery.data || {};

    return (
        <div className="dashboard">
            {/* Dashboard Header */}
            <div className="dashboard-header">
                <div className="dashboard-filters">
                    <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="project-select"
                    >
                        <option value="">All Projects</option>
                        {/* Project options would be populated from API */}
                    </select>

                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(parseInt(e.target.value))}
                        className="timeframe-select"
                    >
                        <option value={1}>Last 24 hours</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="metrics-grid">
                <div className="metric-card quality-score">
                    <div className="metric-header">
                        <h3>Quality Score</h3>
                        <span className="metric-icon">🎯</span>
                    </div>
                    <div className="metric-value">
                        {dashboard?.overview?.qualityScore || 0}%
                    </div>
                    <div className={`metric-trend ${dashboard?.overview?.trend || 'stable'}`}>
                        {dashboard?.overview?.trend === 'improving' && '📈 Improving'}
                        {dashboard?.overview?.trend === 'declining' && '📉 Declining'}
                        {dashboard?.overview?.trend === 'stable' && '➡️ Stable'}
                    </div>
                </div>

                <div className="metric-card success-rate">
                    <div className="metric-header">
                        <h3>Success Rate</h3>
                        <span className="metric-icon">✅</span>
                    </div>
                    <div className="metric-value">
                        {dashboard?.overview?.successRate || 0}%
                    </div>
                    <div className="metric-subtitle">
                        {dashboard?.overview?.totalValidations || 0} total validations
                    </div>
                </div>

                <div className="metric-card health-status">
                    <div className="metric-header">
                        <h3>Health Status</h3>
                        <span className="metric-icon">❤️</span>
                    </div>
                    <div className={`metric-value health-${dashboard?.health?.overall || 'unknown'}`}>
                        {dashboard?.health?.overall || 'Unknown'}
                    </div>
                    <div className="metric-subtitle">
                        Score: {dashboard?.health?.score || 0}/100
                    </div>
                </div>

                <div className="metric-card performance">
                    <div className="metric-header">
                        <h3>Avg. Execution Time</h3>
                        <span className="metric-icon">⚡</span>
                    </div>
                    <div className="metric-value">
                        {dashboard?.performance?.averageExecutionTime ? 
                            `${Math.round(dashboard.performance.averageExecutionTime / 1000)}s` : 
                            'N/A'
                        }
                    </div>
                    <div className="metric-subtitle">
                        {dashboard?.performance?.totalTestsExecuted || 0} tests executed
                    </div>
                </div>
            </div>

            {/* Health Alerts */}
            {dashboard?.alerts && dashboard.alerts.length > 0 && (
                <div className="alerts-section">
                    <h3>Health Alerts</h3>
                    <div className="alerts-list">
                        {dashboard.alerts.map((alert, index) => (
                            <div key={index} className={`alert alert-${alert.type}`}>
                                <span className="alert-icon">
                                    {alert.type === 'warning' && '⚠️'}
                                    {alert.type === 'error' && '❌'}
                                    {alert.type === 'info' && 'ℹ️'}
                                </span>
                                <div className="alert-content">
                                    <div className="alert-message">{alert.message}</div>
                                    <div className="alert-timestamp">
                                        {new Date(alert.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Trends */}
            {dashboard?.recentTrends && dashboard.recentTrends.length > 0 && (
                <div className="trends-section">
                    <h3>Recent Trends</h3>
                    <div className="trends-chart">
                        {dashboard.recentTrends.map((trend, index) => (
                            <div key={index} className="trend-bar">
                                <div className="trend-date">{trend.period}</div>
                                <div className="trend-metrics">
                                    <div 
                                        className="trend-success"
                                        style={{ height: `${trend.successRate || 0}%` }}
                                        title={`Success Rate: ${trend.successRate || 0}%`}
                                    ></div>
                                </div>
                                <div className="trend-total">{trend.totalValidations || 0}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Patterns */}
            {dashboard?.topPatterns && dashboard.topPatterns.length > 0 && (
                <div className="patterns-section">
                    <h3>Most Effective Patterns</h3>
                    <div className="patterns-list">
                        {dashboard.topPatterns.map((pattern, index) => (
                            <div key={index} className="pattern-item">
                                <div className="pattern-name">{pattern.name}</div>
                                <div className="pattern-metrics">
                                    <span className="pattern-effectiveness">
                                        {pattern.effectiveness || 0}% effective
                                    </span>
                                    <span className="pattern-usage">
                                        Used {pattern.usage || 0} times
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;