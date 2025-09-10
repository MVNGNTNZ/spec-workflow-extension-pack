# Distribution Scripts

This directory contains comprehensive distribution and publishing scripts for the Test Validation Extension Pack.

## Available Scripts

### Core Build & Package Scripts

#### `build.js`
Comprehensive build script for creating distribution packages.

**Usage:**
```bash
npm run build
# or
node scripts/build.js
```

**Features:**
- Cleans previous builds
- Validates package structure
- Creates distribution package with all necessary assets
- Generates build metadata
- Validates build output

#### `package.js`
Creates different types of distribution packages for various deployment scenarios.

**Usage:**
```bash
npm run package                    # Create all package types
npm run package:npm                # NPM registry package only
npm run package:standalone         # Standalone installation package
npm run package:docs               # Documentation package

# Advanced usage
node scripts/package.js --type npm,standalone --output ./custom-packages
node scripts/package.js --no-tarball
```

**Package Types:**
- **npm**: Optimized for NPM registry publishing
- **standalone**: Self-contained package for direct installation
- **development**: Full development environment with tests and tools
- **docs**: Documentation and API reference package

### Version Management

#### `version.js`
Handles semantic versioning, changelog generation, and git tagging.

**Usage:**
```bash
npm run version:patch              # 1.0.0 → 1.0.1
npm run version:minor              # 1.0.0 → 1.1.0  
npm run version:major              # 1.0.0 → 2.0.0
npm run version:info               # Show version information

# Advanced usage
node scripts/version.js patch --dry-run
node scripts/version.js custom --version 2.0.0-beta.1
node scripts/version.js minor --skip-changelog
```

**Features:**
- Semantic version bumping
- Automatic changelog generation from git commits
- Git tagging with proper annotations
- Version validation and consistency checks
- Dry-run mode for testing

### Testing & Quality

#### `test-all.js`
Comprehensive test runner that executes all types of tests before publishing.

**Usage:**
```bash
npm run test:all                   # Run all tests with coverage
node scripts/test-all.js --performance --verbose
node scripts/test-all.js --no-integration --fail-fast
```

**Test Types:**
- **Unit Tests**: Core functionality testing with Jest
- **Integration Tests**: Component interaction testing  
- **Performance Tests**: Benchmark key operations
- **Security Tests**: Vulnerability scanning and security checks
- **Code Quality**: Linting, formatting, and static analysis

**Features:**
- Configurable test suites
- Coverage reporting with thresholds
- Performance benchmarking
- Security vulnerability detection
- Comprehensive test reporting

#### `pre-publish.js`
Pre-publish validation script that ensures package quality before publishing.

**Usage:**
```bash
npm run pre-publish
node scripts/pre-publish.js
```

**Validation Checks:**
- Package integrity and metadata validation
- Version consistency and semver compliance
- Comprehensive test execution
- Code quality and formatting checks
- Documentation completeness
- Security vulnerability scanning
- Dependency analysis and outdated package detection

### Publishing & Release

#### `publish.js`
Complete publishing workflow for NPM registry deployment.

**Usage:**
```bash
npm run publish:dry                # Preview publish process
npm run publish:beta               # Publish with beta tag
node scripts/publish.js --otp 123456
```

**Workflow Steps:**
1. Environment validation (Node.js version, NPM auth)
2. Pre-publish validation and testing
3. Package building and optimization
4. Distribution package creation  
5. NPM registry publishing
6. Git operations (pushing commits/tags)
7. Publication verification
8. Release documentation generation

**Features:**
- Comprehensive validation pipeline
- Multiple registry support
- 2FA/OTP support for secure publishing
- Rollback capabilities on failure
- Post-publish verification

#### `release.js`
Master release orchestrator that handles the complete release process.

**Usage:**
```bash
npm run release                    # Patch release
npm run release:minor              # Minor release  
npm run release:major              # Major release
npm run release:dry                # Dry-run preview
npm run release:interactive        # Interactive confirmation

# Custom version
node scripts/release.js --version 2.0.0-rc.1 --interactive
```

**Complete Release Process:**
1. **Version Management**: Bump version, update changelog, create git tags
2. **Comprehensive Testing**: Run full test suite with coverage
3. **Package Building**: Create optimized distribution packages
4. **Distribution Creation**: Generate all package types
5. **NPM Publishing**: Publish to registry with verification
6. **Release Verification**: Confirm availability and installation
7. **Documentation**: Generate release notes and metadata

**Features:**
- Interactive confirmation prompts
- Dry-run mode for testing
- Selective step skipping
- Comprehensive error handling
- Detailed timing and reporting
- Post-release instructions

## Configuration

### Environment Variables

