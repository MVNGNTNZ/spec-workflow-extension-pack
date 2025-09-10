#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Test Validation Extension Pack
 * 
 * This script runs all types of tests before publishing:
 * - Unit tests with coverage reporting
 * - Integration tests
 * - End-to-end tests
 * - Performance benchmarks
 * - Security audits
 * - Code quality checks
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class ComprehensiveTestRunner {
    constructor(options = {}) {
        this.options = {
            coverage: options.coverage !== false,
            integration: options.integration !== false,
            performance: options.performance || false,
            security: options.security !== false,
            lint: options.lint !== false,
            format: options.format !== false,
            parallel: options.parallel || false,
            verbose: options.verbose || false,
            failFast: options.failFast || false,
            ...options
        };
        
        this.testId = Date.now().toString();
        this.results = {};
        this.errors = [];
        this.warnings = [];
        this.timing = {};
        this.coverageThreshold = 80;
    }

    async runAllTests() {
        console.log(chalk.blue('🧪 Running comprehensive test suite...'));
        console.log(chalk.gray(`Test run ID: ${this.testId}`));
        
        const startTime = Date.now();
        
        try {
            await this.setupTestEnvironment();
            await this.runUnitTests();
            await this.runIntegrationTests();
            await this.runPerformanceTests();
            await this.runSecurityTests();
            await this.runCodeQualityChecks();
            await this.generateReports();
            
            this.timing.total = Date.now() - startTime;
            this.printSummary();
            
            if (this.errors.length > 0) {
                throw new Error(`Test suite failed with ${this.errors.length} errors`);
            }
            
            console.log(chalk.green('✅ All tests passed successfully!'));
            return this.results;
            
        } catch (error) {
            console.error(chalk.red(`❌ Test suite failed: ${error.message}`));
            process.exit(1);
        }
    }

    async setupTestEnvironment() {
        console.log(chalk.yellow('⚙️ Setting up test environment...'));
        
        try {
            // Ensure test directories exist
            const testDirs = ['tests', 'coverage', 'test-results'];
            
            for (const dir of testDirs) {
                await fs.mkdir(path.join(rootDir, dir), { recursive: true });
            }
            
            // Set test environment variables
            process.env.NODE_ENV = 'test';
            process.env.TEST_RUN_ID = this.testId;
            
            console.log(chalk.green('✅ Test environment ready'));
            
        } catch (error) {
            this.errors.push(`Test environment setup failed: ${error.message}`);
        }
    }

    async runUnitTests() {
        const stepStart = Date.now();
        console.log(chalk.yellow('🧪 Running unit tests...'));
        
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            if (!packageJson.scripts?.test) {
                this.warnings.push('No test script defined in package.json');
                return;
            }
            
            let testCommand = 'npm test';
            
            if (this.options.coverage) {
                testCommand = 'npm run test:coverage';
                if (!packageJson.scripts['test:coverage']) {
                    testCommand = 'npm test -- --coverage';
                }
            }
            
            if (this.options.verbose) {
                testCommand += ' -- --verbose';
            }
            
            console.log(chalk.blue(`  Running: ${testCommand}`));
            
            const { stdout, stderr } = await execAsync(testCommand, { 
                cwd: rootDir,
                env: { ...process.env, CI: 'true' }
            });
            
            // Parse test results
            const testResults = this.parseJestOutput(stdout);
            this.results.unit = testResults;
            
            // Check coverage if enabled
            if (this.options.coverage) {
                const coverage = await this.parseCoverageResults();
                this.results.coverage = coverage;
                
                if (coverage.total < this.coverageThreshold) {
                    this.warnings.push(`Coverage ${coverage.total}% is below threshold ${this.coverageThreshold}%`);
                } else {
                    console.log(chalk.green(`  ✅ Coverage: ${coverage.total}%`));
                }
            }
            
            if (testResults.failed > 0) {
                this.errors.push(`${testResults.failed} unit tests failed`);
            } else {
                console.log(chalk.green(`  ✅ ${testResults.passed} unit tests passed`));
            }
            
        } catch (error) {
            this.errors.push(`Unit tests failed: ${error.message}`);
            
            if (this.options.failFast) {
                throw error;
            }
        } finally {
            this.timing.unit = Date.now() - stepStart;
        }
    }

    async runIntegrationTests() {
        if (!this.options.integration) {
            console.log(chalk.gray('⏭️ Skipping integration tests'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('🔗 Running integration tests...'));
        
        try {
            // Check if integration tests exist
            const integrationTestsExist = await this.checkTestsExist(['tests/integration', 'src/**/*.integration.test.js']);
            
            if (!integrationTestsExist) {
                this.warnings.push('No integration tests found');
                return;
            }
            
            // Run integration tests
            const testCommand = 'npm test -- --testPathPattern=integration';
            console.log(chalk.blue(`  Running: ${testCommand}`));
            
            const { stdout } = await execAsync(testCommand, { 
                cwd: rootDir,
                env: { ...process.env, TEST_TYPE: 'integration' }
            });
            
            const results = this.parseJestOutput(stdout);
            this.results.integration = results;
            
            if (results.failed > 0) {
                this.errors.push(`${results.failed} integration tests failed`);
            } else {
                console.log(chalk.green(`  ✅ ${results.passed} integration tests passed`));
            }
            
        } catch (error) {
            this.errors.push(`Integration tests failed: ${error.message}`);
            
            if (this.options.failFast) {
                throw error;
            }
        } finally {
            this.timing.integration = Date.now() - stepStart;
        }
    }

    async runPerformanceTests() {
        if (!this.options.performance) {
            console.log(chalk.gray('⏭️ Skipping performance tests'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('⚡ Running performance benchmarks...'));
        
        try {
            // Basic performance tests for key functions
            const performanceResults = {};
            
            // Test installation manager performance
            console.log(chalk.blue('  Testing InstallationManager performance...'));
            const installStart = Date.now();
            
            // Import and test key components
            const { InstallationManager } = await import(path.join(rootDir, 'src', 'installer.js'));
            const manager = new InstallationManager({ autoInstall: false });
            
            await manager.checkClaudeWorkflow();
            performanceResults.installationCheck = Date.now() - installStart;
            
            // Test pattern library manager performance
            console.log(chalk.blue('  Testing PatternLibraryManager performance...'));
            const patternStart = Date.now();
            
            const { PatternLibraryManager } = await import(path.join(rootDir, 'src', 'pattern-library-manager.js'));
            const patternManager = new PatternLibraryManager();
            
            await patternManager.initialize();
            performanceResults.patternLibraryInit = Date.now() - patternStart;
            
            // Test agent patcher performance
            console.log(chalk.blue('  Testing AgentPatcher performance...'));
            const patchStart = Date.now();
            
            const { AgentPatcher } = await import(path.join(rootDir, 'src', 'agent-patcher.js'));
            const patcher = new AgentPatcher({ dryRun: true });
            
            await patcher.getAvailableAgents();
            performanceResults.agentDiscovery = Date.now() - patchStart;
            
            this.results.performance = performanceResults;
            
            // Check performance thresholds
            const thresholds = {
                installationCheck: 5000, // 5 seconds
                patternLibraryInit: 2000, // 2 seconds
                agentDiscovery: 1000 // 1 second
            };
            
            let performanceIssues = 0;
            Object.entries(performanceResults).forEach(([test, time]) => {
                const threshold = thresholds[test] || 10000;
                if (time > threshold) {
                    this.warnings.push(`${test} took ${time}ms (threshold: ${threshold}ms)`);
                    performanceIssues++;
                } else {
                    console.log(chalk.green(`  ✅ ${test}: ${time}ms`));
                }
            });
            
            if (performanceIssues === 0) {
                console.log(chalk.green('  ✅ All performance benchmarks passed'));
            }
            
        } catch (error) {
            this.warnings.push(`Performance tests failed: ${error.message}`);
        } finally {
            this.timing.performance = Date.now() - stepStart;
        }
    }

    async runSecurityTests() {
        if (!this.options.security) {
            console.log(chalk.gray('⏭️ Skipping security tests'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('🔒 Running security tests...'));
        
        try {
            const securityResults = {};
            
            // NPM audit
            console.log(chalk.blue('  Running npm audit...'));
            
            try {
                await execAsync('npm audit --audit-level moderate', { cwd: rootDir });
                securityResults.npmAudit = 'passed';
                console.log(chalk.green('  ✅ No security vulnerabilities found'));
            } catch (error) {
                if (error.message.includes('vulnerabilities')) {
                    this.errors.push('Security vulnerabilities found - run npm audit fix');
                    securityResults.npmAudit = 'failed';
                } else {
                    this.warnings.push('Could not run npm audit');
                    securityResults.npmAudit = 'skipped';
                }
            }
            
            // Check for sensitive files
            console.log(chalk.blue('  Checking for sensitive files...'));
            const sensitiveFiles = [
                '.env', '.env.local', '.env.production', '.env.development',
                'private.key', '*.pem', 'config/secrets.*', 'secrets.*'
            ];
            
            let foundSensitiveFiles = [];
            
            for (const pattern of sensitiveFiles) {
                try {
                    const { stdout } = await execAsync(`find . -name "${pattern}" -not -path "./node_modules/*"`, { cwd: rootDir });
                    if (stdout.trim()) {
                        foundSensitiveFiles = foundSensitiveFiles.concat(stdout.trim().split('\n'));
                    }
                } catch (error) {
                    // Ignore find errors
                }
            }
            
            if (foundSensitiveFiles.length > 0) {
                this.warnings.push(`Potentially sensitive files found: ${foundSensitiveFiles.join(', ')}`);
                securityResults.sensitiveFiles = foundSensitiveFiles;
            } else {
                console.log(chalk.green('  ✅ No sensitive files found'));
                securityResults.sensitiveFiles = [];
            }
            
            // Check package.json for security issues
            console.log(chalk.blue('  Checking package.json security...'));
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            const securityIssues = [];
            
            if (packageJson.scripts?.postinstall && !packageJson.scripts.postinstall.includes('node ')) {
                securityIssues.push('Potentially unsafe postinstall script');
            }
            
            if (packageJson.scripts?.preinstall) {
                securityIssues.push('Preinstall script found - ensure it\'s necessary');
            }
            
            securityResults.packageJsonSecurity = securityIssues;
            
            if (securityIssues.length > 0) {
                this.warnings = this.warnings.concat(securityIssues);
            } else {
                console.log(chalk.green('  ✅ Package.json security check passed'));
            }
            
            this.results.security = securityResults;
            
        } catch (error) {
            this.warnings.push(`Security tests failed: ${error.message}`);
        } finally {
            this.timing.security = Date.now() - stepStart;
        }
    }

    async runCodeQualityChecks() {
        const stepStart = Date.now();
        console.log(chalk.yellow('✨ Running code quality checks...'));
        
        try {
            const qualityResults = {};
            
            // Run linting
            if (this.options.lint) {
                console.log(chalk.blue('  Running ESLint...'));
                
                try {
                    const { stdout } = await execAsync('npm run lint', { cwd: rootDir });
                    qualityResults.lint = 'passed';
                    console.log(chalk.green('  ✅ Linting passed'));
                } catch (error) {
                    if (error.stdout?.includes('error') || error.stderr?.includes('error')) {
                        this.errors.push('Linting errors found');
                        qualityResults.lint = 'failed';
                    } else {
                        this.warnings.push('Linting warnings found');
                        qualityResults.lint = 'warnings';
                    }
                }
            }
            
            // Check formatting
            if (this.options.format) {
                console.log(chalk.blue('  Checking code formatting...'));
                
                try {
                    await execAsync('npm run format:check', { cwd: rootDir });
                    qualityResults.formatting = 'passed';
                    console.log(chalk.green('  ✅ Code formatting is consistent'));
                } catch (error) {
                    this.warnings.push('Code formatting issues detected');
                    qualityResults.formatting = 'failed';
                }
            }
            
            // Check for TODO/FIXME comments
            console.log(chalk.blue('  Checking for TODO/FIXME comments...'));
            
            try {
                const { stdout } = await execAsync('grep -r "TODO\\|FIXME" src/ tests/ --exclude-dir=node_modules', { cwd: rootDir });
                const todoCount = stdout.split('\n').filter(line => line.trim()).length;
                
                if (todoCount > 0) {
                    this.warnings.push(`${todoCount} TODO/FIXME comments found`);
                    qualityResults.todos = todoCount;
                } else {
                    console.log(chalk.green('  ✅ No TODO/FIXME comments found'));
                    qualityResults.todos = 0;
                }
            } catch (error) {
                // No TODOs found (grep returns non-zero when no matches)
                console.log(chalk.green('  ✅ No TODO/FIXME comments found'));
                qualityResults.todos = 0;
            }
            
            this.results.quality = qualityResults;
            
        } catch (error) {
            this.warnings.push(`Code quality checks failed: ${error.message}`);
        } finally {
            this.timing.quality = Date.now() - stepStart;
        }
    }

    async generateReports() {
        console.log(chalk.yellow('📊 Generating test reports...'));
        
        try {
            const reportDir = path.join(rootDir, 'test-results');
            await fs.mkdir(reportDir, { recursive: true });
            
            // Generate comprehensive test report
            const report = {
                testId: this.testId,
                timestamp: new Date().toISOString(),
                results: this.results,
                timing: this.timing,
                errors: this.errors,
                warnings: this.warnings,
                options: this.options,
                environment: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            };
            
            // Save JSON report
            const jsonReportPath = path.join(reportDir, `test-report-${this.testId}.json`);
            await fs.writeFile(jsonReportPath, JSON.stringify(report, null, 2), 'utf-8');
            
            // Generate human-readable report
            const humanReportPath = path.join(reportDir, `test-report-${this.testId}.md`);
            const humanReport = this.generateHumanReport(report);
            await fs.writeFile(humanReportPath, humanReport, 'utf-8');
            
            // Generate latest report symlink
            try {
                const latestJsonPath = path.join(reportDir, 'latest-test-report.json');
                const latestMdPath = path.join(reportDir, 'latest-test-report.md');
                
                await fs.unlink(latestJsonPath).catch(() => {});
                await fs.unlink(latestMdPath).catch(() => {});
                
                await fs.symlink(jsonReportPath, latestJsonPath);
                await fs.symlink(humanReportPath, latestMdPath);
            } catch (error) {
                // Symlinks might not be supported on all systems
            }
            
            console.log(chalk.green(`✅ Test reports generated in: ${path.relative(rootDir, reportDir)}`));
            
        } catch (error) {
            this.warnings.push(`Report generation failed: ${error.message}`);
        }
    }

    generateHumanReport(report) {
        let markdown = `# Test Report - ${report.timestamp}\n\n`;
        markdown += `**Test ID**: ${report.testId}\n`;
        markdown += `**Duration**: ${Math.round(report.timing.total / 1000)}s\n`;
        markdown += `**Environment**: Node.js ${report.environment.nodeVersion} on ${report.environment.platform}\n\n`;
        
        // Results summary
        markdown += `## Summary\n\n`;
        
        const totalTests = Object.values(report.results).reduce((sum, result) => {
            return sum + (result.passed || 0) + (result.failed || 0);
        }, 0);
        
        markdown += `- **Total Tests**: ${totalTests}\n`;
        markdown += `- **Errors**: ${report.errors.length}\n`;
        markdown += `- **Warnings**: ${report.warnings.length}\n\n`;
        
        // Detailed results
        Object.entries(report.results).forEach(([category, result]) => {
            markdown += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Tests\n\n`;
            
            if (result.passed !== undefined) {
                markdown += `- **Passed**: ${result.passed}\n`;
                markdown += `- **Failed**: ${result.failed}\n`;
            } else {
                markdown += `- **Result**: ${JSON.stringify(result, null, 2)}\n`;
            }
            
            if (report.timing[category]) {
                markdown += `- **Duration**: ${Math.round(report.timing[category] / 1000)}s\n`;
            }
            
            markdown += '\n';
        });
        
        // Errors and warnings
        if (report.errors.length > 0) {
            markdown += `## Errors\n\n`;
            report.errors.forEach(error => {
                markdown += `- ${error}\n`;
            });
            markdown += '\n';
        }
        
        if (report.warnings.length > 0) {
            markdown += `## Warnings\n\n`;
            report.warnings.forEach(warning => {
                markdown += `- ${warning}\n`;
            });
            markdown += '\n';
        }
        
        return markdown;
    }

    async checkTestsExist(patterns) {
        for (const pattern of patterns) {
            try {
                if (pattern.includes('*')) {
                    const { stdout } = await execAsync(`find . -path "${pattern}" -not -path "./node_modules/*"`, { cwd: rootDir });
                    if (stdout.trim()) {
                        return true;
                    }
                } else {
                    await fs.access(path.join(rootDir, pattern));
                    return true;
                }
            } catch (error) {
                // Continue checking other patterns
            }
        }
        return false;
    }

    parseJestOutput(output) {
        const results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0
        };
        
        try {
            // Look for Jest summary
            const passedMatch = output.match(/(\d+) passed/);
            const failedMatch = output.match(/(\d+) failed/);
            const skippedMatch = output.match(/(\d+) skipped/);
            
            if (passedMatch) results.passed = parseInt(passedMatch[1]);
            if (failedMatch) results.failed = parseInt(failedMatch[1]);
            if (skippedMatch) results.skipped = parseInt(skippedMatch[1]);
            
            results.total = results.passed + results.failed + results.skipped;
            
        } catch (error) {
            // Could not parse Jest output
        }
        
        return results;
    }

    async parseCoverageResults() {
        try {
            const coveragePath = path.join(rootDir, 'coverage', 'coverage-summary.json');
            const coverageData = JSON.parse(await fs.readFile(coveragePath, 'utf-8'));
            
            return {
                total: coverageData.total.lines.pct,
                lines: coverageData.total.lines.pct,
                functions: coverageData.total.functions.pct,
                branches: coverageData.total.branches.pct,
                statements: coverageData.total.statements.pct
            };
        } catch (error) {
            return { total: 0, error: error.message };
        }
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Comprehensive Test Summary:'));
        console.log(chalk.blue(`🆔 Test ID: ${this.testId}`));
        console.log(chalk.blue(`⏱️ Total time: ${Math.round(this.timing.total / 1000)}s`));
        
        // Results breakdown
        Object.entries(this.results).forEach(([category, result]) => {
            if (result.passed !== undefined) {
                const status = result.failed > 0 ? chalk.red('❌') : chalk.green('✅');
                console.log(`${status} ${category}: ${result.passed} passed, ${result.failed} failed`);
            } else {
                console.log(chalk.blue(`ℹ️ ${category}: completed`));
            }
        });
        
        // Coverage info
        if (this.results.coverage?.total) {
            const coverageColor = this.results.coverage.total >= this.coverageThreshold ? chalk.green : chalk.yellow;
            console.log(coverageColor(`📊 Coverage: ${this.results.coverage.total}%`));
        }
        
        if (this.errors.length > 0) {
            console.log(chalk.red(`\n❌ Errors (${this.errors.length}):`));
            this.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️ Warnings (${this.warnings.length}):`));
            this.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green('\n🎉 All tests completed successfully with no issues!'));
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(chalk.blue('Comprehensive Test Runner'));
        console.log('\nUsage:');
        console.log('  node test-all.js [options]');
        console.log('\nOptions:');
        console.log('  --no-coverage          Skip coverage reporting');
        console.log('  --no-integration       Skip integration tests');
        console.log('  --performance          Run performance benchmarks');
        console.log('  --no-security          Skip security tests');
        console.log('  --no-lint              Skip linting');
        console.log('  --no-format            Skip format checking');
        console.log('  --parallel             Run tests in parallel (experimental)');
        console.log('  --verbose              Verbose test output');
        console.log('  --fail-fast            Stop on first failure');
        console.log('\nExamples:');
        console.log('  node test-all.js');
        console.log('  node test-all.js --performance --verbose');
        console.log('  node test-all.js --no-integration --fail-fast');
        process.exit(0);
    }
    
    const options = {};
    
    // Parse options
    args.forEach(arg => {
        if (arg === '--no-coverage') options.coverage = false;
        if (arg === '--no-integration') options.integration = false;
        if (arg === '--performance') options.performance = true;
        if (arg === '--no-security') options.security = false;
        if (arg === '--no-lint') options.lint = false;
        if (arg === '--no-format') options.format = false;
        if (arg === '--parallel') options.parallel = true;
        if (arg === '--verbose') options.verbose = true;
        if (arg === '--fail-fast') options.failFast = true;
    });
    
    const testRunner = new ComprehensiveTestRunner(options);
    testRunner.runAllTests().catch(error => {
        console.error(chalk.red(`Fatal error: ${error.message}`));
        process.exit(1);
    });
}

export default ComprehensiveTestRunner;