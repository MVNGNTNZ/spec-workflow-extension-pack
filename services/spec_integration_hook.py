"""
Spec Integration Hook - Integration Layer Between Git Automation and Spec Workflow

This module provides the SpecIntegrationHook class that seamlessly connects the Git 
automation system with the existing spec-task-executor agent. It handles task context 
passing, workflow state monitoring, and callback mechanisms to enable automatic Git 
commits after task completions while maintaining backward compatibility.

Key Features:
- Enhanced callback mechanism with task context passing
- Spec workflow state monitoring and task completion detection  
- Hook registration and lifecycle management
- Backward compatibility with existing workflows
- Intelligent task context extraction and enrichment
"""

import os
import re
import json
import logging
from typing import Dict, List, Optional, Any, Callable, Union
from dataclasses import dataclass, asdict
from pathlib import Path
from datetime import datetime
from enum import Enum

# Import Git automation components
try:
    # Try relative import first (when used as package)
    from .git_auto_commit import GitAutoCommit, create_git_auto_commit, create_processing_context, CommitResult
    from .git_config_reader import ConfigurationReader
    from .git_task_aggregator import GitTaskAggregator, create_git_task_aggregator, TaskContext
except ImportError:
    # Fall back to absolute import (when run directly)
    from git_auto_commit import GitAutoCommit, create_git_auto_commit, create_processing_context, CommitResult
    from git_config_reader import ConfigurationReader
    from git_task_aggregator import GitTaskAggregator, create_git_task_aggregator, TaskContext


# Set up logging
logger = logging.getLogger(__name__)


class HookState(Enum):
    """States for hook lifecycle management"""
    UNREGISTERED = "unregistered"
    REGISTERED = "registered" 
    ACTIVE = "active"
    DISABLED = "disabled"
    ERROR = "error"


@dataclass
class SpecTaskContext:
    """Enhanced task context for spec workflow integration"""
    task_id: str
    task_title: str
    task_description: Optional[str] = None
    spec_name: Optional[str] = None
    phase: Optional[str] = None  # e.g., "requirements", "design", "tasks"
    completion_method: Optional[str] = None  # e.g., "get-tasks", "manual"
    agent_name: Optional[str] = None  # e.g., "spec-task-executor"
    timestamp: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def to_processing_context(self, **kwargs) -> Any:
        """Convert to ProcessingContext for GitAutoCommit"""
        return create_processing_context(
            task_id=self.task_id,
            task_title=self.task_title,
            task_description=self.task_description,
            spec_name=self.spec_name,
            **kwargs
        )


@dataclass  
class HookCallback:
    """Callback configuration for spec workflow events"""
    name: str
    callback: Callable[[SpecTaskContext], Any]
    enabled: bool = True
    priority: int = 0  # Higher priority callbacks run first
    error_handling: str = "continue"  # "continue", "stop", "retry"


