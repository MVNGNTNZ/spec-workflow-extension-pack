"""
Git Message Generation with Intelligent Analysis

Generates descriptive, meaningful commit messages by analyzing task descriptions 
and file changes. Uses conventional commit format and ensures imperative mood 
for professional commit history.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

# Import the FileDetector and related classes
try:
    # Try relative import first (when used as package)
    from .git_file_detector import FileDetector, ChangeAnalysis, CommitType, FileChange
except ImportError:
    # Fall back to absolute import (when run directly)
    from git_file_detector import FileDetector, ChangeAnalysis, CommitType, FileChange


# Set up logging
logger = logging.getLogger(__name__)


@dataclass
class TaskContext:
    """Task information for commit message generation"""
    task_id: str
    task_title: str
    task_description: Optional[str] = None
    completion_time: Optional[str] = None


@dataclass
class MessageComponents:
    """Components of a generated commit message"""
    commit_type: CommitType
    action: str
    description: str
    confidence: float
    raw_message: str
    formatted_message: str


class MessageGenerator:
    """
    Intelligent commit message generator that analyzes task descriptions 
    and file changes to create descriptive, meaningful commit messages.
    
    Features:
    - Task description analysis to extract meaningful actions
    - File change integration for commit type determination
    - Imperative mood conversion and message formatting
    - Quality validation to prevent generic messages
    - Conventional commit format compliance
    """
    
    def __init__(self, file_detector: Optional[FileDetector] = None):
        """
        Initialize MessageGenerator
        
        Args:
            file_detector: Optional FileDetector instance. Creates new one if not provided.
        """
        self.file_detector = file_detector or FileDetector()
        
        # Action extraction patterns for task analysis
        self._action_patterns = {
            'implement': {
                'patterns': [
                    r'\b(?:implement|create|add|build|develop|establish)\b',
                    r'\b(?:set up|setup)\b',
                    r'\b(?:introduce|install)\b'
                ],
                'confidence': 0.9
            },
            'fix': {
                'patterns': [
                    r'\b(?:fix|resolve|correct|repair|address)\b',
                    r'\b(?:solve|debug|troubleshoot)\b',
                    r'\b(?:patch|mend)\b'
                ],
                'confidence': 0.9
            },
            'update': {
                'patterns': [
                    r'\b(?:update|modify|change|improve|enhance)\b',
                    r'\b(?:revise|adjust|refine)\b',
                    r'\b(?:upgrade|modernize)\b'
                ],
                'confidence': 0.8
            },
            'refactor': {
                'patterns': [
                    r'\b(?:refactor|restructure|reorganize|simplify)\b',
                    r'\b(?:clean up|cleanup|optimize)\b',
                    r'\b(?:streamline|consolidate)\b'
                ],
                'confidence': 0.9
            },
            'remove': {
                'patterns': [
                    r'\b(?:remove|delete|drop|eliminate)\b',
                    r'\b(?:disable|deactivate|deprecate)\b',
                    r'\b(?:clean|purge)\b'
                ],
                'confidence': 0.9
            },
            'configure': {
                'patterns': [
                    r'\b(?:configure|config|setup|set up)\b',
                    r'\b(?:initialize|init)\b',
                    r'\b(?:prepare|provision)\b'
                ],
                'confidence': 0.8
            },
            'test': {
                'patterns': [
                    r'\b(?:test|testing|spec|verify)\b',
                    r'\b(?:validate|check)\b',
                    r'\b(?:ensure|confirm)\b'
                ],
                'confidence': 0.9
            }
        }
        
        # Object extraction patterns - what is being acted upon
        self._object_patterns = [
            # Technical components
            r'\b(?:authentication|auth|login|registration)\b',
            r'\b(?:database|db|migration|schema)\b',
            r'\b(?:api|endpoint|route|service)\b',
            r'\b(?:component|module|class|function)\b',
            r'\b(?:interface|ui|frontend|backend)\b',
            r'\b(?:configuration|config|settings)\b',
            r'\b(?:validation|security|permissions)\b',
            r'\b(?:workflow|process|pipeline)\b',
            
            # Business concepts  
            r'\b(?:user|client|practice|consumable)\b',
            r'\b(?:prepack|fullpack|inventory|pricing)\b',
            r'\b(?:calculation|markup|analytics)\b',
            r'\b(?:upload|file|data|report)\b',
            
            # Generic patterns
            r'\b(?:system|feature|functionality)\b',
            r'\b(?:issue|bug|error|problem)\b',
            r'\b(?:documentation|docs|readme)\b'
        ]
        
        # Commit type override patterns based on task context
        self._commit_type_overrides = {
            CommitType.DOCS: [
                r'\b(?:documentation|docs|readme|guide)\b',
                r'\b(?:comment|annotation|docstring)\b'
            ],
            CommitType.TEST: [
                r'\b(?:test|testing|spec|unit test|integration test)\b',
                r'\b(?:coverage|assertion|mock)\b'
            ],
            CommitType.FIX: [
                r'\b(?:fix|bug|error|issue|problem)\b',
                r'\b(?:resolve|correct|repair|address)\b'
            ],
            CommitType.REFACTOR: [
                r'\b(?:refactor|restructure|reorganize|simplify)\b',
                r'\b(?:clean up|cleanup|optimize|streamline)\b'
            ],
            CommitType.STYLE: [
                r'\b(?:style|styling|css|design|layout)\b',
                r'\b(?:formatting|prettier|eslint)\b'
            ],
            CommitType.CHORE: [
                r'\b(?:chore|maintenance|dependency|package)\b',
                r'\b(?:build|deployment|ci|cd)\b'
            ]
        }
        
        # Quality validation patterns - indicators of generic messages
        self._generic_message_indicators = [
            r'^\w+:\s*(?:update|modify|change)\s*$',  # Just "feat: update"
            r'^\w+:\s*(?:complete|finish)\s+task\s*\d*\s*$',  # "feat: complete task 3"
            r'^\w+:\s*(?:work|changes|updates)\s*$',  # Too vague
            r'^\w+:\s*\w{1,3}\s*$',  # Too short after type
        ]
        
        # Maximum message length for subject line
        self.max_subject_length = 72
    
    def generate_commit_message(self, task_context: TaskContext, 
                               change_analysis: Optional[ChangeAnalysis] = None) -> MessageComponents:
        """
        Generate intelligent commit message from task context and file changes
        
        Args:
            task_context: Task information including ID, title, and description
            change_analysis: Optional file change analysis. Will be generated if not provided.
            
        Returns:
            MessageComponents with complete commit message information
        """
        try:
            # Get file change analysis if not provided
            if change_analysis is None:
                change_analysis = self.file_detector.analyze_file_changes()
            
            # Extract action and object from task context
            action_info = self._extract_action_from_task(
                task_context.task_title, 
                task_context.task_description
            )
            
            # Determine commit type from task context and file changes
            commit_type = self._determine_commit_type_with_context(
                task_context, change_analysis
            )
            
            # Build descriptive message
            description = self._build_description(action_info, change_analysis)
            
            # Format final message
            raw_message = f"{description}"
            formatted_message = self._format_commit_message(commit_type, raw_message)
            
            # Calculate confidence score
            confidence = self._calculate_confidence(action_info, change_analysis, formatted_message)
            
            # Validate message quality
            if not self._is_quality_message(formatted_message):
                # Fall back to template-based message
                fallback_msg = self._generate_fallback_message(task_context, commit_type)
                formatted_message = fallback_msg
                confidence = 0.5  # Lower confidence for fallback
            
            return MessageComponents(
                commit_type=commit_type,
                action=action_info.get('action', ''),
                description=description,
                confidence=confidence,
                raw_message=raw_message,
                formatted_message=formatted_message
            )
            
        except Exception as e:
            logger.warning(f"Failed to generate intelligent commit message: {str(e)}")
            # Generate fallback message
            fallback_type = CommitType.CHORE
            fallback_msg = self._generate_fallback_message(task_context, fallback_type)
            
            return MessageComponents(
                commit_type=fallback_type,
                action='complete',
                description=task_context.task_title,
                confidence=0.2,
                raw_message=task_context.task_title,
                formatted_message=fallback_msg
            )
    
    def _extract_action_from_task(self, task_title: str, 
                                 task_description: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract meaningful action and object from task information
        
        Args:
            task_title: Task title
            task_description: Optional task description
            
        Returns:
            Dictionary with action, object, and confidence information
        """
        # Combine text sources, prioritizing description over title
        text_sources = []
        if task_description:
            text_sources.append(('description', task_description, 1.0))
        if task_title:
            text_sources.append(('title', task_title, 0.8))
        
        best_match = {
            'action': None,
            'object': None,
            'confidence': 0.0,
            'source': 'none',
            'full_text': task_title or ''
        }
        
        for source_name, text, source_weight in text_sources:
            if not text:
                continue
                
            text_lower = text.lower()
            
            # Extract action
            action_found = None
            action_confidence = 0.0
            
            for action, pattern_info in self._action_patterns.items():
                for pattern in pattern_info['patterns']:
                    if re.search(pattern, text_lower):
                        if pattern_info['confidence'] > action_confidence:
                            action_found = action
                            action_confidence = pattern_info['confidence']
            
            # Extract object/target
            object_found = None
            object_match = None
            
            for pattern in self._object_patterns:
                match = re.search(pattern, text_lower)
                if match:
                    object_found = match.group(0)
                    object_match = match
                    break
            
            # If no specific object found, try to extract noun phrases
            if not object_found and action_found:
                object_found = self._extract_object_after_action(text, action_found)
            
            # Calculate overall confidence for this source
            total_confidence = action_confidence * source_weight
            if object_found:
                total_confidence += 0.2  # Bonus for finding specific object
            
            # Update best match if this is better
            if total_confidence > best_match['confidence']:
                best_match.update({
                    'action': action_found,
                    'object': object_found,
                    'confidence': total_confidence,
                    'source': source_name,
                    'full_text': text
                })
        
        return best_match
    
    def _extract_object_after_action(self, text: str, action: str) -> Optional[str]:
        """
        Extract object/target that follows an action in text
        
        Args:
            text: Full text to analyze
            action: Action that was found
            
        Returns:
            Object string if found, None otherwise
        """
        # Get action patterns for the found action
        action_patterns = self._action_patterns.get(action, {}).get('patterns', [])
        
        for pattern in action_patterns:
            # Look for pattern followed by object
            extended_pattern = pattern + r'\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?:\s+(?:for|with|in|to|from|by)|[.!]|$)'
            match = re.search(extended_pattern, text, re.IGNORECASE)
            if match:
                obj = match.group(1).strip()
                # Clean up the object
                obj = re.sub(r'\b(?:the|a|an|and|or|of|in|on|at|to|for|with|by)\b', ' ', obj, flags=re.IGNORECASE)
                obj = ' '.join(obj.split())  # Normalize whitespace
                if len(obj.split()) <= 4 and len(obj) > 2:  # Reasonable length
                    return obj
        
        return None
    
    def _determine_commit_type_with_context(self, task_context: TaskContext, 
                                          change_analysis: ChangeAnalysis) -> CommitType:
        """
        Determine commit type using both task context and file changes
        
        Args:
            task_context: Task information
            change_analysis: File change analysis
            
        Returns:
            Most appropriate CommitType
        """
        # Check task context for explicit type indicators
        task_text = f"{task_context.task_title} {task_context.task_description or ''}".lower()
        
        for commit_type, patterns in self._commit_type_overrides.items():
            for pattern in patterns:
                if re.search(pattern, task_text):
                    return commit_type
        
        # Use file change analysis as primary source
        if change_analysis.primary_commit_type:
            return change_analysis.primary_commit_type
        
        # Fallback based on task context
        if 'test' in task_text:
            return CommitType.TEST
        elif any(word in task_text for word in ['fix', 'bug', 'error', 'issue']):
            return CommitType.FIX
        elif any(word in task_text for word in ['doc', 'readme', 'comment']):
            return CommitType.DOCS
        elif any(word in task_text for word in ['style', 'css', 'format']):
            return CommitType.STYLE
        elif any(word in task_text for word in ['refactor', 'restructure', 'cleanup']):
            return CommitType.REFACTOR
        else:
            return CommitType.FEAT  # Default for new functionality
    
    def _build_description(self, action_info: Dict[str, Any], 
                          change_analysis: ChangeAnalysis) -> str:
        """
        Build descriptive part of commit message
        
        Args:
            action_info: Extracted action information
            change_analysis: File change analysis
            
        Returns:
            Formatted description string
        """
        action = action_info.get('action')
        obj = action_info.get('object')
        
        # Start with action and object if available
        if action and obj:
            description = f"{action} {obj}"
        elif action:
            description = action
        elif obj:
            description = f"update {obj}"
        else:
            # Fall back to change analysis summary
            if change_analysis.change_summary and not change_analysis.change_summary.startswith('No'):
                return change_analysis.change_summary
            else:
                return "update components"
        
        # Enhance with file context if helpful
        if change_analysis.affected_areas:
            areas = list(change_analysis.affected_areas)
            if len(areas) == 1 and areas[0] not in description.lower():
                area = areas[0]
                if area in ['frontend', 'backend']:
                    description += f" in {area}"
                elif area in ['test', 'docs']:
                    description += f" ({area})"
        
        # Ensure imperative mood
        description = self._ensure_imperative_mood(description)
        
        return description
    
    def _ensure_imperative_mood(self, text: str) -> str:
        """
        Convert text to imperative mood
        
        Args:
            text: Text to convert
            
        Returns:
            Text in imperative mood
        """
        text = text.strip()
        if not text:
            return text
        
        # Common verb transformations to imperative
        transformations = {
            r'^(adding|adds)\s+': 'Add ',
            r'^(updating|updates)\s+': 'Update ',
            r'^(fixing|fixes)\s+': 'Fix ',
            r'^(implementing|implements)\s+': 'Implement ',
            r'^(creating|creates)\s+': 'Create ',
            r'^(removing|removes|deleting|deletes)\s+': 'Remove ',
            r'^(refactoring|refactors)\s+': 'Refactor ',
            r'^(configuring|configures)\s+': 'Configure ',
            r'^(testing|tests)\s+': 'Test ',
            r'^(building|builds)\s+': 'Build ',
            r'^(installing|installs)\s+': 'Install ',
            r'^(improving|improves)\s+': 'Improve ',
            r'^(optimizing|optimizes)\s+': 'Optimize ',
        }
        
        for pattern, replacement in transformations.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
        # Capitalize first letter
        if text:
            text = text[0].upper() + text[1:]
        
        return text
    
    def _format_commit_message(self, commit_type: CommitType, description: str) -> str:
        """
        Format final commit message following conventional commits
        
        Args:
            commit_type: Conventional commit type
            description: Description text
            
        Returns:
            Formatted commit message
        """
        # Build base message
        message = f"{commit_type.value}: {description}"
        
        # Truncate if too long, ensuring we don't cut mid-word
        if len(message) > self.max_subject_length:
            truncate_to = self.max_subject_length - 3  # Leave room for "..."
            if truncate_to > len(commit_type.value) + 2:  # Ensure minimum viable message
                words = message[:truncate_to].split()
                if len(words) > 1:  # Don't cut the commit type
                    message = ' '.join(words[:-1]) + "..."
                else:
                    # Just truncate without regard to words if necessary
                    message = message[:truncate_to] + "..."
        
        return message
    
    def _calculate_confidence(self, action_info: Dict[str, Any], 
                            change_analysis: ChangeAnalysis, 
                            formatted_message: str) -> float:
        """
        Calculate confidence score for generated message
        
        Args:
            action_info: Action extraction results
            change_analysis: File change analysis
            formatted_message: Final formatted message
            
        Returns:
            Confidence score between 0.0 and 1.0
        """
        confidence = 0.0
        
        # Base confidence from action extraction
        confidence += action_info.get('confidence', 0.0) * 0.4
        
        # Confidence from file change analysis
        if change_analysis.commit_type_confidence:
            confidence += change_analysis.commit_type_confidence * 0.3
        
        # Bonus for having both action and object
        if action_info.get('action') and action_info.get('object'):
            confidence += 0.2
        
        # Penalty for very short or generic descriptions
        description_part = formatted_message.split(': ', 1)[1] if ': ' in formatted_message else formatted_message
        if len(description_part.split()) < 2:
            confidence -= 0.2
        elif len(description_part.split()) >= 4:
            confidence += 0.1
        
        return max(0.0, min(1.0, confidence))
    
    def _is_quality_message(self, message: str) -> bool:
        """
        Validate that the generated message meets quality standards
        
        Args:
            message: Generated commit message
            
        Returns:
            True if message meets quality standards
        """
        # Check for generic message patterns
        for pattern in self._generic_message_indicators:
            if re.match(pattern, message, re.IGNORECASE):
                return False
        
        # Ensure minimum length after commit type
        if ': ' in message:
            description_part = message.split(': ', 1)[1]
            if len(description_part.strip()) < 5:
                return False
            
            # Check that it's not just single common words
            description_words = description_part.strip().split()
            if len(description_words) == 1 and description_words[0].lower() in ['update', 'fix', 'add', 'remove', 'change']:
                return False
        
        # Check for task ID patterns (usually not descriptive)
        if re.search(r'\btask\s*\d+', message, re.IGNORECASE):
            return False
        
        return True
    
    def _generate_fallback_message(self, task_context: TaskContext, 
                                  commit_type: CommitType) -> str:
        """
        Generate fallback message when intelligent generation fails
        
        Args:
            task_context: Task information
            commit_type: Determined commit type
            
        Returns:
            Fallback commit message
        """
        # Use task title, cleaned up
        title = task_context.task_title or "Complete task"
        
        # Remove task ID patterns
        title = re.sub(r'^\s*(?:task\s*)?\d+\.?\s*', '', title, flags=re.IGNORECASE)
        
        # Remove common prefixes
        title = re.sub(r'^\s*(?:implement|create|add|build|update|fix)\s+', '', title, flags=re.IGNORECASE)
        
        # Ensure imperative mood
        title = self._ensure_imperative_mood(title)
        
        # Limit length
        if len(title) > 60:
            words = title[:60].split()
            title = ' '.join(words[:-1]) + "..." if len(words) > 1 else title[:60]
        
        return f"{commit_type.value}: {title}"


