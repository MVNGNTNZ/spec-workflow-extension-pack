const express = require('express');
const path = require('path');
const MetricsService = require('../services/metrics');
const router = express.Router();

// Initialize metrics service
const metricsService = new MetricsService();

/**
 * Metrics API
 * 
 * Provides REST endpoints for accessing calculated metrics, quality scores,
 * trend analysis, and health monitoring data.
 * 
 * Endpoints:
 * - GET /quality - Get comprehensive quality metrics
 * - GET /trends - Get trend analysis data
 * - GET /health - Get system health metrics
 * - GET /patterns - Get pattern effectiveness metrics
 * - GET /performance - Get performance benchmark data
 * - GET /comparative - Get cross-project comparative analysis
 * - POST /cache/clear - Clear metrics cache
 */

/**
 * Get comprehensive quality metrics
 */
router.get('/quality', async (req, res) => {
    try {
        const { project, timeframe = 30 } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        res.json({
            success: true,
            metrics,
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving quality metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get trend analysis data
 */
router.get('/trends', async (req, res) => {
    try {
        const { project, timeframe = 30 } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        res.json({
            success: true,
            trends: metrics.trends,
            overview: metrics.overview,
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                dataPoints: metrics.trends.length,
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving trend metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get system health metrics
 */
router.get('/health', async (req, res) => {
    try {
        const { project, timeframe = 30 } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        res.json({
            success: true,
            health: metrics.health,
            overview: {
                qualityScore: metrics.overview.qualityScore,
                successRate: metrics.overview.successRate,
                totalValidations: metrics.overview.totalValidations,
                trend: metrics.overview.trend
            },
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving health metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get pattern effectiveness metrics
 */
router.get('/patterns', async (req, res) => {
    try {
        const { project, timeframe = 30, scope } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        let patternMetrics = metrics.patterns;
        
        // Filter by scope if requested
        if (scope && scope !== 'all') {
            const filterScope = scope.toLowerCase();
            patternMetrics = {
                ...patternMetrics,
                patternUsage: patternMetrics.patternUsage.filter(p => 
                    p.scope && p.scope.toLowerCase() === filterScope
                ),
                mostEffective: patternMetrics.mostEffective.filter(p => 
                    p.scope && p.scope.toLowerCase() === filterScope
                ),
                leastEffective: patternMetrics.leastEffective.filter(p => 
                    p.scope && p.scope.toLowerCase() === filterScope
                )
            };
        }
        
        res.json({
            success: true,
            patterns: patternMetrics,
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                scope: scope || 'all',
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving pattern metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get performance benchmark data
 */
router.get('/performance', async (req, res) => {
    try {
        const { project, timeframe = 30 } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        res.json({
            success: true,
            performance: metrics.performance,
            overview: {
                totalValidations: metrics.overview.totalValidations,
                qualityScore: metrics.overview.qualityScore
            },
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving performance metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get cross-project comparative analysis
 */
router.get('/comparative', async (req, res) => {
    try {
        const { project, timeframe = 30 } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        res.json({
            success: true,
            comparative: metrics.comparative,
            currentProject: {
                name: project,
                qualityScore: metrics.overview.qualityScore,
                successRate: metrics.overview.successRate,
                ranking: metrics.comparative.currentProjectRank
            },
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                totalProjects: metrics.comparative.totalProjects,
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving comparative metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get real-time dashboard summary
 */
router.get('/dashboard', async (req, res) => {
    try {
        const { project, timeframe = 7 } = req.query; // Default to 7 days for dashboard
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        // Create dashboard-optimized summary
        const dashboardData = {
            overview: metrics.overview,
            health: metrics.health,
            recentTrends: metrics.trends.slice(-7), // Last 7 periods
            topPatterns: metrics.patterns.mostEffective.slice(0, 5),
            performance: {
                averageExecutionTime: metrics.performance.averageExecutionTime,
                totalTestsExecuted: metrics.performance.totalTestsExecuted,
                throughput: metrics.performance.throughput
            },
            comparative: {
                ranking: metrics.comparative.currentProjectRank,
                totalProjects: metrics.comparative.totalProjects,
                industryAverage: metrics.comparative.industryAverage
            },
            alerts: []
        };

        // Add health-based alerts
        if (metrics.health.indicators) {
            dashboardData.alerts = metrics.health.indicators
                .filter(indicator => indicator.type === 'warning')
                .map(indicator => ({
                    type: 'warning',
                    message: indicator.message,
                    timestamp: new Date().toISOString()
                }));
        }

        res.json({
            success: true,
            dashboard: dashboardData,
            metadata: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                refreshedAt: new Date().toISOString(),
                cacheStats: metricsService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('Error retrieving dashboard metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Clear metrics cache
 */
router.post('/cache/clear', async (req, res) => {
    try {
        const cacheStatsBefore = metricsService.getCacheStats();
        metricsService.clearCache();
        const cacheStatsAfter = metricsService.getCacheStats();

        res.json({
            success: true,
            message: 'Metrics cache cleared successfully',
            before: cacheStatsBefore,
            after: cacheStatsAfter,
            clearedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error clearing metrics cache:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get cache statistics
 */
router.get('/cache', async (req, res) => {
    try {
        const cacheStats = metricsService.getCacheStats();

        res.json({
            success: true,
            cache: cacheStats,
            metadata: {
                requestedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving cache statistics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Generate metrics export
 */
router.get('/export', async (req, res) => {
    try {
        const { project, timeframe = 30, format = 'json' } = req.query;
        
        const metrics = await metricsService.calculateQualityMetrics(project, parseInt(timeframe));
        
        const exportData = {
            exportInfo: {
                project: project || 'all projects',
                timeframe: parseInt(timeframe),
                generatedAt: new Date().toISOString(),
                version: '1.0.0'
            },
            metrics
        };

        if (format.toLowerCase() === 'csv') {
            // Simple CSV export of trends data
            const csvLines = ['Period,Total,Success Rate,Quality Score,Trend'];
            metrics.trends.forEach(trend => {
                csvLines.push(`${trend.period},${trend.totalValidations},${trend.successRate},${trend.qualityScore || 0},${trend.trend || 'stable'}`);
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="metrics-${project || 'all'}-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvLines.join('\n'));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="metrics-${project || 'all'}-${new Date().toISOString().split('T')[0]}.json"`);
            res.json(exportData);
        }

    } catch (error) {
        console.error('Error exporting metrics:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = router;