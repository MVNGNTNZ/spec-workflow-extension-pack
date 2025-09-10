"""
Git Commit Handler - Specialized Robust Commit Operations

Focused handler for Git commit operations with comprehensive validation,
retry logic, fallback handling, and commit signing support. Provides
enhanced reliability and validation for commit operations within the
git-workflow-integration service ecosystem.
"""

import os
import subprocess
import logging
import re
import time
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from enum import Enum

# Import the component services for patterns and utilities
try:
    # Try relative import first (when used as package)
    from .git_config_reader import ConfigurationReader
    from .git_file_detector import FileDetector, GitError
    from .git_auto_commit import CommitResult, CommitOperation
except ImportError:
    # Fall back to absolute import (when run directly)
    from git_config_reader import ConfigurationReader
    from git_file_detector import FileDetector, GitError
    from git_auto_commit import CommitResult, CommitOperation


# Set up logging
logger = logging.getLogger(__name__)


class MessageValidationLevel(Enum):
    """Validation levels for commit messages"""
    STRICT = "strict"       # Enforce all rules strictly
    STANDARD = "standard"   # Standard validation with warnings
    LENIENT = "lenient"     # Minimal validation only
    DISABLED = "disabled"   # No validation


class RetryReason(Enum):
    """Reasons for commit retry attempts"""
    NETWORK_ERROR = "network_error"
    LOCK_CONFLICT = "lock_conflict"
    TEMPORARY_FAILURE = "temporary_failure"
    SIGNING_FAILURE = "signing_failure"
    PERMISSION_ERROR = "permission_error"


@dataclass
class MessageValidation:
    """Results of commit message validation"""
    is_valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    score: float = 0.0  # Quality score 0.0 to 1.0


@dataclass
class CommitConfig:
    """Configuration for commit operations"""
    max_retries: int = 3
    retry_delay: float = 1.0
    retry_backoff: float = 2.0
    enable_signing: bool = False
    signing_key: Optional[str] = None
    validation_level: MessageValidationLevel = MessageValidationLevel.STANDARD
    max_message_length: int = 72
    min_message_length: int = 10
    require_type_prefix: bool = True
    allowed_types: List[str] = field(default_factory=lambda: [
        'feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'
    ])
    timeout: int = 30
    fallback_enabled: bool = True


@dataclass
class RetryAttempt:
    """Information about a retry attempt"""
    attempt_number: int
    reason: RetryReason
    error_message: str
    timestamp: str
    delay: float
    success: bool = False


@dataclass
class CommitExecutionResult:
    """Detailed results of commit execution"""
    success: bool
    commit_hash: Optional[str] = None
    error_message: Optional[str] = None
    retry_attempts: List[RetryAttempt] = field(default_factory=list)
    validation_result: Optional[MessageValidation] = None
    execution_time: float = 0.0
    signed: bool = False
    fallback_used: bool = False


