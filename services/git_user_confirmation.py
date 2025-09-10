"""
Git User Confirmation System for First-Time Activation

Manages user confirmation for first-time Git automation setup with interactive prompts,
consent tracking, and configuration persistence. Includes CI/CD environment detection
and permanent disable options.
"""

import os
import sys
import json
import logging
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
from enum import Enum

# Import configuration reader
try:
    from .git_config_reader import ConfigurationReader
except ImportError:
    from git_config_reader import ConfigurationReader


# Set up logging
logger = logging.getLogger(__name__)


class ConfirmationResult(Enum):
    """Result codes for user confirmation operations"""
    ENABLED = "enabled"
    DISABLED = "disabled"
    CANCELLED = "cancelled"
    ERROR = "error"
    SKIP_CI = "skip_ci"
    ALREADY_CONFIGURED = "already_configured"


class UserConfirmationManager:
    """
    Manages first-time user confirmation and consent for Git automation
    
    Features:
    - Interactive confirmation prompts with clear explanations
    - Consent tracking with timestamps
    - Permanent disable options
    - CI/CD environment detection and bypass
    - Configuration persistence through ConfigurationReader
    - Comprehensive error handling
    """
    
    def __init__(self, config_reader: Optional[ConfigurationReader] = None):
        """
        Initialize UserConfirmationManager
        
        Args:
            config_reader: Optional ConfigurationReader instance
        """
        self.config_reader = config_reader or ConfigurationReader()
        self._ci_env_vars = [
            'CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER', 'JENKINS_URL',
            'GITHUB_ACTIONS', 'GITLAB_CI', 'TRAVIS', 'CIRCLECI', 'AZURE_PIPELINES'
        ]
    
    def check_first_time_confirmation(self) -> Tuple[bool, ConfirmationResult]:
        """
        Check if first-time confirmation is needed and handle it
        
        Returns:
            Tuple of (should_proceed, confirmation_result)
            - should_proceed: bool indicating if Git automation should be enabled
            - confirmation_result: ConfirmationResult enum indicating what happened
        """
        logger.info("Checking first-time Git automation confirmation status")
        
        try:
            # Check if we're in a CI/CD environment
            if self._is_ci_environment():
                logger.info("CI/CD environment detected - skipping user confirmation")
                return False, ConfirmationResult.SKIP_CI
            
            # Check current configuration
            confirmation_status = self._get_confirmation_status()
            
            # If already configured, respect existing setting
            if confirmation_status['already_confirmed']:
                is_enabled = self.config_reader.is_git_automation_enabled()
                logger.info(f"Git automation already configured: {'enabled' if is_enabled else 'disabled'}")
                return is_enabled, ConfirmationResult.ALREADY_CONFIGURED
            
            # First-time setup - show confirmation dialog
            return self._handle_first_time_confirmation()
            
        except Exception as e:
            logger.error(f"Error checking first-time confirmation: {str(e)}")
            return False, ConfirmationResult.ERROR
    
    def _is_ci_environment(self) -> bool:
        """
        Check if running in a CI/CD environment
        
        Returns:
            bool: True if in CI/CD environment
        """
        # Check for common CI environment variables
        for env_var in self._ci_env_vars:
            if os.getenv(env_var):
                logger.debug(f"CI environment detected via {env_var}")
                return True
        
        # Check for non-interactive terminal
        if not sys.stdin.isatty():
            logger.debug("Non-interactive terminal detected")
            return True
        
        return False
    
    def _get_confirmation_status(self) -> Dict[str, Any]:
        """
        Get current confirmation status from configuration
        
        Returns:
            Dictionary with confirmation status information
        """
        try:
            config = self.config_reader.read_config()
            git_config = config.get('git_automation', {})
            
            return {
                'already_confirmed': 'user_confirmation' in git_config,
                'confirmation_timestamp': git_config.get('user_confirmation', {}).get('timestamp'),
                'user_choice': git_config.get('user_confirmation', {}).get('choice'),
                'can_prompt_again': git_config.get('user_confirmation', {}).get('can_prompt_again', True)
            }
            
        except (FileNotFoundError, json.JSONDecodeError):
            # No configuration exists yet
            return {
                'already_confirmed': False,
                'confirmation_timestamp': None,
                'user_choice': None,
                'can_prompt_again': True
            }
    
    def _handle_first_time_confirmation(self) -> Tuple[bool, ConfirmationResult]:
        """
        Handle first-time confirmation dialog
        
        Returns:
            Tuple of (should_proceed, confirmation_result)
        """
        try:
            # Display comprehensive explanation
            self._display_git_automation_explanation()
            
            # Get user choice
            user_choice = self._prompt_user_choice()
            
            if user_choice == 'enable':
                # User chose to enable
                self._save_confirmation_choice(True, can_prompt_again=True)
                logger.info("User enabled Git automation")
                return True, ConfirmationResult.ENABLED
                
            elif user_choice == 'disable':
                # User chose to disable for now
                self._save_confirmation_choice(False, can_prompt_again=True)
                logger.info("User disabled Git automation (can be changed later)")
                return False, ConfirmationResult.DISABLED
                
            elif user_choice == 'never':
                # User chose to permanently disable
                self._save_confirmation_choice(False, can_prompt_again=False)
                logger.info("User permanently disabled Git automation")
                return False, ConfirmationResult.DISABLED
                
            else:
                # User cancelled or invalid choice
                logger.info("User cancelled Git automation setup")
                return False, ConfirmationResult.CANCELLED
                
        except Exception as e:
            logger.error(f"Error handling first-time confirmation: {str(e)}")
            return False, ConfirmationResult.ERROR
    
    def _display_git_automation_explanation(self):
        """Display comprehensive explanation of Git automation features"""
        print("\n" + "="*80)
        print("GIT WORKFLOW INTEGRATION - FIRST TIME SETUP")
        print("="*80)
        print()
        print("This system provides automatic Git operations for spec-driven development:")
        print()
        print("WHAT IT DOES:")
        print("• Automatically adds modified files to Git staging after task completion")
        print("• Creates intelligent commit messages based on your work:")
        print("  - Analyzes file changes and task descriptions")
        print("  - Uses conventional commit format (feat:, fix:, docs:, etc.)")
        print("  - Examples: 'feat: Add user authentication system'")
        print("             'fix: Resolve database connection timeout'")
        print("• Respects .gitignore patterns and handles errors gracefully")
        print()
        print("SAFETY FEATURES:")
        print("• Only activates when you complete spec workflow tasks")
        print("• Shows confirmation prompt before each commit (configurable)")
        print("• Never forces commits - you can cancel any operation")
        print("• Provides detailed error messages if Git operations fail")
        print("• Can be disabled at any time through configuration")
        print()
        print("PRIVACY & CONTROL:")
        print("• All operations happen locally in your Git repository")
        print("• No data is sent to external services")
        print("• You maintain full control over your Git history")
        print("• Can be configured or disabled through .claude/settings.local.json")
        print()
    
    def _prompt_user_choice(self) -> str:
        """
        Prompt user for their choice on Git automation
        
        Returns:
            str: User choice ('enable', 'disable', 'never', 'cancel')
        """
        while True:
            print("SETUP OPTIONS:")
            print("1. Enable - Turn on Git automation with confirmation prompts")
            print("2. Disable - Keep Git automation off for now (can enable later)")
            print("3. Never - Permanently disable (won't ask again)")
            print("4. Cancel - Skip setup for now")
            print()
            
            try:
                choice = input("Choose option (1-4): ").strip()
                
                if choice == '1' or choice.lower().startswith('enable'):
                    return 'enable'
                elif choice == '2' or choice.lower().startswith('disable'):
                    return 'disable'
                elif choice == '3' or choice.lower().startswith('never'):
                    # Confirm permanent disable
                    confirm = input("Are you sure you want to permanently disable? (y/N): ").lower().strip()
                    if confirm in ['y', 'yes']:
                        return 'never'
                    else:
                        continue  # Ask again
                elif choice == '4' or choice.lower().startswith('cancel'):
                    return 'cancel'
                else:
                    print("Invalid choice. Please enter 1, 2, 3, or 4.\n")
                    continue
                    
            except (KeyboardInterrupt, EOFError):
                print("\nSetup cancelled by user.")
                return 'cancel'
    
    def _save_confirmation_choice(self, enabled: bool, can_prompt_again: bool = True):
        """
        Save user confirmation choice to configuration
        
        Args:
            enabled: Whether Git automation should be enabled
            can_prompt_again: Whether user can be prompted again in future
        """
        try:
            # Read existing configuration
            try:
                config = self.config_reader.read_config()
            except FileNotFoundError:
                config = {}
            
            # Update git automation settings
            if 'git_automation' not in config:
                config['git_automation'] = {}
            
            # Set main automation flag
            config['git_automation_enabled'] = enabled
            
            # Store confirmation information
            config['git_automation']['user_confirmation'] = {
                'timestamp': datetime.now().isoformat(),
                'choice': 'enabled' if enabled else 'disabled',
                'can_prompt_again': can_prompt_again,
                'setup_version': '1.0'
            }
            
            # Set default automation preferences if enabled
            if enabled:
                config['git_automation'].update({
                    'auto_add_files': True,
                    'use_intelligent_messages': True,
                    'require_confirmation': True,
                    'max_message_length': 72,
                    'fallback_message_template': 'feat: Complete task {task_id} - {task_title}'
                })
            
            # Save configuration
            self._write_config(config)
            logger.info(f"Saved user confirmation choice: {'enabled' if enabled else 'disabled'}")
            
        except Exception as e:
            logger.error(f"Error saving confirmation choice: {str(e)}")
            raise
    
    def _write_config(self, config: Dict[str, Any]):
        """
        Write configuration to file
        
        Args:
            config: Configuration dictionary to save
        """
        config_path = self.config_reader.get_config_path()
        
        # Ensure directory exists
        Path(config_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Write configuration with proper formatting
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        # Clear config cache to force reload
        self.config_reader.clear_cache()
    
    def reset_confirmation_status(self):
        """
        Reset confirmation status to allow re-prompting user
        
        This is useful for testing or if user wants to change their choice
        """
        try:
            config = self.config_reader.read_config()
            
            # Remove confirmation information
            if 'git_automation' in config and 'user_confirmation' in config['git_automation']:
                del config['git_automation']['user_confirmation']
            
            # Reset automation flag to default (disabled)
            config['git_automation_enabled'] = False
            
            self._write_config(config)
            logger.info("Reset user confirmation status")
            
        except FileNotFoundError:
            # No configuration exists, nothing to reset
            logger.info("No configuration found to reset")
        except Exception as e:
            logger.error(f"Error resetting confirmation status: {str(e)}")
            raise
    
    def get_confirmation_info(self) -> Dict[str, Any]:
        """
        Get detailed information about current confirmation status
        
        Returns:
            Dictionary with confirmation information
        """
        try:
            status = self._get_confirmation_status()
            config = self.config_reader.get_git_automation_config()
            
            return {
                'is_configured': status['already_confirmed'],
                'automation_enabled': self.config_reader.is_git_automation_enabled(),
                'confirmation_timestamp': status['confirmation_timestamp'],
                'user_choice': status['user_choice'],
                'can_prompt_again': status['can_prompt_again'],
                'is_ci_environment': self._is_ci_environment(),
                'config_path': self.config_reader.get_config_path(),
                'automation_settings': config
            }
            
        except Exception as e:
            return {
                'error': str(e),
                'is_configured': False,
                'automation_enabled': False
            }
    
    def can_enable_automation(self) -> bool:
        """
        Check if automation can be enabled (not permanently disabled)
        
        Returns:
            bool: True if automation can be enabled
        """
        try:
            status = self._get_confirmation_status()
            
            # If never configured, can enable
            if not status['already_confirmed']:
                return True
            
            # If configured but can prompt again, can enable
            return status['can_prompt_again']
            
        except Exception:
            # On error, default to allowing enable attempt
            return True
    
    def force_enable_automation(self, require_confirmation: bool = True):
        """
        Force enable automation (bypass confirmation)
        
        This is useful for programmatic setup or administrative override
        
        Args:
            require_confirmation: Whether to require confirmation for commits
        """
        try:
            self._save_confirmation_choice(
                enabled=True, 
                can_prompt_again=True
            )
            
            # Update confirmation settings
            config = self.config_reader.read_config()
            config['git_automation']['require_confirmation'] = require_confirmation
            self._write_config(config)
            
            logger.info("Force enabled Git automation")
            
        except Exception as e:
            logger.error(f"Error force enabling automation: {str(e)}")
            raise
    
    def force_disable_automation(self, permanent: bool = False):
        """
        Force disable automation
        
        Args:
            permanent: If True, permanently disable (won't prompt again)
        """
        try:
            self._save_confirmation_choice(
                enabled=False,
                can_prompt_again=not permanent
            )
            
            logger.info(f"Force disabled Git automation ({'permanent' if permanent else 'temporary'})")
            
        except Exception as e:
            logger.error(f"Error force disabling automation: {str(e)}")
            raise


# Factory functions for easy instantiation

def create_user_confirmation_manager(config_reader: Optional[ConfigurationReader] = None) -> UserConfirmationManager:
    """
    Factory function to create UserConfirmationManager instance
    
    Args:
        config_reader: Optional ConfigurationReader instance
        
    Returns:
        UserConfirmationManager instance
    """
    return UserConfirmationManager(config_reader)


def check_git_automation_consent(config_reader: Optional[ConfigurationReader] = None) -> Tuple[bool, ConfirmationResult]:
    """
    Convenience function to check Git automation consent
    
    Args:
        config_reader: Optional ConfigurationReader instance
        
    Returns:
        Tuple of (should_proceed, confirmation_result)
    """
    manager = create_user_confirmation_manager(config_reader)
    return manager.check_first_time_confirmation()


# Example usage and testing
if __name__ == "__main__":
    # Example usage for testing
    try:
        # Create confirmation manager
        manager = create_user_confirmation_manager()
        
        # Get current status
        print("Current confirmation status:")
        info = manager.get_confirmation_info()
        print(json.dumps(info, indent=2, default=str))
        
        # Check if first-time confirmation is needed
        should_proceed, result = manager.check_first_time_confirmation()
        print(f"\nShould proceed: {should_proceed}")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Example execution failed: {str(e)}")