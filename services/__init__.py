"""
Services package for Git Workflow Integration

This package contains service modules for Git automation functionality:
- git_config_reader: Configuration management for Git automation settings
- git_file_detector: File detection and change analysis for intelligent commit type determination
- git_message_generator: Intelligent commit message generation from task context and file changes
- git_auto_commit: Main orchestrator integrating all components for complete Git automation
- git_commit_handler: Specialized robust commit operations with validation and retry logic
- spec_integration_hook: Integration layer between Git automation and spec workflow systems
- git_service_init: Service initialization and dependency management for complete system bootstrap
"""

from .git_config_reader import ConfigurationReader, get_config_reader
from .git_file_detector import FileDetector, create_file_detector, CommitType, FileChange, ChangeAnalysis, GitError
from .git_message_generator import MessageGenerator, TaskContext, MessageComponents, create_message_generator
from .git_auto_commit import GitAutoCommit, ProcessingContext, CommitOperation, CommitResult, create_git_auto_commit, create_processing_context
from .git_commit_handler import GitCommitHandler, CommitConfig, MessageValidation, CommitExecutionResult, MessageValidationLevel, create_git_commit_handler
from .spec_integration_hook import SpecIntegrationHook, HookState
from .git_task_aggregator import GitTaskAggregator, TaskContext as AggregatorTaskContext, create_git_task_aggregator
from .git_service_init import GitServiceInitializer, ServiceState, SystemState, ServiceDependency, ServiceHealth, SystemHealth, InitializationResult, create_git_service_initializer, initialize_git_automation

__all__ = [
    'ConfigurationReader',
    'get_config_reader',
    'FileDetector', 
    'create_file_detector',
    'CommitType',
    'FileChange',
    'ChangeAnalysis',
    'GitError',
    'MessageGenerator',
    'TaskContext',
    'MessageComponents',
    'create_message_generator',
    'GitAutoCommit',
    'ProcessingContext', 
    'CommitOperation',
    'CommitResult',
    'create_git_auto_commit',
    'create_processing_context',
    'GitCommitHandler',
    'CommitConfig',
    'MessageValidation',
    'CommitExecutionResult', 
    'MessageValidationLevel',
    'create_git_commit_handler',
    'SpecIntegrationHook',
    'HookState',
    'GitTaskAggregator',
    'AggregatorTaskContext', 
    'create_git_task_aggregator',
    'GitServiceInitializer',
    'ServiceState',
    'SystemState',
    'ServiceDependency',
    'ServiceHealth',
    'SystemHealth',
    'InitializationResult',
    'create_git_service_initializer',
    'initialize_git_automation'
]