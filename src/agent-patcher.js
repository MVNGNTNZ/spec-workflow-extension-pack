import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

/**
 * AgentPatcher - Modifies existing claude-code-spec-workflow agents with test validation enhancements
 * 
 * This class handles patching of existing agents like spec-task-executor to include test validation
 * capabilities, while maintaining backups and rollback functionality.
 */
export class AgentPatcher {
  constructor(options = {}) {
    this.options = {
      claudeDir: '.claude',
      agentsDir: 'agents',
      backupSuffix: '.backup',
      dryRun: false,
      verbose: false,
      ...options
    };
    
    this.patchedAgents = [];
    this.claudePath = path.resolve(this.options.claudeDir);
    this.agentsPath = path.join(this.claudePath, this.options.agentsDir);
    this.backupPath = path.join(this.claudePath, 'backups', 'agents');
  }

  /**
   * Apply test validation enhancements to specified agents
   * @param {string[]} agentNames - Names of agents to patch (without .md extension)
   * @returns {Object} Result of the patching operation
   */
  async applyEnhancements(agentNames = ['spec-task-executor']) {
    try {
      await this._ensureDirectories();
      
      const results = {
        success: true,
        patchedCount: 0,
        errors: [],
        patched: []
      };

      for (const agentName of agentNames) {
        try {
          const patchResult = await this._patchAgent(agentName);
          if (patchResult.success) {
            results.patchedCount++;
            results.patched.push(agentName);
            this.patchedAgents.push({
              name: agentName,
              patchedAt: new Date().toISOString(),
              backupPath: patchResult.backupPath
            });
          }
        } catch (error) {
          results.errors.push({
            agent: agentName,
            error: error.message
          });
          if (this.options.verbose) {
            console.error(`Error patching ${agentName}:`, error);
          }
        }
      }

      results.success = results.errors.length === 0;
      results.message = `Enhanced ${results.patchedCount} agent(s) with test validation capabilities`;
      
      return results;
    } catch (error) {
      return {
        success: false,
        patchedCount: 0,
        error: error.message,
        message: 'Failed to apply agent enhancements'
      };
    }
  }

  /**
   * Patch a specific agent with test validation enhancements
   * @param {string} agentName - Name of the agent to patch
   * @returns {Object} Result of the patch operation
   * @private
   */
  async _patchAgent(agentName) {
    const agentFile = path.join(this.agentsPath, `${agentName}.md`);
    
    if (!await fs.pathExists(agentFile)) {
      throw new Error(`Agent file not found: ${agentFile}`);
    }

    // Create backup
    const backupPath = await this._createBackup(agentName);
    
    // Read current agent content
    const content = await fs.readFile(agentFile, 'utf8');
    const { frontMatter, body } = this._parseFrontMatter(content);
    
    // Apply test validation enhancements
    const enhancedContent = this._enhanceAgentWithTestValidation(frontMatter, body, agentName);
    
    if (!this.options.dryRun) {
      await fs.writeFile(agentFile, enhancedContent);
      
      if (this.options.verbose) {
        console.log(`✅ Enhanced ${agentName} with test validation capabilities`);
      }
    } else {
      console.log(`[DRY RUN] Would enhance ${agentName} with test validation capabilities`);
    }

    return {
      success: true,
      backupPath,
      enhanced: true
    };
  }

