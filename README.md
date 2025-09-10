# Spec Workflow Extension Pack

Comprehensive extension pack for spec-driven development workflows with Git automation and test validation enhancements.

## Features

### 🔄 Git Workflow Integration
- **Intelligent Commit Automation**: Automatically commit changes at task, phase, or spec completion
- **Smart Commit Messages**: Conventional commit format with context-aware message generation
- **Commit Aggregation**: Group multiple task completions into meaningful phase/spec commits
- **Non-blocking Operations**: Git failures never interrupt your development workflow

### 🧪 Test Validation Enhancement
- **Pattern Recognition**: Learn from test failures and build institutional knowledge
- **Root Cause Analysis**: Five Whys methodology for systematic issue investigation
- **Cross-Technology Intelligence**: Share failure patterns between frontend/backend/universal scopes
- **Autonomous Learning**: Update pattern libraries automatically as new patterns are discovered

## Installation

### Quick Install (Interactive)
```bash
npm install @MVNGNTNZ/spec-workflow-extension-pack
npm run install:interactive
```

### Module-Specific Installation

#### Git Workflow Only
```bash
npm run git:install
```

#### Test Validation Only
```bash
npm run test-validation:install
```

#### Install Everything
```bash
npm run install:all
```

## Git Workflow Configuration

### Commit Frequency Options
1. **Task-level** (`task`): Commit after each individual task completion
2. **Phase-level** (`phase`): Commit after completing logical groups of tasks (**Default**)
3. **Spec-level** (`spec`): Single commit after completing entire specification

### Configuration File
The Git workflow creates `.claude/git-automation.json` with these settings:

```json
{
  "git_automation_enabled": false,
  "git_automation": {
    "commit_frequency": "phase",
    "commit_message_template": "feat: Complete {phase_or_spec} - {description}",
    "auto_add_files": true,
    "use_intelligent_messages": true,
    "aggregate_commit_messages": true,
    "include_task_count": true,
    "fallback_message_template": "feat: Complete task {task_id} - {task_title}",
    "max_message_length": 72,
    "require_confirmation": true
  }
}
```

### Example Commit Messages

#### Phase-level Commits (Default)
```
feat: Complete Phase 2 - Authentication system with JWT tokens and role-based access (Tasks 2.1-2.4)
fix: Complete Phase 3 - Database connection timeout resolution and error handling (Tasks 3.1-3.3)
docs: Complete Phase 1 - API documentation update for PrePacks module (Tasks 1.1-1.2)
```

#### Task-level Commits
```
feat: Complete task 2.1 - Add JWT token generation service
fix: Complete task 3.2 - Resolve database connection timeout in user service
```

#### Spec-level Commits
```
feat: Complete user-authentication-system - Comprehensive authentication with JWT, roles, and security (12 tasks)
```

## Test Validation Features

### Pattern Recognition
The system learns from test failures and builds a knowledge base:

```json
{
  "patterns": [
    {
      "id": "async-timeout-frontend",
      "scope": "frontend",
      "category": "async",
      "signature": "timeout.*async.*await",
      "description": "Async operation timeout in React components",
      "solutions": ["Increase timeout", "Mock async operations", "Use act() wrapper"],
      "confidence": 0.95
    }
  ]
}
```

### Investigation Methodology
Uses Five Whys root cause analysis:
1. **Surface Issue**: What failed?
2. **Immediate Cause**: Why did it fail?
3. **System Cause**: Why did the immediate cause occur?
4. **Process Cause**: Why wasn't this prevented?
5. **Root Cause**: What system change prevents recurrence?

## Integration with Spec Workflow

### Agent Integration
The extension provides both agent patching and new agent installation:

**Agent Patches** (modifies existing agents):
- `spec-task-executor`: Git workflow integration
- `spec-requirements-validator`: Test validation context
- `spec-design-validator`: Test strategy validation
- `spec-task-validator`: Test health consideration

**New Agent Installation** (adds new agents):
- `spec-test-validator`: Enhanced test validation with pattern learning and root cause analysis

### Workflow Integration
Works seamlessly with existing spec commands:
- `/spec-create` - Enhanced with test validation
- `/spec-execute` - Automatic Git commits based on configuration
- `/bug-analyze` - Pattern-aware root cause analysis

## Commands

### Git Workflow Commands
```bash
npm run git:install          # Install Git workflow integration
npm run git:configure        # Configure Git settings interactively
```

### Test Validation Commands
```bash
npm run test-validation:install  # Install test validation enhancement
npm run pattern:sync            # Sync pattern libraries
npm run pattern:validate        # Validate pattern libraries
```

### Agent Management
```bash
npm run agent:patch         # Apply all agent patches
npm run agent:rollback      # Rollback agent patches
```

### Development Commands
```bash
npm run test               # Run test suite
npm run test:coverage      # Generate coverage report
npm run lint               # Lint codebase
npm run format             # Format code with Prettier
```

## Requirements

- **Node.js**: >=18.0.0
- **Spec Workflow**: >=1.0.0
- **Git**: Any version (for Git workflow features)
- **Python**: >=3.8 (for Git automation services)

## Architecture

### Git Workflow Services (Python)
Located in `services/` directory:
- `git_config_reader.py`: Configuration management with `get_git_automation_config()` method
- `git_file_detector.py`: Change analysis and commit type detection
- `git_message_generator.py`: Intelligent commit message generation
- `git_auto_commit.py`: Main orchestration service
- `git_commit_handler.py`: Robust commit operations with retry logic
- `spec_integration_hook.py`: Integration with spec workflow (tested and working)
- `git_task_aggregator.py`: Task completion tracking and phase detection
- `git_service_init.py`: Service initialization and dependency management
- `git_user_confirmation.py`: User confirmation workflows

### Test Validation Components
- `pattern-validator.js`: Pattern library validation
- `test-validator-patch.js`: Agent enhancement for test validation
- `pattern-sync.js`: Cross-repository pattern synchronization
- `database.js`: Optional database integration for pattern storage

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm test`
6. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/MVNGNTNZ/spec-workflow-extension-pack/issues)
- **Documentation**: [GitHub Wiki](https://github.com/MVNGNTNZ/spec-workflow-extension-pack/wiki)

## Changelog

### v1.0.0
- Initial release with Git workflow integration and test validation enhancement
- Support for task/phase/spec commit frequencies
- Intelligent commit message generation
- Pattern recognition and learning system
- Seamless spec workflow agent integration