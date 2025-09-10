const path = require('path');
const fs = require('fs-extra');

/**
 * Metrics Calculation Service
 * 
 * Provides comprehensive quality metrics calculation from validation results,
 * including trend analysis, pattern effectiveness scoring, and health monitoring.
 * 
 * Metrics calculated:
 * - Quality scores and success rates
 * - Pattern effectiveness and usage statistics
 * - Test health trends and projections
 * - Cross-project comparative analysis
 * - Performance benchmarks
 */
class MetricsService {
    constructor(dataPath) {
        this.dataPath = dataPath || path.join(__dirname, '../../../data');
        this.validationResultsPath = path.join(this.dataPath, 'validation-results');
        this.patternLibraryPath = path.join(this.dataPath, '.claude');
        this.metricsCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Calculate comprehensive quality metrics for a project or globally
     */
    async calculateQualityMetrics(projectName = null, timeframe = 30) {
        const cacheKey = `quality-${projectName || 'global'}-${timeframe}`;
        
        // Check cache first
        if (this.metricsCache.has(cacheKey)) {
            const cached = this.metricsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const cutoffDate = new Date(Date.now() - (timeframe * 24 * 60 * 60 * 1000));
            const validationResults = await this.loadValidationResults(projectName, cutoffDate);

            const metrics = {
                overview: this.calculateOverviewMetrics(validationResults),
                trends: this.calculateTrendMetrics(validationResults, timeframe),
                patterns: await this.calculatePatternMetrics(validationResults),
                performance: this.calculatePerformanceMetrics(validationResults),
                health: this.calculateHealthMetrics(validationResults),
                comparative: await this.calculateComparativeMetrics(validationResults, projectName),
                timestamp: new Date().toISOString(),
                project: projectName,
                timeframe
            };

            // Cache results
            this.metricsCache.set(cacheKey, {
                data: metrics,
                timestamp: Date.now()
            });

            return metrics;

        } catch (error) {
            console.error('Error calculating quality metrics:', error);
            throw new Error(`Failed to calculate quality metrics: ${error.message}`);
        }
    }

    /**
     * Load validation results with optional filtering
     */
    async loadValidationResults(projectName = null, cutoffDate = null) {
        await fs.ensureDir(this.validationResultsPath);
        
        const files = await fs.readdir(this.validationResultsPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        const results = [];
        
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(this.validationResultsPath, file);
                const data = await fs.readJson(filePath);
                const fileStats = await fs.stat(filePath);
                
                // Ensure timestamp
                if (!data.timestamp) data.timestamp = fileStats.mtime;
                
                // Apply filters
                if (cutoffDate && new Date(data.timestamp) < cutoffDate) continue;
                if (projectName && (!data.project || !data.project.toLowerCase().includes(projectName.toLowerCase()))) continue;
                
                results.push(data);
            } catch (error) {
                console.warn(`Failed to load validation result ${file}:`, error.message);
            }
        }
        
        return results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    /**
     * Calculate overview metrics
     */
    calculateOverviewMetrics(results) {
        const total = results.length;
        if (total === 0) {
            return {
                totalValidations: 0,
                successRate: 0,
                failureRate: 0,
                warningRate: 0,
                qualityScore: 0,
                trend: 'stable'
            };
        }

        const successful = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'failure').length;
        const warnings = results.filter(r => r.status === 'warning').length;

        const successRate = Math.round((successful / total) * 100);
        const failureRate = Math.round((failed / total) * 100);
        const warningRate = Math.round((warnings / total) * 100);

        // Calculate quality score (weighted: success=1, warning=0.5, failure=0)
        const qualityScore = Math.round(((successful + (warnings * 0.5)) / total) * 100);

        // Determine trend (compare last 7 days vs previous 7 days)
        const trend = this.calculateTrend(results, 7);

        return {
            totalValidations: total,
            successRate,
            failureRate,
            warningRate,
            qualityScore,
            trend,
            breakdown: {
                successful,
                failed,
                warnings
            }
        };
    }

