const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();

/**
 * Validation Results API
 * 
 * Provides REST endpoints for retrieving and managing test validation results,
 * including filtering, sorting, pagination, and real-time updates.
 * 
 * Endpoints:
 * - GET /results - List validation results with filtering and pagination
 * - GET /results/:id - Get specific validation result details
 * - GET /results/summary - Get validation results summary statistics
 * - GET /results/trends - Get validation trend data over time
 * - POST /results - Store new validation results
 * - DELETE /results/:id - Delete specific validation result
 */

/**
 * Get validation results with filtering and pagination
 */
router.get('/results', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            project,
            status,
            pattern,
            dateFrom,
            dateTo,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = req.query;

        const dataPath = path.join(__dirname, '../../../data/validation-results');
        
        // Ensure validation results directory exists
        await fs.ensureDir(dataPath);

        // Get all validation result files
        const files = await fs.readdir(dataPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        let results = [];

        // Load and parse validation results
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(dataPath, file);
                const data = await fs.readJson(filePath);
                
                // Ensure required fields exist
                if (!data.id) data.id = path.basename(file, '.json');
                if (!data.timestamp) data.timestamp = (await fs.stat(filePath)).mtime;
                
                results.push(data);
            } catch (error) {
                console.warn(`Failed to load validation result ${file}:`, error.message);
            }
        }

        // Apply filters
        if (project) {
            results = results.filter(r => 
                r.project && r.project.toLowerCase().includes(project.toLowerCase())
            );
        }

        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            results = results.filter(r => 
                r.status && statusArray.includes(r.status.toLowerCase())
            );
        }

        if (pattern) {
            results = results.filter(r => 
                r.patterns && r.patterns.some(p => 
                    p.name && p.name.toLowerCase().includes(pattern.toLowerCase())
                )
            );
        }

        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            results = results.filter(r => new Date(r.timestamp) >= fromDate);
        }

        if (dateTo) {
            const toDate = new Date(dateTo);
            results = results.filter(r => new Date(r.timestamp) <= toDate);
        }

        // Sort results
        results.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            // Handle timestamp sorting
            if (sortBy === 'timestamp') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }

            if (sortOrder === 'desc') {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });

        // Apply pagination
        const total = results.length;
        const offset = (page - 1) * limit;
        const paginatedResults = results.slice(offset, offset + parseInt(limit));

        res.json({
            results: paginatedResults,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: offset + parseInt(limit) < total,
                hasPrev: page > 1
            },
            filters: {
                project,
                status,
                pattern,
                dateFrom,
                dateTo
            },
            sorting: {
                sortBy,
                sortOrder
            }
        });

    } catch (error) {
        console.error('Error retrieving validation results:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get specific validation result details
 */
router.get('/results/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(__dirname, '../../../data/validation-results', `${id}.json`);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Validation result not found' });
        }

        const result = await fs.readJson(filePath);
        
        // Ensure ID is set
        if (!result.id) result.id = id;

        res.json({ result });

    } catch (error) {
        console.error('Error retrieving validation result:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get validation results summary statistics
 */
router.get('/results/summary', async (req, res) => {
    try {
        const { project, days = 30 } = req.query;
        const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

        const dataPath = path.join(__dirname, '../../../data/validation-results');
        await fs.ensureDir(dataPath);

        const files = await fs.readdir(dataPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        let results = [];
        
        // Load validation results
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(dataPath, file);
                const data = await fs.readJson(filePath);
                const fileStats = await fs.stat(filePath);
                
                if (!data.timestamp) data.timestamp = fileStats.mtime;
                
                // Filter by date and project if specified
                if (new Date(data.timestamp) < cutoffDate) continue;
                if (project && (!data.project || !data.project.toLowerCase().includes(project.toLowerCase()))) continue;
                
                results.push(data);
            } catch (error) {
                console.warn(`Failed to load validation result ${file}:`, error.message);
            }
        }

        // Calculate summary statistics
        const summary = {
            totalResults: results.length,
            successCount: results.filter(r => r.status === 'success').length,
            failureCount: results.filter(r => r.status === 'failure').length,
            warningCount: results.filter(r => r.status === 'warning').length,
            projects: [...new Set(results.map(r => r.project).filter(Boolean))],
            dateRange: {
                from: cutoffDate.toISOString(),
                to: new Date().toISOString()
            },
            averageExecutionTime: 0,
            mostCommonPatterns: [],
            qualityScore: 0
        };

        // Calculate average execution time
        const executionTimes = results.map(r => r.executionTime).filter(Boolean);
        if (executionTimes.length > 0) {
            summary.averageExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
        }

        // Find most common patterns
        const patternCounts = {};
        results.forEach(r => {
            if (r.patterns && Array.isArray(r.patterns)) {
                r.patterns.forEach(pattern => {
                    const key = pattern.name || pattern.type || 'unknown';
                    patternCounts[key] = (patternCounts[key] || 0) + 1;
                });
            }
        });

        summary.mostCommonPatterns = Object.entries(patternCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        // Calculate quality score (success rate)
        if (results.length > 0) {
            summary.qualityScore = Math.round((summary.successCount / results.length) * 100);
        }

        res.json({ summary });

    } catch (error) {
        console.error('Error calculating validation summary:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get validation trend data over time
 */
router.get('/results/trends', async (req, res) => {
    try {
        const { 
            project,
            days = 30,
            granularity = 'day' // day, hour, week
        } = req.query;

        const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        const dataPath = path.join(__dirname, '../../../data/validation-results');
        await fs.ensureDir(dataPath);

        const files = await fs.readdir(dataPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        let results = [];
        
        // Load validation results within date range
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(dataPath, file);
                const data = await fs.readJson(filePath);
                const fileStats = await fs.stat(filePath);
                
                if (!data.timestamp) data.timestamp = fileStats.mtime;
                
                const resultDate = new Date(data.timestamp);
                if (resultDate < cutoffDate) continue;
                if (project && (!data.project || !data.project.toLowerCase().includes(project.toLowerCase()))) continue;
                
                results.push(data);
            } catch (error) {
                console.warn(`Failed to load validation result ${file}:`, error.message);
            }
        }

        // Group results by time period
        const trendData = {};
        const formatDate = (date) => {
            switch (granularity) {
                case 'hour':
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
                case 'day':
                default:
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }
        };

        results.forEach(result => {
            const periodKey = formatDate(new Date(result.timestamp));
            
            if (!trendData[periodKey]) {
                trendData[periodKey] = {
                    period: periodKey,
                    total: 0,
                    success: 0,
                    failure: 0,
                    warning: 0,
                    patterns: {}
                };
            }

            const period = trendData[periodKey];
            period.total++;
            
            if (result.status) {
                period[result.status] = (period[result.status] || 0) + 1;
            }

            // Track pattern usage
            if (result.patterns && Array.isArray(result.patterns)) {
                result.patterns.forEach(pattern => {
                    const patternName = pattern.name || pattern.type || 'unknown';
                    period.patterns[patternName] = (period.patterns[patternName] || 0) + 1;
                });
            }
        });

        // Convert to array and sort by period
        const trends = Object.values(trendData).sort((a, b) => 
            new Date(a.period) - new Date(b.period)
        );

        // Calculate success rate for each period
        trends.forEach(trend => {
            trend.successRate = trend.total > 0 ? Math.round((trend.success / trend.total) * 100) : 0;
        });

        res.json({
            trends,
            metadata: {
                project,
                days: parseInt(days),
                granularity,
                dateRange: {
                    from: cutoffDate.toISOString(),
                    to: new Date().toISOString()
                },
                totalResults: results.length
            }
        });

    } catch (error) {
        console.error('Error calculating validation trends:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Store new validation results
 */
router.post('/results', async (req, res) => {
    try {
        const validationResult = req.body;

        // Validate required fields
        if (!validationResult.project) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        // Generate ID if not provided
        if (!validationResult.id) {
            validationResult.id = `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Add timestamp if not provided
        if (!validationResult.timestamp) {
            validationResult.timestamp = new Date().toISOString();
        }

        // Add user information
        if (req.user) {
            validationResult.submittedBy = {
                username: req.user.username,
                id: req.user.id
            };
        }

        const dataPath = path.join(__dirname, '../../../data/validation-results');
        await fs.ensureDir(dataPath);

        const filePath = path.join(dataPath, `${validationResult.id}.json`);
        await fs.writeJson(filePath, validationResult, { spaces: 2 });

        // Broadcast real-time update if WebSocket is available
        if (req.app.locals.dashboardServer && req.app.locals.dashboardServer.io) {
            req.app.locals.dashboardServer.broadcastUpdate('metrics-updates', {
                type: 'new-validation-result',
                result: validationResult
            });
        }

        res.status(201).json({
            message: 'Validation result stored successfully',
            id: validationResult.id,
            result: validationResult
        });

    } catch (error) {
        console.error('Error storing validation result:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete specific validation result
 */
router.delete('/results/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(__dirname, '../../../data/validation-results', `${id}.json`);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Validation result not found' });
        }

        await fs.remove(filePath);

        // Broadcast real-time update if WebSocket is available
        if (req.app.locals.dashboardServer && req.app.locals.dashboardServer.io) {
            req.app.locals.dashboardServer.broadcastUpdate('metrics-updates', {
                type: 'validation-result-deleted',
                id
            });
        }

        res.json({ message: 'Validation result deleted successfully', id });

    } catch (error) {
        console.error('Error deleting validation result:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;