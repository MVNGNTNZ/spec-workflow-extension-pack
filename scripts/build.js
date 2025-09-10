#!/usr/bin/env node

/**
 * Build Script for Test Validation Extension Pack
 * 
 * This script prepares the package for distribution by:
 * - Cleaning previous builds
 * - Validating package structure
 * - Creating distribution package
 * - Generating documentation
 * - Preparing assets for publishing
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');
const templatesDir = path.join(rootDir, 'templates');
const dashboardDir = path.join(rootDir, 'dashboard');
const claudeDir = path.join(rootDir, '.claude');

class ExtensionBuilder {
    constructor() {
        this.buildId = Date.now().toString();
        this.errors = [];
        this.warnings = [];
    }

    async build() {
        console.log(chalk.blue('🔨 Building Test Validation Extension Pack...'));
        console.log(chalk.gray(`Build ID: ${this.buildId}`));

        try {
            await this.cleanup();
            await this.validateStructure();
            await this.createDistribution();
            await this.copyAssets();
            await this.generateMetadata();
            await this.validateBuild();
            
            this.printSummary();
            
            if (this.errors.length > 0) {
                throw new Error(`Build failed with ${this.errors.length} errors`);
            }

            console.log(chalk.green('✅ Build completed successfully!'));
            console.log(chalk.blue(`📦 Package ready for distribution in: ${path.relative(rootDir, distDir)}`));
            
        } catch (error) {
            console.error(chalk.red(`❌ Build failed: ${error.message}`));
            process.exit(1);
        }
    }

    async cleanup() {
        console.log(chalk.yellow('🧹 Cleaning previous build...'));
        
        try {
            await fs.rm(distDir, { recursive: true, force: true });
            await fs.mkdir(distDir, { recursive: true });
            console.log(chalk.green('✅ Cleanup completed'));
        } catch (error) {
            this.errors.push(`Cleanup failed: ${error.message}`);
        }
    }

    async validateStructure() {
        console.log(chalk.yellow('🔍 Validating package structure...'));

        const requiredFiles = [
            'package.json',
            'index.js',
            'src/installer.js',
            'src/agent-patcher.js',
            'src/pattern-library-manager.js'
        ];

        const requiredDirs = [
            'src',
            '.claude/agents'
        ];

        // Validate required files
        for (const file of requiredFiles) {
            const filePath = path.join(rootDir, file);
            try {
                await fs.access(filePath);
                console.log(chalk.green(`  ✅ ${file}`));
            } catch (error) {
                this.errors.push(`Missing required file: ${file}`);
                console.log(chalk.red(`  ❌ ${file}`));
            }
        }

        // Validate required directories
        for (const dir of requiredDirs) {
            const dirPath = path.join(rootDir, dir);
            try {
                const stats = await fs.stat(dirPath);
                if (stats.isDirectory()) {
                    console.log(chalk.green(`  ✅ ${dir}/`));
                } else {
                    this.errors.push(`${dir} is not a directory`);
                }
            } catch (error) {
                this.errors.push(`Missing required directory: ${dir}`);
                console.log(chalk.red(`  ❌ ${dir}/`));
            }
        }

        // Validate package.json
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
            
            if (!packageJson.name) this.errors.push('package.json missing name field');
            if (!packageJson.version) this.errors.push('package.json missing version field');
            if (!packageJson.main) this.errors.push('package.json missing main field');
            if (!packageJson.files) this.warnings.push('package.json missing files field');
            
            console.log(chalk.green('✅ Package validation completed'));
        } catch (error) {
            this.errors.push(`Invalid package.json: ${error.message}`);
        }
    }

    async createDistribution() {
        console.log(chalk.yellow('📦 Creating distribution package...'));

        const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));

        // Create distribution structure
        await fs.mkdir(path.join(distDir, 'src'), { recursive: true });
        await fs.mkdir(path.join(distDir, '.claude', 'agents'), { recursive: true });
        await fs.mkdir(path.join(distDir, 'scripts'), { recursive: true });

        console.log(chalk.green('✅ Distribution structure created'));
    }

    async copyAssets() {
        console.log(chalk.yellow('📋 Copying assets...'));

        const assets = [
            // Core files
            { src: 'index.js', dest: 'index.js' },
            { src: 'package.json', dest: 'package.json' },
            
            // Source files
            { src: 'src', dest: 'src', type: 'directory' },
            
            // Claude agents and configuration
            { src: '.claude/agents', dest: '.claude/agents', type: 'directory' },
            { src: '.claude/pattern-library.json', dest: '.claude/pattern-library.json', optional: true },
            { src: '.claude/backend-pattern-library.json', dest: '.claude/backend-pattern-library.json', optional: true },
            { src: '.claude/frontend-pattern-library.json', dest: '.claude/frontend-pattern-library.json', optional: true },
            
            // Scripts
            { src: 'scripts', dest: 'scripts', type: 'directory', optional: true },
            
            // Dashboard (if exists)
            { src: 'dashboard', dest: 'dashboard', type: 'directory', optional: true },
            
            // Documentation
            { src: 'README.md', dest: 'README.md', optional: true },
            { src: 'LICENSE', dest: 'LICENSE', optional: true }
        ];

        for (const asset of assets) {
            try {
                const srcPath = path.join(rootDir, asset.src);
                const destPath = path.join(distDir, asset.dest);

                try {
                    await fs.access(srcPath);
                } catch (error) {
                    if (!asset.optional) {
                        this.errors.push(`Missing required asset: ${asset.src}`);
                        console.log(chalk.red(`  ❌ ${asset.src}`));
                    } else {
                        console.log(chalk.gray(`  ⏭️  ${asset.src} (optional, skipped)`));
                    }
                    continue;
                }

                if (asset.type === 'directory') {
                    await this.copyDirectory(srcPath, destPath);
                } else {
                    await fs.mkdir(path.dirname(destPath), { recursive: true });
                    await fs.copyFile(srcPath, destPath);
                }
                
                console.log(chalk.green(`  ✅ ${asset.src} → ${asset.dest}`));
            } catch (error) {
                this.errors.push(`Failed to copy ${asset.src}: ${error.message}`);
                console.log(chalk.red(`  ❌ ${asset.src}`));
            }
        }
    }

    async copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    async generateMetadata() {
        console.log(chalk.yellow('📄 Generating build metadata...'));

        const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8'));
        
        const metadata = {
            buildId: this.buildId,
            buildTime: new Date().toISOString(),
            version: packageJson.version,
            name: packageJson.name,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            files: await this.getFileList(),
            size: await this.calculateSize(),
            checksums: await this.generateChecksums()
        };

        await fs.writeFile(
            path.join(distDir, 'build-metadata.json'),
            JSON.stringify(metadata, null, 2),
            'utf-8'
        );

        console.log(chalk.green('✅ Build metadata generated'));
    }

    async getFileList() {
        const files = [];
        
        async function walk(dir, basePath = '') {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);
                
                if (entry.isDirectory()) {
                    await walk(fullPath, relativePath);
                } else {
                    const stats = await fs.stat(fullPath);
                    files.push({
                        path: relativePath,
                        size: stats.size,
                        modified: stats.mtime.toISOString()
                    });
                }
            }
        }
        
        await walk(distDir);
        return files;
    }

    async calculateSize() {
        let totalSize = 0;
        const files = await this.getFileList();
        
        for (const file of files) {
            totalSize += file.size;
        }
        
        return {
            bytes: totalSize,
            human: this.formatBytes(totalSize)
        };
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    async generateChecksums() {
        // This is a simple implementation - in production you might want to use crypto
        const checksums = {};
        const files = await this.getFileList();
        
        for (const file of files.slice(0, 10)) { // Limit to first 10 files for performance
            const content = await fs.readFile(path.join(distDir, file.path), 'utf-8').catch(() => '');
            checksums[file.path] = content.length.toString();
        }
        
        return checksums;
    }

    async validateBuild() {
        console.log(chalk.yellow('🔍 Validating build output...'));

        // Validate distribution package.json
        try {
            const distPackageJson = JSON.parse(
                await fs.readFile(path.join(distDir, 'package.json'), 'utf-8')
            );
            
            if (!distPackageJson.main || !distPackageJson.name || !distPackageJson.version) {
                this.errors.push('Invalid distribution package.json');
            } else {
                console.log(chalk.green('✅ Distribution package.json valid'));
            }
        } catch (error) {
            this.errors.push(`Cannot validate distribution package.json: ${error.message}`);
        }

        // Validate main entry point
        try {
            await fs.access(path.join(distDir, 'index.js'));
            console.log(chalk.green('✅ Main entry point exists'));
        } catch (error) {
            this.errors.push('Main entry point missing from distribution');
        }

        // Validate source files
        try {
            const srcFiles = await fs.readdir(path.join(distDir, 'src'));
            if (srcFiles.length === 0) {
                this.errors.push('No source files in distribution');
            } else {
                console.log(chalk.green(`✅ ${srcFiles.length} source files included`));
            }
        } catch (error) {
            this.errors.push('Source directory missing from distribution');
        }

        // Validate agents
        try {
            const agentFiles = await fs.readdir(path.join(distDir, '.claude', 'agents'));
            if (agentFiles.length === 0) {
                this.warnings.push('No agent files in distribution');
            } else {
                console.log(chalk.green(`✅ ${agentFiles.length} agent files included`));
            }
        } catch (error) {
            this.warnings.push('Agent directory missing from distribution');
        }
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Build Summary:'));
        
        if (this.errors.length > 0) {
            console.log(chalk.red(`❌ Errors: ${this.errors.length}`));
            this.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.warnings.length > 0) {
            console.log(chalk.yellow(`⚠️  Warnings: ${this.warnings.length}`));
            this.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green('✅ No issues found'));
        }
        
        console.log(chalk.blue(`🔧 Build ID: ${this.buildId}`));
    }
}

// Run the build if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const builder = new ExtensionBuilder();
    builder.build().catch(error => {
        console.error(chalk.red(`Fatal build error: ${error.message}`));
        process.exit(1);
    });
}

export default ExtensionBuilder;