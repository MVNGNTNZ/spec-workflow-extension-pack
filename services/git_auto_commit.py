"""
Git Auto-Commit Service - Main Orchestrator

Integrates ConfigurationReader, FileDetector, and MessageGenerator to provide 
complete Git auto-commit functionality for spec workflow tasks. Handles the
full workflow from task completion detection to commit execution with rollback
capabilities and comprehensive error handling.
"""

import os
import subprocess
import logging
import json
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
from enum import Enum

# Import the component services
try:
    # Try relative import first (when used as package)
    from .git_config_reader import ConfigurationReader
    from .git_file_detector import FileDetector, ChangeAnalysis, GitError
    from .git_message_generator import MessageGenerator, TaskContext, MessageComponents
    from .git_user_confirmation import UserConfirmationManager, ConfirmationResult
except ImportError:
    # Fall back to absolute import (when run directly)
    from git_config_reader import ConfigurationReader
    from git_file_detector import FileDetector, ChangeAnalysis, GitError
    from git_message_generator import MessageGenerator, TaskContext, MessageComponents
    from git_user_confirmation import UserConfirmationManager, ConfirmationResult


# Set up logging
logger = logging.getLogger(__name__)


class CommitResult(Enum):
    """Result codes for commit operations"""
    SUCCESS = "success"
    NO_CHANGES = "no_changes" 
    DISABLED = "disabled"
    ERROR = "error"
    ROLLBACK = "rollback"
    CANCELLED = "cancelled"


@dataclass
class CommitOperation:
    """Represents a Git commit operation with metadata"""
    task_id: str
    task_title: str
    commit_message: str
    files_added: List[str]
    files_modified: List[str]
    files_deleted: List[str]
    commit_hash: Optional[str] = None
    timestamp: Optional[str] = None
    result: Optional[CommitResult] = None
    error_message: Optional[str] = None
    rollback_info: Optional[Dict[str, Any]] = None


@dataclass
class ProcessingContext:
    """Context information for task completion processing"""
    task_id: str
    task_title: str
    task_description: Optional[str] = None
    spec_name: Optional[str] = None
    working_directory: Optional[str] = None
    dry_run: bool = False
    force_commit: bool = False
    require_confirmation: Optional[bool] = None