class GitCommitHandler:
    """
    Specialized handler for robust Git commit operations
    
    Provides comprehensive commit functionality with:
    - Advanced message validation with configurable levels
    - Retry logic for transient failures with exponential backoff
    - Commit signing support when configured
    - Fallback message generation when primary generation fails
    - Detailed error reporting and diagnostics
    - Integration with existing git-workflow services
    
    Features:
    - Message quality scoring and validation
    - Multiple retry strategies for different failure types
    - GPG/SSH commit signing support
    - Comprehensive error categorization and handling
    - Performance monitoring and timing
    - Rollback capabilities for failed operations
    """
    
    def __init__(self,
                 config_reader: Optional[ConfigurationReader] = None,
                 file_detector: Optional[FileDetector] = None,
                 config: Optional[CommitConfig] = None,
                 repo_path: Optional[str] = None):
        """
        Initialize GitCommitHandler with configuration and dependencies
        
        Args:
            config_reader: Optional ConfigurationReader instance
            file_detector: Optional FileDetector instance  
            config: Optional CommitConfig for commit behavior
            repo_path: Optional path to git repository
        """
        self.repo_path = Path(repo_path) if repo_path else Path.cwd()
        
        # Initialize dependencies
        self.config_reader = config_reader or ConfigurationReader()
        self.file_detector = file_detector or FileDetector(str(self.repo_path))
        
        # Initialize commit configuration
        self.config = config or self._load_default_config()
        
        # Operation tracking
        self._recent_commits: List[CommitExecutionResult] = []
        self._total_commits = 0
        self._total_retries = 0
        
        # Validate git repository
        if not self.file_detector.is_git_repository():
            raise GitError(f"Directory is not a Git repository: {self.repo_path}")
    
    def _load_default_config(self) -> CommitConfig:
        """Load default commit configuration from config reader"""
        try:
            git_config = self.config_reader.get_git_automation_config()
            commit_settings = git_config.get('commit_handler', {})
            
            return CommitConfig(
                max_retries=commit_settings.get('max_retries', 3),
                retry_delay=commit_settings.get('retry_delay', 1.0),
                retry_backoff=commit_settings.get('retry_backoff', 2.0),
                enable_signing=commit_settings.get('enable_signing', False),
                signing_key=commit_settings.get('signing_key'),
                validation_level=MessageValidationLevel(
                    commit_settings.get('validation_level', 'standard')
                ),
                max_message_length=commit_settings.get('max_message_length', 72),
                min_message_length=commit_settings.get('min_message_length', 10),
                require_type_prefix=commit_settings.get('require_type_prefix', True),
                allowed_types=commit_settings.get('allowed_types', [
                    'feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'
                ]),
                timeout=commit_settings.get('timeout', 30),
                fallback_enabled=commit_settings.get('fallback_enabled', True)
            )
        except Exception as e:
            logger.warning(f"Error loading commit config, using defaults: {str(e)}")
            return CommitConfig()
    
    def validate_commit_message(self, message: str) -> MessageValidation:
        """
        Comprehensive validation of commit message
        
        Args:
            message: Commit message to validate
            
        Returns:
            MessageValidation with detailed results
        """
        validation = MessageValidation(is_valid=True)
        
        # Skip validation if disabled
        if self.config.validation_level == MessageValidationLevel.DISABLED:
            validation.score = 1.0
            return validation
        
        # Basic structure checks
        if not message or not message.strip():
            validation.is_valid = False
            validation.errors.append("Commit message cannot be empty")
            return validation
        
        message = message.strip()
        lines = message.split('\n')
        subject = lines[0] if lines else ""
        
        # Length validation
        self._validate_message_length(subject, validation)
        
        # Type prefix validation (conventional commits)
        if self.config.require_type_prefix:
            self._validate_type_prefix(subject, validation)
        
        # Format and structure validation
        self._validate_message_format(message, lines, validation)
        
        # Calculate quality score
        validation.score = self._calculate_quality_score(message, validation)
        
        # Apply validation level rules
        self._apply_validation_level(validation)
        
        return validation
    
    def _validate_message_length(self, subject: str, validation: MessageValidation):
        """Validate commit message length constraints"""
        if len(subject) > self.config.max_message_length:
            if self.config.validation_level == MessageValidationLevel.STRICT:
                validation.errors.append(
                    f"Subject line too long: {len(subject)} > {self.config.max_message_length} characters"
                )
            else:
                validation.warnings.append(
                    f"Subject line is long: {len(subject)} characters (recommended: ≤{self.config.max_message_length})"
                )
        
        if len(subject) < self.config.min_message_length:
            validation.errors.append(
                f"Subject line too short: {len(subject)} < {self.config.min_message_length} characters"
            )
    
    def _validate_type_prefix(self, subject: str, validation: MessageValidation):
        """Validate conventional commit type prefix"""
        # Pattern: type(optional scope): description
        pattern = r'^([a-z]+)(\([^)]+\))?: .+'
        match = re.match(pattern, subject.lower())
        
        if not match:
            if self.config.validation_level == MessageValidationLevel.STRICT:
                validation.errors.append(
                    "Subject must follow format: 'type(scope): description' or 'type: description'"
                )
            else:
                validation.warnings.append(
                    "Consider using conventional commit format: 'type: description'"
                )
                validation.suggestions.append(
                    f"Example: 'feat: {subject}' or 'fix: {subject}'"
                )
            return
        
        commit_type = match.group(1)
        if commit_type not in self.config.allowed_types:
            if self.config.validation_level == MessageValidationLevel.STRICT:
                validation.errors.append(
                    f"Invalid commit type '{commit_type}'. Allowed: {', '.join(self.config.allowed_types)}"
                )
            else:
                validation.warnings.append(
                    f"Unusual commit type '{commit_type}'. Common types: {', '.join(self.config.allowed_types[:5])}"
                )
    
    def _validate_message_format(self, message: str, lines: List[str], validation: MessageValidation):
        """Validate overall message format and structure"""
        # Check for proper capitalization
        subject = lines[0] if lines else ""
        if subject and not subject[0].isupper() and self.config.validation_level != MessageValidationLevel.LENIENT:
            # Exception for conventional commits starting with type:
            if not re.match(r'^[a-z]+(\([^)]+\))?: [A-Z]', subject):
                validation.warnings.append("Subject line should start with a capital letter")
        
        # Check for trailing period
        if subject.endswith('.'):
            validation.warnings.append("Subject line should not end with a period")
        
        # Check for blank line between subject and body (if body exists)
        if len(lines) > 1 and lines[1].strip():
            validation.warnings.append("Include blank line between subject and body")
        
        # Body line length check
        for i, line in enumerate(lines[2:], start=3):
            if len(line) > 72:
                validation.warnings.append(f"Body line {i} is long: {len(line)} characters (recommended: ≤72)")
    
    def _calculate_quality_score(self, message: str, validation: MessageValidation) -> float:
        """Calculate overall quality score for commit message"""
        score = 1.0
        
        # Deduct for errors (major issues)
        score -= len(validation.errors) * 0.3
        
        # Deduct for warnings (minor issues)
        score -= len(validation.warnings) * 0.1
        
        # Bonus for good practices
        lines = message.split('\n')
        subject = lines[0] if lines else ""
        
        # Bonus for conventional commits
        if re.match(r'^[a-z]+(\([^)]+\))?: ', subject.lower()):
            score += 0.1
        
        # Bonus for appropriate length
        if self.config.min_message_length <= len(subject) <= 50:
            score += 0.1
        
        # Bonus for having body (detailed explanation)
        if len(lines) > 2 and any(line.strip() for line in lines[2:]):
            score += 0.1
        
        return max(0.0, min(1.0, score))
    
    def _apply_validation_level(self, validation: MessageValidation):
        """Apply validation level rules to final result"""
        if self.config.validation_level == MessageValidationLevel.LENIENT:
            # In lenient mode, only hard errors fail validation
            hard_errors = [error for error in validation.errors 
                          if "empty" in error.lower() or "too short" in error.lower()]
            validation.errors = hard_errors
            validation.is_valid = len(hard_errors) == 0
        elif self.config.validation_level == MessageValidationLevel.STANDARD:
            # Standard mode: errors fail validation, warnings allowed
            validation.is_valid = len(validation.errors) == 0
        else:  # STRICT
            # Strict mode: any error or critical warning fails validation
            critical_warnings = [w for w in validation.warnings 
                               if "too long" in w.lower() or "invalid" in w.lower()]
            validation.is_valid = len(validation.errors) == 0 and len(critical_warnings) == 0
    
    def commit_with_message(self, message: str, 
                           staged_only: bool = True,
                           allow_empty: bool = False) -> CommitExecutionResult:
        """
        Execute git commit with comprehensive validation and retry logic
        
        Args:
            message: Commit message to use
            staged_only: If True, only commit staged changes
            allow_empty: If True, allow commits with no changes
            
        Returns:
            CommitExecutionResult with detailed execution information
        """
        start_time = time.time()
        result = CommitExecutionResult(success=False)
        
        try:
            # Step 1: Validate commit message
            logger.info("Validating commit message...")
            result.validation_result = self.validate_commit_message(message)
            
            if not result.validation_result.is_valid:
                if self.config.fallback_enabled:
                    logger.warning("Message validation failed, attempting fallback generation")
                    message = self._generate_fallback_message(message, result.validation_result)
                    result.fallback_used = True
                    result.validation_result = self.validate_commit_message(message)
                    
                    if not result.validation_result.is_valid:
                        result.error_message = f"Message validation failed: {'; '.join(result.validation_result.errors)}"
                        return result
                else:
                    result.error_message = f"Message validation failed: {'; '.join(result.validation_result.errors)}"
                    return result
            
            # Step 2: Check for changes to commit (unless allowing empty)
            if not allow_empty and not self._has_staged_changes():
                result.error_message = "No staged changes to commit"
                return result
            
            # Step 3: Execute commit with retry logic
            result = self._execute_commit_with_retry(message, staged_only, allow_empty, result)
            
        except Exception as e:
            logger.error(f"Unexpected error during commit execution: {str(e)}")
            result.error_message = f"Unexpected error: {str(e)}"
        
        finally:
            # Record execution time and update tracking
            result.execution_time = time.time() - start_time
            self._update_commit_tracking(result)
        
        return result
    
    def _has_staged_changes(self) -> bool:
        """Check if there are staged changes ready to commit"""
        try:
            # Check git status for staged changes
            result = subprocess.run(
                ['git', 'diff', '--cached', '--quiet'],
                cwd=self.repo_path,
                capture_output=True,
                timeout=10
            )
            # Exit code 0 means no differences (no staged changes)
            # Exit code 1 means there are differences (staged changes exist)
            return result.returncode != 0
        except Exception as e:
            logger.warning(f"Error checking staged changes: {str(e)}")
            return False
    
    def _execute_commit_with_retry(self, message: str, staged_only: bool, 
                                  allow_empty: bool, result: CommitExecutionResult) -> CommitExecutionResult:
        """Execute git commit with retry logic for transient failures"""
        max_attempts = self.config.max_retries + 1
        current_delay = self.config.retry_delay
        
        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(f"Commit attempt {attempt}/{max_attempts}")
                
                # Build git commit command
                cmd = self._build_commit_command(message, staged_only, allow_empty)
                
                # Execute commit
                commit_result = subprocess.run(
                    cmd,
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=self.config.timeout
                )
                
                if commit_result.returncode == 0:
                    # Success!
                    result.success = True
                    result.commit_hash = self._extract_commit_hash(commit_result.stdout)
                    result.signed = self._check_if_commit_signed(result.commit_hash)
                    
                    logger.info(f"Commit successful: {result.commit_hash[:8] if result.commit_hash else 'unknown'}")
                    
                    # Mark any previous retry attempts as ultimately successful
                    for retry_attempt in result.retry_attempts:
                        if not retry_attempt.success:
                            retry_attempt.success = True
                    
                    break
                else:
                    # Analyze failure and determine if retry is appropriate
                    error_output = commit_result.stderr or commit_result.stdout
                    retry_reason = self._analyze_commit_failure(error_output)
                    
                    if attempt < max_attempts and retry_reason:
                        # Record retry attempt
                        retry_attempt = RetryAttempt(
                            attempt_number=attempt,
                            reason=retry_reason,
                            error_message=error_output,
                            timestamp=datetime.now().isoformat(),
                            delay=current_delay
                        )
                        result.retry_attempts.append(retry_attempt)
                        
                        logger.warning(f"Commit attempt {attempt} failed ({retry_reason.value}), retrying in {current_delay}s: {error_output}")
                        
                        # Wait before retry
                        time.sleep(current_delay)
                        current_delay *= self.config.retry_backoff
                        
                        # Special handling for specific failure types
                        if retry_reason == RetryReason.LOCK_CONFLICT:
                            self._handle_lock_conflict()
                        elif retry_reason == RetryReason.SIGNING_FAILURE:
                            self._handle_signing_failure()
                    else:
                        # Final failure or non-retryable error
                        result.error_message = f"Commit failed: {error_output}"
                        logger.error(f"Commit failed after {attempt} attempts: {error_output}")
                        break
            
            except subprocess.TimeoutExpired:
                error_msg = f"Commit timed out after {self.config.timeout}s"
                if attempt < max_attempts:
                    retry_attempt = RetryAttempt(
                        attempt_number=attempt,
                        reason=RetryReason.TEMPORARY_FAILURE,
                        error_message=error_msg,
                        timestamp=datetime.now().isoformat(),
                        delay=current_delay
                    )
                    result.retry_attempts.append(retry_attempt)
                    logger.warning(f"Commit attempt {attempt} timed out, retrying in {current_delay}s")
                    time.sleep(current_delay)
                    current_delay *= self.config.retry_backoff
                else:
                    result.error_message = error_msg
                    break
            
            except Exception as e:
                error_msg = f"Unexpected error during commit: {str(e)}"
                if attempt < max_attempts:
                    retry_attempt = RetryAttempt(
                        attempt_number=attempt,
                        reason=RetryReason.TEMPORARY_FAILURE,
                        error_message=error_msg,
                        timestamp=datetime.now().isoformat(),
                        delay=current_delay
                    )
                    result.retry_attempts.append(retry_attempt)
                    logger.warning(f"Commit attempt {attempt} failed with exception, retrying in {current_delay}s: {str(e)}")
                    time.sleep(current_delay)
                    current_delay *= self.config.retry_backoff
                else:
                    result.error_message = error_msg
                    break
        
        # Update retry statistics
        self._total_retries += len(result.retry_attempts)
        
        return result
    
    def _build_commit_command(self, message: str, staged_only: bool, allow_empty: bool) -> List[str]:
        """Build git commit command with appropriate options"""
        cmd = ['git', 'commit', '-m', message]
        
        # Add signing if enabled
        if self.config.enable_signing:
            if self.config.signing_key:
                cmd.extend(['-S', self.config.signing_key])
            else:
                cmd.append('-S')
        
        # Add allow empty if specified
        if allow_empty:
            cmd.append('--allow-empty')
        
        # Add all changes if not staged_only
        if not staged_only:
            cmd.append('-a')
        
        return cmd
    
    def _analyze_commit_failure(self, error_output: str) -> Optional[RetryReason]:
        """
        Analyze commit failure to determine if retry is appropriate
        
        Returns:
            RetryReason if retryable, None if not retryable
        """
        error_lower = error_output.lower()
        
        # Check for common retryable errors
        if any(phrase in error_lower for phrase in [
            'index.lock', 'unable to create', 'resource temporarily unavailable'
        ]):
            return RetryReason.LOCK_CONFLICT
        
        if any(phrase in error_lower for phrase in [
            'gpg failed to sign', 'signing failed', 'secret key not available'
        ]):
            return RetryReason.SIGNING_FAILURE
        
        if any(phrase in error_lower for phrase in [
            'connection refused', 'network', 'timeout', 'temporary failure'
        ]):
            return RetryReason.NETWORK_ERROR
        
        if any(phrase in error_lower for phrase in [
            'permission denied', 'operation not permitted'
        ]):
            return RetryReason.PERMISSION_ERROR
        
        # Check for non-retryable errors
        if any(phrase in error_lower for phrase in [
            'nothing to commit', 'no changes added',
            'pathspec', 'invalid', 'bad revision'
        ]):
            return None  # Non-retryable
        
        # Default to temporary failure for unknown errors
        return RetryReason.TEMPORARY_FAILURE
    
    def _extract_commit_hash(self, output: str) -> Optional[str]:
        """Extract commit hash from git commit output"""
        try:
            # Look for pattern like "[main 1234567] message"
            match = re.search(r'\[[\w/-]+ ([a-f0-9]{7,40})\]', output)
            if match:
                return match.group(1)
            
            # Fallback: get current HEAD hash
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.warning(f"Error extracting commit hash: {str(e)}")
        
        return None
    
    def _check_if_commit_signed(self, commit_hash: Optional[str]) -> bool:
        """Check if the commit is signed"""
        if not commit_hash:
            return False
        
        try:
            result = subprocess.run(
                ['git', 'show', '--format=%G?', '-s', commit_hash],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                signature_status = result.stdout.strip()
                return signature_status in ['G', 'U']  # Good or untrusted signature
        except Exception as e:
            logger.warning(f"Error checking commit signature: {str(e)}")
        
        return False
    
    def _handle_lock_conflict(self):
        """Handle git lock conflicts by attempting cleanup"""
        try:
            lock_files = [
                '.git/index.lock',
                '.git/refs/heads/main.lock',
                '.git/refs/heads/master.lock'
            ]
            
            for lock_file in lock_files:
                lock_path = self.repo_path / lock_file
                if lock_path.exists():
                    logger.info(f"Removing stale lock file: {lock_file}")
                    lock_path.unlink()
        except Exception as e:
            logger.warning(f"Error handling lock conflict: {str(e)}")
    
    def _handle_signing_failure(self):
        """Handle commit signing failures"""
        try:
            # Check if GPG agent is running
            result = subprocess.run(
                ['gpg-connect-agent', '/bye'],
                capture_output=True,
                timeout=10
            )
            if result.returncode != 0:
                logger.warning("GPG agent not responding, attempting to restart")
                subprocess.run(['gpg-connect-agent', 'reloadagent', '/bye'], 
                             capture_output=True, timeout=10)
        except Exception as e:
            logger.warning(f"Error handling signing failure: {str(e)}")
    
    def _generate_fallback_message(self, original_message: str, 
                                 validation: MessageValidation) -> str:
        """
        Generate fallback commit message when validation fails
        
        Args:
            original_message: Original message that failed validation
            validation: Validation results
            
        Returns:
            Fallback commit message
        """
        logger.info("Generating fallback commit message")
        
        # Try to fix common issues automatically
        message = original_message.strip()
        
        # Fix empty message
        if not message:
            message = "chore: Update files"
        
        # Fix missing type prefix
        if self.config.require_type_prefix and not re.match(r'^[a-z]+(\([^)]+\))?: ', message.lower()):
            # Try to infer type from message content
            message_lower = message.lower()
            if any(word in message_lower for word in ['add', 'create', 'implement', 'new']):
                message = f"feat: {message}"
            elif any(word in message_lower for word in ['fix', 'bug', 'issue', 'error']):
                message = f"fix: {message}"
            elif any(word in message_lower for word in ['update', 'change', 'modify']):
                message = f"chore: {message}"
            elif any(word in message_lower for word in ['test', 'spec']):
                message = f"test: {message}"
            elif any(word in message_lower for word in ['doc', 'readme', 'comment']):
                message = f"docs: {message}"
            else:
                message = f"chore: {message}"
        
        # Truncate if too long
        if len(message) > self.config.max_message_length:
            message = message[:self.config.max_message_length - 3] + "..."
        
        # Ensure minimum length
        if len(message) < self.config.min_message_length:
            message += " - auto-generated fallback message"
        
        # Remove trailing period
        if message.endswith('.'):
            message = message[:-1]
        
        logger.info(f"Generated fallback message: {message}")
        return message
    
    def _update_commit_tracking(self, result: CommitExecutionResult):
        """Update internal tracking of commit operations"""
        self._recent_commits.append(result)
        
        # Keep only recent commits (last 20)
        if len(self._recent_commits) > 20:
            self._recent_commits = self._recent_commits[-20:]
        
        if result.success:
            self._total_commits += 1
    
    # Public utility methods
    
    def get_commit_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about commit operations
        
        Returns:
            Dictionary with commit statistics
        """
        successful_commits = sum(1 for r in self._recent_commits if r.success)
        total_recent = len(self._recent_commits)
        
        avg_execution_time = 0.0
        if self._recent_commits:
            avg_execution_time = sum(r.execution_time for r in self._recent_commits) / len(self._recent_commits)
        
        return {
            'total_commits': self._total_commits,
            'total_retries': self._total_retries,
            'recent_success_rate': successful_commits / total_recent if total_recent > 0 else 0.0,
            'recent_commits': total_recent,
            'average_execution_time': avg_execution_time,
            'signing_enabled': self.config.enable_signing,
            'validation_level': self.config.validation_level.value,
            'fallback_enabled': self.config.fallback_enabled
        }
    
    def get_recent_commits(self, limit: int = 10) -> List[CommitExecutionResult]:
        """
        Get recent commit execution results
        
        Args:
            limit: Maximum number of results to return
            
        Returns:
            List of recent CommitExecutionResult objects
        """
        return self._recent_commits[-limit:] if self._recent_commits else []
    
    def validate_repository_state(self) -> Dict[str, Any]:
        """
        Validate current repository state for commit readiness
        
        Returns:
            Dictionary with validation results
        """
        validation = {
            'ready_for_commit': True,
            'issues': [],
            'warnings': [],
            'info': []
        }
        
        try:
            # Check if we're in a git repository
            if not self.file_detector.is_git_repository():
                validation['ready_for_commit'] = False
                validation['issues'].append("Not in a Git repository")
                return validation
            
            # Check for staged changes
            if not self._has_staged_changes():
                validation['warnings'].append("No staged changes to commit")
            
            # Check git configuration
            try:
                result = subprocess.run(['git', 'config', 'user.name'], 
                                      capture_output=True, text=True, timeout=10)
                if result.returncode != 0 or not result.stdout.strip():
                    validation['issues'].append("Git user.name not configured")
                    validation['ready_for_commit'] = False
                
                result = subprocess.run(['git', 'config', 'user.email'], 
                                      capture_output=True, text=True, timeout=10)
                if result.returncode != 0 or not result.stdout.strip():
                    validation['issues'].append("Git user.email not configured")
                    validation['ready_for_commit'] = False
            except Exception as e:
                validation['warnings'].append(f"Could not verify git configuration: {str(e)}")
            
            # Check for signing configuration if enabled
            if self.config.enable_signing:
                try:
                    result = subprocess.run(['git', 'config', 'user.signingkey'], 
                                          capture_output=True, text=True, timeout=10)
                    if result.returncode != 0 or not result.stdout.strip():
                        validation['warnings'].append("Commit signing enabled but no signing key configured")
                except Exception as e:
                    validation['warnings'].append(f"Could not verify signing configuration: {str(e)}")
            
            # Repository status information
            validation['info'].append(f"Repository path: {self.repo_path}")
            validation['info'].append(f"Validation level: {self.config.validation_level.value}")
            validation['info'].append(f"Max retries: {self.config.max_retries}")
            
        except Exception as e:
            validation['ready_for_commit'] = False
            validation['issues'].append(f"Error validating repository state: {str(e)}")
        
        return validation


# Factory functions for easy instantiation

def create_git_commit_handler(repo_path: Optional[str] = None,
                             config_path: Optional[str] = None,
                             validation_level: str = "standard") -> GitCommitHandler:
    """
    Factory function to create GitCommitHandler instance with default configuration
    
    Args:
        repo_path: Optional path to git repository
        config_path: Optional path to configuration file
        validation_level: Message validation level (strict/standard/lenient/disabled)
        
    Returns:
        GitCommitHandler instance
    """
    config_reader = ConfigurationReader(config_path) if config_path else ConfigurationReader()
    file_detector = FileDetector(repo_path)
    
    commit_config = CommitConfig(
        validation_level=MessageValidationLevel(validation_level)
    )
    
    return GitCommitHandler(config_reader, file_detector, commit_config, repo_path)


# Example usage and testing
if __name__ == "__main__":
    # Example usage for testing
    try:
        # Create GitCommitHandler instance
        commit_handler = create_git_commit_handler()
        
        # Validate repository state
        print("Validating repository state...")
        repo_validation = commit_handler.validate_repository_state()
        print(f"Ready for commit: {repo_validation['ready_for_commit']}")
        if repo_validation['issues']:
            print("Issues:", repo_validation['issues'])
        if repo_validation['warnings']:
            print("Warnings:", repo_validation['warnings'])
        
        # Example message validation
        test_messages = [
            "feat: Add new user authentication system",
            "fix: resolve database connection timeout issue",
            "This is a test message without type prefix",
            "x",  # Too short
            "feat: " + "a" * 100  # Too long
        ]
        
        print("\nTesting message validation...")
        for message in test_messages:
            validation = commit_handler.validate_commit_message(message)
            print(f"Message: '{message[:50]}{'...' if len(message) > 50 else ''}'")
            print(f"  Valid: {validation.is_valid}, Score: {validation.score:.2f}")
            if validation.errors:
                print(f"  Errors: {validation.errors}")
            if validation.warnings:
                print(f"  Warnings: {validation.warnings}")
            print()
        
        # Display statistics
        stats = commit_handler.get_commit_statistics()
        print(f"Commit statistics: {stats}")
        
    except Exception as e:
        print(f"Example execution failed: {str(e)}")