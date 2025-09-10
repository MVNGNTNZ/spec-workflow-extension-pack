const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();

/**
 * Pattern Analysis API
 * 
 * Provides REST endpoints for pattern library access, search functionality,
 * usage statistics, effectiveness metrics, and pattern management.
 * 
 * Endpoints:
 * - GET /library - Get complete pattern library data
 * - GET /library/:scope - Get patterns for specific scope (universal, backend, frontend)
 * - GET /search - Search patterns with filters
 * - GET /usage - Get pattern usage statistics
 * - GET /effectiveness - Get pattern effectiveness metrics
 * - POST /patterns - Add new pattern to library
 * - PUT /patterns/:id - Update existing pattern
 * - DELETE /patterns/:id - Remove pattern from library
 * - GET /export - Export pattern library data
 */

/**
 * Get complete pattern library data
 */
router.get('/library', async (req, res) => {
    try {
        const { includeStats = true } = req.query;
        
        const patternLibraries = await loadPatternLibraries();
        const response = {
            success: true,
            libraries: patternLibraries,
            summary: {
                totalPatterns: Object.values(patternLibraries).reduce((sum, lib) => sum + (lib.patterns?.length || 0), 0),
                scopes: Object.keys(patternLibraries),
                lastUpdated: Math.max(...Object.values(patternLibraries).map(lib => new Date(lib.lastUpdated || 0).getTime())),
                versions: Object.fromEntries(Object.entries(patternLibraries).map(([scope, lib]) => [scope, lib.version]))
            }
        };

        // Include usage statistics if requested
        if (includeStats === 'true') {
            const stats = await getPatternUsageStats();
            response.usage = stats;
        }

        res.json(response);

    } catch (error) {
        console.error('Error retrieving pattern library:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get patterns for specific scope
 */
router.get('/library/:scope', async (req, res) => {
    try {
        const { scope } = req.params;
        const { includeUsage = false, sortBy = 'name', sortOrder = 'asc' } = req.query;

        const validScopes = ['universal', 'backend', 'frontend'];
        if (!validScopes.includes(scope)) {
            return res.status(400).json({
                success: false,
                error: `Invalid scope. Must be one of: ${validScopes.join(', ')}`
            });
        }

        const fileName = scope === 'universal' ? 'pattern-library.json' : `${scope}-pattern-library.json`;
        const filePath = path.join(__dirname, '../../../.claude', fileName);

        if (!await fs.pathExists(filePath)) {
            return res.json({
                success: true,
                library: { patterns: [], version: '0.0.0', scope },
                message: `Pattern library for ${scope} scope not found`
            });
        }

        const library = await fs.readJson(filePath);
        let patterns = library.patterns || [];

        // Include usage statistics for each pattern if requested
        if (includeUsage === 'true') {
            const usageStats = await getPatternUsageStats();
            patterns = patterns.map(pattern => ({
                ...pattern,
                usage: usageStats[pattern.name] || { count: 0, effectiveness: 0, lastUsed: null }
            }));
        }

        // Sort patterns
        patterns.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            if (sortBy === 'usage' && includeUsage === 'true') {
                aVal = a.usage?.count || 0;
                bVal = b.usage?.count || 0;
            }

            if (sortBy === 'effectiveness' && includeUsage === 'true') {
                aVal = a.usage?.effectiveness || 0;
                bVal = b.usage?.effectiveness || 0;
            }

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (sortOrder === 'desc') {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });

        res.json({
            success: true,
            library: {
                ...library,
                patterns,
                scope
            }
        });

    } catch (error) {
        console.error('Error retrieving scoped pattern library:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Search patterns with filters
 */
router.get('/search', async (req, res) => {
    try {
        const { 
            query = '',
            scope,
            category,
            language,
            framework,
            minEffectiveness,
            minUsage,
            limit = 50
        } = req.query;

        const patternLibraries = await loadPatternLibraries();
        const allPatterns = [];

        // Collect all patterns from all libraries
        Object.entries(patternLibraries).forEach(([libraryScope, library]) => {
            if (scope && scope !== libraryScope) return;

            (library.patterns || []).forEach(pattern => {
                allPatterns.push({
                    ...pattern,
                    scope: libraryScope
                });
            });
        });

        // Get usage statistics
        const usageStats = await getPatternUsageStats();

        // Apply filters
        let filteredPatterns = allPatterns.filter(pattern => {
            // Text search in name and description
            if (query) {
                const searchText = `${pattern.name} ${pattern.description || ''} ${pattern.problem || ''}`.toLowerCase();
                if (!searchText.includes(query.toLowerCase())) {
                    return false;
                }
            }

            // Category filter
            if (category && pattern.category !== category) {
                return false;
            }

            // Language filter
            if (language && pattern.languages && !pattern.languages.includes(language)) {
                return false;
            }

            // Framework filter
            if (framework && pattern.frameworks && !pattern.frameworks.includes(framework)) {
                return false;
            }

            // Usage and effectiveness filters
            const usage = usageStats[pattern.name];
            if (minUsage && (!usage || usage.count < parseInt(minUsage))) {
                return false;
            }

            if (minEffectiveness && (!usage || usage.effectiveness < parseInt(minEffectiveness))) {
                return false;
            }

            return true;
        });

        // Add usage statistics to results
        filteredPatterns = filteredPatterns.map(pattern => ({
            ...pattern,
            usage: usageStats[pattern.name] || { count: 0, effectiveness: 0, lastUsed: null }
        }));

        // Sort by relevance (usage count and effectiveness)
        filteredPatterns.sort((a, b) => {
            const aScore = (a.usage.count || 0) + (a.usage.effectiveness || 0) * 0.1;
            const bScore = (b.usage.count || 0) + (b.usage.effectiveness || 0) * 0.1;
            return bScore - aScore;
        });

        // Apply limit
        const limitedPatterns = filteredPatterns.slice(0, parseInt(limit));

        res.json({
            success: true,
            results: limitedPatterns,
            metadata: {
                query,
                filters: { scope, category, language, framework, minEffectiveness, minUsage },
                totalFound: filteredPatterns.length,
                totalReturned: limitedPatterns.length,
                searchedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error searching patterns:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get pattern usage statistics
 */
router.get('/usage', async (req, res) => {
    try {
        const { scope, period = 30 } = req.query;
        
        const usageStats = await getPatternUsageStats(scope, parseInt(period));
        
        res.json({
            success: true,
            usage: usageStats,
            metadata: {
                scope: scope || 'all',
                period: parseInt(period),
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error retrieving pattern usage:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Get pattern effectiveness metrics
 */
router.get('/effectiveness', async (req, res) => {
    try {
        const { scope, minUsage = 3, sortBy = 'effectiveness' } = req.query;
        
        const usageStats = await getPatternUsageStats(scope);
        
        // Filter patterns with minimum usage and calculate effectiveness
        const effectivenessData = Object.entries(usageStats)
            .filter(([name, stats]) => stats.count >= parseInt(minUsage))
            .map(([name, stats]) => ({
                name,
                ...stats,
                effectivenessGrade: getEffectivenessGrade(stats.effectiveness)
            }))
            .sort((a, b) => {
                if (sortBy === 'usage') {
                    return b.count - a.count;
                }
                return b.effectiveness - a.effectiveness;
            });

        // Group by effectiveness grade
        const groupedByGrade = {
            excellent: effectivenessData.filter(p => p.effectivenessGrade === 'excellent'),
            good: effectivenessData.filter(p => p.effectivenessGrade === 'good'),
            fair: effectivenessData.filter(p => p.effectivenessGrade === 'fair'),
            poor: effectivenessData.filter(p => p.effectivenessGrade === 'poor')
        };

        res.json({
            success: true,
            effectiveness: {
                patterns: effectivenessData,
                byGrade: groupedByGrade,
                summary: {
                    total: effectivenessData.length,
                    averageEffectiveness: effectivenessData.length > 0 ? 
                        Math.round(effectivenessData.reduce((sum, p) => sum + p.effectiveness, 0) / effectivenessData.length) : 0,
                    distribution: {
                        excellent: groupedByGrade.excellent.length,
                        good: groupedByGrade.good.length,
                        fair: groupedByGrade.fair.length,
                        poor: groupedByGrade.poor.length
                    }
                }
            },
            metadata: {
                scope: scope || 'all',
                minUsage: parseInt(minUsage),
                sortBy,
                calculatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error calculating pattern effectiveness:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Add new pattern to library
 */
router.post('/patterns', async (req, res) => {
    try {
        const { scope = 'universal', pattern } = req.body;

        if (!pattern || !pattern.name) {
            return res.status(400).json({
                success: false,
                error: 'Pattern object with name is required'
            });
        }

        const validScopes = ['universal', 'backend', 'frontend'];
        if (!validScopes.includes(scope)) {
            return res.status(400).json({
                success: false,
                error: `Invalid scope. Must be one of: ${validScopes.join(', ')}`
            });
        }

        const fileName = scope === 'universal' ? 'pattern-library.json' : `${scope}-pattern-library.json`;
        const filePath = path.join(__dirname, '../../../.claude', fileName);

        // Load existing library or create new one
        let library = { patterns: [], version: '1.0.0', lastUpdated: new Date().toISOString() };
        if (await fs.pathExists(filePath)) {
            library = await fs.readJson(filePath);
        }

        // Check if pattern already exists
        const existingIndex = library.patterns.findIndex(p => p.name === pattern.name);
        if (existingIndex !== -1) {
            return res.status(409).json({
                success: false,
                error: 'Pattern with this name already exists'
            });
        }

        // Add new pattern
        const newPattern = {
            ...pattern,
            id: `${scope}-${Date.now()}`,
            createdAt: new Date().toISOString(),
            createdBy: req.user ? req.user.username : 'unknown'
        };

        library.patterns.push(newPattern);
        library.lastUpdated = new Date().toISOString();

        // Update version (increment patch version)
        const versionParts = library.version.split('.').map(Number);
        versionParts[2]++;
        library.version = versionParts.join('.');

        // Save updated library
        await fs.writeJson(filePath, library, { spaces: 2 });

        res.status(201).json({
            success: true,
            message: 'Pattern added successfully',
            pattern: newPattern,
            library: {
                scope,
                version: library.version,
                totalPatterns: library.patterns.length
            }
        });

    } catch (error) {
        console.error('Error adding pattern:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Update existing pattern
 */
router.put('/patterns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { scope, pattern } = req.body;

        if (!scope || !pattern) {
            return res.status(400).json({
                success: false,
                error: 'Scope and pattern data are required'
            });
        }

        const fileName = scope === 'universal' ? 'pattern-library.json' : `${scope}-pattern-library.json`;
        const filePath = path.join(__dirname, '../../../.claude', fileName);

        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Pattern library not found'
            });
        }

        const library = await fs.readJson(filePath);
        const patternIndex = library.patterns.findIndex(p => p.id === id);

        if (patternIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Pattern not found'
            });
        }

        // Update pattern
        const updatedPattern = {
            ...library.patterns[patternIndex],
            ...pattern,
            id, // Preserve original ID
            updatedAt: new Date().toISOString(),
            updatedBy: req.user ? req.user.username : 'unknown'
        };

        library.patterns[patternIndex] = updatedPattern;
        library.lastUpdated = new Date().toISOString();

        // Update version (increment patch version)
        const versionParts = library.version.split('.').map(Number);
        versionParts[2]++;
        library.version = versionParts.join('.');

        // Save updated library
        await fs.writeJson(filePath, library, { spaces: 2 });

        res.json({
            success: true,
            message: 'Pattern updated successfully',
            pattern: updatedPattern,
            library: {
                scope,
                version: library.version,
                totalPatterns: library.patterns.length
            }
        });

    } catch (error) {
        console.error('Error updating pattern:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Export pattern library data
 */
router.get('/export', async (req, res) => {
    try {
        const { scope, format = 'json', includeUsage = false } = req.query;
        
        let exportData;
        
        if (scope) {
            // Export specific scope
            const fileName = scope === 'universal' ? 'pattern-library.json' : `${scope}-pattern-library.json`;
            const filePath = path.join(__dirname, '../../../.claude', fileName);
            
            if (!await fs.pathExists(filePath)) {
                return res.status(404).json({
                    success: false,
                    error: `Pattern library for scope ${scope} not found`
                });
            }
            
            exportData = await fs.readJson(filePath);
        } else {
            // Export all libraries
            exportData = await loadPatternLibraries();
        }

        // Include usage statistics if requested
        if (includeUsage === 'true') {
            const usageStats = await getPatternUsageStats();
            
            if (scope) {
                exportData.patterns = exportData.patterns?.map(pattern => ({
                    ...pattern,
                    usage: usageStats[pattern.name] || { count: 0, effectiveness: 0 }
                }));
            } else {
                Object.keys(exportData).forEach(libraryScope => {
                    exportData[libraryScope].patterns = exportData[libraryScope].patterns?.map(pattern => ({
                        ...pattern,
                        usage: usageStats[pattern.name] || { count: 0, effectiveness: 0 }
                    }));
                });
            }
        }

        // Add export metadata
        const exportMetadata = {
            exportedAt: new Date().toISOString(),
            scope: scope || 'all',
            format,
            includeUsage: includeUsage === 'true',
            version: '1.0.0'
        };

        const finalExportData = {
            metadata: exportMetadata,
            data: exportData
        };

        // Set response headers
        const filename = `patterns-${scope || 'all'}-${new Date().toISOString().split('T')[0]}`;
        
        if (format === 'csv') {
            // Simple CSV export of pattern names and effectiveness
            const csvLines = ['Name,Scope,Category,Usage Count,Effectiveness,Description'];
            
            const addPatternsToCsv = (patterns, patternScope) => {
                patterns.forEach(pattern => {
                    const usage = pattern.usage || { count: 0, effectiveness: 0 };
                    csvLines.push([
                        pattern.name,
                        patternScope,
                        pattern.category || '',
                        usage.count,
                        usage.effectiveness,
                        `"${(pattern.description || '').replace(/"/g, '""')}"`
                    ].join(','));
                });
            };

            if (scope) {
                addPatternsToCsv(exportData.patterns || [], scope);
            } else {
                Object.entries(exportData).forEach(([libraryScope, library]) => {
                    addPatternsToCsv(library.patterns || [], libraryScope);
                });
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.send(csvLines.join('\n'));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
            res.json(finalExportData);
        }

    } catch (error) {
        console.error('Error exporting patterns:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Helper function to load all pattern libraries
 */
async function loadPatternLibraries() {
    const libraries = {};
    const claudePath = path.join(__dirname, '../../../.claude');
    
    // Universal patterns
    const universalPath = path.join(claudePath, 'pattern-library.json');
    if (await fs.pathExists(universalPath)) {
        libraries.universal = await fs.readJson(universalPath);
    }

    // Backend patterns
    const backendPath = path.join(claudePath, 'backend-pattern-library.json');
    if (await fs.pathExists(backendPath)) {
        libraries.backend = await fs.readJson(backendPath);
    }

    // Frontend patterns
    const frontendPath = path.join(claudePath, 'frontend-pattern-library.json');
    if (await fs.pathExists(frontendPath)) {
        libraries.frontend = await fs.readJson(frontendPath);
    }

    return libraries;
}

/**
 * Helper function to get pattern usage statistics
 */
async function getPatternUsageStats(scope = null, period = 30) {
    const usageStats = {};
    const cutoffDate = new Date(Date.now() - (period * 24 * 60 * 60 * 1000));
    
    try {
        const validationResultsPath = path.join(__dirname, '../../../data/validation-results');
        
        if (!await fs.pathExists(validationResultsPath)) {
            return usageStats;
        }

        const files = await fs.readdir(validationResultsPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(validationResultsPath, file);
                const data = await fs.readJson(filePath);
                const fileStats = await fs.stat(filePath);
                
                if (!data.timestamp) data.timestamp = fileStats.mtime;
                
                // Skip old results
                if (new Date(data.timestamp) < cutoffDate) continue;
                
                // Process patterns in this validation result
                if (data.patterns && Array.isArray(data.patterns)) {
                    data.patterns.forEach(pattern => {
                        const patternName = pattern.name || pattern.type || 'unknown';
                        
                        // Filter by scope if specified
                        if (scope && pattern.scope && pattern.scope !== scope) return;
                        
                        if (!usageStats[patternName]) {
                            usageStats[patternName] = {
                                count: 0,
                                successes: 0,
                                failures: 0,
                                warnings: 0,
                                lastUsed: null,
                                scope: pattern.scope || 'universal'
                            };
                        }

                        const stats = usageStats[patternName];
                        stats.count++;
                        stats.lastUsed = data.timestamp;

                        // Track effectiveness based on validation result status
                        switch (data.status) {
                            case 'success': stats.successes++; break;
                            case 'failure': stats.failures++; break;
                            case 'warning': stats.warnings++; break;
                        }
                    });
                }
            } catch (error) {
                console.warn(`Failed to process validation result ${file}:`, error.message);
            }
        }

        // Calculate effectiveness percentages
        Object.keys(usageStats).forEach(patternName => {
            const stats = usageStats[patternName];
            const total = stats.count;
            
            if (total > 0) {
                stats.effectiveness = Math.round(((stats.successes + (stats.warnings * 0.5)) / total) * 100);
                stats.successRate = Math.round((stats.successes / total) * 100);
            } else {
                stats.effectiveness = 0;
                stats.successRate = 0;
            }
        });

    } catch (error) {
        console.error('Error calculating pattern usage stats:', error);
    }

    return usageStats;
}

/**
 * Helper function to get effectiveness grade
 */
function getEffectivenessGrade(effectiveness) {
    if (effectiveness >= 90) return 'excellent';
    if (effectiveness >= 75) return 'good';
    if (effectiveness >= 60) return 'fair';
    return 'poor';
}

module.exports = router;