class SpecIntegrationHook:
    """
    Integration hook that connects Git automation with spec workflow.
    
    Provides seamless integration between the GitAutoCommit service and the 
    existing spec-task-executor agent, enabling automatic commits after task 
    completions while maintaining backward compatibility and providing enhanced 
    callback mechanisms.
    """
    
    def __init__(self, 
                 git_service: Optional[GitAutoCommit] = None,
                 config_reader: Optional[ConfigurationReader] = None,
                 task_aggregator: Optional[GitTaskAggregator] = None,
                 working_directory: Optional[str] = None):
        """
        Initialize the integration hook.
        
        Args:
            git_service: GitAutoCommit service instance (created if not provided)
            config_reader: Configuration reader (created if not provided) 
            task_aggregator: Task aggregator for commit frequency control (created if not provided)
            working_directory: Working directory for Git operations
        """
        self.working_directory = working_directory or os.getcwd()
        self.config_reader = config_reader or ConfigurationReader()
        self.task_aggregator = task_aggregator or create_git_task_aggregator()
        
        # Initialize Git service if automation is enabled
        self._git_service = git_service
        self._callbacks: List[HookCallback] = []
        self._state = HookState.UNREGISTERED
        self._operation_history: List[Dict[str, Any]] = []
        
        logger.info(f"SpecIntegrationHook initialized for directory: {self.working_directory}")
    
    @property
    def git_service(self) -> Optional[GitAutoCommit]:
        """Lazy initialization of Git service"""
        if self._git_service is None and self.is_git_automation_enabled():
            try:
                self._git_service = create_git_auto_commit(
                    repo_path=self.working_directory
                )
                logger.info("GitAutoCommit service initialized lazily")
            except Exception as e:
                logger.warning(f"Failed to initialize GitAutoCommit service: {e}")
        return self._git_service
    
    def register_hook(self) -> bool:
        """
        Register the integration hook and set up callbacks.
        
        Returns:
            bool: True if registration successful, False otherwise
        """
        try:
            if self._state in [HookState.REGISTERED, HookState.ACTIVE]:
                logger.info("Hook already registered, skipping registration")
                return True
            
            # Register default Git automation callback
            self._register_default_callbacks()
            
            # Validate setup
            validation_result = self.validate_setup()
            if not validation_result['valid']:
                logger.error(f"Hook validation failed: {validation_result['errors']}")
                self._state = HookState.ERROR
                return False
            
            self._state = HookState.REGISTERED
            logger.info("SpecIntegrationHook registered successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to register hook: {e}")
            self._state = HookState.ERROR
            return False
    
    def _register_default_callbacks(self):
        """Register default callbacks for Git automation"""
        if self.is_git_automation_enabled():
            git_callback = HookCallback(
                name="git_auto_commit",
                callback=self._handle_git_automation,
                enabled=True,
                priority=100,  # High priority for Git operations
                error_handling="continue"
            )
            self.add_callback(git_callback)
            logger.info("Default Git automation callback registered")
    
    def add_callback(self, callback: HookCallback) -> bool:
        """
        Add a callback to the hook.
        
        Args:
            callback: HookCallback instance to add
            
        Returns:
            bool: True if callback added successfully
        """
        try:
            # Check for duplicate names
            existing_names = [cb.name for cb in self._callbacks]
            if callback.name in existing_names:
                logger.warning(f"Callback with name '{callback.name}' already exists")
                return False
            
            self._callbacks.append(callback)
            # Sort callbacks by priority (descending)
            self._callbacks.sort(key=lambda x: x.priority, reverse=True)
            
            logger.info(f"Callback '{callback.name}' added with priority {callback.priority}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add callback '{callback.name}': {e}")
            return False
    
    def remove_callback(self, name: str) -> bool:
        """
        Remove a callback by name.
        
        Args:
            name: Name of the callback to remove
            
        Returns:
            bool: True if callback removed successfully
        """
        try:
            original_count = len(self._callbacks)
            self._callbacks = [cb for cb in self._callbacks if cb.name != name]
            
            if len(self._callbacks) < original_count:
                logger.info(f"Callback '{name}' removed successfully")
                return True
            else:
                logger.warning(f"Callback '{name}' not found")
                return False
                
        except Exception as e:
            logger.error(f"Failed to remove callback '{name}': {e}")
            return False
    
    def handle_task_completion(self, 
                              task_id: str, 
                              task_title: str,
                              task_description: Optional[str] = None,
                              spec_name: Optional[str] = None,
                              next_task_id: Optional[str] = None,
                              total_tasks: Optional[int] = None,
                              **kwargs) -> Dict[str, Any]:
        """
        Handle task completion event with commit frequency control.
        
        This is the main integration point called by the spec-task-executor
        agent after a task is completed.
        
        Args:
            task_id: Unique task identifier
            task_title: Human-readable task title
            task_description: Optional detailed task description
            spec_name: Name of the specification being executed
            next_task_id: ID of the next task (for phase detection)
            total_tasks: Total tasks in spec (for completion detection)
            **kwargs: Additional metadata for callbacks
            
        Returns:
            Dict with callback results and operation metadata
        """
        logger.info(f"Handling task completion: {task_id} - {task_title}")
        
        # Create enhanced task context
        task_context = SpecTaskContext(
            task_id=task_id,
            task_title=task_title,
            task_description=task_description,
            spec_name=spec_name,
            completion_method=kwargs.get('completion_method', 'get-tasks'),
            agent_name=kwargs.get('agent_name', 'spec-task-executor'),
            timestamp=datetime.now().isoformat(),
            metadata=kwargs
        )
        
        # Convert to TaskContext for aggregator
        aggregator_task = TaskContext(
            task_id=task_id,
            task_title=task_title,
            spec_name=spec_name or 'unknown-spec',
            completed_at=task_context.timestamp,
            files_changed=kwargs.get('files_changed', [])
        )
        
        # Get commit frequency from configuration
        git_config = self.config_reader.get_git_automation_config()
        commit_frequency = git_config.get('commit_frequency', 'phase')
        
        commit_result = {'skipped': True, 'reason': 'Not ready to commit'}
        
        if not self.is_git_automation_enabled():
            logger.info("Git automation disabled, skipping commit")
        elif commit_frequency == 'task':
            # Immediate commit after each task (original behavior)
            commit_result = self._commit_immediate(task_context)
        elif commit_frequency == 'phase':
            # Add to aggregator, commit when phase complete
            self.task_aggregator.add_completed_task(aggregator_task)
            if self.task_aggregator.is_phase_complete(aggregator_task, next_task_id):
                phase_tasks = self.task_aggregator.clear_phase_tasks(aggregator_task.phase_number)
                commit_result = self._commit_aggregated(phase_tasks, 'phase')
        elif commit_frequency == 'spec':
            # Add to aggregator, commit when spec complete
            self.task_aggregator.add_completed_task(aggregator_task)
            if self.task_aggregator.is_spec_complete(aggregator_task, total_tasks):
                all_tasks = self.task_aggregator.clear_all_tasks()
                commit_result = self._commit_aggregated(all_tasks, 'spec')
        else:
            logger.warning(f"Unknown commit frequency: {commit_frequency}")
        
        # Execute callbacks
        callback_results = self._execute_callbacks(task_context)
        
        # Record operation
        operation_record = {
            'task_context': asdict(task_context),
            'commit_result': commit_result,
            'callback_results': callback_results,
            'commit_frequency': commit_frequency,
            'timestamp': datetime.now().isoformat(),
            'hook_state': self._state.value
        }
        self._operation_history.append(operation_record)
        
        # Keep only last 50 operations
        if len(self._operation_history) > 50:
            self._operation_history = self._operation_history[-50:]
        
        return {
            'success': True,
            'task_context': asdict(task_context),
            'commit_result': commit_result,
            'callback_results': callback_results,
            'operation_id': len(self._operation_history) - 1
        }
    
    def _commit_immediate(self, task_context: SpecTaskContext) -> Dict[str, Any]:
        """Commit immediately after task completion (original behavior)"""
        try:
            if self.git_service:
                processing_context = task_context.to_processing_context()
                result = self.git_service.process_task_completion(processing_context)
                return {
                    'committed': True,
                    'frequency': 'task',
                    'result': result
                }
            else:
                return {'committed': False, 'reason': 'Git service not available'}
        except Exception as e:
            logger.error(f"Immediate commit failed: {e}")
            return {'committed': False, 'error': str(e)}
    
    def _commit_aggregated(self, tasks: List[TaskContext], commit_type: str) -> Dict[str, Any]:
        """Commit multiple aggregated tasks (phase or spec level)"""
        try:
            if not tasks:
                return {'committed': False, 'reason': 'No tasks to commit'}
            
            if not self.git_service:
                return {'committed': False, 'reason': 'Git service not available'}
            
            # Generate aggregated commit message
            commit_message = self.task_aggregator.generate_aggregated_message(tasks, commit_type)
            
            # Create processing context for aggregated commit
            primary_task = tasks[0]  # Use first task as primary
            processing_context = create_processing_context(
                task_id=f"{commit_type}-{primary_task.spec_name}",
                task_title=commit_message,
                task_description=f"Aggregated commit for {len(tasks)} tasks",
                spec_name=primary_task.spec_name,
                custom_commit_message=commit_message
            )
            
            result = self.git_service.process_task_completion(processing_context)
            
            return {
                'committed': True,
                'frequency': commit_type,
                'task_count': len(tasks),
                'commit_message': commit_message,
                'result': result
            }
            
        except Exception as e:
            logger.error(f"Aggregated commit failed: {e}")
            return {'committed': False, 'error': str(e), 'task_count': len(tasks)}
    
    def _execute_callbacks(self, task_context: SpecTaskContext) -> Dict[str, Any]:
        """
        Execute all registered callbacks with the task context.
        
        Args:
            task_context: SpecTaskContext with task information
            
        Returns:
            Dict with results from each callback
        """
        callback_results = {}
        
        if self._state != HookState.REGISTERED:
            logger.warning(f"Hook not in registered state: {self._state}")
            return callback_results
        
        # Set state to active during callback execution
        self._state = HookState.ACTIVE
        
        try:
            for callback in self._callbacks:
                if not callback.enabled:
                    callback_results[callback.name] = {'skipped': True, 'reason': 'disabled'}
                    continue
                
                try:
                    logger.debug(f"Executing callback: {callback.name}")
                    result = callback.callback(task_context)
                    callback_results[callback.name] = {
                        'success': True,
                        'result': result
                    }
                    logger.debug(f"Callback '{callback.name}' completed successfully")
                    
                except Exception as e:
                    error_msg = f"Callback '{callback.name}' failed: {e}"
                    logger.error(error_msg)
                    
                    callback_results[callback.name] = {
                        'success': False,
                        'error': str(e)
                    }
                    
                    # Handle error based on callback configuration
                    if callback.error_handling == "stop":
                        logger.error("Stopping callback execution due to error")
                        break
                    elif callback.error_handling == "retry":
                        # Simple retry logic (could be enhanced)
                        try:
                            logger.info(f"Retrying callback: {callback.name}")
                            result = callback.callback(task_context)
                            callback_results[callback.name] = {
                                'success': True,
                                'result': result,
                                'retried': True
                            }
                        except Exception as retry_error:
                            callback_results[callback.name]['retry_error'] = str(retry_error)
            
        finally:
            # Return to registered state
            self._state = HookState.REGISTERED
        
        return callback_results
    
    def _handle_git_automation(self, task_context: SpecTaskContext) -> Dict[str, Any]:
        """
        Handle Git automation for the completed task.
        
        Args:
            task_context: SpecTaskContext with task information
            
        Returns:
            Dict with Git automation results
        """
        if not self.is_git_automation_enabled():
            return {'result': CommitResult.DISABLED.value, 'message': 'Git automation disabled'}
        
        if self.git_service is None:
            return {'result': CommitResult.ERROR.value, 'message': 'Git service not available'}
        
        try:
            # Convert to processing context
            processing_context = task_context.to_processing_context(
                working_directory=self.working_directory
            )
            
            # Execute Git automation
            operation = self.git_service.process_task_completion(processing_context)
            
            return {
                'result': operation.result.value if hasattr(operation, 'result') else CommitResult.SUCCESS.value,
                'commit_message': operation.commit_message,
                'files_modified': len(operation.files_modified),
                'commit_hash': getattr(operation, 'commit_hash', None),
                'operation_id': operation.task_id
            }
            
        except Exception as e:
            logger.error(f"Git automation failed for task {task_context.task_id}: {e}")
            return {
                'result': CommitResult.ERROR.value,
                'error': str(e)
            }
    
    def is_git_automation_enabled(self) -> bool:
        """
        Check if Git automation is enabled in configuration.
        
        Returns:
            bool: True if Git automation is enabled
        """
        try:
            config = self.config_reader.read_config()
            return config.get('git_automation_enabled', False)
        except Exception as e:
            logger.error(f"Failed to read Git automation configuration: {e}")
            return False
    
    def get_hook_status(self) -> Dict[str, Any]:
        """
        Get current hook status and configuration.
        
        Returns:
            Dict with hook status information
        """
        return {
            'state': self._state.value,
            'git_automation_enabled': self.is_git_automation_enabled(),
            'git_service_available': self.git_service is not None,
            'callbacks_registered': len(self._callbacks),
            'callback_names': [cb.name for cb in self._callbacks],
            'working_directory': self.working_directory,
            'operation_count': len(self._operation_history)
        }
    
    def get_operation_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent operation history.
        
        Args:
            limit: Maximum number of operations to return
            
        Returns:
            List of recent operation records
        """
        return self._operation_history[-limit:] if self._operation_history else []
    
    def validate_setup(self) -> Dict[str, Any]:
        """
        Validate hook setup and dependencies.
        
        Returns:
            Dict with validation results
        """
        validation_result = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'checks': {}
        }
        
        try:
            # Check working directory
            if not os.path.exists(self.working_directory):
                validation_result['errors'].append(f"Working directory does not exist: {self.working_directory}")
                validation_result['valid'] = False
            validation_result['checks']['working_directory'] = os.path.exists(self.working_directory)
            
            # Check configuration
            try:
                config = self.config_reader.read_config()
                validation_result['checks']['configuration'] = True
            except Exception as e:
                validation_result['warnings'].append(f"Configuration issues: {e}")
                validation_result['checks']['configuration'] = False
            
            # Check Git service if enabled
            if self.is_git_automation_enabled():
                git_service_valid = self.git_service is not None
                validation_result['checks']['git_service'] = git_service_valid
                if not git_service_valid:
                    validation_result['warnings'].append("Git automation enabled but service not available")
            else:
                validation_result['checks']['git_service'] = 'disabled'
            
            # Check callback registration
            validation_result['checks']['callbacks_registered'] = len(self._callbacks) > 0
            
        except Exception as e:
            validation_result['errors'].append(f"Validation failed: {e}")
            validation_result['valid'] = False
        
        return validation_result
    
    def enable_hook(self) -> bool:
        """
        Enable the hook if it's currently disabled.
        
        Returns:
            bool: True if hook enabled successfully
        """
        if self._state == HookState.DISABLED:
            self._state = HookState.REGISTERED
            logger.info("Hook enabled successfully")
            return True
        return False
    
    def disable_hook(self) -> bool:
        """
        Disable the hook temporarily.
        
        Returns:
            bool: True if hook disabled successfully
        """
        if self._state in [HookState.REGISTERED, HookState.ACTIVE]:
            self._state = HookState.DISABLED
            logger.info("Hook disabled successfully")
            return True
        return False
    
    def unregister_hook(self) -> bool:
        """
        Unregister the hook and clean up resources.
        
        Returns:
            bool: True if hook unregistered successfully
        """
        try:
            self._callbacks.clear()
            self._state = HookState.UNREGISTERED
            logger.info("Hook unregistered successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to unregister hook: {e}")
            return False


# Factory function for easy instantiation
def create_spec_integration_hook(working_directory: Optional[str] = None,
                                config_path: Optional[str] = None) -> SpecIntegrationHook:
    """
    Factory function to create SpecIntegrationHook with default configuration.
    
    Args:
        working_directory: Working directory for operations
        config_path: Optional path to configuration file
        
    Returns:
        SpecIntegrationHook instance
    """
    config_reader = ConfigurationReader(config_path) if config_path else ConfigurationReader()
    task_aggregator = create_git_task_aggregator()
    
    return SpecIntegrationHook(
        config_reader=config_reader,
        task_aggregator=task_aggregator,
        working_directory=working_directory
    )


# Global hook instance for simple usage
_global_hook: Optional[SpecIntegrationHook] = None


def get_global_hook() -> SpecIntegrationHook:
    """
    Get or create global hook instance.
    
    Returns:
        SpecIntegrationHook: Global hook instance
    """
    global _global_hook
    if _global_hook is None:
        _global_hook = create_spec_integration_hook()
        _global_hook.register_hook()
    return _global_hook


def handle_task_completion_simple(task_id: str, 
                                 task_title: str, 
                                 **kwargs) -> Dict[str, Any]:
    """
    Simple interface for handling task completion using global hook.
    
    Args:
        task_id: Task identifier
        task_title: Task title
        **kwargs: Additional task context
        
    Returns:
        Dict with operation results
    """
    hook = get_global_hook()
    return hook.handle_task_completion(task_id, task_title, **kwargs)


if __name__ == "__main__":
    # Example usage and testing
    import sys
    
    logging.basicConfig(level=logging.INFO)
    
    # Create and test hook
    hook = create_spec_integration_hook()
    
    print("Hook Status:", hook.get_hook_status())
    
    # Register hook
    if hook.register_hook():
        print("Hook registered successfully")
        
        # Test validation
        validation = hook.validate_setup()
        print("Validation:", validation)
        
        # Test task completion
        if len(sys.argv) > 1:
            test_result = hook.handle_task_completion(
                task_id="test-1", 
                task_title="Test Task",
                task_description="This is a test task for integration testing"
            )
            print("Task completion result:", test_result)
    else:
        print("Failed to register hook")