const PatternLibraryManager = require('../src/pattern-library-manager');
const fs = require('fs-extra');
const path = require('path');

describe('PatternLibraryManager', () => {
    let manager;
    const testClaudeDir = 'test-claude';

    beforeAll(async () => {
        // Set up test environment with pattern libraries
        await fs.ensureDir(testClaudeDir);
        
        // Copy actual pattern libraries for testing
        const sourceClaudeDir = '.claude';
        const patternFiles = ['pattern-library.json', 'backend-pattern-library.json', 'frontend-pattern-library.json'];
        
        for (const file of patternFiles) {
            const sourcePath = path.join(sourceClaudeDir, file);
            const targetPath = path.join(testClaudeDir, file);
            
            if (await fs.pathExists(sourcePath)) {
                await fs.copy(sourcePath, targetPath);
            }
        }
        
        manager = new PatternLibraryManager(testClaudeDir);
    });

    afterAll(async () => {
        // Clean up test environment
        await fs.remove(testClaudeDir);
    });

    beforeEach(async () => {
        // Reset manager state
        manager.reset();
    });

    describe('Initialization', () => {
        test('should initialize and load all pattern libraries', async () => {
            const result = await manager.initialize();
            
            expect(result.success).toBe(true);
            expect(result.loadedLibraries).toEqual(['universal', 'backend', 'frontend']);
            expect(result.totalPatterns).toBeGreaterThan(0);
        });

        test('should handle missing pattern libraries gracefully', async () => {
            const emptyManager = new PatternLibraryManager('nonexistent');
            const result = await emptyManager.initialize();
            
            expect(result.success).toBe(true);
            expect(result.loadedLibraries).toEqual([]);
            expect(result.totalPatterns).toBe(0);
        });
    });

    describe('Pattern Library Access', () => {
        beforeEach(async () => {
            await manager.initialize();
        });

        test('should get all libraries', () => {
            const libraries = manager.getAllLibraries();
            
            expect(libraries).toHaveProperty('universal');
            expect(libraries).toHaveProperty('backend');
            expect(libraries).toHaveProperty('frontend');
        });

        test('should get patterns by scope', () => {
            const universalPatterns = manager.getPatternsByScope('universal');
            const backendPatterns = manager.getPatternsByScope('backend');
            
            expect(typeof universalPatterns).toBe('object');
            expect(typeof backendPatterns).toBe('object');
        });

        test('should return empty object for invalid scope', () => {
            const patterns = manager.getPatternsByScope('invalid');
            expect(patterns).toEqual({});
        });
    });

    describe('Pattern Matching', () => {
        beforeEach(async () => {
            await manager.initialize();
        });

        test('should find matching patterns for test failures', () => {
            const mockFailures = [
                { error: 'Multiple related tests failing after single change' },
                { error: 'API contract broken' }
            ];

            const matches = manager.findMatchingPatterns(mockFailures);
            
            expect(Array.isArray(matches)).toBe(true);
            // Should find cascade failure pattern
            expect(matches.some(match => match.name === 'CASCADE_FAILURE')).toBe(true);
        });

        test('should find scope-specific patterns', () => {
            const mockBackendFailures = [
                { error: 'Database column not found after migration' }
            ];

            const matches = manager.findMatchingPatterns(mockBackendFailures, 'backend');
            
            expect(Array.isArray(matches)).toBe(true);
            expect(matches.every(match => match.scope === 'backend')).toBe(true);
        });

        test('should handle empty failures gracefully', () => {
            const matches = manager.findMatchingPatterns([]);
            expect(matches).toEqual([]);
        });

        test('should sort matches by confidence', () => {
            const mockFailures = [
                { error: 'component prop error' },
                { error: 'multiple tests failing' }
            ];

            const matches = manager.findMatchingPatterns(mockFailures);
            
            // Verify descending confidence order
            for (let i = 1; i < matches.length; i++) {
                expect(matches[i-1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
            }
        });
    });

    describe('Pattern Management', () => {
        beforeEach(async () => {
            await manager.initialize();
        });

        test('should add new pattern to library', async () => {
            const newPattern = {
                signature: 'Test pattern for unit testing',
                confidence: 0.8,
                typical_causes: ['Unit test cause'],
                investigation_steps: ['Check unit test'],
                prevention_strategies: ['Prevent unit test issues']
            };

            const result = await manager.addPattern('universal', 'TEST_PATTERN', newPattern);
            
            expect(result.success).toBe(true);
            
            const patterns = manager.getPatternsByScope('universal');
            expect(patterns).toHaveProperty('TEST_PATTERN');
        });

        test('should update existing pattern', async () => {
            // First add a pattern
            const newPattern = {
                signature: 'Original signature',
                confidence: 0.5
            };

            await manager.addPattern('universal', 'UPDATE_TEST', newPattern);

            // Then update it
            const updates = {
                signature: 'Updated signature',
                confidence: 0.9
            };

            const result = await manager.updatePattern('universal', 'UPDATE_TEST', updates);
            
            expect(result.success).toBe(true);
            
            const patterns = manager.getPatternsByScope('universal');
            expect(patterns.UPDATE_TEST.signature).toBe('Updated signature');
            expect(patterns.UPDATE_TEST.confidence).toBe(0.9);
        });

        test('should handle invalid scope for pattern operations', async () => {
            const result = await manager.addPattern('invalid', 'TEST', {});
            expect(result.success).toBe(false);
        });
    });

    describe('Statistics and Export', () => {
        beforeEach(async () => {
            await manager.initialize();
        });

        test('should provide accurate statistics', () => {
            const stats = manager.getStatistics();
            
            expect(stats).toHaveProperty('totalLibraries');
            expect(stats).toHaveProperty('totalPatterns');
            expect(stats).toHaveProperty('libraryStats');
            
            expect(stats.totalLibraries).toBeGreaterThan(0);
            expect(stats.totalPatterns).toBeGreaterThan(0);
        });

        test('should export pattern libraries for packaging', async () => {
            const outputDir = path.join(testClaudeDir, 'export-test');
            const result = await manager.exportForPackaging(outputDir);
            
            expect(result.success).toBe(true);
            expect(await fs.pathExists(path.join(outputDir, 'pattern-libraries'))).toBe(true);
            expect(await fs.pathExists(path.join(outputDir, 'pattern-libraries', 'index.json'))).toBe(true);
            
            // Clean up
            await fs.remove(outputDir);
        });
    });

    describe('Validation', () => {
        test('should validate library structure', () => {
            const validLibrary = {
                pattern_library_version: '1.0.0',
                scope: 'test',
                patterns: {
                    TEST_PATTERN: {
                        signature: 'Test signature',
                        confidence: 0.8
                    }
                }
            };

            expect(() => manager.validateLibrary(validLibrary)).not.toThrow();
        });

        test('should reject invalid library structure', () => {
            const invalidLibrary = {
                // Missing required fields
                patterns: {}
            };

            expect(() => manager.validateLibrary(invalidLibrary)).toThrow();
        });
    });
});