    /**
     * Calculate trend metrics over time periods
     */
    calculateTrendMetrics(results, timeframe) {
        const trends = [];
        const daysPerPeriod = Math.max(1, Math.floor(timeframe / 10)); // 10 data points max
        
        for (let i = timeframe; i >= 0; i -= daysPerPeriod) {
            const periodEnd = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
            const periodStart = new Date(periodEnd.getTime() - (daysPerPeriod * 24 * 60 * 60 * 1000));
            
            const periodResults = results.filter(r => {
                const resultDate = new Date(r.timestamp);
                return resultDate >= periodStart && resultDate < periodEnd;
            });

            const periodMetrics = this.calculateOverviewMetrics(periodResults);
            
            trends.push({
                period: periodEnd.toISOString().split('T')[0],
                ...periodMetrics,
                dateRange: {
                    start: periodStart.toISOString(),
                    end: periodEnd.toISOString()
                }
            });
        }

        return trends;
    }

    /**
     * Calculate pattern effectiveness metrics
     */
    async calculatePatternMetrics(results) {
        const patternStats = new Map();
        const patternSuccessRates = new Map();

        // Analyze pattern usage and effectiveness
        results.forEach(result => {
            if (result.patterns && Array.isArray(result.patterns)) {
                result.patterns.forEach(pattern => {
                    const patternKey = pattern.name || pattern.type || 'unknown';
                    
                    if (!patternStats.has(patternKey)) {
                        patternStats.set(patternKey, {
                            name: patternKey,
                            usage: 0,
                            successes: 0,
                            failures: 0,
                            warnings: 0,
                            confidence: pattern.confidence || 0,
                            scope: pattern.scope || 'universal'
                        });
                    }

                    const stats = patternStats.get(patternKey);
                    stats.usage++;
                    
                    switch (result.status) {
                        case 'success': stats.successes++; break;
                        case 'failure': stats.failures++; break;
                        case 'warning': stats.warnings++; break;
                    }
                    
                    // Update average confidence
                    stats.confidence = ((stats.confidence * (stats.usage - 1)) + (pattern.confidence || 0)) / stats.usage;
                });
            }
        });

        // Calculate effectiveness scores
        const patternMetrics = Array.from(patternStats.values()).map(stats => {
            const total = stats.usage;
            const effectiveness = total > 0 ? Math.round(((stats.successes + (stats.warnings * 0.5)) / total) * 100) : 0;
            
            return {
                ...stats,
                effectiveness,
                successRate: total > 0 ? Math.round((stats.successes / total) * 100) : 0
            };
        });

        // Load pattern library statistics
        const libraryStats = await this.getPatternLibraryStats();

        return {
            patternUsage: patternMetrics.sort((a, b) => b.usage - a.usage).slice(0, 20),
            mostEffective: patternMetrics.sort((a, b) => b.effectiveness - a.effectiveness).slice(0, 10),
            leastEffective: patternMetrics.filter(p => p.usage >= 3).sort((a, b) => a.effectiveness - b.effectiveness).slice(0, 5),
            libraryStats,
            totalPatterns: patternMetrics.length,
            averageEffectiveness: patternMetrics.length > 0 ? 
                Math.round(patternMetrics.reduce((sum, p) => sum + p.effectiveness, 0) / patternMetrics.length) : 0
        };
    }

