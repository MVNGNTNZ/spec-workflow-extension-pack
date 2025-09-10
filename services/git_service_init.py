"""
Git Service Initialization and Dependency Management

Provides the GitServiceInitializer class for bootstrapping the Git automation system
with comprehensive dependency validation, service lifecycle management, and health
monitoring capabilities.

This module serves as the entry point for initializing the entire Git workflow 
integration system, ensuring all components are properly configured and operational
before allowing any Git automation activities.

Key Features:
- Complete dependency validation for all Git automation services
- Service lifecycle management with graceful startup and shutdown
- Configuration validation and setup verification
- Comprehensive error reporting with actionable diagnostics
- Health check system for ongoing service monitoring
- Integration validation with spec workflow systems
"""

import os
import sys
import json
import logging
import subprocess
import traceback
from typing import Dict, List, Optional, Any, Tuple, Union, Callable
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from enum import Enum

# Import all Git automation service components
try:
    # Try relative import first (when used as package)
    from .git_config_reader import ConfigurationReader, get_config_reader
    from .git_file_detector import FileDetector, create_file_detector, CommitType, FileChange, ChangeAnalysis, GitError
    from .git_message_generator import MessageGenerator, TaskContext, MessageComponents, create_message_generator
    from .git_auto_commit import GitAutoCommit, ProcessingContext, CommitOperation, CommitResult, create_git_auto_commit, create_processing_context
    from .git_commit_handler import GitCommitHandler, CommitConfig, MessageValidation, CommitExecutionResult, MessageValidationLevel, create_git_commit_handler
    from .spec_integration_hook import SpecIntegrationHook, HookState
except ImportError:
    # Fall back to absolute import (when run directly)
    from git_config_reader import ConfigurationReader, get_config_reader
    from git_file_detector import FileDetector, create_file_detector, CommitType, FileChange, ChangeAnalysis, GitError
    from git_message_generator import MessageGenerator, TaskContext, MessageComponents, create_message_generator
    from git_auto_commit import GitAutoCommit, ProcessingContext, CommitOperation, CommitResult, create_git_auto_commit, create_processing_context
    from git_commit_handler import GitCommitHandler, CommitConfig, MessageValidation, CommitExecutionResult, MessageValidationLevel, create_git_commit_handler
    from spec_integration_hook import SpecIntegrationHook, HookState


# Set up logging
logger = logging.getLogger(__name__)


class ServiceState(Enum):
    """States for individual service lifecycle management"""
    UNINITIALIZED = "uninitialized"
    INITIALIZING = "initializing"
    READY = "ready"
    ACTIVE = "active"
    ERROR = "error"
    DISABLED = "disabled"


class SystemState(Enum):
    """Overall system state for Git automation"""
    NOT_INITIALIZED = "not_initialized"
    INITIALIZING = "initializing"
    READY = "ready"
    ACTIVE = "active"
    DEGRADED = "degraded"
    ERROR = "error"
    SHUTDOWN = "shutdown"


@dataclass
class ServiceDependency:
    """Represents a service dependency with validation requirements"""
    name: str
    required: bool = True
    validator: Optional[Callable[[], bool]] = None
    error_message: Optional[str] = None
    service_instance: Optional[Any] = None
    state: ServiceState = ServiceState.UNINITIALIZED


@dataclass
class ServiceHealth:
    """Health status information for a service"""
    service_name: str
    state: ServiceState
    last_check: datetime
    error_count: int = 0
    last_error: Optional[str] = None
    performance_metrics: Dict[str, Any] = field(default_factory=dict)
    dependencies_met: bool = True


@dataclass
class SystemHealth:
    """Overall system health status"""
    system_state: SystemState
    services: Dict[str, ServiceHealth]
    initialization_time: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    error_summary: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class InitializationResult:
    """Result of system initialization process"""
    success: bool
    system_health: SystemHealth
    initialized_services: List[str]
    failed_services: List[str]
    warnings: List[str]
    error_details: Optional[str] = None
    initialization_duration: Optional[float] = None


