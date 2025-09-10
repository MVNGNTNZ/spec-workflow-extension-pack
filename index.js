#!/usr/bin/env node

/**
 * Claude Code Test Validation Extension Pack
 * 
 * Main entry point for the test validation extension that provides advanced
 * test validation capabilities, pattern recognition, and institutional knowledge
 * capture for Claude Code spec-driven development workflows.
 * 
 * @version 1.0.0
 * @author Claude Code Team
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';
import { InstallationManager } from './src/installer.js';
import { ConfigurationManager } from './src/config.js';
import { AgentPatcher } from './src/agent-patcher.js';
import { PatternManager } from './src/pattern-manager.js';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extension metadata and version information
 */
const EXTENSION_INFO = {
  name: '@claude-code/test-validation-extension-pack',
  version: '1.0.0',
  description: 'Advanced test validation with pattern recognition',
  compatibleVersions: ['>=1.0.0'],
  requiredFeatures: ['spec-validation', 'pattern-recognition', 'agent-enhancement']
};

/**
 * Main Extension Class
 * 
 * Orchestrates all extension functionality including installation detection,
 * dependency management, agent enhancement, and pattern recognition.
 */
export class TestValidationExtension {
  constructor(options = {}) {
    this.options = {
      autoInstall: true,
      enableDashboard: true,
      enableDatabase: false,
      debugMode: false,
      ...options
    };
    
    this.installer = new InstallationManager(this.options);
    this.config = new ConfigurationManager(this.options);
    this.agentPatcher = new AgentPatcher(this.options);
    this.patternManager = new PatternManager(this.options);
    
    this.initialized = false;
    this.claudeWorkflowVersion = null;
  }

  /**
   * Initialize the extension with dependency checking and setup
   * 
   * @param {Object} initOptions - Initialization options
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(initOptions = {}) {
    try {
      console.log(chalk.blue('🚀 Initializing Claude Code Test Validation Extension Pack...'));
      
      // Load and validate configuration
      await this.config.load();
      console.log(chalk.green('✓ Configuration loaded successfully'));
      
      // Check for claude-code-spec-workflow dependency
      const dependencyCheck = await this.checkDependencies();
      if (!dependencyCheck.satisfied) {
        console.log(chalk.yellow('⚠️  Missing claude-code-spec-workflow dependency'));
        
        if (this.options.autoInstall) {
          console.log(chalk.blue('📦 Auto-installing claude-code-spec-workflow...'));
          const installResult = await this.installer.installClaudeWorkflow();
          
          if (!installResult.success) {
            throw new Error(`Failed to auto-install dependency: ${installResult.error}`);
          }
          
          console.log(chalk.green('✓ claude-code-spec-workflow installed successfully'));
        } else {
          throw new Error('claude-code-spec-workflow is required but auto-install is disabled');
        }
      } else {
        console.log(chalk.green('✓ claude-code-spec-workflow dependency satisfied'));
        this.claudeWorkflowVersion = dependencyCheck.version;
      }
      
      // Initialize pattern libraries
      await this.patternManager.initialize();
      console.log(chalk.green('✓ Pattern libraries initialized'));
      
      // Apply agent enhancements if enabled
      if (this.config.get('agentPatchLevel') !== 'none') {
        console.log(chalk.blue('🔧 Applying agent enhancements...'));
        const patchResults = await this.agentPatcher.applyEnhancements();
        
        if (patchResults.success) {
          console.log(chalk.green(`✓ Enhanced ${patchResults.patchedCount} validation agents`));
        } else {
          console.log(chalk.yellow(`⚠️  Agent enhancement partially failed: ${patchResults.error}`));
        }
      }
      
      this.initialized = true;
      console.log(chalk.green('🎉 Extension initialized successfully!'));
      
      return true;
      
    } catch (error) {
      console.error(chalk.red('❌ Extension initialization failed:'), error.message);
      
      if (this.options.debugMode) {
        console.error(chalk.gray(error.stack));
      }
      
      return false;
    }
  }

  /**
   * Check dependency satisfaction and version compatibility
   * 
   * @returns {Promise<Object>} - Dependency check results
   */
  async checkDependencies() {
    try {
      const workflowCheck = await this.installer.checkClaudeWorkflow();
      
      return {
        satisfied: workflowCheck.installed,
        version: workflowCheck.version,
        compatible: workflowCheck.compatible,
        details: workflowCheck
      };
      
    } catch (error) {
      return {
        satisfied: false,
        version: null,
        compatible: false,
        error: error.message
      };
    }
  }

  /**
   * Get current extension status and health information
   * 
   * @returns {Object} - Extension status details
   */
  getStatus() {
    return {
      initialized: this.initialized,
      version: EXTENSION_INFO.version,
      claudeWorkflowVersion: this.claudeWorkflowVersion,
      configuration: this.config.getAll(),
      agentEnhancements: this.agentPatcher.getStatus(),
      patternLibraries: this.patternManager.getStatus(),
      features: {
        autoInstall: this.options.autoInstall,
        dashboard: this.options.enableDashboard,
        database: this.options.enableDatabase
      }
    };
  }

