#!/usr/bin/env node

/**
 * Version Management Script for Test Validation Extension Pack
 * 
 * This script handles version bumping, changelog generation, and git tagging:
 * - Semantic version bumping (patch, minor, major)
 * - Automatic changelog generation from git commits
 * - Git tagging with proper annotations
 * - Version validation and consistency checks
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

class VersionManager {
    constructor(options = {}) {
        this.options = {
            dryRun: options.dryRun || false,
            skipGit: options.skipGit || false,
            skipChangelog: options.skipChangelog || false,
            commitMessage: options.commitMessage || 'chore: release version {version}',
            tagMessage: options.tagMessage || 'Release version {version}',
            ...options
        };
        
        this.currentVersion = null;
        this.newVersion = null;
        this.changes = [];
    }

    async bumpVersion(type = 'patch', customVersion = null) {
        console.log(chalk.blue(`🔖 Managing version (${type})...`));
        
        if (this.options.dryRun) {
            console.log(chalk.yellow('🔍 DRY RUN MODE - No changes will be made'));
        }
        
        try {
            await this.loadCurrentVersion();
            await this.validateGitStatus();
            await this.calculateNewVersion(type, customVersion);
            await this.generateChangelog();
            await this.updateVersionFiles();
            await this.commitAndTag();
            
            this.printSummary();
            
            if (!this.options.dryRun) {
                console.log(chalk.green('✅ Version management completed successfully!'));
                console.log(chalk.blue(`📦 New version: ${this.newVersion}`));
                console.log(chalk.blue(`🏷️  Git tag: v${this.newVersion}`));
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Version management failed: ${error.message}`));
            process.exit(1);
        }
    }

    async loadCurrentVersion() {
        console.log(chalk.yellow('📄 Loading current version...'));
        
        try {
            const packageJson = JSON.parse(
                await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8')
            );
            
            this.currentVersion = packageJson.version;
            
            if (!semver.valid(this.currentVersion)) {
                throw new Error(`Invalid current version: ${this.currentVersion}`);
            }
            
            console.log(chalk.green(`✅ Current version: ${this.currentVersion}`));
            
        } catch (error) {
            throw new Error(`Failed to load current version: ${error.message}`);
        }
    }

    async validateGitStatus() {
        if (this.options.skipGit) {
            console.log(chalk.gray('⏭️ Skipping git status validation'));
            return;
        }
        
        console.log(chalk.yellow('🔍 Validating git status...'));
        
        try {
            // Check if we're in a git repository
            await execAsync('git status', { cwd: rootDir });
            
            // Check for uncommitted changes
            const { stdout: status } = await execAsync('git status --porcelain', { cwd: rootDir });
            
            if (status.trim() && !this.options.dryRun) {
                throw new Error('Working directory has uncommitted changes. Commit or stash changes before version bump.');
            }
            
            // Check if we're on the correct branch (optional)
            try {
                const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir });
                const currentBranch = branch.trim();
                
                if (currentBranch !== 'main' && currentBranch !== 'master') {
                    console.log(chalk.yellow(`⚠️ Current branch is '${currentBranch}' (not main/master)`));
                }
                
            } catch (error) {
                // Ignore branch check errors
            }
            
            console.log(chalk.green('✅ Git status validation passed'));
            
        } catch (error) {
            if (error.message.includes('not a git repository')) {
                console.log(chalk.yellow('⚠️ Not a git repository - skipping git operations'));
                this.options.skipGit = true;
            } else {
                throw error;
            }
        }
    }

    async calculateNewVersion(type, customVersion) {
        console.log(chalk.yellow(`🧮 Calculating new version (${type})...`));
        
        if (customVersion) {
            if (!semver.valid(customVersion)) {
                throw new Error(`Invalid custom version: ${customVersion}`);
            }
            
            if (!semver.gt(customVersion, this.currentVersion)) {
                throw new Error(`Custom version ${customVersion} must be greater than current version ${this.currentVersion}`);
            }
            
            this.newVersion = customVersion;
        } else {
            this.newVersion = semver.inc(this.currentVersion, type);
            
            if (!this.newVersion) {
                throw new Error(`Failed to increment version with type: ${type}`);
            }
        }
        
        console.log(chalk.green(`✅ New version calculated: ${this.currentVersion} → ${this.newVersion}`));
    }

    async generateChangelog() {
        if (this.options.skipChangelog) {
            console.log(chalk.gray('⏭️ Skipping changelog generation'));
            return;
        }
        
        console.log(chalk.yellow('📝 Generating changelog...'));
        
        try {
            const changelogPath = path.join(rootDir, 'CHANGELOG.md');
            let existingChangelog = '';
            
            // Read existing changelog
            try {
                existingChangelog = await fs.readFile(changelogPath, 'utf-8');
            } catch (error) {
                console.log(chalk.blue('📄 Creating new CHANGELOG.md'));
                existingChangelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
            }
            
            // Generate new changelog entry
            const newEntry = await this.generateChangelogEntry();
            
            // Insert new entry after header
            const lines = existingChangelog.split('\n');
            const headerEndIndex = lines.findIndex(line => line.trim() && !line.startsWith('#') && !line.toLowerCase().includes('notable changes'));
            const insertIndex = headerEndIndex !== -1 ? headerEndIndex : 3;
            
            lines.splice(insertIndex, 0, '', newEntry, '');
            
            const newChangelog = lines.join('\n');
            
            if (!this.options.dryRun) {
                await fs.writeFile(changelogPath, newChangelog, 'utf-8');
            }
            
            this.changes.push('CHANGELOG.md');
            console.log(chalk.green('✅ Changelog updated'));
            
        } catch (error) {
            console.log(chalk.yellow(`⚠️ Changelog generation failed: ${error.message}`));
        }
    }

    async generateChangelogEntry() {
        const date = new Date().toISOString().split('T')[0];
        let entry = `## [${this.newVersion}] - ${date}\n`;
        
        if (!this.options.skipGit) {
            try {
                // Get commits since last tag
                const { stdout: lastTag } = await execAsync('git describe --tags --abbrev=0', { 
                    cwd: rootDir 
                }).catch(() => ({ stdout: '' }));
                
                const range = lastTag.trim() ? `${lastTag.trim()}..HEAD` : 'HEAD';
                const { stdout: commits } = await execAsync(`git log ${range} --pretty=format:"%s" --no-merges`, { 
                    cwd: rootDir 
                });
                
                if (commits.trim()) {
                    const commitLines = commits.split('\n').filter(line => line.trim());
                    
                    // Categorize commits
                    const categories = {
                        'Added': [],
                        'Changed': [],
                        'Fixed': [],
                        'Security': [],
                        'Deprecated': [],
                        'Removed': []
                    };
                    
                    commitLines.forEach(commit => {
                        const trimmed = commit.trim();
                        
                        if (trimmed.startsWith('feat:') || trimmed.startsWith('feature:')) {
                            categories.Added.push(trimmed.replace(/^(feat|feature):\s*/, ''));
                        } else if (trimmed.startsWith('fix:')) {
                            categories.Fixed.push(trimmed.replace(/^fix:\s*/, ''));
                        } else if (trimmed.startsWith('security:')) {
                            categories.Security.push(trimmed.replace(/^security:\s*/, ''));
                        } else if (trimmed.startsWith('breaking:') || trimmed.includes('BREAKING CHANGE')) {
                            categories.Changed.push(trimmed.replace(/^breaking:\s*/, ''));
                        } else if (trimmed.startsWith('deprecate:')) {
                            categories.Deprecated.push(trimmed.replace(/^deprecate:\s*/, ''));
                        } else if (trimmed.startsWith('remove:')) {
                            categories.Removed.push(trimmed.replace(/^remove:\s*/, ''));
                        } else {
                            categories.Changed.push(trimmed);
                        }
                    });
                    
                    // Add non-empty categories to changelog
                    Object.entries(categories).forEach(([category, items]) => {
                        if (items.length > 0) {
                            entry += `\n### ${category}\n`;
                            items.forEach(item => {
                                entry += `- ${item}\n`;
                            });
                        }
                    });
                } else {
                    entry += '\n- Version bump\n';
                }
                
            } catch (error) {
                console.log(chalk.yellow('⚠️ Could not generate detailed changelog from git history'));
                entry += '\n- Version bump\n';
            }
        } else {
            entry += '\n- Version bump\n';
        }
        
        return entry;
    }

    async updateVersionFiles() {
        console.log(chalk.yellow('📝 Updating version files...'));
        
        // Update package.json
        const packageJsonPath = path.join(rootDir, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        packageJson.version = this.newVersion;
        
        if (!this.options.dryRun) {
            await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        }
        
        this.changes.push('package.json');
        
        // Update package-lock.json if it exists
        try {
            const packageLockPath = path.join(rootDir, 'package-lock.json');
            const packageLock = JSON.parse(await fs.readFile(packageLockPath, 'utf-8'));
            
            packageLock.version = this.newVersion;
            
            if (packageLock.packages && packageLock.packages[""]) {
                packageLock.packages[""].version = this.newVersion;
            }
            
            if (!this.options.dryRun) {
                await fs.writeFile(packageLockPath, JSON.stringify(packageLock, null, 2) + '\n', 'utf-8');
            }
            
            this.changes.push('package-lock.json');
            
        } catch (error) {
            console.log(chalk.gray('⏭️ No package-lock.json to update'));
        }
        
        console.log(chalk.green(`✅ Updated ${this.changes.length} files`));
    }

    async commitAndTag() {
        if (this.options.skipGit) {
            console.log(chalk.gray('⏭️ Skipping git commit and tag'));
            return;
        }
        
        console.log(chalk.yellow('📝 Creating git commit and tag...'));
        
        if (this.options.dryRun) {
            console.log(chalk.blue(`Would commit: ${this.changes.join(', ')}`));
            console.log(chalk.blue(`Would create tag: v${this.newVersion}`));
            return;
        }
        
        try {
            // Stage changed files
            for (const file of this.changes) {
                await execAsync(`git add "${file}"`, { cwd: rootDir });
            }
            
            // Commit changes
            const commitMessage = this.options.commitMessage.replace('{version}', this.newVersion);
            await execAsync(`git commit -m "${commitMessage}"`, { cwd: rootDir });
            console.log(chalk.green('✅ Created commit'));
            
            // Create annotated tag
            const tagMessage = this.options.tagMessage.replace('{version}', this.newVersion);
            await execAsync(`git tag -a "v${this.newVersion}" -m "${tagMessage}"`, { cwd: rootDir });
            console.log(chalk.green(`✅ Created tag: v${this.newVersion}`));
            
        } catch (error) {
            throw new Error(`Git operations failed: ${error.message}`);
        }
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Version Management Summary:'));
        console.log(chalk.blue(`📦 Version: ${this.currentVersion} → ${this.newVersion}`));
        console.log(chalk.blue(`📁 Files updated: ${this.changes.length}`));
        
        this.changes.forEach(file => {
            console.log(chalk.green(`  ✅ ${file}`));
        });
        
        if (!this.options.skipGit && !this.options.dryRun) {
            console.log(chalk.blue(`🏷️  Git tag: v${this.newVersion}`));
        }
        
        if (this.options.dryRun) {
            console.log(chalk.yellow('🔍 This was a dry run - no actual changes were made'));
        }
    }

    // Utility method to get version information
    async getVersionInfo() {
        await this.loadCurrentVersion();
        
        const info = {
            current: this.currentVersion,
            nextPatch: semver.inc(this.currentVersion, 'patch'),
            nextMinor: semver.inc(this.currentVersion, 'minor'),
            nextMajor: semver.inc(this.currentVersion, 'major')
        };
        
        if (!this.options.skipGit) {
            try {
                const { stdout: lastTag } = await execAsync('git describe --tags --abbrev=0', { 
                    cwd: rootDir 
                }).catch(() => ({ stdout: 'none' }));
                
                info.lastTag = lastTag.trim() || 'none';
                
                const { stdout: commitCount } = await execAsync(`git rev-list --count HEAD`, { 
                    cwd: rootDir 
                }).catch(() => ({ stdout: '0' }));
                
                info.commitCount = parseInt(commitCount.trim()) || 0;
                
            } catch (error) {
                info.lastTag = 'unknown';
                info.commitCount = 0;
            }
        }
        
        return info;
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(chalk.blue('Version Management Script'));
        console.log('\nUsage:');
        console.log('  node version.js <type> [options]');
        console.log('\nVersion types:');
        console.log('  patch    - Bug fixes (1.0.0 → 1.0.1)');
        console.log('  minor    - New features (1.0.0 → 1.1.0)');
        console.log('  major    - Breaking changes (1.0.0 → 2.0.0)');
        console.log('  custom   - Specify exact version');
        console.log('\nOptions:');
        console.log('  --version <version>    Custom version number');
        console.log('  --dry-run             Preview changes without making them');
        console.log('  --skip-git            Skip git operations');
        console.log('  --skip-changelog      Skip changelog generation');
        console.log('  --commit-msg <msg>    Custom commit message');
        console.log('  --tag-msg <msg>       Custom tag message');
        console.log('\nExamples:');
        console.log('  node version.js patch');
        console.log('  node version.js minor --dry-run');
        console.log('  node version.js custom --version 2.0.0');
        console.log('  node version.js info                 # Show version info');
        process.exit(0);
    }
    
    const type = args[0];
    const options = {};
    
    // Parse options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--skip-git') {
            options.skipGit = true;
        } else if (arg === '--skip-changelog') {
            options.skipChangelog = true;
        } else if (arg === '--version' && args[i + 1]) {
            options.customVersion = args[i + 1];
            i++;
        } else if (arg === '--commit-msg' && args[i + 1]) {
            options.commitMessage = args[i + 1];
            i++;
        } else if (arg === '--tag-msg' && args[i + 1]) {
            options.tagMessage = args[i + 1];
            i++;
        }
    }
    
    const manager = new VersionManager(options);
    
    if (type === 'info') {
        manager.getVersionInfo().then(info => {
            console.log(chalk.blue('📦 Version Information:'));
            console.log(chalk.green(`Current: ${info.current}`));
            console.log(chalk.blue(`Next patch: ${info.nextPatch}`));
            console.log(chalk.blue(`Next minor: ${info.nextMinor}`));
            console.log(chalk.blue(`Next major: ${info.nextMajor}`));
            
            if (info.lastTag !== undefined) {
                console.log(chalk.gray(`Last tag: ${info.lastTag}`));
                console.log(chalk.gray(`Total commits: ${info.commitCount}`));
            }
        }).catch(error => {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        });
    } else if (['patch', 'minor', 'major', 'custom'].includes(type)) {
        manager.bumpVersion(type, options.customVersion).catch(error => {
            console.error(chalk.red(`Fatal error: ${error.message}`));
            process.exit(1);
        });
    } else {
        console.error(chalk.red(`Invalid version type: ${type}`));
        console.error(chalk.gray('Run "node version.js --help" for usage information'));
        process.exit(1);
    }
}

export default VersionManager;