class GitAutoCommit:
    """
    Main orchestrator for Git auto-commit functionality
    
    Integrates all components to provide complete task completion workflow:
    1. Configuration validation
    2. File change detection 
    3. Intelligent commit message generation
    4. Git operations execution
    5. Error handling and rollback
    
    Features:
    - Complete workflow orchestration
    - Comprehensive error handling and logging
    - Rollback capabilities for failed commits
    - Confirmation prompts for safety
    - Dry run mode for testing
    - Integration with spec workflow tasks
    """
    
    def __init__(self, 
                 config_reader: Optional[ConfigurationReader] = None,
                 file_detector: Optional[FileDetector] = None, 
                 message_generator: Optional[MessageGenerator] = None,
                 user_confirmation: Optional[UserConfirmationManager] = None,
                 repo_path: Optional[str] = None):
        """
        Initialize GitAutoCommit service
        
        Args:
            config_reader: Optional ConfigurationReader instance
            file_detector: Optional FileDetector instance
            message_generator: Optional MessageGenerator instance
            user_confirmation: Optional UserConfirmationManager instance  
            repo_path: Optional path to git repository
        """
        self.repo_path = Path(repo_path) if repo_path else Path.cwd()
        
        # Initialize component services
        self.config_reader = config_reader or ConfigurationReader()
        self.file_detector = file_detector or FileDetector(str(self.repo_path))
        self.message_generator = message_generator or MessageGenerator(self.file_detector)
        self.user_confirmation = user_confirmation or UserConfirmationManager(self.config_reader)
        
        # Operation tracking
        self._last_operation: Optional[CommitOperation] = None
        self._operation_history: List[CommitOperation] = []
        
        # Validate git repository
        if not self.file_detector.is_git_repository():
            raise GitError(f"Directory is not a Git repository: {self.repo_path}")
    
    def process_task_completion(self, context: ProcessingContext) -> CommitOperation:
        """
        Main workflow method - processes task completion and creates commit
        
        Args:
            context: ProcessingContext with task information and options
            
        Returns:
            CommitOperation with results and metadata
            
        Raises:
            GitError: If Git operations fail
            ValueError: If task context is invalid
        """
        logger.info(f"Processing task completion for task {context.task_id}: {context.task_title}")
        
        # Initialize operation tracking
        operation = CommitOperation(
            task_id=context.task_id,
            task_title=context.task_title,
            commit_message="",
            files_added=[],
            files_modified=[],
            files_deleted=[],
            timestamp=datetime.now().isoformat()
        )
        
        try:
            # Step 1: Validate configuration and check if automation is enabled
            if not self._validate_and_check_enabled(context, operation):
                return operation
            
            # Step 2: Detect file changes
            change_analysis = self._detect_changes(context, operation)
            if not change_analysis or change_analysis.total_files == 0:
                operation.result = CommitResult.NO_CHANGES
                logger.info("No file changes detected - skipping commit")
                return operation
            
            # Step 3: Generate commit message
            commit_message = self._generate_commit_message(context, change_analysis, operation)
            operation.commit_message = commit_message
            
            # Step 4: Confirmation check (if required and not disabled)
            if not self._handle_confirmation(context, operation, change_analysis):
                return operation
            
            # Step 5: Execute Git operations (add + commit)
            if context.dry_run:
                operation.result = CommitResult.SUCCESS
                logger.info(f"DRY RUN: Would commit with message: {commit_message}")
            else:
                self._execute_git_operations(context, operation, change_analysis)
            
            # Step 6: Update tracking and log success
            self._finalize_successful_operation(operation)
            
            return operation
            
        except Exception as e:
            logger.error(f"Error processing task completion: {str(e)}")
            operation.result = CommitResult.ERROR
            operation.error_message = str(e)
            
            # Attempt rollback if we've made any changes
            if operation.commit_hash:
                self._attempt_rollback(operation)
            
            return operation
    
    def _validate_and_check_enabled(self, context: ProcessingContext, 
                                   operation: CommitOperation) -> bool:
        """
        Validate configuration and check if Git automation is enabled
        
        Includes first-time confirmation check for new users.
        
        Returns:
            bool: True if automation should proceed, False otherwise
        """
        try:
            # Validate configuration
            validation = self.config_reader.validate_config()
            if not validation['valid']:
                error_msg = f"Invalid configuration: {', '.join(validation['errors'])}"
                logger.error(error_msg)
                operation.result = CommitResult.ERROR
                operation.error_message = error_msg
                return False
            
            # Check first-time confirmation status
            should_proceed, confirmation_result = self.user_confirmation.check_first_time_confirmation()
            
            # Handle different confirmation results
            if confirmation_result == ConfirmationResult.SKIP_CI:
                logger.info("CI/CD environment - skipping user confirmation")
                # In CI, check if automation is enabled in config
                if not self.config_reader.is_git_automation_enabled():
                    operation.result = CommitResult.DISABLED
                    return False
            elif confirmation_result == ConfirmationResult.CANCELLED:
                logger.info("User cancelled Git automation setup")
                operation.result = CommitResult.CANCELLED
                return False
            elif confirmation_result == ConfirmationResult.ERROR:
                logger.warning("Error in user confirmation system - proceeding with config check")
                # Fall back to regular configuration check on error
            elif not should_proceed:
                # User disabled automation or other reason not to proceed
                logger.info(f"Git automation disabled by user confirmation: {confirmation_result}")
                operation.result = CommitResult.DISABLED
                return False
            
            # Final check - ensure automation is actually enabled in config
            if not self.config_reader.is_git_automation_enabled():
                logger.info("Git automation is disabled in configuration - skipping commit")
                operation.result = CommitResult.DISABLED
                return False
            
            return True
            
        except Exception as e:
            error_msg = f"Configuration or confirmation error: {str(e)}"
            logger.error(error_msg)
            operation.result = CommitResult.ERROR
            operation.error_message = error_msg
            return False
    
    def _detect_changes(self, context: ProcessingContext, 
                       operation: CommitOperation) -> Optional[ChangeAnalysis]:
        """
        Detect and analyze file changes
        
        Returns:
            ChangeAnalysis or None if no changes
        """
        try:
            # Change to working directory if specified
            original_cwd = None
            if context.working_directory:
                original_cwd = os.getcwd()
                os.chdir(context.working_directory)
            
            try:
                # Analyze file changes
                change_analysis = self.file_detector.analyze_file_changes()
                
                # Update operation with file information
                for file_change in change_analysis.files:
                    if file_change.status == 'A':  # Added
                        operation.files_added.append(file_change.path)
                    elif file_change.status == 'M':  # Modified
                        operation.files_modified.append(file_change.path)
                    elif file_change.status == 'D':  # Deleted
                        operation.files_deleted.append(file_change.path)
                
                logger.info(f"Detected {change_analysis.total_files} changed files")
                return change_analysis
                
            finally:
                # Restore original working directory
                if original_cwd:
                    os.chdir(original_cwd)
                    
        except Exception as e:
            error_msg = f"Error detecting file changes: {str(e)}"
            logger.error(error_msg)
            operation.result = CommitResult.ERROR
            operation.error_message = error_msg
            return None
    
    def _generate_commit_message(self, context: ProcessingContext, 
                                change_analysis: ChangeAnalysis,
                                operation: CommitOperation) -> str:
        """
        Generate intelligent commit message using MessageGenerator
        
        Returns:
            str: Generated commit message
        """
        try:
            # Create task context for message generation
            task_context = TaskContext(
                task_id=context.task_id,
                task_title=context.task_title,
                task_description=context.task_description,
                completion_time=datetime.now().isoformat()
            )
            
            # Generate message using intelligent analysis
            message_components = self.message_generator.generate_commit_message(
                task_context=task_context,
                change_analysis=change_analysis
            )
            
            logger.info(f"Generated commit message with {message_components.confidence:.2f} confidence")
            return message_components.formatted_message
            
        except Exception as e:
            # Fall back to template-based message
            logger.warning(f"Error generating intelligent message, using fallback: {str(e)}")
            return self._generate_fallback_message(context)
    
    def _generate_fallback_message(self, context: ProcessingContext) -> str:
        """Generate simple fallback commit message"""
        git_config = self.config_reader.get_git_automation_config()
        template = git_config.get('fallback_message_template', 
                                 'feat: Complete task {task_id} - {task_title}')
        
        return template.format(
            task_id=context.task_id,
            task_title=context.task_title
        )
    
    def _handle_confirmation(self, context: ProcessingContext, 
                            operation: CommitOperation,
                            change_analysis: ChangeAnalysis) -> bool:
        """
        Handle user confirmation if required
        
        Returns:
            bool: True if should proceed, False if cancelled
        """
        # Check if confirmation is required
        git_config = self.config_reader.get_git_automation_config()
        require_confirmation = context.require_confirmation
        if require_confirmation is None:
            require_confirmation = git_config.get('require_confirmation', True)
        
        # Skip confirmation in certain cases
        if not require_confirmation or context.dry_run or context.force_commit:
            return True
        
        # Display confirmation prompt
        print(f"\nGit Auto-Commit Summary:")
        print(f"Task: {context.task_id} - {context.task_title}")
        print(f"Files to commit: {change_analysis.total_files}")
        
        # Show file breakdown
        if operation.files_added:
            print(f"  Added: {len(operation.files_added)} files")
        if operation.files_modified:
            print(f"  Modified: {len(operation.files_modified)} files")
        if operation.files_deleted:
            print(f"  Deleted: {len(operation.files_deleted)} files")
        
        print(f"Commit message: {operation.commit_message}")
        
        response = input("\nProceed with commit? (y/n): ").lower().strip()
        if response not in ['y', 'yes']:
            logger.info("Commit cancelled by user")
            operation.result = CommitResult.CANCELLED
            return False
        
        return True
    
    def _execute_git_operations(self, context: ProcessingContext,
                               operation: CommitOperation, 
                               change_analysis: ChangeAnalysis):
        """
        Execute git add and git commit operations
        
        Raises:
            GitError: If git operations fail
        """
        try:
            # Change to working directory if specified
            original_cwd = None
            if context.working_directory:
                original_cwd = os.getcwd()
                os.chdir(context.working_directory)
            
            try:
                # Step 1: Git add (if auto_add_files is enabled)
                git_config = self.config_reader.get_git_automation_config()
                if git_config.get('auto_add_files', True):
                    self._git_add_files(change_analysis)
                
                # Step 2: Git commit
                commit_hash = self._git_commit(operation.commit_message)
                operation.commit_hash = commit_hash
                operation.result = CommitResult.SUCCESS
                
                logger.info(f"Successfully created commit {commit_hash[:8]}")
                
            finally:
                # Restore original working directory
                if original_cwd:
                    os.chdir(original_cwd)
                    
        except Exception as e:
            error_msg = f"Git operation failed: {str(e)}"
            logger.error(error_msg)
            operation.result = CommitResult.ERROR
            operation.error_message = error_msg
            raise GitError(error_msg)
    
    def _git_add_files(self, change_analysis: ChangeAnalysis):
        """Execute git add for changed files"""
        file_paths = [fc.path for fc in change_analysis.files]
        
        if not file_paths:
            return
        
        # Use git add with specific files for safety
        cmd = ['git', 'add'] + file_paths
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            raise GitError(f"git add failed: {result.stderr}")
        
        logger.info(f"Added {len(file_paths)} files to staging area")
    
    def _git_commit(self, message: str) -> str:
        """
        Execute git commit and return commit hash
        
        Returns:
            str: Commit hash
        """
        cmd = ['git', 'commit', '-m', message]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            raise GitError(f"git commit failed: {result.stderr}")
        
        # Extract commit hash from output
        output_lines = result.stdout.strip().split('\n')
        for line in output_lines:
            if line.strip().startswith('['):
                # Format: [branch commit_hash] message
                parts = line.split()
                if len(parts) >= 2:
                    commit_hash = parts[1].rstrip(']')
                    return commit_hash
        
        # Fallback: get latest commit hash
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return result.stdout.strip()
        
        return "unknown"
    
    def _attempt_rollback(self, operation: CommitOperation):
        """
        Attempt to rollback a failed or problematic commit
        
        Args:
            operation: CommitOperation to rollback
        """
        if not operation.commit_hash:
            return
        
        try:
            logger.info(f"Attempting rollback of commit {operation.commit_hash[:8]}")
            
            # Store rollback info before attempting
            operation.rollback_info = {
                'rollback_attempted': True,
                'rollback_timestamp': datetime.now().isoformat(),
                'original_commit': operation.commit_hash
            }
            
            # Reset to previous commit (hard reset)
            cmd = ['git', 'reset', '--hard', 'HEAD~1']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                logger.info("Rollback successful")
                operation.rollback_info['rollback_success'] = True
                operation.result = CommitResult.ROLLBACK
            else:
                logger.error(f"Rollback failed: {result.stderr}")
                operation.rollback_info['rollback_success'] = False
                operation.rollback_info['rollback_error'] = result.stderr
            
        except Exception as e:
            logger.error(f"Exception during rollback: {str(e)}")
            operation.rollback_info = operation.rollback_info or {}
            operation.rollback_info.update({
                'rollback_success': False,
                'rollback_error': str(e)
            })
    
    def _finalize_successful_operation(self, operation: CommitOperation):
        """Finalize successful operation with tracking and logging"""
        self._last_operation = operation
        self._operation_history.append(operation)
        
        # Keep history to reasonable size
        if len(self._operation_history) > 50:
            self._operation_history = self._operation_history[-50:]
        
        logger.info(f"Task {operation.task_id} committed successfully: {operation.commit_hash[:8] if operation.commit_hash else 'N/A'}")
    
    # Additional utility methods
    
    def get_last_operation(self) -> Optional[CommitOperation]:
        """Get the last commit operation performed"""
        return self._last_operation
    
    def get_operation_history(self, limit: int = 10) -> List[CommitOperation]:
        """
        Get recent operation history
        
        Args:
            limit: Maximum number of operations to return
            
        Returns:
            List of recent CommitOperation objects
        """
        return self._operation_history[-limit:] if self._operation_history else []
    
    def is_automation_enabled(self) -> bool:
        """Check if Git automation is currently enabled"""
        return self.config_reader.is_git_automation_enabled()
    
    def get_repository_status(self) -> Dict[str, Any]:
        """
        Get comprehensive repository status information
        
        Returns:
            Dictionary with repository status information
        """
        try:
            return {
                'is_git_repo': self.file_detector.is_git_repository(),
                'is_empty_repo': self.file_detector.is_empty_repository(),
                'automation_enabled': self.is_automation_enabled(),
                'repo_info': self.file_detector.get_repository_info(),
                'last_operation': self._last_operation.task_id if self._last_operation else None,
                'operations_count': len(self._operation_history)
            }
        except Exception as e:
            return {
                'error': str(e),
                'is_git_repo': False,
                'automation_enabled': False
            }
    
    def validate_setup(self) -> Dict[str, Any]:
        """
        Validate complete setup and return diagnostic information
        
        Returns:
            Dictionary with validation results and setup status
        """
        validation_result = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'info': []
        }
        
        try:
            # Check git repository
            if not self.file_detector.is_git_repository():
                validation_result['errors'].append("Not in a Git repository")
                validation_result['valid'] = False
            
            # Validate configuration
            config_validation = self.config_reader.validate_config()
            if not config_validation['valid']:
                validation_result['errors'].extend(config_validation['errors'])
                validation_result['valid'] = False
            validation_result['warnings'].extend(config_validation.get('warnings', []))
            
            # Check user confirmation status
            confirmation_info = self.user_confirmation.get_confirmation_info()
            if confirmation_info.get('error'):
                validation_result['warnings'].append(f"Confirmation system error: {confirmation_info['error']}")
            else:
                if confirmation_info.get('is_configured'):
                    validation_result['info'].append("User confirmation completed")
                    if confirmation_info.get('automation_enabled'):
                        validation_result['info'].append("Git automation is enabled")
                    else:
                        validation_result['info'].append("Git automation is disabled by user choice")
                else:
                    validation_result['info'].append("First-time setup needed")
                
                if confirmation_info.get('is_ci_environment'):
                    validation_result['info'].append("CI/CD environment detected")
            
            # Check automation status
            if self.is_automation_enabled():
                validation_result['info'].append("Git automation is currently enabled")
            else:
                validation_result['warnings'].append("Git automation is currently disabled")
            
            # Repository status
            repo_status = self.get_repository_status()
            validation_result['info'].append(f"Repository status: {json.dumps(repo_status, indent=2)}")
            
        except Exception as e:
            validation_result['errors'].append(f"Setup validation error: {str(e)}")
            validation_result['valid'] = False
        
        return validation_result
    
    def get_user_confirmation_info(self) -> Dict[str, Any]:
        """
        Get detailed user confirmation information
        
        Returns:
            Dictionary with user confirmation status and settings
        """
        return self.user_confirmation.get_confirmation_info()
    
    def reset_user_confirmation(self):
        """
        Reset user confirmation status to allow re-prompting
        
        This is useful for testing or if user wants to change their choice
        """
        self.user_confirmation.reset_confirmation_status()
        logger.info("Reset user confirmation status")
    
    def can_enable_automation(self) -> bool:
        """
        Check if automation can be enabled (not permanently disabled)
        
        Returns:
            bool: True if automation can be enabled
        """
        return self.user_confirmation.can_enable_automation()
    
    def force_enable_automation(self, require_confirmation: bool = True):
        """
        Force enable automation bypassing user confirmation
        
        Args:
            require_confirmation: Whether to require confirmation for commits
        """
        self.user_confirmation.force_enable_automation(require_confirmation)
        logger.info("Force enabled Git automation")
    
    def force_disable_automation(self, permanent: bool = False):
        """
        Force disable automation
        
        Args:
            permanent: If True, permanently disable (won't prompt again)
        """
        self.user_confirmation.force_disable_automation(permanent)
        logger.info(f"Force disabled Git automation ({'permanent' if permanent else 'temporary'})")