  /**
   * Enhance agent content with test validation capabilities
   * @param {Object} frontMatter - YAML front matter
   * @param {string} body - Agent body content
   * @param {string} agentName - Name of the agent
   * @returns {string} Enhanced agent content
   * @private
   */
  _enhanceAgentWithTestValidation(frontMatter, body, agentName) {
    // Update description to include test validation
    if (frontMatter.description && !frontMatter.description.includes('test validation')) {
      frontMatter.description = `${frontMatter.description} Enhanced with comprehensive test validation and quality assurance capabilities.`;
    }

    // Add test validation section based on agent type
    const testValidationSection = this._generateTestValidationSection(agentName);
    
    // Insert test validation section before the final "Remember" section if it exists
    let enhancedBody = body;
    const rememberMatch = body.match(/^Remember:.*$/m);
    
    if (rememberMatch) {
      enhancedBody = body.replace(rememberMatch[0], `${testValidationSection}\n\n${rememberMatch[0]}`);
    } else {
      enhancedBody = `${body}\n\n${testValidationSection}`;
    }

    // Reconstruct the full content
    const yamlHeader = yaml.dump(frontMatter).trim();
    return `---\n${yamlHeader}\n---\n\n${enhancedBody}`;
  }

  /**
   * Generate test validation section based on agent type
   * @param {string} agentName - Name of the agent
   * @returns {string} Test validation section content
   * @private
   */
  _generateTestValidationSection(agentName) {
    const commonTestValidation = `## Test Validation Protocol

### Automated Test Quality Assurance
Before marking any task as complete, you must:

1. **Test Coverage Analysis**
   - Verify that new code has appropriate test coverage
   - Check that existing tests still pass
   - Identify any gaps in test scenarios

2. **Test Quality Validation**
   - Ensure tests are meaningful and test actual functionality
   - Verify tests follow project testing conventions
   - Check that tests are not flaky or unreliable

3. **Integration Testing**
   - Run relevant integration tests if the change affects multiple components
   - Verify that changes don't break existing functionality
   - Test edge cases and error conditions`;

    const agentSpecificSections = {
      'spec-task-executor': `

### Task Implementation Testing Requirements
For each implemented task:

1. **Pre-Implementation Testing**
   - Run existing tests to establish baseline
   - Identify which tests might be affected by changes

2. **Implementation Testing**
   - Write tests for new functionality as you implement
   - Test both happy path and error conditions
   - Ensure proper error handling and validation

3. **Post-Implementation Validation**
   - Run full test suite to ensure no regressions
   - Verify new tests are passing and meaningful
   - Check test coverage meets project standards

4. **Quality Gates**
   - All tests must pass before marking task complete
   - Test coverage should not decrease
   - Code should follow project testing patterns`,

      'spec-design-validator': `

### Design Validation Testing Requirements
When validating designs:

1. **Testability Assessment**
   - Evaluate if the design is testable
   - Identify testing strategies for the proposed design
   - Ensure design supports both unit and integration testing

2. **Test Architecture Review**
   - Review proposed test structure
   - Validate test dependencies and mocking strategies
   - Ensure test isolation and reliability`,

      'spec-requirements-validator': `

### Requirements Testing Validation
When validating requirements:

1. **Test Requirement Analysis**
   - Ensure requirements are testable and verifiable
   - Identify acceptance criteria that can be automated
   - Validate that requirements support test-driven development

2. **Test Planning Integration**
   - Include testing considerations in requirements validation
   - Ensure requirements specify expected test coverage
   - Validate that requirements support quality assurance processes`
    };

    return commonTestValidation + (agentSpecificSections[agentName] || '');
  }

  /**
   * Apply Git workflow integration enhancements to agents
   * @param {string[]} agentNames - Names of agents to patch (without .md extension)
   * @returns {Object} Result of the patching operation
   */
  async applyGitWorkflowEnhancements(agentNames = ['spec-task-executor']) {
    try {
      await this._ensureDirectories();
      
      const results = {
        success: true,
        patchedCount: 0,
        errors: [],
        patched: []
      };

      for (const agentName of agentNames) {
        try {
          const patchResult = await this._patchAgentWithGitWorkflow(agentName);
          if (patchResult.success) {
            results.patchedCount++;
            results.patched.push(agentName);
            this.patchedAgents.push({
              name: agentName,
              patchedAt: new Date().toISOString(),
              backupPath: patchResult.backupPath,
              enhancement: 'git-workflow'
            });
          }
        } catch (error) {
          results.errors.push({
            agent: agentName,
            error: error.message
          });
          if (this.options.verbose) {
            console.error(`Error patching ${agentName} with Git workflow:`, error);
          }
        }
      }

      results.success = results.errors.length === 0;
      results.message = `Enhanced ${results.patchedCount} agent(s) with Git workflow integration`;
      
      return results;
    } catch (error) {
      return {
        success: false,
        patchedCount: 0,
        error: error.message,
        message: 'Failed to apply Git workflow enhancements'
      };
    }
  }