    /**
     * Get pattern library statistics
     */
    async getPatternLibraryStats() {
        const libraryStats = {
            universal: { count: 0, version: '0.0.0' },
            backend: { count: 0, version: '0.0.0' },
            frontend: { count: 0, version: '0.0.0' },
            total: 0
        };

        try {
            // Universal patterns
            const universalPath = path.join(this.patternLibraryPath, 'pattern-library.json');
            if (await fs.pathExists(universalPath)) {
                const universal = await fs.readJson(universalPath);
                libraryStats.universal = {
                    count: universal.patterns ? universal.patterns.length : 0,
                    version: universal.version || '0.0.0'
                };
            }

            // Backend patterns
            const backendPath = path.join(this.patternLibraryPath, 'backend-pattern-library.json');
            if (await fs.pathExists(backendPath)) {
                const backend = await fs.readJson(backendPath);
                libraryStats.backend = {
                    count: backend.patterns ? backend.patterns.length : 0,
                    version: backend.version || '0.0.0'
                };
            }

            // Frontend patterns
            const frontendPath = path.join(this.patternLibraryPath, 'frontend-pattern-library.json');
            if (await fs.pathExists(frontendPath)) {
                const frontend = await fs.readJson(frontendPath);
                libraryStats.frontend = {
                    count: frontend.patterns ? frontend.patterns.length : 0,
                    version: frontend.version || '0.0.0'
                };
            }

            libraryStats.total = libraryStats.universal.count + libraryStats.backend.count + libraryStats.frontend.count;

        } catch (error) {
            console.warn('Error loading pattern library stats:', error.message);
        }

        return libraryStats;
    }

    /**
     * Calculate performance metrics
     */
    calculatePerformanceMetrics(results) {
        const executionTimes = results.map(r => r.executionTime).filter(Boolean);
        const testCounts = results.map(r => r.testCount || r.totalTests).filter(Boolean);

        const performance = {
            averageExecutionTime: 0,
            medianExecutionTime: 0,
            maxExecutionTime: 0,
            minExecutionTime: 0,
            averageTestCount: 0,
            totalTestsExecuted: testCounts.reduce((sum, count) => sum + count, 0),
            throughput: 0 // validations per hour
        };

        if (executionTimes.length > 0) {
            performance.averageExecutionTime = Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length);
            performance.maxExecutionTime = Math.max(...executionTimes);
            performance.minExecutionTime = Math.min(...executionTimes);
            
            // Calculate median
            const sorted = [...executionTimes].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            performance.medianExecutionTime = sorted.length % 2 === 0 ? 
                Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
        }

        if (testCounts.length > 0) {
            performance.averageTestCount = Math.round(testCounts.reduce((a, b) => a + b, 0) / testCounts.length);
        }

        // Calculate throughput (validations per hour)
        if (results.length > 1) {
            const timeSpan = new Date(results[results.length - 1].timestamp) - new Date(results[0].timestamp);
            const hours = timeSpan / (1000 * 60 * 60);
            if (hours > 0) {
                performance.throughput = Math.round(results.length / hours * 100) / 100;
            }
        }

