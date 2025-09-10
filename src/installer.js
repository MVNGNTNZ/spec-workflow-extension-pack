/**
 * InstallationManager - Auto-dependency handling for claude-code-spec-workflow
 * 
 * This class handles automatic detection and installation of claude-code-spec-workflow
 * dependency with comprehensive error handling and user feedback.
 * 
 * Task 2.1: Create InstallationManager with auto-dependency handling
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import chalk from 'chalk';

export class InstallationManager {
  constructor(options = {}) {
    this.options = {
      autoInstall: true,
      verbose: false,
      timeout: 120000, // 2 minutes timeout
      requiredVersion: '>=1.0.0',
      ...options
    };
    
    this.packageName = '@pizmzno/claude-code-spec-workflow';
    this.globalPackageName = '@pizmzno/claude-code-spec-workflow';
  }

  /**
   * Main entry point - checks and installs claude-code-spec-workflow if needed
   */
  async ensureDependency() {
    try {
      const checkResult = await this.checkClaudeWorkflow();
      
      if (checkResult.installed && checkResult.compatible) {
        if (this.options.verbose) {
          console.log(chalk.green(`✓ ${this.packageName} is already installed and compatible`));
        }
        return checkResult;
      }

      if (!checkResult.installed) {
        console.log(chalk.yellow(`⚠ ${this.packageName} is not installed`));
        
        if (this.options.autoInstall) {
          console.log(chalk.blue('🔧 Auto-installing claude-code-spec-workflow...'));
          const installResult = await this.installClaudeWorkflow();
          
          if (installResult.success) {
            console.log(chalk.green('✓ Installation completed successfully'));
            return await this.checkClaudeWorkflow(); // Re-check after installation
          } else {
            throw new Error(`Installation failed: ${installResult.message}`);
          }
        } else {
          throw new Error(`${this.packageName} is required but auto-install is disabled`);
        }
      } else if (!checkResult.compatible) {
        console.log(chalk.yellow(`⚠ ${this.packageName} version ${checkResult.version} is not compatible`));
        console.log(chalk.blue('🔧 Updating to compatible version...'));
        
        const installResult = await this.installClaudeWorkflow();
        if (installResult.success) {
          console.log(chalk.green('✓ Update completed successfully'));
          return await this.checkClaudeWorkflow();
        } else {
          throw new Error(`Update failed: ${installResult.message}`);
        }
      }

    } catch (error) {
      console.error(chalk.red(`❌ Dependency management failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Check if claude-code-spec-workflow is installed and compatible
   */
  async checkClaudeWorkflow() {
    try {
      // Check local installation first
      const localCheck = await this.checkLocalInstallation();
      if (localCheck.installed) {
        return localCheck;
      }

      // Check global installation
      const globalCheck = await this.checkGlobalInstallation();
      return globalCheck;

    } catch (error) {
      if (this.options.verbose) {
        console.warn(chalk.yellow(`Warning during dependency check: ${error.message}`));
      }
      
      return {
        installed: false,
        version: null,
        compatible: false,
        error: error.message
      };
    }
  }

  /**
   * Check local node_modules installation
   */
  async checkLocalInstallation() {
    try {
      const packagePath = path.resolve('node_modules', this.packageName, 'package.json');
      
      if (await fs.pathExists(packagePath)) {
        const packageJson = await fs.readJson(packagePath);
        const version = packageJson.version;
        const compatible = semver.satisfies(version, this.options.requiredVersion);
        
        return {
          installed: true,
          version,
          compatible,
          location: 'local',
          path: packagePath
        };
      }
    } catch (error) {
      // Silent failure for local check
    }

    return { installed: false, version: null, compatible: false, location: 'local' };
  }

  /**
   * Check global npm installation
   */
  async checkGlobalInstallation() {
    try {
      // Try to get global package info
      const result = execSync(`npm list -g ${this.globalPackageName} --json --depth=0`, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      });
      
      const globalPackages = JSON.parse(result);
      const packageInfo = globalPackages.dependencies?.[this.globalPackageName];
      
      if (packageInfo) {
        const version = packageInfo.version;
        const compatible = semver.satisfies(version, this.options.requiredVersion);
        
        return {
          installed: true,
          version,
          compatible,
          location: 'global',
          path: packageInfo.resolved || 'global'
        };
      }
    } catch (error) {
      // Try alternative global check method
      try {
        const version = execSync(`${this.globalPackageName} --version`, { 
          encoding: 'utf8', 
          stdio: 'pipe' 
        }).trim();
        
        const compatible = semver.satisfies(version, this.options.requiredVersion);
        
        return {
          installed: true,
          version,
          compatible,
          location: 'global-command',
          path: 'global'
        };
      } catch (cmdError) {
        // Package not found globally
      }
    }

    return { installed: false, version: null, compatible: false, location: 'global' };
  }

  /**
   * Install claude-code-spec-workflow
   */
  async installClaudeWorkflow() {
    try {
      const packageManager = await this.detectPackageManager();
      
      console.log(chalk.blue(`Installing ${this.globalPackageName} using ${packageManager}...`));
      
      const installResult = await this.executeInstallation(packageManager);
      
      if (installResult.success) {
        // Verify installation
        const verifyResult = await this.checkClaudeWorkflow();
        
        if (verifyResult.installed && verifyResult.compatible) {
          return {
            success: true,
            message: `Successfully installed ${this.globalPackageName} v${verifyResult.version}`,
            version: verifyResult.version,
            location: verifyResult.location
          };
        } else {
          return {
            success: false,
            message: 'Installation completed but verification failed',
            details: verifyResult
          };
        }
      } else {
        return installResult;
      }

    } catch (error) {
      return {
        success: false,
        message: `Installation failed: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Detect the package manager to use (npm, yarn, pnpm)
   */
  async detectPackageManager() {
    // Check for lock files to determine package manager
    if (await fs.pathExists('pnpm-lock.yaml')) {
      return 'pnpm';
    }
    
    if (await fs.pathExists('yarn.lock')) {
      return 'yarn';
    }
    
    if (await fs.pathExists('package-lock.json')) {
      return 'npm';
    }

    // Default to npm if no lock files found
    return 'npm';
  }

  /**
   * Execute the actual installation command
   */
  async executeInstallation(packageManager) {
    return new Promise((resolve) => {
      const commands = {
        npm: ['npm', ['install', '-g', this.globalPackageName]],
        yarn: ['yarn', ['global', 'add', this.globalPackageName]],
        pnpm: ['pnpm', ['add', '-g', this.globalPackageName]]
      };

      const [command, args] = commands[packageManager];
      
      if (this.options.verbose) {
        console.log(chalk.gray(`Executing: ${command} ${args.join(' ')}`));
      }

      const child = spawn(command, args, {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      if (!this.options.verbose) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          message: `Installation timeout after ${this.options.timeout}ms`,
          timeout: true
        });
      }, this.options.timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        
        if (code === 0) {
          resolve({
            success: true,
            message: `${packageManager} installation completed successfully`,
            stdout,
            stderr
          });
        } else {
          resolve({
            success: false,
            message: `${packageManager} installation failed with exit code ${code}`,
            exitCode: code,
            stdout,
            stderr
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          message: `Failed to start installation process: ${error.message}`,
          error
        });
      });
    });
  }

  /**
   * Get detailed dependency information
   */
  async getDependencyInfo() {
    const checkResult = await this.checkClaudeWorkflow();
    
    return {
      packageName: this.packageName,
      globalPackageName: this.globalPackageName,
      requiredVersion: this.options.requiredVersion,
      currentStatus: checkResult,
      autoInstall: this.options.autoInstall,
      packageManager: await this.detectPackageManager()
    };
  }

  /**
   * Cleanup method for removing installed dependencies (if needed)
   */
  async cleanup() {
    try {
      const checkResult = await this.checkClaudeWorkflow();
      
      if (checkResult.installed && checkResult.location === 'global') {
        const packageManager = await this.detectPackageManager();
        
        console.log(chalk.yellow(`Removing ${this.globalPackageName}...`));
        
        const commands = {
          npm: ['npm', ['uninstall', '-g', this.globalPackageName]],
          yarn: ['yarn', ['global', 'remove', this.globalPackageName]],
          pnpm: ['pnpm', ['remove', '-g', this.globalPackageName]]
        };

        const [command, args] = commands[packageManager];
        
        execSync(`${command} ${args.join(' ')}`, { stdio: 'inherit' });
        
        console.log(chalk.green('✓ Cleanup completed'));
        return { success: true, message: 'Dependency removed successfully' };
      }
      
      return { success: true, message: 'No cleanup required' };
      
    } catch (error) {
      return { 
        success: false, 
        message: `Cleanup failed: ${error.message}`,
        error 
      };
    }
  }

  /**
   * Install Git workflow integration with user preferences
   */
  async installGitWorkflow(options = {}) {
    try {
      console.log(chalk.blue('\n🔧 Setting up Git Workflow Integration...'));
      
      const gitOptions = await this.promptGitWorkflowOptions(options);
      
      if (!gitOptions.enableGit) {
        console.log(chalk.yellow('⚠ Skipping Git workflow integration'));
        return { success: true, message: 'Git workflow installation skipped' };
      }

      // Copy Git services to target repository
      const copyResult = await this.copyGitServices();
      if (!copyResult.success) {
        throw new Error(`Failed to copy Git services: ${copyResult.message}`);
      }

      // Create Git automation configuration
      const configResult = await this.createGitConfiguration(gitOptions);
      if (!configResult.success) {
        throw new Error(`Failed to create Git configuration: ${configResult.message}`);
      }

      console.log(chalk.green('✅ Git workflow integration installed successfully!'));
      console.log(chalk.cyan(`📋 Commit frequency: ${gitOptions.commitFrequency}`));
      console.log(chalk.cyan(`🎯 Intelligent messages: ${gitOptions.useIntelligentMessages ? 'enabled' : 'disabled'}`));
      
      return {
        success: true,
        message: 'Git workflow integration installed successfully',
        configuration: gitOptions
      };

    } catch (error) {
      console.error(chalk.red(`❌ Git workflow installation failed: ${error.message}`));
      return {
        success: false,
        message: `Git workflow installation failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Prompt user for Git workflow preferences
   */
  async promptGitWorkflowOptions(options = {}) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (question) => new Promise(resolve => rl.question(question, resolve));

    try {
      if (options.silent) {
        // Use default options for silent installation
        return {
          enableGit: options.enableGit ?? false,
          commitFrequency: options.commitFrequency ?? 'phase',
          useIntelligentMessages: options.useIntelligentMessages ?? true,
          requireConfirmation: options.requireConfirmation ?? true
        };
      }

      console.log(chalk.cyan('\n📝 Git Workflow Configuration'));
      console.log(chalk.gray('Configure automatic Git commits for your spec-driven development workflow.\n'));

      // Enable Git workflow
      const enableGit = await ask(chalk.blue('Enable Git auto-commit? (y/n) [n]: '));
      if (!['y', 'yes', '1', 'true'].includes(enableGit.toLowerCase().trim())) {
        rl.close();
        return { enableGit: false };
      }

      console.log(chalk.cyan('\n🎯 When should commits be created?'));
      console.log(chalk.gray('  1. After each task (most granular, many commits)'));
      console.log(chalk.gray('  2. After each phase (recommended, balanced approach) [default]'));
      console.log(chalk.gray('  3. After complete spec (least granular, single commit)'));
      
      const frequencyChoice = await ask(chalk.blue('Choice (1/2/3) [2]: '));
      const commitFrequency = {
        '1': 'task',
        '2': 'phase', 
        '3': 'spec'
      }[frequencyChoice.trim()] || 'phase';

      // Intelligent messages
      const intelligentMessages = await ask(chalk.blue('Use intelligent commit messages? (y/n) [y]: '));
      const useIntelligentMessages = !['n', 'no', '0', 'false'].includes(intelligentMessages.toLowerCase().trim());

      // Confirmation requirement
      const confirmation = await ask(chalk.blue('Require confirmation before commits? (y/n) [y]: '));
      const requireConfirmation = !['n', 'no', '0', 'false'].includes(confirmation.toLowerCase().trim());

      rl.close();

      return {
        enableGit: true,
        commitFrequency,
        useIntelligentMessages,
        requireConfirmation
      };

    } catch (error) {
      rl.close();
      throw error;
    }
  }

  /**
   * Copy Git service files to target repository
   */
  async copyGitServices() {
    try {
      const targetDir = path.resolve('.claude/services');
      const sourceDir = path.resolve(__dirname, '../../.claude/services');

      console.log(chalk.blue('📁 Copying Git service files...'));

      // Ensure target directory exists
      await fs.ensureDir(targetDir);

      // Git service files to copy
      const gitServiceFiles = [
        'git_config_reader.py',
        'git_file_detector.py', 
        'git_message_generator.py',
        'git_auto_commit.py',
        'git_commit_handler.py',
        'git_task_aggregator.py',
        'git_user_confirmation.py',
        'git_service_init.py',
        'spec_integration_hook.py',
        '__init__.py'
      ];

      let copiedCount = 0;
      for (const file of gitServiceFiles) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);
        
        if (await fs.pathExists(sourcePath)) {
          await fs.copy(sourcePath, targetPath);
          copiedCount++;
          if (this.options.verbose) {
            console.log(chalk.gray(`  ✓ Copied ${file}`));
          }
        }
      }

      console.log(chalk.green(`✅ Copied ${copiedCount} Git service files`));
      
      return {
        success: true,
        message: `Copied ${copiedCount} Git service files`,
        copiedCount
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to copy Git services: ${error.message}`,
        error
      };
    }
  }

  /**
   * Create Git automation configuration file
   */
  async createGitConfiguration(options) {
    try {
      const configPath = path.resolve('.claude/git-automation.json');
      
      console.log(chalk.blue('⚙️ Creating Git automation configuration...'));

      const config = {
        git_automation_enabled: options.enableGit,
        git_automation: {
          commit_frequency: options.commitFrequency,
          commit_message_template: 'feat: Complete {phase_or_spec} - {description}',
          auto_add_files: true,
          use_intelligent_messages: options.useIntelligentMessages,
          aggregate_commit_messages: options.commitFrequency !== 'task',
          include_task_count: true,
          fallback_message_template: 'feat: Complete task {task_id} - {task_title}',
          max_message_length: 72,
          require_confirmation: options.requireConfirmation
        }
      };

      await fs.writeJson(configPath, config, { spaces: 2 });
      
      console.log(chalk.green('✅ Git configuration created'));
      if (this.options.verbose) {
        console.log(chalk.gray(`  📄 Configuration saved to: ${configPath}`));
      }

      return {
        success: true,
        message: 'Git configuration created successfully',
        configPath,
        config
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to create Git configuration: ${error.message}`,
        error
      };
    }
  }

  /**
   * Uninstall Git workflow integration
   */
  async uninstallGitWorkflow() {
    try {
      console.log(chalk.yellow('🔧 Removing Git workflow integration...'));

      const results = [];

      // Remove Git service files
      const servicesDir = path.resolve('.claude/services');
      const gitServiceFiles = [
        'git_config_reader.py', 'git_file_detector.py', 'git_message_generator.py',
        'git_auto_commit.py', 'git_commit_handler.py', 'git_task_aggregator.py',
        'git_user_confirmation.py', 'git_service_init.py', 'spec_integration_hook.py'
      ];

      let removedCount = 0;
      for (const file of gitServiceFiles) {
        const filePath = path.join(servicesDir, file);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          removedCount++;
        }
      }
      results.push(`Removed ${removedCount} Git service files`);

      // Remove configuration file
      const configPath = path.resolve('.claude/git-automation.json');
      if (await fs.pathExists(configPath)) {
        await fs.remove(configPath);
        results.push('Removed Git automation configuration');
      }

      // Remove workflow storage directory
      const workflowDir = path.resolve('.claude/git-workflow');
      if (await fs.pathExists(workflowDir)) {
        await fs.remove(workflowDir);
        results.push('Removed Git workflow storage');
      }

      console.log(chalk.green('✅ Git workflow integration removed successfully'));
      
      return {
        success: true,
        message: 'Git workflow integration uninstalled',
        details: results
      };

    } catch (error) {
      return {
        success: false,
        message: `Git workflow uninstall failed: ${error.message}`,
        error
      };
    }
  }
}