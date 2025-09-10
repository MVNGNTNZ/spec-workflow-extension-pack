"""
Configuration reader for Git Workflow Integration

Handles reading and validation of Git automation settings from .claude/settings.local.json
with graceful error handling and default value management.
"""

import json
import os
from typing import Dict, Any, Optional
from pathlib import Path


class ConfigurationReader:
    """Configuration reader for Git automation settings"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize configuration reader
        
        Args:
            config_path: Optional custom path to settings file. 
                        Defaults to .claude/git-automation.json or .claude/settings.local.json
        """
        self._config_path = config_path or self._get_default_config_path()
        self._config_cache: Optional[Dict[str, Any]] = None
        
    def _get_default_config_path(self) -> str:
        """Get default configuration file path"""
        # Find project root by looking for .claude directory
        current_path = Path(os.getcwd())
        
        # Walk up directory tree to find .claude folder
        while current_path != current_path.parent:
            claude_path = current_path / '.claude'
            if claude_path.exists() and claude_path.is_dir():
                # Prefer dedicated git-automation.json if it exists
                git_config_path = claude_path / 'git-automation.json'
                if git_config_path.exists():
                    return str(git_config_path)
                # Fall back to settings.local.json
                return str(claude_path / 'settings.local.json')
            current_path = current_path.parent
        
        # Fallback to current directory if not found
        return '.claude/git-automation.json'
    
    def read_config(self) -> Dict[str, Any]:
        """
        Read complete configuration from settings file
        
        Returns:
            Dictionary containing all configuration settings
            
        Raises:
            FileNotFoundError: If configuration file doesn't exist
            json.JSONDecodeError: If configuration file contains invalid JSON
            PermissionError: If file cannot be read due to permissions
        """
        try:
            with open(self._config_path, 'r', encoding='utf-8') as file:
                config = json.load(file)
                self._config_cache = config
                return config
                
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Configuration file not found: {self._config_path}. "
                "Ensure .claude/settings.local.json exists."
            )
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(
                f"Invalid JSON in configuration file: {self._config_path}. "
                f"JSON error: {str(e)}", 
                e.doc, e.pos
            )
        except PermissionError:
            raise PermissionError(
                f"Permission denied reading configuration file: {self._config_path}. "
                "Check file permissions."
            )
    
    def is_git_automation_enabled(self) -> bool:
        """
        Check if Git automation is enabled in configuration
        
        Returns:
            Boolean indicating if Git automation is enabled.
            Defaults to False for safety if setting is missing or invalid.
        """
        try:
            config = self.read_config()
            
            # Check for git_automation_enabled setting
            git_enabled = config.get('git_automation_enabled')
            
            # Validate boolean type
            if isinstance(git_enabled, bool):
                return git_enabled
            
            # Handle string representations
            if isinstance(git_enabled, str):
                return git_enabled.lower() in ('true', '1', 'yes', 'on')
            
            # Handle numeric representations
            if isinstance(git_enabled, (int, float)):
                return bool(git_enabled)
            
            # Default to False for any other type or None
            return False
            
        except (FileNotFoundError, json.JSONDecodeError, PermissionError):
            # Return safe default if any configuration error occurs
            return False
    
    def get_git_automation_config(self) -> Dict[str, Any]:
        """
        Get Git automation specific configuration settings
        
        Returns:
            Dictionary containing Git automation configuration with defaults
        """
        try:
            config = self.read_config()
            
            # Get git_automation section or empty dict
            git_config = config.get('git_automation', {})
            
            # Apply defaults for missing values
            defaults = {
                'enabled': self.is_git_automation_enabled(),
                'commit_frequency': 'phase',  # Default to phase-level commits
                'commit_message_template': 'feat: Complete {phase_or_spec} - {description}',
                'auto_add_files': True,
                'use_intelligent_messages': True,
                'aggregate_commit_messages': True,  # For phase/spec commits
                'include_task_count': True,         # Include task count in messages
                'fallback_message_template': 'feat: Complete task {task_id} - {task_title}',
                'max_message_length': 72,
                'require_confirmation': True
            }
            
            # Merge with defaults
            for key, default_value in defaults.items():
                if key not in git_config:
                    git_config[key] = default_value
            
            return git_config
            
        except (FileNotFoundError, json.JSONDecodeError, PermissionError):
            # Return defaults if configuration cannot be read
            return {
                'enabled': False,
                'commit_message_template': 'feat: Complete task {task_id} - {task_title}',
                'auto_add_files': True,
                'use_intelligent_messages': True,
                'fallback_message_template': 'feat: Complete task {task_id} - {task_title}',
                'max_message_length': 72,
                'require_confirmation': True
            }
    
    def validate_config(self) -> Dict[str, Any]:
        """
        Validate configuration and return validation results
        
        Returns:
            Dictionary containing validation results:
            - 'valid': bool indicating overall validity
            - 'errors': list of error messages
            - 'warnings': list of warning messages
        """
        validation_result = {
            'valid': True,
            'errors': [],
            'warnings': []
        }
        
        try:
            config = self.read_config()
            
            # Validate git_automation_enabled setting
            git_enabled = config.get('git_automation_enabled')
            if git_enabled is not None and not isinstance(git_enabled, (bool, str, int, float)):
                validation_result['errors'].append(
                    f"git_automation_enabled must be boolean, string, or number. "
                    f"Got: {type(git_enabled).__name__}"
                )
                validation_result['valid'] = False
            
            # Validate git_automation section if present
            git_config = config.get('git_automation', {})
            if git_config and not isinstance(git_config, dict):
                validation_result['errors'].append(
                    "git_automation section must be an object/dictionary"
                )
                validation_result['valid'] = False
            else:
                # Validate specific git_automation settings
                max_length = git_config.get('max_message_length')
                if max_length is not None:
                    if not isinstance(max_length, int) or max_length <= 0:
                        validation_result['errors'].append(
                            "max_message_length must be a positive integer"
                        )
                        validation_result['valid'] = False
                    elif max_length < 20:
                        validation_result['warnings'].append(
                            f"max_message_length of {max_length} is quite short. "
                            "Consider using at least 50 characters."
                        )
                
                # Validate template strings
                templates = ['commit_message_template', 'fallback_message_template']
                for template_key in templates:
                    template = git_config.get(template_key)
                    if template is not None and not isinstance(template, str):
                        validation_result['errors'].append(
                            f"{template_key} must be a string"
                        )
                        validation_result['valid'] = False
                    elif template and '{task_id}' not in template:
                        validation_result['warnings'].append(
                            f"{template_key} should contain '{{task_id}}' placeholder"
                        )
            
        except FileNotFoundError:
            validation_result['errors'].append(
                f"Configuration file not found: {self._config_path}"
            )
            validation_result['valid'] = False
        except json.JSONDecodeError as e:
            validation_result['errors'].append(
                f"Invalid JSON in configuration: {str(e)}"
            )
            validation_result['valid'] = False
        except PermissionError:
            validation_result['errors'].append(
                f"Cannot read configuration file: {self._config_path} (permission denied)"
            )
            validation_result['valid'] = False
        
        return validation_result
    
    def get_config_path(self) -> str:
        """
        Get the current configuration file path
        
        Returns:
            String path to configuration file
        """
        return self._config_path
    
    def clear_cache(self):
        """Clear cached configuration data"""
        self._config_cache = None


def get_config_reader(config_path: Optional[str] = None) -> ConfigurationReader:
    """
    Factory function to create ConfigurationReader instance
    
    Args:
        config_path: Optional custom path to settings file
        
    Returns:
        ConfigurationReader instance
    """
    return ConfigurationReader(config_path)


# Example usage and testing
if __name__ == "__main__":
    # Example usage for testing
    reader = ConfigurationReader()
    
    print(f"Configuration path: {reader.get_config_path()}")
    print(f"Git automation enabled: {reader.is_git_automation_enabled()}")
    
    # Validation example
    validation = reader.validate_config()
    print(f"Configuration valid: {validation['valid']}")
    if validation['errors']:
        print("Errors:", validation['errors'])
    if validation['warnings']:
        print("Warnings:", validation['warnings'])
    
    # Full config example
    git_config = reader.get_git_automation_config()
    print("Git automation config:", json.dumps(git_config, indent=2))