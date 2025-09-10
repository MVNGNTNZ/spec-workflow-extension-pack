const fs = require('fs-extra');
const path = require('path');

/**
 * PatternLibraryManager - Manages test failure pattern libraries for the test validation extension
 * 
 * Handles loading, updating, and querying pattern libraries for:
 * - Universal patterns (cross-technology)
 * - Backend-specific patterns (FastAPI, SQLAlchemy, Python)
 * - Frontend-specific patterns (React, Next.js, JavaScript)
 */
class PatternLibraryManager {
    constructor(claudeDir = '.claude') {
        this.claudeDir = claudeDir;
        this.patternLibraries = new Map();
        this.libraryPaths = {
            universal: path.join(claudeDir, 'pattern-library.json'),
            backend: path.join(claudeDir, 'backend-pattern-library.json'),
            frontend: path.join(claudeDir, 'frontend-pattern-library.json')
        };
    }

    /**
     * Initialize the pattern library system
     * Loads all available pattern libraries
     */
    async initialize() {
        try {
            for (const [scope, filePath] of Object.entries(this.libraryPaths)) {
                if (await fs.pathExists(filePath)) {
                    const library = await fs.readJson(filePath);
                    this.patternLibraries.set(scope, library);
                    console.log(`✅ Loaded ${scope} pattern library (v${library.pattern_library_version}) with ${library.total_patterns} patterns`);
                } else {
                    console.log(`⚠️  Pattern library not found: ${filePath}`);
                }
            }

            return {
                success: true,
                loadedLibraries: Array.from(this.patternLibraries.keys()),
                totalPatterns: this.getTotalPatternCount()
            };
        } catch (error) {
            console.error('❌ Failed to initialize pattern libraries:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all pattern libraries
     */
    getAllLibraries() {
        return Object.fromEntries(this.patternLibraries);
    }

    /**
     * Get patterns for a specific scope
     */
    getPatternsByScope(scope) {
        const library = this.patternLibraries.get(scope);
        return library ? library.patterns : {};
    }

    /**
     * Search for patterns matching test failures
     * @param {Array} failures - Array of test failure objects
     * @param {String} scope - Specific scope to search (optional)
     * @returns {Array} Matching patterns with confidence scores
     */
    findMatchingPatterns(failures, scope = null) {
        const matches = [];
        const librariesToSearch = scope ? [scope] : Array.from(this.patternLibraries.keys());

        for (const libraryScope of librariesToSearch) {
            const library = this.patternLibraries.get(libraryScope);
            if (!library || !library.patterns) continue;

            for (const [patternName, pattern] of Object.entries(library.patterns)) {
                // Apply detection logic (simplified pattern matching)
                const isMatch = this._evaluatePattern(failures, pattern);
                
                if (isMatch) {
                    matches.push({
                        name: patternName,
                        scope: libraryScope,
                        confidence: pattern.confidence,
                        pattern: pattern
                    });
                }
            }
        }

        // Sort by confidence score
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Add a new pattern to a specific library
     */
    async addPattern(scope, patternName, patternData) {
        try {
            const library = this.patternLibraries.get(scope);
            if (!library) {
                throw new Error(`Pattern library not found for scope: ${scope}`);
            }

            // Add the new pattern
            library.patterns[patternName] = patternData;
            library.total_patterns = Object.keys(library.patterns).length;
            library.last_updated = new Date().toISOString();

            // Save to file
            await fs.writeJson(this.libraryPaths[scope], library, { spaces: 2 });

            // Update in-memory library
            this.patternLibraries.set(scope, library);

            console.log(`✅ Added pattern '${patternName}' to ${scope} library`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to add pattern: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update existing pattern
     */
    async updatePattern(scope, patternName, updates) {
        try {
            const library = this.patternLibraries.get(scope);
            if (!library || !library.patterns[patternName]) {
                throw new Error(`Pattern '${patternName}' not found in ${scope} library`);
            }

            // Apply updates
            library.patterns[patternName] = { ...library.patterns[patternName], ...updates };
            library.last_updated = new Date().toISOString();

            // Save to file
            await fs.writeJson(this.libraryPaths[scope], library, { spaces: 2 });

            // Update in-memory library
            this.patternLibraries.set(scope, library);

            console.log(`✅ Updated pattern '${patternName}' in ${scope} library`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to update pattern: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get pattern library statistics
     */
    getStatistics() {
        const stats = {
            totalLibraries: this.patternLibraries.size,
            totalPatterns: 0,
            libraryStats: {}
        };

        for (const [scope, library] of this.patternLibraries) {
            stats.libraryStats[scope] = {
                version: library.pattern_library_version,
                patternCount: library.total_patterns,
                lastUpdated: library.last_updated
            };
            stats.totalPatterns += library.total_patterns;
        }

        return stats;
    }

    /**
     * Export pattern libraries for extension packaging
     */
    async exportForPackaging(outputDir) {
        try {
            const exportDir = path.join(outputDir, 'pattern-libraries');
            await fs.ensureDir(exportDir);

            for (const [scope, filePath] of Object.entries(this.libraryPaths)) {
                if (await fs.pathExists(filePath)) {
                    const targetPath = path.join(exportDir, path.basename(filePath));
                    await fs.copy(filePath, targetPath);
                    console.log(`✅ Exported ${scope} pattern library to ${targetPath}`);
                }
            }

            // Create index file
            const indexData = {
                libraries: Object.keys(this.libraryPaths),
                exportDate: new Date().toISOString(),
                statistics: this.getStatistics()
            };

            await fs.writeJson(path.join(exportDir, 'index.json'), indexData, { spaces: 2 });

            return { success: true, exportDir };
        } catch (error) {
            console.error(`❌ Failed to export pattern libraries: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get total pattern count across all libraries
     */
    getTotalPatternCount() {
        let total = 0;
        for (const library of this.patternLibraries.values()) {
            total += library.total_patterns || 0;
        }
        return total;
    }

    /**
     * Simplified pattern matching evaluation
     * In production, this would use the actual detection logic from patterns
     */
    _evaluatePattern(failures, pattern) {
        if (!failures || !Array.isArray(failures) || failures.length === 0) {
            return false;
        }

        // Check for signature keywords in failure messages
        const signature = pattern.signature.toLowerCase();
        const keywords = signature.split(' ');
        
        return failures.some(failure => {
            const errorText = (failure.error || failure.message || '').toLowerCase();
            return keywords.some(keyword => errorText.includes(keyword));
        });
    }

    /**
     * Validate pattern library structure
     */
    validateLibrary(libraryData) {
        const required = ['pattern_library_version', 'scope', 'patterns'];
        const missing = required.filter(field => !libraryData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate patterns structure
        for (const [name, pattern] of Object.entries(libraryData.patterns)) {
            if (!pattern.signature || !pattern.confidence) {
                throw new Error(`Pattern '${name}' missing required fields`);
            }
        }

        return true;
    }

    /**
     * Reset pattern libraries to initial state
     */
    reset() {
        this.patternLibraries.clear();
        console.log('🔄 Pattern library manager reset');
    }
}

module.exports = PatternLibraryManager;