```bash
# NPM Publishing
NPM_TOKEN=your-npm-token
NPM_REGISTRY=https://registry.npmjs.org/

# Git Configuration  
GIT_USER_NAME="Your Name"
GIT_USER_EMAIL="your.email@example.com"

# Testing
NODE_ENV=test
TEST_TIMEOUT=30000
COVERAGE_THRESHOLD=80

# Build Configuration
BUILD_TARGET=production
BUILD_OPTIMIZE=true
```

### Package.json Scripts

The scripts integrate seamlessly with package.json scripts:

```json
{
  "scripts": {
    "build": "node scripts/build.js",
    "test:all": "node scripts/test-all.js", 
    "version:patch": "node scripts/version.js patch",
    "release": "node scripts/release.js",
    "pre-publish": "node scripts/pre-publish.js"
  }
}
```

## Development Workflow

### Standard Release Process

1. **Development**: Make changes, write tests, update documentation
2. **Quality Check**: `npm run test:all && npm run lint && npm run format:check`
3. **Pre-release Validation**: `npm run pre-publish`
4. **Release**: `npm run release:patch` (or minor/major)
5. **Verification**: Check NPM registry and test installation

### Beta/RC Release Process

1. **Prepare Release**: `npm run version:patch` (create version locally)
2. **Test Build**: `npm run build:dist`
3. **Beta Publish**: `node scripts/publish.js --tag beta`
4. **Test Beta**: Install and test beta version
5. **Promote to Latest**: `npm dist-tag add package@version latest`

### Emergency Hotfix Process

1. **Quick Fix**: Make minimal changes for critical issues
2. **Fast Validation**: `npm run test && npm run lint`
3. **Patch Release**: `npm run release:patch --skip-build` (if build exists)
4. **Monitor**: Watch for issues and be ready to rollback

## Error Handling

All scripts include comprehensive error handling:

- **Validation Errors**: Clear messages about what needs to be fixed
- **Build Errors**: Detailed build failure information  
- **Test Errors**: Specific test failure details with remediation
- **Publish Errors**: NPM/registry specific error handling
- **Git Errors**: Repository state and access issues

### Common Issues

#### "Working directory has uncommitted changes"
```bash
git status                         # Check what's uncommitted
git add . && git commit -m "msg"   # Commit changes
# or
git stash                          # Stash changes temporarily
```

#### "NPM authentication required"
```bash
npm login                          # Login to NPM registry
npm whoami                         # Verify authentication
```

#### "Tests failing"
```bash
npm run test:all --verbose         # Run tests with detailed output
npm run lint:fix                   # Fix linting issues
npm run format                     # Fix formatting issues
```

#### "Version already exists"
```bash
npm run version:info               # Check current version
node scripts/version.js patch      # Bump to next patch version
```

## Advanced Usage

### Custom Package Types

Create custom package types by extending `package.js`:

```javascript
// Add to package.js
async createCustomPackage() {
    const packageName = 'test-validation-extension-pack-custom';
    const packageDir = path.join(this.options.outputDir, packageName);
    
    // Custom packaging logic
    await this.copySpecificFiles(packageDir);
    await this.generateCustomConfig(packageDir);
    
    this.packages.push({
        name: packageName,
        type: 'custom',
        description: 'Custom package variant'
    });
}
```

### Custom Validation Rules

Extend `pre-publish.js` with custom validation:

```javascript
async customValidation() {
    // Add custom validation logic
    const issues = await this.checkCustomRequirements();
    this.errors = this.errors.concat(issues);
}
```

### Integration with CI/CD

Use scripts in GitHub Actions, Jenkins, or other CI/CD systems:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:all
      - run: npm run release:patch
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Troubleshooting

### Debug Mode

Enable debug output for all scripts:

```bash
DEBUG=true node scripts/release.js patch
```

### Logs and Reports

All scripts generate detailed logs:

- **Build Logs**: `dist/build-metadata.json`
- **Test Reports**: `test-results/test-report-*.json`
- **Release Information**: `.releases/release-*.json`
- **Package Index**: `packages/package-index.json`

### Script Help

Each script provides detailed help:

```bash
node scripts/build.js --help
node scripts/version.js --help
node scripts/publish.js --help
node scripts/release.js --help
```

## Support

For issues with the distribution scripts:

1. **Check Logs**: Review generated log files and reports
2. **Debug Mode**: Run scripts with `DEBUG=true` for verbose output
3. **Dry Run**: Use `--dry-run` flags to preview operations
4. **GitHub Issues**: Report bugs or request features
5. **Documentation**: Refer to individual script help and source code

---

These scripts provide a complete, professional-grade distribution and publishing pipeline for the Test Validation Extension Pack, ensuring consistent, high-quality releases with comprehensive validation and error handling.