  /**
   * Patch a specific agent with Git workflow integration
   * @param {string} agentName - Name of the agent to patch
   * @returns {Object} Result of the patch operation
   * @private
   */
  async _patchAgentWithGitWorkflow(agentName) {
    const agentFile = path.join(this.agentsPath, `${agentName}.md`);
    
    if (!await fs.pathExists(agentFile)) {
      throw new Error(`Agent file not found: ${agentFile}`);
    }

    // Create backup
    const backupPath = await this._createBackup(agentName, 'git-workflow');
    
    // Read current agent content
    const content = await fs.readFile(agentFile, 'utf8');
    const { frontMatter, body } = this._parseFrontMatter(content);
    
    // Apply Git workflow enhancements
    const enhancedContent = this._enhanceAgentWithGitWorkflow(frontMatter, body, agentName);
    
    if (!this.options.dryRun) {
      await fs.writeFile(agentFile, enhancedContent);
      
      if (this.options.verbose) {
        console.log(`✅ Enhanced ${agentName} with Git workflow integration`);
      }
    } else {
      console.log(`[DRY RUN] Would enhance ${agentName} with Git workflow integration`);
    }

    return {
      success: true,
      backupPath,
      enhanced: true
    };
  }

  /**
   * Enhance agent content with Git workflow integration
   * @param {Object} frontMatter - YAML front matter
   * @param {string} body - Agent body content
   * @param {string} agentName - Name of the agent
   * @returns {string} Enhanced agent content
   * @private
   */
  _enhanceAgentWithGitWorkflow(frontMatter, body, agentName) {
    // Update description to include Git workflow
    if (frontMatter.description && !frontMatter.description.includes('Git workflow')) {
      frontMatter.description = `${frontMatter.description} Enhanced with intelligent Git workflow automation for automatic commits with configurable frequency.`;
    }

    // Add Git workflow section based on agent type
    const gitWorkflowSection = this._generateGitWorkflowSection(agentName);
    
    // Insert Git workflow section before task completion protocol
    let enhancedBody = body;
    const taskCompletionMatch = body.match(/^## Task Completion Protocol.*$/m);
    
    if (taskCompletionMatch) {
      enhancedBody = body.replace(taskCompletionMatch[0], `${gitWorkflowSection}\n\n${taskCompletionMatch[0]}`);
    } else {
      // Insert before final section or at end
      const finalSectionMatch = body.match(/^## (?!.*##).*$/m);
      if (finalSectionMatch) {
        enhancedBody = body.replace(finalSectionMatch[0], `${gitWorkflowSection}\n\n${finalSectionMatch[0]}`);
      } else {
        enhancedBody = `${body}\n\n${gitWorkflowSection}`;
      }
    }

    // Reconstruct the full content
    const yamlHeader = yaml.dump(frontMatter).trim();
    return `---\n${yamlHeader}\n---\n\n${enhancedBody}`;
  }

  /**
   * Generate Git workflow section based on agent type
   * @param {string} agentName - Name of the agent
   * @returns {string} Git workflow section content
   * @private
   */
  _generateGitWorkflowSection(agentName) {
    const commonGitWorkflow = `## Git Workflow Integration

### Automatic Commit Management
This agent supports intelligent Git workflow automation with configurable commit frequency:

- **Task-level commits**: Commits after each individual task completion
- **Phase-level commits**: Commits after completing groups of related tasks (recommended)
- **Spec-level commits**: Single commit after completing entire specification

### Git Automation Protocol
After task completion, the system will automatically:

1. **Check Configuration**: Verify if Git automation is enabled in \`.claude/git-automation.json\`
2. **Analyze Changes**: Detect modified files and analyze change patterns
3. **Generate Message**: Create intelligent commit message based on task context and file changes
4. **Execute Commit**: Add files and commit with descriptive message following conventional commit format

### Commit Message Intelligence
The system generates descriptive commit messages such as:
- \`feat: Add user authentication with JWT tokens\`
- \`fix: Resolve database connection timeout issues\`
- \`docs: Update API documentation for PrePacks module\`
- \`refactor: Simplify pricing calculation logic\``;

    const agentSpecificSections = {
      'spec-task-executor': `

### Task Execution with Git Integration
When implementing tasks:

1. **Pre-Execution Setup**
   - Check if Git automation is configured and enabled
   - Verify repository is in clean state before starting
   - Load commit frequency preferences from configuration

2. **During Task Implementation**
   - Work normally - focus on task implementation
   - Git integration is passive and non-intrusive
   - Continue with existing workflow patterns

3. **Post-Task Completion**
   \`\`\`bash
   # After marking task complete with get-tasks command:
   if [ -f ".claude/git-automation.json" ]; then
     python3 -c "
import sys, os
sys.path.insert(0, os.path.join('.claude', 'services'))
try:
    from spec_integration_hook import create_spec_integration_hook
    hook = create_spec_integration_hook()
    if hook.is_git_automation_enabled():
        result = hook.handle_task_completion(
            task_id='{task-id}',
            task_title='{task-title}',
            spec_name='{feature-name}',
            next_task_id='{next-task-id}',  # Optional
            total_tasks={total-tasks}       # Optional
        )
        if result.get('commit_result', {}).get('committed'):
            print(f'✅ Auto-committed: {result[\"commit_result\"][\"commit_message\"]}')
        else:
            reason = result.get('commit_result', {}).get('reason', 'Unknown')
            print(f'ℹ️  Commit {reason}')
except ImportError:
    # Git workflow not available - continue normally
    pass
except Exception as e:
    # Git workflow failed - continue normally, don't break task completion
    print(f'⚠️  Git workflow error: {e}')
     "
   fi
   \`\`\`

4. **Error Handling**
   - Git failures never block task completion
   - All Git operations are non-blocking and graceful
   - Errors are logged but workflow continues normally`,

      'spec-design-validator': `

### Design Validation with Git Context
When validating designs:

1. **Git-Aware Validation**
   - Consider how design changes will affect commit organization
   - Validate that design supports clean Git workflow integration
   - Ensure design doesn't create unnecessary commit noise

2. **Version Control Considerations**
   - Review if design creates appropriate file organization for Git
   - Validate that design supports meaningful commit messages
   - Ensure design changes can be tracked effectively in version control`,

      'spec-requirements-validator': `

### Requirements with Git Workflow Context
When validating requirements:

1. **Git-Friendly Requirements**
   - Ensure requirements can be implemented in logical commit units
   - Validate that acceptance criteria align with commit boundaries
   - Consider how requirements map to phase and task organization

2. **Version Control Integration**
   - Requirements should support incremental development
   - Acceptance criteria should be verifiable at commit boundaries
   - Requirements should enable meaningful commit message generation`
    };

    return commonGitWorkflow + (agentSpecificSections[agentName] || '');
  }

  /**
   * Parse YAML front matter from markdown content
   * @param {string} content - Markdown content with front matter
   * @returns {Object} Object with frontMatter and body
   * @private
   */
  _parseFrontMatter(content) {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (frontMatterMatch) {
      try {
        const frontMatter = yaml.load(frontMatterMatch[1]) || {};
        const body = frontMatterMatch[2];
        return { frontMatter, body };
      } catch (error) {
        console.warn('Warning: Failed to parse YAML front matter, using raw content');
        return { frontMatter: {}, body: content };
      }
    }
    
    return { frontMatter: {}, body: content };
  }

  /**
   * Create a backup of the agent file
   * @param {string} agentName - Name of the agent
   * @returns {string} Path to the backup file
   * @private
   */
  async _createBackup(agentName) {
    const sourceFile = path.join(this.agentsPath, `${agentName}.md`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupPath, `${agentName}.${timestamp}.backup.md`);
    
    await fs.copy(sourceFile, backupFile);
    
    if (this.options.verbose) {
      console.log(`📁 Created backup: ${backupFile}`);
    }
    
    return backupFile;
  }

  /**
   * Ensure required directories exist
   * @private
   */
  async _ensureDirectories() {
    await fs.ensureDir(this.agentsPath);
    await fs.ensureDir(this.backupPath);
  }

  /**
   * Get current patching status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      patchedAgents: this.patchedAgents,
      patchLevel: 'enhanced',
      backupLocation: this.backupPath,
      totalPatched: this.patchedAgents.length
    };
  }

  /**
   * Check if any agents have been patched
   * @returns {boolean} True if agents have been patched
   */
  hasPatches() {
    return this.patchedAgents.length > 0;
  }

  /**
   * List all available agents that can be patched
   * @returns {string[]} Array of agent names
   */
  async getAvailableAgents() {
    try {
      if (!await fs.pathExists(this.agentsPath)) {
        return [];
      }
      
      const files = await fs.readdir(this.agentsPath);
      return files
        .filter(file => file.endsWith('.md'))
        .map(file => file.replace('.md', ''));
    } catch (error) {
      if (this.options.verbose) {
        console.error('Error reading agents directory:', error);
      }
      return [];
    }
  }

  /**
   * Rollback all patched agents to their original state
   * @returns {boolean} True if rollback was successful
   */
  async rollbackAll() {
    try {
      let rolledBack = 0;
      
      for (const patchInfo of this.patchedAgents) {
        const agentFile = path.join(this.agentsPath, `${patchInfo.name}.md`);
        
        if (await fs.pathExists(patchInfo.backupPath)) {
          await fs.copy(patchInfo.backupPath, agentFile);
          rolledBack++;
          
          if (this.options.verbose) {
            console.log(`⏮️  Rolled back ${patchInfo.name}`);
          }
        }
      }
      
      this.patchedAgents = [];
      
      if (this.options.verbose) {
        console.log(`✅ Rolled back ${rolledBack} agent(s)`);
      }
      
      return true;
    } catch (error) {
      if (this.options.verbose) {
        console.error('Error during rollback:', error);
      }
      return false;
    }
  }

  /**
   * Rollback a specific agent
   * @param {string} agentName - Name of the agent to rollback
   * @returns {boolean} True if rollback was successful
   */
  async rollbackAgent(agentName) {
    try {
      const patchIndex = this.patchedAgents.findIndex(p => p.name === agentName);
      
      if (patchIndex === -1) {
        throw new Error(`Agent ${agentName} was not patched`);
      }
      
      const patchInfo = this.patchedAgents[patchIndex];
      const agentFile = path.join(this.agentsPath, `${agentName}.md`);
      
      if (await fs.pathExists(patchInfo.backupPath)) {
        await fs.copy(patchInfo.backupPath, agentFile);
        this.patchedAgents.splice(patchIndex, 1);
        
        if (this.options.verbose) {
          console.log(`⏮️  Rolled back ${agentName}`);
        }
        
        return true;
      }
      
      throw new Error(`Backup not found: ${patchInfo.backupPath}`);
    } catch (error) {
      if (this.options.verbose) {
        console.error(`Error rolling back ${agentName}:`, error);
      }
      return false;
    }
  }
}