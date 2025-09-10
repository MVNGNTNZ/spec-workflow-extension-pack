#!/usr/bin/env node

/**
 * Package Distribution Script for Test Validation Extension Pack
 * 
 * This script creates distribution packages for different deployment scenarios:
 * - NPM package for registry publishing
 * - Standalone package for direct installation
 * - Development package for testing
 * - Documentation package for GitHub releases
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import chalk from 'chalk';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class PackageDistributor {
    constructor(options = {}) {
        this.options = {
            outputDir: options.outputDir || path.join(rootDir, 'packages'),
            includeDev: options.includeDev || false,
            createTarball: options.createTarball !== false,
            packageTypes: options.packageTypes || ['npm', 'standalone', 'docs'],
            ...options
        };
        
        this.buildId = Date.now().toString();
        this.errors = [];
        this.warnings = [];
        this.packages = [];
    }

    async createDistribution() {
        console.log(chalk.blue('📦 Creating distribution packages...'));
        console.log(chalk.gray(`Build ID: ${this.buildId}`));
        console.log(chalk.gray(`Output directory: ${path.relative(rootDir, this.options.outputDir)}`));
        
        try {
            await this.setup();
            
            for (const packageType of this.options.packageTypes) {
                await this.createPackage(packageType);
            }
            
            await this.generateIndex();
            this.printSummary();
            
            if (this.errors.length > 0) {
                throw new Error(`Packaging failed with ${this.errors.length} errors`);
            }
            
            console.log(chalk.green('✅ Distribution packages created successfully!'));
            console.log(chalk.blue(`📂 Packages available in: ${path.relative(rootDir, this.options.outputDir)}`));
            
        } catch (error) {
            console.error(chalk.red(`❌ Packaging failed: ${error.message}`));
            process.exit(1);
        }
    }

    async setup() {
        console.log(chalk.yellow('⚙️ Setting up packaging environment...'));
        
        // Create output directory
        await fs.mkdir(this.options.outputDir, { recursive: true });
        
        // Clean existing packages
        try {
            const existing = await fs.readdir(this.options.outputDir);
            for (const item of existing) {
                if (item.startsWith('test-validation-extension-pack-')) {
                    await fs.rm(path.join(this.options.outputDir, item), { recursive: true, force: true });
                }
            }
        } catch (error) {
            // Directory might be empty or not exist
        }
        
        console.log(chalk.green('✅ Packaging environment ready'));
    }

    async createPackage(packageType) {
        console.log(chalk.yellow(`📦 Creating ${packageType} package...`));
        
        try {
            switch (packageType) {
                case 'npm':
                    await this.createNpmPackage();
                    break;
                case 'standalone':
                    await this.createStandalonePackage();
                    break;
                case 'development':
                    await this.createDevelopmentPackage();
                    break;
                case 'docs':
                    await this.createDocumentationPackage();
                    break;
                default:
                    this.warnings.push(`Unknown package type: ${packageType}`);
            }
        } catch (error) {
            this.errors.push(`Failed to create ${packageType} package: ${error.message}`);
        }
    }

    async createNpmPackage() {
        const packageName = 'test-validation-extension-pack-npm';
        const packageDir = path.join(this.options.outputDir, packageName);
        
        await fs.mkdir(packageDir, { recursive: true });
        
        // Copy core files for NPM distribution
        const npmFiles = [
            'index.js',
            'package.json',
            'README.md',
            'LICENSE'
        ];
        
        const npmDirs = [
            'src',
            '.claude/agents'
        ];
        
        // Copy files
        for (const file of npmFiles) {
            try {
                await fs.copyFile(path.join(rootDir, file), path.join(packageDir, file));
            } catch (error) {
                if (file !== 'README.md' && file !== 'LICENSE') {
                    this.errors.push(`Missing required file for NPM package: ${file}`);
                }
            }
        }
        
        // Copy directories
        for (const dir of npmDirs) {
            try {
                await this.copyDirectory(path.join(rootDir, dir), path.join(packageDir, dir));
            } catch (error) {
                this.errors.push(`Failed to copy directory ${dir}: ${error.message}`);
            }
        }
        
        // Create optimized package.json for NPM
        await this.createNpmPackageJson(packageDir);
        
        // Create tarball if requested
        if (this.options.createTarball) {
            await this.createTarball(packageDir, `${packageName}.tgz`);
        }
        
        this.packages.push({
            name: packageName,
            type: 'npm',
            path: packageDir,
            description: 'NPM registry package ready for publishing'
        });
        
        console.log(chalk.green(`✅ NPM package created: ${packageName}`));
    }

    async createStandalonePackage() {
        const packageName = 'test-validation-extension-pack-standalone';
        const packageDir = path.join(this.options.outputDir, packageName);
        
        await fs.mkdir(packageDir, { recursive: true });
        
        // Copy all distribution files
        await this.copyDirectory(rootDir, packageDir, {
            exclude: ['node_modules', '.git', '.claude.backup*', 'packages', 'dist', '*.tgz']
        });
        
        // Create standalone installation script
        await this.createStandaloneInstaller(packageDir);
        
        // Create README for standalone installation
        await this.createStandaloneReadme(packageDir);
        
        // Create tarball
        if (this.options.createTarball) {
            await this.createTarball(packageDir, `${packageName}.tar.gz`);
        }
        
        this.packages.push({
            name: packageName,
            type: 'standalone',
            path: packageDir,
            description: 'Standalone package for direct installation without NPM'
        });
        
        console.log(chalk.green(`✅ Standalone package created: ${packageName}`));
    }

    async createDevelopmentPackage() {
        const packageName = 'test-validation-extension-pack-development';
        const packageDir = path.join(this.options.outputDir, packageName);
        
        await fs.mkdir(packageDir, { recursive: true });
        
        // Copy everything including development files
        await this.copyDirectory(rootDir, packageDir, {
            exclude: ['node_modules', '.git', 'packages', 'dist']
        });
        
        // Create development setup script
        await this.createDevelopmentSetup(packageDir);
        
        // Create development README
        await this.createDevelopmentReadme(packageDir);
        
        this.packages.push({
            name: packageName,
            type: 'development',
            path: packageDir,
            description: 'Development package with tests, sources, and development tools'
        });
        
        console.log(chalk.green(`✅ Development package created: ${packageName}`));
    }

    async createDocumentationPackage() {
        const packageName = 'test-validation-extension-pack-docs';
        const packageDir = path.join(this.options.outputDir, packageName);
        
        await fs.mkdir(packageDir, { recursive: true });
        
        // Copy documentation files
        const docFiles = [
            'README.md',
            'LICENSE',
            'CHANGELOG.md',
            'package.json'
        ];
        
        for (const file of docFiles) {
            try {
                await fs.copyFile(path.join(rootDir, file), path.join(packageDir, file));
            } catch (error) {
                // Optional files
                if (file === 'README.md' || file === 'package.json') {
                    this.warnings.push(`Documentation file missing: ${file}`);
                }
            }
        }
        
        // Create comprehensive documentation
        await this.generateDocumentation(packageDir);
        
        // Create API documentation if source files exist
        try {
            await this.generateApiDocs(packageDir);
        } catch (error) {
            this.warnings.push('Could not generate API documentation');
        }
        
        // Create tarball
        if (this.options.createTarball) {
            await this.createTarball(packageDir, `${packageName}.tar.gz`);
        }
        
        this.packages.push({
            name: packageName,
            type: 'docs',
            path: packageDir,
            description: 'Documentation package with API docs and usage examples'
        });
        
        console.log(chalk.green(`✅ Documentation package created: ${packageName}`));
    }

    async copyDirectory(src, dest, options = {}) {
        const exclude = options.exclude || [];
        
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
            // Check exclusions
            if (exclude.some(pattern => {
                if (pattern.includes('*')) {
                    return entry.name.match(new RegExp(pattern.replace(/\*/g, '.*')));
                }
                return entry.name === pattern;
            })) {
                continue;
            }
            
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath, options);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    async createNpmPackageJson(packageDir) {
        const originalPackageJson = JSON.parse(
            await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8')
        );
        
        // Create optimized package.json for NPM
        const npmPackageJson = {
            ...originalPackageJson,
            scripts: {
                // Only include essential scripts for npm package
                'install-extension': originalPackageJson.scripts['install-extension'],
                'validate-setup': originalPackageJson.scripts['validate-setup'],
                postinstall: originalPackageJson.scripts.postinstall,
                start: originalPackageJson.scripts.start
            },
            devDependencies: {}, // Remove dev dependencies for production package
            files: [
                'index.js',
                'src/',
                '.claude/agents/',
                '.claude/pattern-library.json',
                '.claude/backend-pattern-library.json',
                '.claude/frontend-pattern-library.json',
                'README.md',
                'LICENSE'
            ]
        };
        
        await fs.writeFile(
            path.join(packageDir, 'package.json'),
            JSON.stringify(npmPackageJson, null, 2),
            'utf-8'
        );
    }

    async createStandaloneInstaller(packageDir) {
        const installerContent = `#!/usr/bin/env node

/**
 * Standalone Installer for Test Validation Extension Pack
 * Usage: node install.js [options]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { InstallationManager } from './src/installer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class StandaloneInstaller {
    constructor() {
        this.installationManager = new InstallationManager();
    }

    async install() {
        console.log(chalk.blue('🚀 Installing Test Validation Extension Pack (Standalone)...'));
        
        try {
            // Check system requirements
            await this.checkRequirements();
            
            // Install dependencies
            await this.installationManager.ensureDependency();
            
            // Setup extension
            await this.setupExtension();
            
            console.log(chalk.green('✅ Installation completed successfully!'));
            console.log(chalk.blue('Run "node index.js --help" for usage information'));
            
        } catch (error) {
            console.error(chalk.red(\`❌ Installation failed: \${error.message}\`));
            process.exit(1);
        }
    }

    async checkRequirements() {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 18) {
            throw new Error(\`Node.js 18+ required (current: \${nodeVersion})\`);
        }
        
        console.log(chalk.green(\`✅ Node.js version: \${nodeVersion}\`));
    }

    async setupExtension() {
        console.log(chalk.yellow('⚙️ Setting up extension...'));
        
        // Create necessary directories
        const configDir = path.join(process.cwd(), '.claude');
        await fs.mkdir(configDir, { recursive: true });
        
        // Copy agents
        const agentsSourceDir = path.join(__dirname, '.claude', 'agents');
        const agentsDestDir = path.join(configDir, 'agents');
        
        try {
            const agentFiles = await fs.readdir(agentsSourceDir);
            await fs.mkdir(agentsDestDir, { recursive: true });
            
            for (const file of agentFiles) {
                await fs.copyFile(
                    path.join(agentsSourceDir, file),
                    path.join(agentsDestDir, file)
                );
            }
            
            console.log(chalk.green(\`✅ Copied \${agentFiles.length} agents\`));
        } catch (error) {
            console.log(chalk.yellow('⚠️ Could not copy agents - they may already exist'));
        }
        
        console.log(chalk.green('✅ Extension setup completed'));
    }
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
    const installer = new StandaloneInstaller();
    installer.install();
}`;
        
        await fs.writeFile(path.join(packageDir, 'install.js'), installerContent, 'utf-8');
        
        // Make installer executable
        try {
            await execAsync(`chmod +x "${path.join(packageDir, 'install.js')}"`);
        } catch (error) {
            // Ignore on Windows
        }
    }

    async createStandaloneReadme(packageDir) {
        const readmeContent = `# Test Validation Extension Pack - Standalone Installation

This is a standalone package for the Test Validation Extension Pack that can be installed without NPM.

## Installation

1. Extract the package to your desired location
2. Run the installer:
   \`\`\`bash
   node install.js
   \`\`\`

## Usage

After installation, you can use the extension with:

\`\`\`bash
node index.js --help
\`\`\`

## System Requirements

- Node.js 18.0.0 or higher
- NPM (for dependency installation)

## Files Included

- \`index.js\` - Main entry point
- \`install.js\` - Standalone installer
- \`src/\` - Source code
- \`.claude/agents/\` - Validation agents
- \`.claude/*.json\` - Pattern libraries

## Support

For issues and documentation, visit: https://github.com/claude-code/test-validation-extension-pack
`;
        
        await fs.writeFile(path.join(packageDir, 'STANDALONE_README.md'), readmeContent, 'utf-8');
    }

    async createDevelopmentSetup(packageDir) {
        const setupContent = `#!/usr/bin/env node

/**
 * Development Environment Setup
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

async function setupDevelopment() {
    console.log(chalk.blue('🔧 Setting up development environment...'));
    
    try {
        console.log(chalk.yellow('📦 Installing dependencies...'));
        await execAsync('npm install');
        console.log(chalk.green('✅ Dependencies installed'));
        
        console.log(chalk.yellow('🧪 Running initial tests...'));
        await execAsync('npm test');
        console.log(chalk.green('✅ All tests passed'));
        
        console.log(chalk.yellow('✨ Setting up pre-commit hooks...'));
        await execAsync('npx husky install');
        console.log(chalk.green('✅ Pre-commit hooks installed'));
        
        console.log(chalk.green('\\n✅ Development environment ready!'));
        console.log(chalk.blue('Available commands:'));
        console.log(chalk.blue('  npm test          - Run tests'));
        console.log(chalk.blue('  npm run lint      - Run linting'));
        console.log(chalk.blue('  npm run dev       - Start development server'));
        
    } catch (error) {
        console.error(chalk.red(\`❌ Setup failed: \${error.message}\`));
        process.exit(1);
    }
}

setupDevelopment();`;
        
        await fs.writeFile(path.join(packageDir, 'setup-dev.js'), setupContent, 'utf-8');
    }

    async createDevelopmentReadme(packageDir) {
        const readmeContent = `# Test Validation Extension Pack - Development Package

This package contains the full development environment including tests, development tools, and source code.

## Quick Start

1. Run the setup script:
   \`\`\`bash
   node setup-dev.js
   \`\`\`

2. Start development:
   \`\`\`bash
   npm run dev
   \`\`\`

## Development Commands

- \`npm test\` - Run test suite
- \`npm run test:watch\` - Run tests in watch mode
- \`npm run test:coverage\` - Generate coverage report
- \`npm run lint\` - Run ESLint
- \`npm run lint:fix\` - Fix linting issues
- \`npm run format\` - Format code with Prettier

## Project Structure

- \`src/\` - Source code
- \`tests/\` - Test files
- \`scripts/\` - Build and distribution scripts
- \`.claude/\` - Extension configuration and agents

## Contributing

1. Make your changes
2. Run tests: \`npm test\`
3. Run linting: \`npm run lint\`
4. Commit with conventional commits format

## Building

To build distribution packages:

\`\`\`bash
npm run build
npm run package
\`\`\`
`;
        
        await fs.writeFile(path.join(packageDir, 'DEVELOPMENT_README.md'), readmeContent, 'utf-8');
    }

    async generateDocumentation(packageDir) {
        // Create docs directory
        const docsDir = path.join(packageDir, 'docs');
        await fs.mkdir(docsDir, { recursive: true });
        
        // Generate usage examples
        const usageContent = `# Usage Examples

## Basic Installation

\`\`\`bash
npm install @claude-code/test-validation-extension-pack
\`\`\`

## Using with Claude Code

1. Install the extension
2. Run validation:
   \`\`\`bash
   claude-test-validation --validate
   \`\`\`

## Configuration

Create a \`.claude/config.json\` file:

\`\`\`json
{
  "testValidation": {
    "enabled": true,
    "strictMode": false,
    "patternMatching": true
  }
}
\`\`\`

## API Reference

### InstallationManager

Handles automatic dependency installation.

### AgentPatcher

Modifies existing Claude Code agents with test validation enhancements.

### PatternLibraryManager

Manages test failure patterns for institutional knowledge.
`;
        
        await fs.writeFile(path.join(docsDir, 'usage.md'), usageContent, 'utf-8');
        
        // Generate API documentation index
        const apiIndexContent = `# API Documentation

## Core Classes

- [InstallationManager](./api/installation-manager.md) - Dependency management
- [AgentPatcher](./api/agent-patcher.md) - Agent enhancement
- [PatternLibraryManager](./api/pattern-library-manager.md) - Pattern management

## Configuration

- [Extension Configuration](./config/extension-config.md)
- [Agent Configuration](./config/agent-config.md)
- [Pattern Libraries](./config/pattern-libraries.md)

## Examples

- [Basic Usage](./examples/basic-usage.md)
- [Advanced Configuration](./examples/advanced-config.md)
- [Custom Patterns](./examples/custom-patterns.md)
`;
        
        await fs.writeFile(path.join(docsDir, 'api-index.md'), apiIndexContent, 'utf-8');
    }

    async generateApiDocs(packageDir) {
        // This is a simplified API doc generation
        // In a real implementation, you might use JSDoc or similar tools
        
        const apiDir = path.join(packageDir, 'docs', 'api');
        await fs.mkdir(apiDir, { recursive: true });
        
        // Generate placeholder API documentation
        const classes = ['InstallationManager', 'AgentPatcher', 'PatternLibraryManager'];
        
        for (const className of classes) {
            const apiDoc = `# ${className}

## Overview

Documentation for the ${className} class.

## Constructor

\`\`\`javascript
const manager = new ${className}(options);
\`\`\`

## Methods

### method1()

Description of method1.

### method2(param)

Description of method2.

- \`param\` - Parameter description

## Examples

\`\`\`javascript
// Example usage
const manager = new ${className}();
await manager.method1();
\`\`\`
`;
            
            await fs.writeFile(
                path.join(apiDir, `${className.toLowerCase().replace(/([A-Z])/g, '-$1').slice(1)}.md`),
                apiDoc,
                'utf-8'
            );
        }
    }

    async createTarball(packageDir, filename) {
        const tarballPath = path.join(this.options.outputDir, filename);
        
        try {
            // Create tarball using tar command
            await execAsync(`tar -czf "${tarballPath}" -C "${path.dirname(packageDir)}" "${path.basename(packageDir)}"`);
            console.log(chalk.green(`  ✅ Created tarball: ${filename}`));
        } catch (error) {
            // Fallback: just note that tarball creation failed
            this.warnings.push(`Could not create tarball ${filename}: ${error.message}`);
        }
    }

    async generateIndex() {
        const indexContent = {
            buildId: this.buildId,
            createdAt: new Date().toISOString(),
            packages: this.packages,
            summary: {
                total: this.packages.length,
                types: [...new Set(this.packages.map(p => p.type))],
                errors: this.errors.length,
                warnings: this.warnings.length
            }
        };
        
        await fs.writeFile(
            path.join(this.options.outputDir, 'package-index.json'),
            JSON.stringify(indexContent, null, 2),
            'utf-8'
        );
        
        // Create human-readable index
        const readableIndex = `# Distribution Packages

Generated on: ${new Date().toISOString()}
Build ID: ${this.buildId}

## Available Packages

${this.packages.map(pkg => `
### ${pkg.name}
- **Type**: ${pkg.type}
- **Description**: ${pkg.description}
- **Location**: ${path.relative(this.options.outputDir, pkg.path)}
`).join('')}

## Summary
- Total packages: ${this.packages.length}
- Package types: ${[...new Set(this.packages.map(p => p.type))].join(', ')}
- Errors: ${this.errors.length}
- Warnings: ${this.warnings.length}
`;
        
        await fs.writeFile(
            path.join(this.options.outputDir, 'README.md'),
            readableIndex,
            'utf-8'
        );
    }

    printSummary() {
        console.log('\n' + chalk.blue('📊 Packaging Summary:'));
        console.log(chalk.blue(`📦 Packages created: ${this.packages.length}`));
        
        this.packages.forEach(pkg => {
            console.log(chalk.green(`  ✅ ${pkg.name} (${pkg.type})`));
        });
        
        if (this.errors.length > 0) {
            console.log(chalk.red(`\n❌ Errors (${this.errors.length}):`));
            this.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
        }
        
        if (this.warnings.length > 0) {
            console.log(chalk.yellow(`\n⚠️  Warnings (${this.warnings.length}):`));
            this.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
        }
    }
}

// Run packaging if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--output' && args[i + 1]) {
            options.outputDir = args[i + 1];
            i++;
        } else if (arg === '--no-tarball') {
            options.createTarball = false;
        } else if (arg === '--type' && args[i + 1]) {
            options.packageTypes = args[i + 1].split(',');
            i++;
        }
    }
    
    const distributor = new PackageDistributor(options);
    distributor.createDistribution().catch(error => {
        console.error(chalk.red(`Fatal packaging error: ${error.message}`));
        process.exit(1);
    });
}

export default PackageDistributor;