# Factory functions for easy instantiation

def create_git_auto_commit(repo_path: Optional[str] = None, 
                          config_path: Optional[str] = None) -> GitAutoCommit:
    """
    Factory function to create GitAutoCommit instance with default components
    
    Args:
        repo_path: Optional path to git repository
        config_path: Optional path to configuration file
        
    Returns:
        GitAutoCommit instance
    """
    config_reader = ConfigurationReader(config_path) if config_path else ConfigurationReader()
    file_detector = FileDetector(repo_path)
    message_generator = MessageGenerator(file_detector)
    user_confirmation = UserConfirmationManager(config_reader)
    
    return GitAutoCommit(config_reader, file_detector, message_generator, user_confirmation, repo_path)


def create_processing_context(task_id: str, task_title: str, **kwargs) -> ProcessingContext:
    """
    Factory function to create ProcessingContext with sensible defaults
    
    Args:
        task_id: Task identifier
        task_title: Task title
        **kwargs: Additional context parameters
        
    Returns:
        ProcessingContext instance
    """
    return ProcessingContext(
        task_id=task_id,
        task_title=task_title,
        **kwargs
    )


# Example usage and testing
if __name__ == "__main__":
    # Example usage for testing
    try:
        # Create GitAutoCommit instance
        git_auto_commit = create_git_auto_commit()
        
        # Validate setup
        print("Validating setup...")
        validation = git_auto_commit.validate_setup()
        print(f"Setup valid: {validation['valid']}")
        if validation['errors']:
            print("Errors:", validation['errors'])
        if validation['warnings']:
            print("Warnings:", validation['warnings'])
        
        # Example task processing (dry run)
        if validation['valid']:
            context = create_processing_context(
                task_id="4",
                task_title="Create enhanced GitAutoCommit service with message generation integration",
                task_description="Create GitAutoCommit class integrating all components",
                dry_run=True
            )
            
            print(f"\nProcessing task completion (dry run)...")
            result = git_auto_commit.process_task_completion(context)
            print(f"Result: {result.result}")
            print(f"Message: {result.commit_message}")
            if result.error_message:
                print(f"Error: {result.error_message}")
        
    except Exception as e:
        print(f"Example execution failed: {str(e)}")