        return performance;
    }

    /**
     * Calculate health metrics and status
     */
    calculateHealthMetrics(results) {
        if (results.length === 0) {
            return {
                overall: 'unknown',
                score: 0,
                indicators: [],
                recommendations: ['No validation data available']
            };
        }

        const indicators = [];
        const recommendations = [];
        let score = 100;

        // Success rate indicator
        const successRate = Math.round((results.filter(r => r.status === 'success').length / results.length) * 100);
        if (successRate < 70) {
            indicators.push({ type: 'warning', message: `Low success rate: ${successRate}%` });
            recommendations.push('Review failing validation patterns and improve test quality');
            score -= (70 - successRate);
        } else if (successRate >= 95) {
            indicators.push({ type: 'success', message: `Excellent success rate: ${successRate}%` });
        }

        // Trend indicator
        const trend = this.calculateTrend(results, 7);
        if (trend === 'declining') {
            indicators.push({ type: 'warning', message: 'Quality trend is declining' });
            recommendations.push('Investigate recent changes that may be affecting validation quality');
            score -= 15;
        } else if (trend === 'improving') {
            indicators.push({ type: 'success', message: 'Quality trend is improving' });
        }

        // Pattern effectiveness indicator
        const recentResults = results.slice(-20); // Last 20 validations
        const patternsUsed = new Set();
        recentResults.forEach(r => {
            if (r.patterns) {
                r.patterns.forEach(p => patternsUsed.add(p.name || p.type));
            }
        });

        if (patternsUsed.size < 3 && results.length > 10) {
            indicators.push({ type: 'info', message: 'Limited pattern diversity detected' });
            recommendations.push('Consider expanding pattern library to improve validation coverage');
            score -= 5;
        }

        // Performance indicator
        const executionTimes = results.map(r => r.executionTime).filter(Boolean);
        if (executionTimes.length > 0) {
            const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            if (avgTime > 30000) { // 30 seconds
                indicators.push({ type: 'warning', message: 'Slow average validation time' });
                recommendations.push('Optimize validation processes to improve performance');
                score -= 10;
            }
        }

        // Determine overall health
        let overall = 'excellent';
        if (score < 60) overall = 'poor';
        else if (score < 75) overall = 'fair';
        else if (score < 90) overall = 'good';

        return {
            overall,
            score: Math.max(0, score),
            indicators,
            recommendations,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Calculate comparative metrics across projects
     */
    async calculateComparativeMetrics(currentResults, currentProject) {
        try {
            // Load results from all projects for comparison
            const allResults = await this.loadValidationResults();
            const projectGroups = new Map();

            // Group by project
            allResults.forEach(result => {
                const project = result.project || 'unknown';
                if (!projectGroups.has(project)) {
                    projectGroups.set(project, []);
                }
                projectGroups.get(project).push(result);
            });

            const comparisons = [];

            // Calculate metrics for each project
            for (const [projectName, results] of projectGroups) {
                if (results.length < 5) continue; // Skip projects with too few results

                const overview = this.calculateOverviewMetrics(results);
                const performance = this.calculatePerformanceMetrics(results);

                comparisons.push({
                    project: projectName,
                    isCurrent: projectName === currentProject,
                    ...overview,
                    averageExecutionTime: performance.averageExecutionTime,
                    totalTestsExecuted: performance.totalTestsExecuted,
                    lastValidation: results[results.length - 1]?.timestamp
                });
            }

            // Sort by quality score
            comparisons.sort((a, b) => b.qualityScore - a.qualityScore);

            // Find current project ranking
            const currentRank = currentProject ? 
                comparisons.findIndex(c => c.project === currentProject) + 1 : null;

            return {
                projects: comparisons,
                totalProjects: comparisons.length,
                currentProjectRank: currentRank,
                industryAverage: {
                    qualityScore: comparisons.length > 0 ? 
                        Math.round(comparisons.reduce((sum, p) => sum + p.qualityScore, 0) / comparisons.length) : 0,
                    successRate: comparisons.length > 0 ?
                        Math.round(comparisons.reduce((sum, p) => sum + p.successRate, 0) / comparisons.length) : 0
                }
            };

        } catch (error) {
            console.error('Error calculating comparative metrics:', error);
            return {
                projects: [],
                totalProjects: 0,
                currentProjectRank: null,
                industryAverage: { qualityScore: 0, successRate: 0 }
            };
        }
    }

    /**
     * Calculate trend direction
     */
    calculateTrend(results, days) {
        if (results.length < 10) return 'stable';

        const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        const recent = results.filter(r => new Date(r.timestamp) >= cutoff);
        const previous = results.filter(r => new Date(r.timestamp) < cutoff).slice(-recent.length);

        if (recent.length < 5 || previous.length < 5) return 'stable';

        const recentSuccessRate = recent.filter(r => r.status === 'success').length / recent.length;
        const previousSuccessRate = previous.filter(r => r.status === 'success').length / previous.length;

        const difference = recentSuccessRate - previousSuccessRate;

        if (difference > 0.05) return 'improving';
        if (difference < -0.05) return 'declining';
        return 'stable';
    }

    /**
     * Clear metrics cache
     */
    clearCache() {
        this.metricsCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.metricsCache.size,
            keys: Array.from(this.metricsCache.keys())
        };
    }
}

module.exports = MetricsService;