  /**
   * Validate test files using enhanced agents with pattern recognition
   * 
   * @param {string|Array} files - Files to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} - Validation results
   */
  async validateTests(files, options = {}) {
    if (!this.initialized) {
      throw new Error('Extension must be initialized before validation');
    }

    const validationOptions = {
      applyPatterns: true,
      learnPatterns: true,
      confidence: 0.7,
      ...options
    };

    try {
      // Run enhanced validation through pattern manager
      const results = await this.patternManager.validateWithPatterns(
        files, 
        validationOptions
      );

      return {
        success: true,
        results,
        patternsApplied: results.patternsApplied || [],
        patternsLearned: results.patternsLearned || [],
        recommendations: results.recommendations || []
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        results: null
      };
    }
  }

  /**
   * Start the dashboard server if enabled
   * 
   * @param {Object} serverOptions - Server configuration options
   * @returns {Promise<Object>} - Server start results
   */
  async startDashboard(serverOptions = {}) {
    if (!this.options.enableDashboard) {
      throw new Error('Dashboard is not enabled in configuration');
    }

    try {
      // Dynamic import to avoid loading dashboard dependencies if not needed
      const { DashboardServer } = await import('./dashboard/server/index.js');
      
      const server = new DashboardServer({
        port: serverOptions.port || 3001,
        enableAuth: serverOptions.enableAuth !== false,
        patternManager: this.patternManager,
        ...serverOptions
      });

      const startResult = await server.start();
      
      if (startResult.success) {
        console.log(chalk.green(`🌐 Dashboard started at http://localhost:${startResult.port}`));
      }

      return startResult;

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up resources and restore original agents if needed
   */
  async cleanup() {
    try {
      console.log(chalk.blue('🧹 Cleaning up extension resources...'));
      
      // Rollback agent patches if applied
      if (this.agentPatcher.hasPatches()) {
        await this.agentPatcher.rollbackAll();
        console.log(chalk.green('✓ Agent patches rolled back'));
      }
      
      // Clean up temporary files and caches
      await this.patternManager.cleanup();
      console.log(chalk.green('✓ Pattern manager cleaned up'));
      
      console.log(chalk.green('🎉 Extension cleanup completed'));
      
    } catch (error) {
      console.error(chalk.red('❌ Cleanup failed:'), error.message);
    }
  }
}

/**
 * CLI Command Handler
 * 
 * Handles command-line invocation of the extension
 */
async function handleCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const extension = new TestValidationExtension({
    autoInstall: true,
    debugMode: args.includes('--debug')
  });

  switch (command) {
    case 'init':
    case 'initialize':
      await extension.initialize();
      break;
      
    case 'status':
      const status = extension.getStatus();
      console.log(chalk.blue('Extension Status:'));
      console.log(JSON.stringify(status, null, 2));
      break;
      
    case 'validate':
      const files = args.slice(1).filter(arg => !arg.startsWith('--'));
      if (files.length === 0) {
        console.error(chalk.red('❌ No files specified for validation'));
        process.exit(1);
      }
      
      await extension.initialize();
      const results = await extension.validateTests(files);
      
      if (results.success) {
        console.log(chalk.green('✓ Validation completed'));
        console.log(JSON.stringify(results.results, null, 2));
      } else {
        console.error(chalk.red('❌ Validation failed:'), results.error);
        process.exit(1);
      }
      break;
      
    case 'dashboard':
      await extension.initialize();
      const dashResult = await extension.startDashboard();
      
      if (!dashResult.success) {
        console.error(chalk.red('❌ Dashboard failed to start:'), dashResult.error);
        process.exit(1);
      }
      break;
      
    case 'cleanup':
      await extension.cleanup();
      break;
      
    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(chalk.blue('Claude Code Test Validation Extension Pack'));
      console.log(chalk.gray(`Version: ${EXTENSION_INFO.version}`));
      console.log();
      console.log('Commands:');
      console.log('  init, initialize  Initialize extension and dependencies');
      console.log('  status           Show extension status and configuration');
      console.log('  validate <files> Validate test files with pattern recognition');
      console.log('  dashboard        Start quality metrics dashboard');
      console.log('  cleanup          Clean up and rollback changes');
      console.log('  help             Show this help message');
      console.log();
      console.log('Options:');
      console.log('  --debug          Enable debug mode with verbose logging');
      break;
  }
}

// Export core functionality
export {
  TestValidationExtension as default,
  EXTENSION_INFO,
  InstallationManager,
  ConfigurationManager,
  AgentPatcher,
  PatternManager
};

// CLI entry point when run directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  handleCLI().catch(error => {
    console.error(chalk.red('❌ Extension execution failed:'), error.message);
    process.exit(1);
  });
}