def create_message_generator(file_detector: Optional[FileDetector] = None) -> MessageGenerator:
    """
    Factory function to create MessageGenerator instance
    
    Args:
        file_detector: Optional FileDetector instance
        
    Returns:
        MessageGenerator instance
    """
    return MessageGenerator(file_detector)


# Example usage and testing
if __name__ == "__main__":
    import json
    
    # Example usage
    generator = MessageGenerator()
    
    # Test with sample task
    task = TaskContext(
        task_id="1.3",
        task_title="Create user authentication system with JWT tokens",
        task_description="Implement JWT-based authentication with login and registration endpoints"
    )
    
    print("Generating commit message for sample task...")
    print(f"Task: {task.task_title}")
    print(f"Description: {task.task_description}")
    print()
    
    try:
        # Generate message
        result = generator.generate_commit_message(task)
        
        print("Generated Message:")
        print(f"  Formatted: {result.formatted_message}")
        print(f"  Type: {result.commit_type.value}")
        print(f"  Action: {result.action}")
        print(f"  Description: {result.description}")
        print(f"  Confidence: {result.confidence:.2f}")
        print()
        
        # Test with file changes
        if generator.file_detector.is_git_repository():
            analysis = generator.file_detector.analyze_file_changes()
            print("File Change Analysis:")
            print(f"  Primary type: {analysis.primary_commit_type.value if analysis.primary_commit_type else 'none'}")
            print(f"  Summary: {analysis.change_summary}")
            print(f"  Files: {analysis.total_files}")
            
    except Exception as e:
        print(f"Error generating message: {str(e)}")