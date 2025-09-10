#!/usr/bin/env node

/**
 * Publish Workflow Script for Test Validation Extension Pack
 * 
 * This script orchestrates the complete publishing process:
 * - Pre-publish validation and testing
 * - Build and package creation
 * - NPM registry publishing
 * - Git operations (tagging, pushing)
 * - Post-publish verification
 * - Release announcements
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Import our other scripts
import ExtensionBuilder from './build.js';
import PrePublishValidator from './pre-publish.js';
import PackageDistributor from './package.js';
import VersionManager from './version.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class PublishWorkflow {
    constructor(options = {}) {
        this.options = {
            dryRun: options.dryRun || false,
            skipTests: options.skipTests || false,
            skipValidation: options.skipValidation || false,
            skipBuild: options.skipBuild || false,
            skipGit: options.skipGit || false,
            registry: options.registry || 'https://registry.npmjs.org/',
            access: options.access || 'public',
            tag: options.tag || 'latest',
            otp: options.otp || null,
            ...options
        };
        
        this.publishId = Date.now().toString();
        this.errors = [];
        this.warnings = [];
        this.steps = [];
        this.timing = {};
    }

    async publish() {
        console.log(chalk.blue('🚀 Starting publish workflow...'));
        console.log(chalk.gray(`Publish ID: ${this.publishId}`));
        
        if (this.options.dryRun) {
            console.log(chalk.yellow('🔍 DRY RUN MODE - No actual publishing will occur'));
        }
        
        const startTime = Date.now();
        
        try {
            await this.validateEnvironment();
            await this.runPrePublishValidation();
            await this.runTests();
            await this.buildPackage();
            await this.createDistributions();
            await this.publishToRegistry();
            await this.handleGitOperations();
            await this.verifyPublication();
            await this.createRelease();
            
            this.timing.total = Date.now() - startTime;
            this.printSummary();
            
            if (this.errors.length > 0) {
                throw new Error(`Publish workflow failed with ${this.errors.length} errors`);
            }
            
            console.log(chalk.green('✅ Publish workflow completed successfully!'));
            
            if (!this.options.dryRun) {
                console.log(chalk.blue('🎉 Package has been published to NPM registry!'));
                await this.printPostPublishInstructions();
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Publish workflow failed: ${error.message}`));
            await this.rollbackOnFailure();
            process.exit(1);
        }
    }

    async validateEnvironment() {
        const stepStart = Date.now();
        console.log(chalk.yellow('🔍 Validating publish environment...'));
        
        try {
            // Check Node.js version
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
            
            if (majorVersion < 18) {
                this.errors.push(`Node.js 18+ required (current: ${nodeVersion})`);
            } else {
                console.log(chalk.green(`✅ Node.js version: ${nodeVersion}`));
            }
            
            // Check NPM authentication
            if (!this.options.dryRun) {
                try {
                    await execAsync('npm whoami', { cwd: rootDir });
                    console.log(chalk.green('✅ NPM authentication verified'));
                } catch (error) {
                    this.errors.push('NPM authentication required - run "npm login"');
                }
            }
            
            // Check git status
            if (!this.options.skipGit) {
                try {
                    const { stdout: status } = await execAsync('git status --porcelain', { cwd: rootDir });
                    
                    if (status.trim()) {
                        this.errors.push('Working directory has uncommitted changes');
                    } else {
                        console.log(chalk.green('✅ Working directory is clean'));
                    }
                } catch (error) {
                    this.warnings.push('Could not check git status');
                }
            }
            
            // Check package.json validity
            try {
                const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
                
                if (!packageJson.name || !packageJson.version) {
                    this.errors.push('Invalid package.json - missing name or version');
                } else {
                    console.log(chalk.green(`✅ Package: ${packageJson.name}@${packageJson.version}`));
                }
            } catch (error) {
                this.errors.push('Could not read package.json');
            }
            
            this.steps.push('Environment validation');
            
        } catch (error) {
            this.errors.push(`Environment validation failed: ${error.message}`);
        } finally {
            this.timing.environment = Date.now() - stepStart;
        }
    }

    async runPrePublishValidation() {
        if (this.options.skipValidation) {
            console.log(chalk.gray('⏭️ Skipping pre-publish validation'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('🔍 Running pre-publish validation...'));
        
        try {
            const validator = new PrePublishValidator();
            await validator.validate();
            
            console.log(chalk.green('✅ Pre-publish validation passed'));
            this.steps.push('Pre-publish validation');
            
        } catch (error) {
            this.errors.push(`Pre-publish validation failed: ${error.message}`);
        } finally {
            this.timing.validation = Date.now() - stepStart;
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
            // Run unit tests
            console.log(chalk.blue('  Running unit tests...'));
            await execAsync('npm test', { 
                cwd: rootDir,
                env: { ...process.env, NODE_ENV: 'test' }
            });
            
            console.log(chalk.green('  ✅ Unit tests passed'));
            
            // Run linting
            console.log(chalk.blue('  Running linting...'));
            
            try {
                await execAsync('npm run lint', { cwd: rootDir });
                console.log(chalk.green('  ✅ Linting passed'));
            } catch (error) {
                if (error.stdout?.includes('error') || error.stderr?.includes('error')) {
                    this.errors.push('Linting errors found');
                } else {
                    this.warnings.push('Linting warnings found');
                }
            }
            
            // Check code formatting
            console.log(chalk.blue('  Checking code formatting...'));
            
            try {
                await execAsync('npm run format:check', { cwd: rootDir });
                console.log(chalk.green('  ✅ Code formatting is consistent'));
            } catch (error) {
                this.warnings.push('Code formatting issues detected');
            }
            
            this.steps.push('Testing');
            
        } catch (error) {
            this.errors.push(`Tests failed: ${error.message}`);
        } finally {
            this.timing.tests = Date.now() - stepStart;
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
            
            console.log(chalk.green('✅ Package build completed'));
            this.steps.push('Build');
            
        } catch (error) {
            this.errors.push(`Build failed: ${error.message}`);
        } finally {
            this.timing.build = Date.now() - stepStart;
        }
    }

    async createDistributions() {
        const stepStart = Date.now();
        console.log(chalk.yellow('📦 Creating distribution packages...'));
        
        try {
            const distributor = new PackageDistributor({
                packageTypes: ['npm', 'standalone', 'docs']
            });
            await distributor.createDistribution();
            
            console.log(chalk.green('✅ Distribution packages created'));
            this.steps.push('Distribution packaging');
            
        } catch (error) {
            this.warnings.push(`Distribution packaging failed: ${error.message}`);
        } finally {
            this.timing.distribution = Date.now() - stepStart;
        }
    }

    async publishToRegistry() {
        const stepStart = Date.now();
        console.log(chalk.yellow('📤 Publishing to NPM registry...'));
        
        if (this.options.dryRun) {
            console.log(chalk.blue('🔍 DRY RUN: Would publish to registry'));
            this.steps.push('NPM publish (dry run)');
            return;
        }
        
        try {
            // Build NPM publish command
            let publishCmd = `npm publish --registry=${this.options.registry} --access=${this.options.access}`;
            
            if (this.options.tag !== 'latest') {
                publishCmd += ` --tag=${this.options.tag}`;
            }
            
            if (this.options.otp) {
                publishCmd += ` --otp=${this.options.otp}`;
            }
            
            console.log(chalk.blue(`  Command: ${publishCmd}`));
            
            // Execute publish
            const { stdout, stderr } = await execAsync(publishCmd, { cwd: rootDir });
            
            if (stderr && stderr.includes('error')) {
                throw new Error(`NPM publish failed: ${stderr}`);
            }
            
            console.log(chalk.green('✅ Successfully published to NPM registry'));
            
            // Extract published version info
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            console.log(chalk.blue(`📦 Published: ${packageJson.name}@${packageJson.version}`));
            
            this.steps.push('NPM publish');
            
        } catch (error) {
            this.errors.push(`NPM publish failed: ${error.message}`);
        } finally {
            this.timing.publish = Date.now() - stepStart;
        }
    }

    async handleGitOperations() {
        if (this.options.skipGit) {
            console.log(chalk.gray('⏭️ Skipping git operations'));
            return;
        }
        
        const stepStart = Date.now();
        console.log(chalk.yellow('📝 Handling git operations...'));
        
        if (this.options.dryRun) {
            console.log(chalk.blue('🔍 DRY RUN: Would push commits and tags'));
            this.steps.push('Git operations (dry run)');
            return;
        }
        
        try {
            // Push commits
            console.log(chalk.blue('  Pushing commits...'));
            await execAsync('git push origin', { cwd: rootDir });
            console.log(chalk.green('  ✅ Commits pushed'));
            
            // Push tags
            console.log(chalk.blue('  Pushing tags...'));
            await execAsync('git push origin --tags', { cwd: rootDir });
            console.log(chalk.green('  ✅ Tags pushed'));
            
            this.steps.push('Git operations');
            
        } catch (error) {
            this.warnings.push(`Git operations failed: ${error.message}`);
        } finally {
            this.timing.git = Date.now() - stepStart;
        }
    }

    async verifyPublication() {
        const stepStart = Date.now();
        console.log(chalk.yellow('🔍 Verifying publication...'));
        
        if (this.options.dryRun) {
            console.log(chalk.blue('🔍 DRY RUN: Would verify publication'));
            this.steps.push('Publication verification (dry run)');
            return;
        }
        
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            const packageName = packageJson.name;
            const packageVersion = packageJson.version;
            
            // Wait a moment for registry to update
            console.log(chalk.blue('  Waiting for registry to update...'));
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check if package is available in registry
            console.log(chalk.blue('  Checking package availability...'));
            const { stdout } = await execAsync(`npm view ${packageName}@${packageVersion} version`);
            
            if (stdout.trim() === packageVersion) {
                console.log(chalk.green('✅ Package verified in registry'));
            } else {
                this.warnings.push('Package not yet available in registry (may take time to propagate)');
            }
            
            // Test installation (in temp directory)
            console.log(chalk.blue('  Testing installation...'));
            const tempDir = path.join('/tmp', `test-install-${this.publishId}`);
            
            try {
                await fs.mkdir(tempDir, { recursive: true });
                await fs.writeFile(path.join(tempDir, 'package.json'), '{"name":"test","version":"1.0.0"}', 'utf-8');
                
                await execAsync(`npm install ${packageName}@${packageVersion}`, { cwd: tempDir });
                console.log(chalk.green('  ✅ Test installation successful'));
                
                // Cleanup
                await fs.rm(tempDir, { recursive: true, force: true });
                
            } catch (error) {
                this.warnings.push(`Test installation failed: ${error.message}`);
            }
            
            this.steps.push('Publication verification');
            
        } catch (error) {
            this.warnings.push(`Publication verification failed: ${error.message}`);
        } finally {
            this.timing.verification = Date.now() - stepStart;
        }
    }

    async createRelease() {
        const stepStart = Date.now();
        console.log(chalk.yellow('📝 Creating release documentation...'));
        
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            const releaseInfo = {
                package: packageJson.name,
                version: packageJson.version,
                publishId: this.publishId,
                publishedAt: new Date().toISOString(),
                registry: this.options.registry,
                tag: this.options.tag,
                steps: this.steps,
                timing: this.timing,
                warnings: this.warnings
            };
            
            // Save release info
            const releasesDir = path.join(rootDir, '.releases');
            await fs.mkdir(releasesDir, { recursive: true });
            
            const releaseFile = path.join(releasesDir, `release-${packageJson.version}-${this.publishId}.json`);
            await fs.writeFile(releaseFile, JSON.stringify(releaseInfo, null, 2), 'utf-8');
            
            console.log(chalk.green('✅ Release documentation created'));
            this.steps.push('Release documentation');
            
        } catch (error) {
            this.warnings.push(`Release documentation failed: ${error.message}`);
        } finally {
            this.timing.release = Date.now() - stepStart;
        }
    }

    async rollbackOnFailure() {
        if (this.options.dryRun) {
            return;
        }
        
        console.log(chalk.yellow('🔄 Attempting rollback...'));
        
        try {
            // Note: NPM doesn't support unpublishing recent packages easily
            // So we mainly focus on git rollback
            
            if (!this.options.skipGit) {
                // Remove the tag if it was created
                try {
                    const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
                    await execAsync(`git tag -d v${packageJson.version}`, { cwd: rootDir });
                    console.log(chalk.yellow('⚠️ Removed local git tag'));
                } catch (error) {
                    // Tag might not exist
                }
            }
            
            console.log(chalk.yellow('⚠️ Manual intervention may be required for complete rollback'));
            
        } catch (error) {
            console.log(chalk.red(`❌ Rollback failed: ${error.message}`));
        }
    }

    async printPostPublishInstructions() {
        const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
        
        console.log('\n' + chalk.blue('📋 Post-Publish Instructions:'));
        console.log(chalk.green(`✅ Package published: ${packageJson.name}@${packageJson.version}`));
        console.log(chalk.blue(`📦 Install with: npm install ${packageJson.name}`));
        console.log(chalk.blue(`🔗 NPM page: https://www.npmjs.com/package/${packageJson.name.replace('@', '').replace('/', '%2F')}`));
        
        if (packageJson.repository?.url) {
            const repoUrl = packageJson.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
            console.log(chalk.blue(`📚 Repository: ${repoUrl}`));
            console.log(chalk.blue(`🏷️ Releases: ${repoUrl}/releases`));
        }
        
        console.log('\n' + chalk.yellow('📢 Next Steps:'));
        console.log(chalk.yellow('  • Update documentation if needed'));
        console.log(chalk.yellow('  • Announce the release'));
        console.log(chalk.yellow('  • Monitor for issues'));
        console.log(chalk.yellow('  • Update dependent projects'));
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Publish Workflow Summary:'));
        console.log(chalk.blue(`🆔 Publish ID: ${this.publishId}`));
        console.log(chalk.blue(`⏱️ Total time: ${Math.round(this.timing.total / 1000)}s`));
        console.log(chalk.green(`✅ Completed steps: ${this.steps.length}`));
        
        this.steps.forEach(step => {
            console.log(chalk.green(`  ✅ ${step}`));
        });
        
        // Show timing breakdown
        if (Object.keys(this.timing).length > 1) {
            console.log(chalk.blue('\n⏱️ Timing breakdown:'));
            Object.entries(this.timing).forEach(([step, time]) => {
                if (step !== 'total') {
                    console.log(chalk.gray(`  ${step}: ${Math.round(time / 1000)}s`));
                }
            });
        }
        
        if (this.errors.length > 0) {
            console.log(chalk.red(`\n❌ Errors (${this.errors.length}):`));
            this.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️ Warnings (${this.warnings.length}):`));
            this.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(chalk.blue('Publish Workflow Script'));
        console.log('\nUsage:');
        console.log('  node publish.js [options]');
        console.log('\nOptions:');
        console.log('  --dry-run              Preview what would be published');
        console.log('  --skip-tests           Skip running tests');
        console.log('  --skip-validation      Skip pre-publish validation');
        console.log('  --skip-build           Skip building the package');
        console.log('  --skip-git             Skip git operations');
        console.log('  --registry <url>       NPM registry URL');
        console.log('  --access <public|restricted>  Package access level');
        console.log('  --tag <tag>            NPM dist tag (default: latest)');
        console.log('  --otp <code>           One-time password for 2FA');
        console.log('\nExamples:');
        console.log('  node publish.js --dry-run');
        console.log('  node publish.js --tag beta');
        console.log('  node publish.js --skip-tests --otp 123456');
        process.exit(0);
    }
    
    const options = {};
    
    // Parse options
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--skip-tests') {
            options.skipTests = true;
        } else if (arg === '--skip-validation') {
            options.skipValidation = true;
        } else if (arg === '--skip-build') {
            options.skipBuild = true;
        } else if (arg === '--skip-git') {
            options.skipGit = true;
        } else if (arg === '--registry' && args[i + 1]) {
            options.registry = args[i + 1];
            i++;
        } else if (arg === '--access' && args[i + 1]) {
            options.access = args[i + 1];
            i++;
        } else if (arg === '--tag' && args[i + 1]) {
            options.tag = args[i + 1];
            i++;
        } else if (arg === '--otp' && args[i + 1]) {
            options.otp = args[i + 1];
            i++;
        }
    }
    
    const workflow = new PublishWorkflow(options);
    workflow.publish().catch(error => {
        console.error(chalk.red(`Fatal error: ${error.message}`));
        process.exit(1);
    });
}

export default PublishWorkflow;