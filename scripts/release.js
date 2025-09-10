#!/usr/bin/env node

/**
 * Master Release Script for Test Validation Extension Pack
 * 
 * This script orchestrates the complete release process:
 * - Version management (bump, changelog, tagging)
 * - Comprehensive testing
 * - Build and packaging
 * - Publishing to NPM
 * - Post-release verification
 */

import { promises as fs } from 'fs';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

// Import our workflow scripts
import VersionManager from './version.js';
import ComprehensiveTestRunner from './test-all.js';
import ExtensionBuilder from './build.js';
import PackageDistributor from './package.js';
import PublishWorkflow from './publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class ReleaseOrchestrator {
    constructor(options = {}) {
        this.options = {
            dryRun: options.dryRun || false,
            versionType: options.versionType || 'patch',
            customVersion: options.customVersion || null,
            skipTests: options.skipTests || false,
            skipBuild: options.skipBuild || false,
            skipPublish: options.skipPublish || false,
            skipGit: options.skipGit || false,
            interactive: options.interactive || false,
            ...options
        };
        
        this.releaseId = Date.now().toString();
        this.releaseInfo = {
            id: this.releaseId,
            startTime: new Date().toISOString(),
            steps: [],
            timing: {},
            errors: [],
            warnings: []
        };
    }

    async release() {
        console.log(chalk.blue('🚀 Starting complete release process...'));
        console.log(chalk.gray(`Release ID: ${this.releaseId}`));
        
        if (this.options.dryRun) {
            console.log(chalk.yellow('🔍 DRY RUN MODE - No actual changes will be made'));
        }
        
        const startTime = Date.now();
        
        try {
            await this.showPreReleaseInfo();
            
            if (this.options.interactive) {
                await this.confirmRelease();
            }
            
            await this.bumpVersion();
            await this.runTests();
            await this.buildPackage();
            await this.createDistributions();
            await this.publishPackage();
            await this.verifyRelease();
            await this.saveReleaseInfo();
            
            this.releaseInfo.timing.total = Date.now() - startTime;
            this.releaseInfo.endTime = new Date().toISOString();
            this.printSummary();
            
            if (this.releaseInfo.errors.length > 0) {
                throw new Error(`Release failed with ${this.releaseInfo.errors.length} errors`);
            }
            
            console.log(chalk.green('✅ Release completed successfully!'));
            await this.showPostReleaseInfo();
            
        } catch (error) {
            console.error(chalk.red(`❌ Release failed: ${error.message}`));
            await this.saveReleaseInfo(error);
            process.exit(1);
        }
    }

    async showPreReleaseInfo() {
        console.log(chalk.yellow('📋 Pre-release information...'));
        
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            const versionManager = new VersionManager({ skipGit: this.options.skipGit });
            const versionInfo = await versionManager.getVersionInfo();
            
            console.log(chalk.blue(`📦 Package: ${packageJson.name}`));
            console.log(chalk.blue(`🔖 Current version: ${versionInfo.current}`));
            
            let nextVersion;
            if (this.options.customVersion) {
                nextVersion = this.options.customVersion;
            } else {
                nextVersion = versionInfo[`next${this.options.versionType.charAt(0).toUpperCase() + this.options.versionType.slice(1)}`];
            }
            
            console.log(chalk.blue(`🔖 Next version: ${nextVersion}`));
            console.log(chalk.blue(`🏷️  Last tag: ${versionInfo.lastTag || 'none'}`));
            console.log(chalk.blue(`📝 Total commits: ${versionInfo.commitCount || 0}`));
            console.log(chalk.blue(`🎯 Release type: ${this.options.versionType}`));
            
            this.releaseInfo.package = {
                name: packageJson.name,
                currentVersion: versionInfo.current,
                nextVersion: nextVersion,
                lastTag: versionInfo.lastTag,
                commitCount: versionInfo.commitCount,
                releaseType: this.options.versionType
            };
            
        } catch (error) {
            this.releaseInfo.errors.push(`Pre-release info failed: ${error.message}`);
        }
    }

    async confirmRelease() {
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question(chalk.yellow('Continue with release? (y/N): '), (answer) => {
                rl.close();
                
                if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                    console.log(chalk.gray('Release cancelled by user'));
                    process.exit(0);
                }
                
                resolve();
            });
        });
    }

    async bumpVersion() {
        const stepStart = Date.now();
        console.log(chalk.yellow('🔖 Managing version...'));
        
        try {
            const versionManager = new VersionManager({
                dryRun: this.options.dryRun,
                skipGit: this.options.skipGit
            });
            
            await versionManager.bumpVersion(this.options.versionType, this.options.customVersion);
            
            this.releaseInfo.steps.push('Version management');
            console.log(chalk.green('✅ Version management completed'));
            
        } catch (error) {
            this.releaseInfo.errors.push(`Version management failed: ${error.message}`);
            throw error;
        } finally {
            this.releaseInfo.timing.version = Date.now() - stepStart;
        }
    }

    async runTests() {
        if (this.options.skipTests) {
            console.log(chalk.gray('⏭️ Skipping tests'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('🧪 Running comprehensive test suite...'));
        
        try {
            const testRunner = new ComprehensiveTestRunner({
                coverage: true,
                integration: true,
                security: true,
                lint: true,
                format: true
            });
            
            const testResults = await testRunner.runAllTests();
            this.releaseInfo.testResults = testResults;
            
            this.releaseInfo.steps.push('Testing');
            console.log(chalk.green('✅ All tests passed'));
            
        } catch (error) {
            this.releaseInfo.errors.push(`Tests failed: ${error.message}`);
            throw error;
        } finally {
            this.releaseInfo.timing.tests = Date.now() - stepStart;
        }
    }

    async buildPackage() {
        if (this.options.skipBuild) {
            console.log(chalk.gray('⏭️ Skipping build'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('🔨 Building package...'));
        
        try {
            const builder = new ExtensionBuilder();
            await builder.build();
            
            this.releaseInfo.steps.push('Build');
            console.log(chalk.green('✅ Package built successfully'));
            
        } catch (error) {
            this.releaseInfo.errors.push(`Build failed: ${error.message}`);
            throw error;
        } finally {
            this.releaseInfo.timing.build = Date.now() - stepStart;
        }
    }

    async createDistributions() {
        const stepStart = Date.now();
        console.log(chalk.yellow('📦 Creating distribution packages...'));
        
        try {
            const distributor = new PackageDistributor({
                packageTypes: ['npm', 'standalone', 'docs'],
                createTarball: true
            });
            
            await distributor.createDistribution();
            
            this.releaseInfo.steps.push('Distribution packaging');
            console.log(chalk.green('✅ Distribution packages created'));
            
        } catch (error) {
            this.releaseInfo.warnings.push(`Distribution packaging failed: ${error.message}`);
        } finally {
            this.releaseInfo.timing.distribution = Date.now() - stepStart;
        }
    }

    async publishPackage() {
        if (this.options.skipPublish) {
            console.log(chalk.gray('⏭️ Skipping publish'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('📤 Publishing package...'));
        
        try {
            const publishWorkflow = new PublishWorkflow({
                dryRun: this.options.dryRun,
                skipTests: true, // Already ran tests
                skipBuild: true, // Already built
                skipGit: this.options.skipGit
            });
            
            await publishWorkflow.publish();
            
            this.releaseInfo.steps.push('NPM publish');
            console.log(chalk.green('✅ Package published successfully'));
            
        } catch (error) {
            this.releaseInfo.errors.push(`Publish failed: ${error.message}`);
            throw error;
        } finally {
            this.releaseInfo.timing.publish = Date.now() - stepStart;
        }
    }

    async verifyRelease() {
        const stepStart = Date.now();
        console.log(chalk.yellow('🔍 Verifying release...'));
        
        if (this.options.dryRun) {
            console.log(chalk.blue('🔍 DRY RUN: Skipping release verification'));
            return;
        }
        
        try {
            // Wait for NPM registry to update
            console.log(chalk.blue('  Waiting for registry propagation...'));
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Verify package is available
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            try {
                const { stdout } = await execAsync(`npm view ${packageJson.name}@${packageJson.version} version`);
                
                if (stdout.trim() === packageJson.version) {
                    console.log(chalk.green('  ✅ Package verified in NPM registry'));
                } else {
                    this.releaseInfo.warnings.push('Package not yet available in registry');
                }
            } catch (error) {
                this.releaseInfo.warnings.push(`Could not verify package: ${error.message}`);
            }
            
            this.releaseInfo.steps.push('Release verification');
            
        } catch (error) {
            this.releaseInfo.warnings.push(`Release verification failed: ${error.message}`);
        } finally {
            this.releaseInfo.timing.verification = Date.now() - stepStart;
        }
    }

    async saveReleaseInfo(error = null) {
        try {
            const releasesDir = path.join(rootDir, '.releases');
            await fs.mkdir(releasesDir, { recursive: true });
            
            if (error) {
                this.releaseInfo.error = error.message;
                this.releaseInfo.status = 'failed';
            } else {
                this.releaseInfo.status = 'completed';
            }
            
            const releaseFile = path.join(releasesDir, `release-${this.releaseId}.json`);
            await fs.writeFile(releaseFile, JSON.stringify(this.releaseInfo, null, 2), 'utf-8');
            
            // Create latest release link
            const latestFile = path.join(releasesDir, 'latest-release.json');
            await fs.unlink(latestFile).catch(() => {});
            await fs.symlink(releaseFile, latestFile).catch(() => {
                // Fallback: copy file if symlink fails
                await fs.copyFile(releaseFile, latestFile);
            });
            
        } catch (error) {
            console.log(chalk.yellow(`⚠️ Could not save release info: ${error.message}`));
        }
    }

    async showPostReleaseInfo() {
        if (this.options.dryRun) {
            return;
        }
        
        console.log('\n' + chalk.blue('🎉 Post-Release Information:'));
        
        if (this.releaseInfo.package) {
            const pkg = this.releaseInfo.package;
            console.log(chalk.green(`✅ Released: ${pkg.name}@${pkg.nextVersion}`));
            console.log(chalk.blue(`📦 Install with: npm install ${pkg.name}`));
            console.log(chalk.blue(`🔗 NPM page: https://www.npmjs.com/package/${pkg.name.replace('@', '').replace('/', '%2F')}`));
        }
        
        console.log('\n' + chalk.yellow('📢 Next Steps:'));
        console.log(chalk.yellow('  • Update documentation if needed'));
        console.log(chalk.yellow('  • Announce the release'));
        console.log(chalk.yellow('  • Monitor for issues'));
        console.log(chalk.yellow('  • Update dependent projects'));
        console.log(chalk.yellow('  • Consider creating GitHub release notes'));
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Release Summary:'));
        console.log(chalk.blue(`🆔 Release ID: ${this.releaseId}`));
        console.log(chalk.blue(`⏱️ Total time: ${Math.round(this.releaseInfo.timing.total / 1000)}s`));
        console.log(chalk.green(`✅ Completed steps: ${this.releaseInfo.steps.length}`));
        
        this.releaseInfo.steps.forEach(step => {
            console.log(chalk.green(`  ✅ ${step}`));
        });
        
        // Show timing breakdown
        if (Object.keys(this.releaseInfo.timing).length > 1) {
            console.log(chalk.blue('\n⏱️ Timing breakdown:'));
            Object.entries(this.releaseInfo.timing).forEach(([step, time]) => {
                if (step !== 'total') {
                    console.log(chalk.gray(`  ${step}: ${Math.round(time / 1000)}s`));
                }
            });
        }
        
        if (this.releaseInfo.errors.length > 0) {
            console.log(chalk.red(`\n❌ Errors (${this.releaseInfo.errors.length}):`));
            this.releaseInfo.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.releaseInfo.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️ Warnings (${this.releaseInfo.warnings.length}):`));
            this.releaseInfo.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(chalk.blue('Master Release Script'));
        console.log('\nUsage:');
        console.log('  node release.js [version-type] [options]');
        console.log('\nVersion Types:');
        console.log('  patch      - Bug fixes (1.0.0 → 1.0.1)');
        console.log('  minor      - New features (1.0.0 → 1.1.0)');
        console.log('  major      - Breaking changes (1.0.0 → 2.0.0)');
        console.log('\nOptions:');
        console.log('  --version <version>    Custom version number');
        console.log('  --dry-run              Preview what would be done');
        console.log('  --skip-tests           Skip running tests');
        console.log('  --skip-build           Skip building package');
        console.log('  --skip-publish         Skip publishing to NPM');
        console.log('  --skip-git             Skip git operations');
        console.log('  --interactive          Ask for confirmation');
        console.log('\nExamples:');
        console.log('  node release.js patch');
        console.log('  node release.js minor --dry-run');
        console.log('  node release.js major --interactive');
        console.log('  node release.js --version 2.0.0-beta.1');
        process.exit(0);
    }
    
    let versionType = 'patch';
    const options = {};
    
    // Parse arguments
    if (args[0] && !args[0].startsWith('--')) {
        versionType = args[0];
        args.shift();
    }
    
    // Parse options
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--skip-tests') {
            options.skipTests = true;
        } else if (arg === '--skip-build') {
            options.skipBuild = true;
        } else if (arg === '--skip-publish') {
            options.skipPublish = true;
        } else if (arg === '--skip-git') {
            options.skipGit = true;
        } else if (arg === '--interactive') {
            options.interactive = true;
        } else if (arg === '--version' && args[i + 1]) {
            options.customVersion = args[i + 1];
            versionType = 'custom';
            i++;
        }
    }
    
    options.versionType = versionType;
    
    const orchestrator = new ReleaseOrchestrator(options);
    orchestrator.release().catch(error => {
        console.error(chalk.red(`Fatal release error: ${error.message}`));
        process.exit(1);
    });
}

export default ReleaseOrchestrator;