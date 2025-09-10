#!/usr/bin/env node

/**
 * Pre-Publish Validation Script for Test Validation Extension Pack
 * 
 * This script validates the package before publishing to ensure:
 * - Code quality standards are met
 * - All tests pass
 * - Documentation is complete
 * - Version is properly incremented
 * - Security checks pass
 * - Distribution package is valid
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import semver from 'semver';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class PrePublishValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.checks = 0;
        this.passed = 0;
    }

    async validate() {
        console.log(chalk.blue('🔍 Running pre-publish validation...'));
        
        try {
            await this.checkPackageIntegrity();
            await this.validateVersion();
            await this.runTests();
            await this.checkCodeQuality();
            await this.validateDocumentation();
            await this.checkSecurity();
            await this.validateDistribution();
            await this.checkDependencies();
            
            this.printSummary();
            
            if (this.errors.length > 0) {
                throw new Error(`Validation failed with ${this.errors.length} errors`);
            }
            
            console.log(chalk.green('✅ All pre-publish validations passed!'));
            console.log(chalk.blue('📦 Package is ready for publishing'));
            
        } catch (error) {
            console.error(chalk.red(`❌ Pre-publish validation failed: ${error.message}`));
            process.exit(1);
        }
    }

    async checkPackageIntegrity() {
        console.log(chalk.yellow('📦 Checking package integrity...'));
        this.checks++;

        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            // Required fields
            const requiredFields = ['name', 'version', 'description', 'main', 'author', 'license'];
            const missingFields = requiredFields.filter(field => !packageJson[field]);
            
            if (missingFields.length > 0) {
                this.errors.push(`Missing required package.json fields: ${missingFields.join(', ')}`);
            }
            
            // Validate name format
            if (packageJson.name && !packageJson.name.match(/^[@a-z0-9][a-z0-9\-_.]*$/)) {
                this.errors.push('Package name contains invalid characters');
            }
            
            // Check files field
            if (!packageJson.files || packageJson.files.length === 0) {
                this.warnings.push('No files field specified in package.json - all files will be published');
            }
            
            // Validate scripts
            const requiredScripts = ['test', 'lint'];
            const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script]);
            
            if (missingScripts.length > 0) {
                this.warnings.push(`Missing recommended scripts: ${missingScripts.join(', ')}`);
            }
            
            // Check for development keywords
            const devKeywords = ['test', 'dev', 'debug', 'temp'];
            const hasDevKeywords = packageJson.keywords?.some(keyword => 
                devKeywords.some(devKeyword => keyword.toLowerCase().includes(devKeyword))
            );
            
            if (hasDevKeywords) {
                this.warnings.push('Package keywords contain development-related terms');
            }
            
            this.passed++;
            console.log(chalk.green('✅ Package integrity check passed'));
            
        } catch (error) {
            this.errors.push(`Package integrity check failed: ${error.message}`);
        }
    }

    async validateVersion() {
        console.log(chalk.yellow('🔖 Validating version...'));
        this.checks++;

        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            const currentVersion = packageJson.version;
            
            if (!semver.valid(currentVersion)) {
                this.errors.push(`Invalid version format: ${currentVersion}`);
                return;
            }
            
            // Check if version follows semver
            if (!semver.clean(currentVersion)) {
                this.warnings.push('Version does not follow strict semver format');
            }
            
            // Check against NPM registry (if package exists)
            try {
                const { stdout } = await execAsync(`npm view ${packageJson.name} version`, { 
                    stdio: 'pipe',
                    cwd: rootDir 
                });
                
                const publishedVersion = stdout.trim();
                
                if (publishedVersion && !semver.gt(currentVersion, publishedVersion)) {
                    this.errors.push(`Version ${currentVersion} must be greater than published version ${publishedVersion}`);
                } else if (publishedVersion) {
                    console.log(chalk.blue(`  Current: ${currentVersion}, Published: ${publishedVersion}`));
                }
                
            } catch (error) {
                // Package might not exist yet, which is fine
                console.log(chalk.gray('  Package not found in registry (new package)'));
            }
            
            this.passed++;
            console.log(chalk.green('✅ Version validation passed'));
            
        } catch (error) {
            this.errors.push(`Version validation failed: ${error.message}`);
        }
    }

    async runTests() {
        console.log(chalk.yellow('🧪 Running tests...'));
        this.checks++;

        try {
            // Check if test script exists
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            if (!packageJson.scripts?.test) {
                this.warnings.push('No test script defined');
                return;
            }
            
            console.log(chalk.blue('  Running test suite...'));
            const { stdout, stderr } = await execAsync('npm test', { 
                cwd: rootDir,
                env: { ...process.env, NODE_ENV: 'test' }
            });
            
            // Parse test results
            if (stdout.includes('FAIL') || stderr.includes('FAIL')) {
                this.errors.push('Some tests are failing');
                console.log(chalk.red('  Tests failed'));
            } else {
                this.passed++;
                console.log(chalk.green('✅ All tests passed'));
            }
            
            // Check test coverage if available
            if (stdout.includes('Coverage')) {
                const coverageMatch = stdout.match(/All files[^\n]*?(\d+(?:\.\d+)?)/);
                if (coverageMatch) {
                    const coverage = parseFloat(coverageMatch[1]);
                    if (coverage < 80) {
                        this.warnings.push(`Test coverage is ${coverage}% (recommended: >80%)`);
                    } else {
                        console.log(chalk.green(`  Coverage: ${coverage}%`));
                    }
                }
            }
            
        } catch (error) {
            this.errors.push(`Test execution failed: ${error.message}`);
        }
    }

    async checkCodeQuality() {
        console.log(chalk.yellow('✨ Checking code quality...'));
        this.checks++;

        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            // Run linting if available
            if (packageJson.scripts?.lint) {
                console.log(chalk.blue('  Running linter...'));
                
                try {
                    await execAsync('npm run lint', { cwd: rootDir });
                    console.log(chalk.green('  ✅ Linting passed'));
                } catch (error) {
                    if (error.stdout?.includes('error') || error.stderr?.includes('error')) {
                        this.errors.push('Code linting failed - fix linting errors before publishing');
                    } else {
                        this.warnings.push('Linting warnings found');
                    }
                }
            } else {
                this.warnings.push('No lint script defined');
            }
            
            // Check formatting if available
            if (packageJson.scripts?.['format:check']) {
                console.log(chalk.blue('  Checking code formatting...'));
                
                try {
                    await execAsync('npm run format:check', { cwd: rootDir });
                    console.log(chalk.green('  ✅ Code formatting is consistent'));
                } catch (error) {
                    this.warnings.push('Code formatting issues detected - run format script');
                }
            }
            
            this.passed++;
            console.log(chalk.green('✅ Code quality check completed'));
            
        } catch (error) {
            this.errors.push(`Code quality check failed: ${error.message}`);
        }
    }

    async validateDocumentation() {
        console.log(chalk.yellow('📚 Validating documentation...'));
        this.checks++;

        try {
            const requiredDocs = [
                { file: 'README.md', required: true },
                { file: 'LICENSE', required: true },
                { file: 'CHANGELOG.md', required: false }
            ];

            for (const doc of requiredDocs) {
                try {
                    const content = await fs.readFile(path.join(rootDir, doc.file), 'utf-8');
                    
                    if (doc.file === 'README.md') {
                        // Basic README validation
                        const hasTitle = content.includes('#');
                        const hasInstallation = content.toLowerCase().includes('install');
                        const hasUsage = content.toLowerCase().includes('usage');
                        
                        if (!hasTitle) this.warnings.push('README.md missing title');
                        if (!hasInstallation) this.warnings.push('README.md missing installation instructions');
                        if (!hasUsage) this.warnings.push('README.md missing usage information');
                        
                        if (content.length < 200) {
                            this.warnings.push('README.md seems very short - consider adding more details');
                        }
                    }
                    
                    console.log(chalk.green(`  ✅ ${doc.file} exists`));
                    
                } catch (error) {
                    if (doc.required) {
                        this.errors.push(`Missing required documentation: ${doc.file}`);
                    } else {
                        this.warnings.push(`Missing optional documentation: ${doc.file}`);
                    }
                }
            }
            
            this.passed++;
            console.log(chalk.green('✅ Documentation validation completed'));
            
        } catch (error) {
            this.errors.push(`Documentation validation failed: ${error.message}`);
        }
    }

    async checkSecurity() {
        console.log(chalk.yellow('🔒 Running security checks...'));
        this.checks++;

        try {
            // Check for common security issues in package.json
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            // Check for postinstall scripts (potential security risk)
            if (packageJson.scripts?.postinstall) {
                this.warnings.push('Package contains postinstall script - ensure it\'s necessary and safe');
            }
            
            // Check for preinstall scripts
            if (packageJson.scripts?.preinstall) {
                this.warnings.push('Package contains preinstall script - ensure it\'s necessary and safe');
            }
            
            // NPM audit (if available)
            try {
                console.log(chalk.blue('  Running npm audit...'));
                await execAsync('npm audit --audit-level moderate', { cwd: rootDir });
                console.log(chalk.green('  ✅ No security vulnerabilities found'));
            } catch (error) {
                if (error.message.includes('found') && error.message.includes('vulnerability')) {
                    this.errors.push('Security vulnerabilities found - run npm audit fix');
                } else {
                    this.warnings.push('Could not run security audit');
                }
            }
            
            // Check for sensitive files that shouldn't be published
            const sensitiveFiles = ['.env', '.env.local', '.env.production', 'config/secrets.js', 'private.key'];
            const existingSensitiveFiles = [];
            
            for (const file of sensitiveFiles) {
                try {
                    await fs.access(path.join(rootDir, file));
                    existingSensitiveFiles.push(file);
                } catch (error) {
                    // File doesn't exist, which is good
                }
            }
            
            if (existingSensitiveFiles.length > 0) {
                this.errors.push(`Potentially sensitive files found: ${existingSensitiveFiles.join(', ')}`);
            }
            
            this.passed++;
            console.log(chalk.green('✅ Security checks completed'));
            
        } catch (error) {
            this.errors.push(`Security check failed: ${error.message}`);
        }
    }

    async validateDistribution() {
        console.log(chalk.yellow('📦 Validating distribution package...'));
        this.checks++;

        try {
            // Check if build script exists and run it
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            if (packageJson.scripts?.build) {
                console.log(chalk.blue('  Running build...'));
                await execAsync('npm run build', { cwd: rootDir });
                console.log(chalk.green('  ✅ Build completed'));
            }
            
            // Validate files field against actual files
            if (packageJson.files) {
                console.log(chalk.blue('  Validating files field...'));
                
                for (const file of packageJson.files) {
                    try {
                        await fs.access(path.join(rootDir, file));
                        console.log(chalk.green(`    ✅ ${file}`));
                    } catch (error) {
                        this.errors.push(`File specified in package.json files field does not exist: ${file}`);
                    }
                }
            }
            
            // Check main entry point
            if (packageJson.main) {
                try {
                    await fs.access(path.join(rootDir, packageJson.main));
                    console.log(chalk.green(`  ✅ Main entry point exists: ${packageJson.main}`));
                } catch (error) {
                    this.errors.push(`Main entry point does not exist: ${packageJson.main}`);
                }
            }
            
            this.passed++;
            console.log(chalk.green('✅ Distribution validation completed'));
            
        } catch (error) {
            this.errors.push(`Distribution validation failed: ${error.message}`);
        }
    }

    async checkDependencies() {
        console.log(chalk.yellow('📋 Checking dependencies...'));
        this.checks++;

        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            // Check for outdated dependencies
            try {
                console.log(chalk.blue('  Checking for outdated dependencies...'));
                const { stdout } = await execAsync('npm outdated --json', { cwd: rootDir });
                
                if (stdout.trim()) {
                    const outdated = JSON.parse(stdout);
                    const outdatedCount = Object.keys(outdated).length;
                    
                    if (outdatedCount > 0) {
                        this.warnings.push(`${outdatedCount} dependencies are outdated`);
                        
                        // Check for major version updates
                        const majorUpdates = Object.entries(outdated).filter(
                            ([, info]) => info.wanted !== info.latest
                        );
                        
                        if (majorUpdates.length > 0) {
                            this.warnings.push(`${majorUpdates.length} dependencies have major version updates available`);
                        }
                    }
                }
            } catch (error) {
                // npm outdated returns non-zero exit code when outdated packages exist
                if (error.stdout) {
                    const outdated = JSON.parse(error.stdout);
                    const outdatedCount = Object.keys(outdated).length;
                    this.warnings.push(`${outdatedCount} dependencies are outdated`);
                }
            }
            
            // Check for unused dependencies (basic check)
            const allDeps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
            
            const srcFiles = await this.getAllJSFiles(path.join(rootDir, 'src'));
            const usedDeps = new Set();
            
            for (const file of srcFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const importMatches = content.match(/(?:import|require)\s*\(?['"][^'"]+['"]\)?/g) || [];
                
                importMatches.forEach(match => {
                    const depMatch = match.match(/['"]([^'"]+)['"]/);
                    if (depMatch && !depMatch[1].startsWith('.') && !depMatch[1].startsWith('/')) {
                        const depName = depMatch[1].split('/')[0];
                        if (allDeps[depName]) {
                            usedDeps.add(depName);
                        }
                    }
                });
            }
            
            const unusedDeps = Object.keys(packageJson.dependencies || {}).filter(dep => !usedDeps.has(dep));
            if (unusedDeps.length > 0) {
                this.warnings.push(`Potentially unused dependencies: ${unusedDeps.join(', ')}`);
            }
            
            this.passed++;
            console.log(chalk.green('✅ Dependencies check completed'));
            
        } catch (error) {
            this.errors.push(`Dependencies check failed: ${error.message}`);
        }
    }

    async getAllJSFiles(dir) {
        const files = [];
        
        async function walk(currentDir) {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await walk(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
        }
        
        try {
            await walk(dir);
        } catch (error) {
            // Directory might not exist
        }
        
        return files;
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Pre-Publish Validation Summary:'));
        console.log(chalk.blue(`🔍 Total checks: ${this.checks}`));
        console.log(chalk.green(`✅ Passed: ${this.passed}`));
        console.log(chalk.red(`❌ Failed: ${this.checks - this.passed}`));
        
        if (this.errors.length > 0) {
            console.log(chalk.red(`\n❌ Errors (${this.errors.length}):`));
            this.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️  Warnings (${this.warnings.length}):`));
            this.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green('\n✅ All validations passed with no issues!'));
        }
    }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new PrePublishValidator();
    validator.validate().catch(error => {
        console.error(chalk.red(`Fatal validation error: ${error.message}`));
        process.exit(1);
    });
}

export default PrePublishValidator;