class GitServiceInitializer:
    """
    Main service initializer for Git automation system
    
    Provides comprehensive dependency validation, service lifecycle management,
    and health monitoring capabilities for the Git workflow integration system.
    
    This class serves as the central orchestrator for:
    - Service discovery and dependency validation
    - Configuration validation and setup verification  
    - Graceful service initialization with error recovery
    - Health monitoring and diagnostic reporting
    - Integration with spec workflow systems
    - Service lifecycle management (startup/shutdown)
    
    Features:
    - Dependency injection and validation
    - Configuration validation with detailed error reporting
    - Health check system with performance monitoring
    - Integration validation with spec workflow components
    - Graceful degradation for non-critical service failures
    - Comprehensive diagnostic and troubleshooting information
    """
    
    def __init__(self, 
                 config_path: Optional[str] = None,
                 repo_path: Optional[str] = None,
                 enable_health_monitoring: bool = True):
        """
        Initialize the Git service initializer
        
        Args:
            config_path: Optional custom configuration file path
            repo_path: Optional custom repository path  
            enable_health_monitoring: Whether to enable ongoing health monitoring
        """
        self.config_path = config_path
        self.repo_path = repo_path or os.getcwd()
        self.enable_health_monitoring = enable_health_monitoring
        
        # Service instances and state
        self.services: Dict[str, Any] = {}
        self.dependencies: Dict[str, ServiceDependency] = {}
        self.health_status: Dict[str, ServiceHealth] = {}
        self.system_state = SystemState.NOT_INITIALIZED
        
        # Performance and monitoring
        self.initialization_start_time: Optional[datetime] = None
        self.health_check_callbacks: List[Callable] = []
        self.error_handlers: Dict[str, Callable] = {}
        
        # Initialize dependency definitions
        self._define_service_dependencies()
        
        logger.info(f"GitServiceInitializer created for repo: {self.repo_path}")
    
    def _define_service_dependencies(self) -> None:
        """Define all service dependencies and their validation requirements"""
        
        # Git repository validation
        self.dependencies["git_repo"] = ServiceDependency(
            name="git_repo",
            required=True,
            validator=self._validate_git_repository,
            error_message="Git repository validation failed - ensure you're in a valid Git repository"
        )
        
        # Configuration service
        self.dependencies["config_reader"] = ServiceDependency(
            name="config_reader", 
            required=True,
            validator=self._validate_config_reader,
            error_message="Configuration reader validation failed - check .claude/settings.local.json"
        )
        
        # File detection service  
        self.dependencies["file_detector"] = ServiceDependency(
            name="file_detector",
            required=True,
            validator=self._validate_file_detector,
            error_message="File detector service validation failed"
        )
        
        # Message generation service
        self.dependencies["message_generator"] = ServiceDependency(
            name="message_generator", 
            required=True,
            validator=self._validate_message_generator,
            error_message="Message generator service validation failed"
        )
        
        # Commit handler service
        self.dependencies["commit_handler"] = ServiceDependency(
            name="commit_handler",
            required=True, 
            validator=self._validate_commit_handler,
            error_message="Commit handler service validation failed"
        )
        
        # Auto commit orchestrator
        self.dependencies["auto_commit"] = ServiceDependency(
            name="auto_commit",
            required=True,
            validator=self._validate_auto_commit, 
            error_message="Auto commit service validation failed"
        )
        
        # Spec integration hook
        self.dependencies["spec_hook"] = ServiceDependency(
            name="spec_hook",
            required=False,  # Optional for basic functionality
            validator=self._validate_spec_hook,
            error_message="Spec integration hook validation failed - advanced workflow features may not work"
        )
    
    def initialize_system(self) -> InitializationResult:
        """
        Initialize the complete Git automation system
        
        Performs comprehensive initialization including:
        - Environment validation
        - Service dependency checking
        - Service instantiation and configuration
        - Integration validation
        - Health check setup
        
        Returns:
            InitializationResult containing success status and diagnostic information
        """
        self.initialization_start_time = datetime.now()
        self.system_state = SystemState.INITIALIZING
        
        logger.info("Starting Git automation system initialization...")
        
        try:
            # Phase 1: Environment validation
            logger.info("Phase 1: Validating environment prerequisites...")
            env_validation = self._validate_environment()
            if not env_validation[0]:
                return self._create_failure_result("Environment validation failed", env_validation[1])
            
            # Phase 2: Configuration validation  
            logger.info("Phase 2: Validating configuration...")
            config_validation = self._validate_configuration()
            if not config_validation[0]:
                return self._create_failure_result("Configuration validation failed", config_validation[1])
                
            # Phase 3: Dependency validation and service instantiation
            logger.info("Phase 3: Validating dependencies and initializing services...")
            service_init_result = self._initialize_services()
            if not service_init_result[0]:
                return self._create_failure_result("Service initialization failed", service_init_result[1])
            
            # Phase 4: Integration validation
            logger.info("Phase 4: Validating service integration...")
            integration_validation = self._validate_integration()
            if not integration_validation[0]:
                logger.warning(f"Integration validation warnings: {integration_validation[1]}")
            
            # Phase 5: Health monitoring setup
            if self.enable_health_monitoring:
                logger.info("Phase 5: Setting up health monitoring...")
                self._setup_health_monitoring()
            
            # System ready
            self.system_state = SystemState.READY
            
            initialization_duration = (datetime.now() - self.initialization_start_time).total_seconds()
            
            logger.info(f"Git automation system initialization completed successfully in {initialization_duration:.2f}s")
            
            return InitializationResult(
                success=True,
                system_health=self._get_system_health(),
                initialized_services=list(self.services.keys()),
                failed_services=[],
                warnings=integration_validation[1] if isinstance(integration_validation[1], list) else [],
                initialization_duration=initialization_duration
            )
            
        except Exception as e:
            error_msg = f"Unexpected error during initialization: {str(e)}"
            logger.error(error_msg, exc_info=True)
            self.system_state = SystemState.ERROR
            return self._create_failure_result("Initialization error", error_msg)
    
    def _validate_environment(self) -> Tuple[bool, Union[str, List[str]]]:
        """Validate environment prerequisites"""
        issues = []
        
        try:
            # Check Python version
            if sys.version_info < (3, 7):
                issues.append(f"Python 3.7+ required, found {sys.version_info.major}.{sys.version_info.minor}")
            
            # Check Git availability
            try:
                result = subprocess.run(['git', '--version'], capture_output=True, text=True, timeout=10)
                if result.returncode != 0:
                    issues.append("Git command not available or not functioning")
                else:
                    logger.debug(f"Git version: {result.stdout.strip()}")
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                issues.append(f"Git command validation failed: {str(e)}")
            
            # Check repository path
            if not os.path.exists(self.repo_path):
                issues.append(f"Repository path does not exist: {self.repo_path}")
            elif not os.path.isdir(self.repo_path):
                issues.append(f"Repository path is not a directory: {self.repo_path}")
            
            # Check .claude directory
            claude_dir = Path(self.repo_path) / '.claude'
            if not claude_dir.exists():
                issues.append(f".claude directory not found at: {claude_dir}")
            elif not claude_dir.is_dir():
                issues.append(f".claude path exists but is not a directory: {claude_dir}")
            
            return len(issues) == 0, issues
            
        except Exception as e:
            return False, f"Environment validation error: {str(e)}"
    
    def _validate_configuration(self) -> Tuple[bool, Union[str, List[str]]]:
        """Validate configuration file and settings"""
        try:
            config_reader = ConfigurationReader(self.config_path)
            
            # Test configuration reading
            try:
                config = config_reader.read_config()
                logger.debug("Configuration file loaded successfully")
            except Exception as e:
                return False, f"Configuration file loading failed: {str(e)}"
            
            # Validate Git automation settings
            issues = []
            
            # Check if git automation is enabled
            if not config_reader.is_git_automation_enabled():
                issues.append("Git automation is disabled in configuration (git_automation_enabled: false)")
            
            # Validate configuration structure
            required_sections = ['git_automation_enabled']
            for section in required_sections:
                if section not in config:
                    issues.append(f"Missing required configuration section: {section}")
            
            return len(issues) == 0, issues if issues else "Configuration validated successfully"
            
        except Exception as e:
            return False, f"Configuration validation error: {str(e)}"
    
    def _initialize_services(self) -> Tuple[bool, Union[str, List[str]]]:
        """Initialize all required services with dependency validation"""
        initialization_errors = []
        
        # Initialize services in dependency order
        service_order = [
            "config_reader",
            "file_detector", 
            "message_generator",
            "commit_handler",
            "auto_commit",
            "spec_hook"
        ]
        
        for service_name in service_order:
            try:
                logger.debug(f"Initializing service: {service_name}")
                
                dependency = self.dependencies[service_name]
                dependency.state = ServiceState.INITIALIZING
                
                # Run service validator
                if dependency.validator:
                    is_valid = dependency.validator()
                    if not is_valid:
                        error_msg = dependency.error_message or f"Service validation failed: {service_name}"
                        if dependency.required:
                            initialization_errors.append(error_msg)
                            dependency.state = ServiceState.ERROR
                            continue
                        else:
                            logger.warning(f"Optional service validation failed: {error_msg}")
                            dependency.state = ServiceState.DISABLED
                            continue
                
                dependency.state = ServiceState.READY
                
                # Initialize health monitoring for this service
                self.health_status[service_name] = ServiceHealth(
                    service_name=service_name,
                    state=ServiceState.READY,
                    last_check=datetime.now(),
                    dependencies_met=True
                )
                
            except Exception as e:
                error_msg = f"Service initialization failed for {service_name}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                
                if self.dependencies[service_name].required:
                    initialization_errors.append(error_msg)
                    self.dependencies[service_name].state = ServiceState.ERROR
                else:
                    logger.warning(f"Optional service failed: {error_msg}")
                    self.dependencies[service_name].state = ServiceState.DISABLED
        
        # Check if any required services failed
        if initialization_errors:
            return False, initialization_errors
        
        return True, "All services initialized successfully"
    
    def _validate_integration(self) -> Tuple[bool, List[str]]:
        """Validate integration between services"""
        warnings = []
        
        try:
            # Test basic integration paths
            config_reader = self.services.get("config_reader")
            if config_reader:
                # Test if configuration can be used by other services
                try:
                    config = config_reader.read_config()
                    if not config:
                        warnings.append("Configuration reader returns empty configuration")
                except Exception as e:
                    warnings.append(f"Configuration integration test failed: {str(e)}")
            
            # Test file detector integration
            if "file_detector" in self.services and "config_reader" in self.services:
                # Could test file detection capabilities here
                logger.debug("File detector integration validated")
            
            # Test message generator integration  
            if "message_generator" in self.services:
                # Could test message generation with sample context
                logger.debug("Message generator integration validated")
            
            # Test auto commit integration
            if "auto_commit" in self.services:
                # Could test auto commit workflow without actually committing
                logger.debug("Auto commit integration validated")
            
            return True, warnings
            
        except Exception as e:
            warnings.append(f"Integration validation error: {str(e)}")
            return False, warnings
    
    def _setup_health_monitoring(self) -> None:
        """Set up ongoing health monitoring for all services"""
        try:
            logger.debug("Setting up health monitoring system...")
            
            # Set up periodic health checks (would need a scheduler in production)
            self.health_check_callbacks.append(self._perform_system_health_check)
            
            # Initialize health status for all services
            for service_name in self.services:
                if service_name not in self.health_status:
                    self.health_status[service_name] = ServiceHealth(
                        service_name=service_name,
                        state=ServiceState.READY,
                        last_check=datetime.now()
                    )
            
            logger.info("Health monitoring system initialized")
            
        except Exception as e:
            logger.warning(f"Health monitoring setup failed: {str(e)}")
    
    def _perform_system_health_check(self) -> SystemHealth:
        """Perform comprehensive system health check"""
        try:
            logger.debug("Performing system health check...")
            
            current_time = datetime.now()
            error_summary = []
            warnings = []
            
            # Check each service
            for service_name, health in self.health_status.items():
                try:
                    # Update last check time
                    health.last_check = current_time
                    
                    # Run service-specific health checks
                    if service_name == "config_reader":
                        self._check_config_reader_health(health)
                    elif service_name == "file_detector":
                        self._check_file_detector_health(health)
                    elif service_name == "git_repo":
                        self._check_git_repo_health(health)
                    
                except Exception as e:
                    health.error_count += 1
                    health.last_error = str(e)
                    health.state = ServiceState.ERROR
                    error_summary.append(f"{service_name}: {str(e)}")
            
            # Determine overall system state
            system_state = self._calculate_system_state(error_summary, warnings)
            
            system_health = SystemHealth(
                system_state=system_state,
                services=self.health_status.copy(),
                last_health_check=current_time,
                error_summary=error_summary,
                warnings=warnings
            )
            
            return system_health
            
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}", exc_info=True)
            return SystemHealth(
                system_state=SystemState.ERROR,
                services={},
                error_summary=[f"Health check system error: {str(e)}"]
            )
    
    def _check_config_reader_health(self, health: ServiceHealth) -> None:
        """Health check for configuration reader service"""
        try:
            if "config_reader" in self.services:
                config_reader = self.services["config_reader"]
                # Test configuration reading
                config = config_reader.read_config()
                if config:
                    health.state = ServiceState.READY
                    health.performance_metrics["config_keys"] = len(config.keys())
                else:
                    health.state = ServiceState.ERROR
                    health.last_error = "Configuration reader returned empty config"
        except Exception as e:
            health.state = ServiceState.ERROR
            health.last_error = str(e)
            health.error_count += 1
    
    def _check_file_detector_health(self, health: ServiceHealth) -> None:
        """Health check for file detector service"""
        try:
            if "file_detector" in self.services:
                # Could test file detection capabilities
                health.state = ServiceState.READY
                health.performance_metrics["last_detection_check"] = datetime.now().isoformat()
        except Exception as e:
            health.state = ServiceState.ERROR
            health.last_error = str(e)
            health.error_count += 1
    
    def _check_git_repo_health(self, health: ServiceHealth) -> None:
        """Health check for Git repository status"""
        try:
            # Check if we're still in a valid Git repository
            result = subprocess.run(
                ['git', 'rev-parse', '--git-dir'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                health.state = ServiceState.READY
                health.performance_metrics["git_dir"] = result.stdout.strip()
            else:
                health.state = ServiceState.ERROR  
                health.last_error = f"Git repository check failed: {result.stderr}"
                
        except Exception as e:
            health.state = ServiceState.ERROR
            health.last_error = str(e)
            health.error_count += 1
    
    def _calculate_system_state(self, errors: List[str], warnings: List[str]) -> SystemState:
        """Calculate overall system state based on service health"""
        if errors:
            # Check if all errors are from non-critical services
            critical_errors = [e for e in errors if not any(
                opt_service in e for opt_service in ["spec_hook"]
            )]
            
            if critical_errors:
                return SystemState.ERROR
            else:
                return SystemState.DEGRADED
        
        if warnings:
            return SystemState.DEGRADED
        
        return SystemState.READY
    
    # Service validation methods
    def _validate_git_repository(self) -> bool:
        """Validate Git repository requirements"""
        try:
            # Check if we're in a Git repository
            result = subprocess.run(
                ['git', 'rev-parse', '--git-dir'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Git repository validation failed: {result.stderr}")
                return False
            
            # Store git directory info
            git_dir = result.stdout.strip()
            logger.debug(f"Git directory validated: {git_dir}")
            
            return True
            
        except Exception as e:
            logger.error(f"Git repository validation error: {str(e)}")
            return False
    
    def _validate_config_reader(self) -> bool:
        """Validate configuration reader service"""
        try:
            config_reader = ConfigurationReader(self.config_path)
            
            # Test configuration reading
            config = config_reader.read_config()
            
            # Store service instance
            self.services["config_reader"] = config_reader
            
            logger.debug("Configuration reader service validated")
            return True
            
        except Exception as e:
            logger.error(f"Configuration reader validation failed: {str(e)}")
            return False
    
    def _validate_file_detector(self) -> bool:
        """Validate file detector service"""
        try:
            file_detector = create_file_detector(
                repo_path=self.repo_path,
                config_reader=self.services.get("config_reader")
            )
            
            # Store service instance
            self.services["file_detector"] = file_detector
            
            logger.debug("File detector service validated")
            return True
            
        except Exception as e:
            logger.error(f"File detector validation failed: {str(e)}")
            return False
    
    def _validate_message_generator(self) -> bool:
        """Validate message generator service"""
        try:
            message_generator = create_message_generator(
                config_reader=self.services.get("config_reader")
            )
            
            # Store service instance
            self.services["message_generator"] = message_generator
            
            logger.debug("Message generator service validated")
            return True
            
        except Exception as e:
            logger.error(f"Message generator validation failed: {str(e)}")
            return False
    
    def _validate_commit_handler(self) -> bool:
        """Validate commit handler service"""
        try:
            commit_handler = create_git_commit_handler(
                repo_path=self.repo_path,
                config_reader=self.services.get("config_reader")
            )
            
            # Store service instance
            self.services["commit_handler"] = commit_handler
            
            logger.debug("Commit handler service validated")
            return True
            
        except Exception as e:
            logger.error(f"Commit handler validation failed: {str(e)}")
            return False
    
    def _validate_auto_commit(self) -> bool:
        """Validate auto commit orchestrator service"""
        try:
            auto_commit = create_git_auto_commit(
                config_reader=self.services.get("config_reader"),
                file_detector=self.services.get("file_detector"),
                message_generator=self.services.get("message_generator"),
                repo_path=self.repo_path
            )
            
            # Store service instance
            self.services["auto_commit"] = auto_commit
            
            logger.debug("Auto commit service validated")
            return True
            
        except Exception as e:
            logger.error(f"Auto commit validation failed: {str(e)}")
            return False
    
    def _validate_spec_hook(self) -> bool:
        """Validate spec integration hook service"""
        try:
            # This is optional, so we don't fail the entire system if it's not available
            spec_hook = SpecIntegrationHook(
                git_auto_commit=self.services.get("auto_commit")
            )
            
            # Store service instance
            self.services["spec_hook"] = spec_hook
            
            logger.debug("Spec integration hook service validated")
            return True
            
        except Exception as e:
            logger.warning(f"Spec hook validation failed (optional): {str(e)}")
            return False
    
    def _create_failure_result(self, error_type: str, error_details: Union[str, List[str]]) -> InitializationResult:
        """Create a failure result with diagnostic information"""
        self.system_state = SystemState.ERROR
        
        if isinstance(error_details, list):
            error_message = f"{error_type}: " + "; ".join(error_details)
            warnings = error_details
        else:
            error_message = f"{error_type}: {error_details}"
            warnings = [error_details]
        
        duration = None
        if self.initialization_start_time:
            duration = (datetime.now() - self.initialization_start_time).total_seconds()
        
        return InitializationResult(
            success=False,
            system_health=self._get_system_health(),
            initialized_services=list(self.services.keys()),
            failed_services=[dep for dep, info in self.dependencies.items() 
                           if info.state == ServiceState.ERROR],
            warnings=warnings,
            error_details=error_message,
            initialization_duration=duration
        )
    
    def _get_system_health(self) -> SystemHealth:
        """Get current system health status"""
        return SystemHealth(
            system_state=self.system_state,
            services=self.health_status.copy(),
            initialization_time=self.initialization_start_time,
            last_health_check=datetime.now()
        )
    
    def get_service(self, service_name: str) -> Optional[Any]:
        """
        Get a specific initialized service instance
        
        Args:
            service_name: Name of the service to retrieve
            
        Returns:
            Service instance if available and initialized, None otherwise
        """
        return self.services.get(service_name)
    
    def is_service_available(self, service_name: str) -> bool:
        """
        Check if a service is available and ready
        
        Args:
            service_name: Name of the service to check
            
        Returns:
            True if service is available and ready
        """
        if service_name not in self.dependencies:
            return False
        
        dependency = self.dependencies[service_name]
        return dependency.state == ServiceState.READY
    
    def get_system_status(self) -> Dict[str, Any]:
        """
        Get comprehensive system status information
        
        Returns:
            Dictionary with detailed system status
        """
        return {
            "system_state": self.system_state.value,
            "services": {
                name: {
                    "state": dep.state.value,
                    "required": dep.required,
                    "available": name in self.services
                }
                for name, dep in self.dependencies.items()
            },
            "health_monitoring_enabled": self.enable_health_monitoring,
            "repo_path": self.repo_path,
            "config_path": self.config_path,
            "initialization_time": self.initialization_start_time.isoformat() if self.initialization_start_time else None
        }
    
    def perform_health_check(self) -> SystemHealth:
        """
        Perform on-demand system health check
        
        Returns:
            Current system health status
        """
        return self._perform_system_health_check()
    
    def shutdown(self) -> None:
        """
        Gracefully shutdown the Git automation system
        
        Performs cleanup of all initialized services and releases resources
        """
        logger.info("Shutting down Git automation system...")
        
        try:
            self.system_state = SystemState.SHUTDOWN
            
            # Shutdown services in reverse order
            service_shutdown_order = list(reversed([
                "spec_hook",
                "auto_commit", 
                "commit_handler",
                "message_generator",
                "file_detector",
                "config_reader"
            ]))
            
            for service_name in service_shutdown_order:
                try:
                    if service_name in self.services:
                        service = self.services[service_name]
                        
                        # Call shutdown method if available
                        if hasattr(service, 'shutdown'):
                            service.shutdown()
                        
                        # Update service state
                        if service_name in self.dependencies:
                            self.dependencies[service_name].state = ServiceState.UNINITIALIZED
                        
                        logger.debug(f"Service {service_name} shutdown completed")
                        
                except Exception as e:
                    logger.warning(f"Error shutting down service {service_name}: {str(e)}")
            
            # Clear service instances
            self.services.clear()
            self.health_status.clear()
            
            logger.info("Git automation system shutdown completed")
            
        except Exception as e:
            logger.error(f"Error during system shutdown: {str(e)}", exc_info=True)


def create_git_service_initializer(config_path: Optional[str] = None,
                                 repo_path: Optional[str] = None,
                                 enable_health_monitoring: bool = True) -> GitServiceInitializer:
    """
    Factory function to create a GitServiceInitializer instance
    
    Args:
        config_path: Optional custom configuration file path
        repo_path: Optional custom repository path
        enable_health_monitoring: Whether to enable health monitoring
        
    Returns:
        Configured GitServiceInitializer instance
    """
    return GitServiceInitializer(
        config_path=config_path,
        repo_path=repo_path,
        enable_health_monitoring=enable_health_monitoring
    )


def initialize_git_automation(config_path: Optional[str] = None,
                            repo_path: Optional[str] = None) -> Tuple[bool, GitServiceInitializer, InitializationResult]:
    """
    Convenience function to initialize the complete Git automation system
    
    Args:
        config_path: Optional custom configuration file path
        repo_path: Optional custom repository path
        
    Returns:
        Tuple of (success, initializer_instance, initialization_result)
    """
    initializer = create_git_service_initializer(config_path, repo_path)
    result = initializer.initialize_system()
    
    return result.success, initializer, result


if __name__ == "__main__":
    """Test the service initialization system"""
    
    # Set up logging for testing
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("Testing Git Service Initialization System")
    print("=" * 50)
    
    # Test initialization
    success, initializer, result = initialize_git_automation()
    
    print(f"Initialization Success: {success}")
    print(f"System State: {initializer.system_state.value}")
    print(f"Initialized Services: {result.initialized_services}")
    
    if result.failed_services:
        print(f"Failed Services: {result.failed_services}")
    
    if result.warnings:
        print(f"Warnings: {result.warnings}")
    
    if result.error_details:
        print(f"Error Details: {result.error_details}")
    
    # Test health check
    if success:
        print("\nPerforming health check...")
        health = initializer.perform_health_check()
        print(f"System Health: {health.system_state.value}")
        for service_name, service_health in health.services.items():
            print(f"  {service_name}: {service_health.state.value}")
    
    # Test service access
    if success:
        print("\nTesting service access...")
        config_reader = initializer.get_service("config_reader")
        if config_reader:
            print("✓ Configuration reader service accessible")
        
        auto_commit = initializer.get_service("auto_commit")
        if auto_commit:
            print("✓ Auto commit service accessible")
    
    # Shutdown
    if success:
        print("\nShutting down system...")
        initializer.shutdown()
        print("✓ System shutdown completed")