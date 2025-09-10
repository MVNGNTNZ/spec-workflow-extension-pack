"""
Git Task Aggregator - Manages task completion tracking for commit frequency control

This service tracks task completions across phases and specs to support
different commit frequencies (task/phase/spec level commits).
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import re


class TaskContext:
    """Represents a completed task with context information"""
    
    def __init__(self, task_id: str, task_title: str, spec_name: str, 
                 completed_at: Optional[str] = None, files_changed: Optional[List[str]] = None):
        self.task_id = task_id
        self.task_title = task_title
        self.spec_name = spec_name
        self.completed_at = completed_at or datetime.now().isoformat()
        self.files_changed = files_changed or []
        
        # Parse phase and task number from task_id (e.g., "1.2" -> phase=1, task=2)
        self.phase_number, self.task_number = self._parse_task_id(task_id)
    
    def _parse_task_id(self, task_id: str) -> Tuple[int, int]:
        """Parse task ID like '1.2' into phase=1, task=2"""
        try:
            parts = task_id.split('.')
            if len(parts) >= 2:
                return int(parts[0]), int(parts[1])
            else:
                # Single number task ID
                return 1, int(parts[0])
        except (ValueError, IndexError):
            # Fallback for unparseable task IDs
            return 1, 1
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'task_id': self.task_id,
            'task_title': self.task_title,
            'spec_name': self.spec_name,
            'completed_at': self.completed_at,
            'files_changed': self.files_changed,
            'phase_number': self.phase_number,
            'task_number': self.task_number
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskContext':
        """Create from dictionary"""
        return cls(
            task_id=data['task_id'],
            task_title=data['task_title'],
            spec_name=data['spec_name'],
            completed_at=data.get('completed_at'),
            files_changed=data.get('files_changed', [])
        )


class GitTaskAggregator:
    """Manages task completion tracking for different commit frequencies"""
    
    def __init__(self, claude_dir: str = '.claude'):
        self.claude_dir = Path(claude_dir)
        self.storage_dir = self.claude_dir / 'git-workflow'
        self.pending_file = self.storage_dir / 'pending_tasks.json'
        
        # Ensure storage directory exists
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Load pending tasks
        self.pending_tasks: List[TaskContext] = self._load_pending_tasks()
    
    def add_completed_task(self, task_context: TaskContext) -> None:
        """Add a completed task to the pending list"""
        self.pending_tasks.append(task_context)
        self._save_pending_tasks()
    
    def is_phase_complete(self, current_task: TaskContext, 
                         next_task_id: Optional[str] = None) -> bool:
        """
        Determine if a phase is complete based on task completion
        
        Args:
            current_task: The task that was just completed
            next_task_id: ID of the next task (if known), used to detect phase boundaries
        
        Returns:
            True if the current phase is complete
        """
        # If we know the next task, check if it's in a different phase
        if next_task_id:
            try:
                next_phase = int(next_task_id.split('.')[0])
                return current_task.phase_number != next_phase
            except (ValueError, IndexError):
                pass
        
        # Heuristic: assume phase complete if this is a "round" task number
        # (e.g., task 1.10, 2.5, etc.) - this is imperfect but reasonable
        return current_task.task_number >= 5 and current_task.task_number % 5 == 0
    
    def is_spec_complete(self, current_task: TaskContext,
                        total_tasks: Optional[int] = None) -> bool:
        """
        Determine if the entire spec is complete
        
        Args:
            current_task: The task that was just completed
            total_tasks: Total number of tasks in the spec (if known)
        
        Returns:
            True if the entire spec is complete
        """
        if total_tasks:
            completed_count = len(self.pending_tasks)
            return completed_count >= total_tasks
        
        # Heuristic: look for keywords in task title suggesting finalization
        final_keywords = ['final', 'complete', 'finish', 'deploy', 'integration', 'end-to-end']
        task_title_lower = current_task.task_title.lower()
        return any(keyword in task_title_lower for keyword in final_keywords)
    
    def get_phase_tasks(self, phase_number: int) -> List[TaskContext]:
        """Get all pending tasks for a specific phase"""
        return [task for task in self.pending_tasks if task.phase_number == phase_number]
    
    def get_all_pending_tasks(self) -> List[TaskContext]:
        """Get all pending tasks"""
        return self.pending_tasks.copy()
    
    def clear_phase_tasks(self, phase_number: int) -> List[TaskContext]:
        """Remove and return all tasks for a specific phase"""
        phase_tasks = self.get_phase_tasks(phase_number)
        self.pending_tasks = [task for task in self.pending_tasks 
                             if task.phase_number != phase_number]
        self._save_pending_tasks()
        return phase_tasks
    
    def clear_all_tasks(self) -> List[TaskContext]:
        """Remove and return all pending tasks"""
        all_tasks = self.pending_tasks.copy()
        self.pending_tasks = []
        self._save_pending_tasks()
        return all_tasks
    
    def generate_aggregated_message(self, tasks: List[TaskContext], 
                                  commit_type: str = 'phase') -> str:
        """
        Generate an aggregated commit message for multiple tasks
        
        Args:
            tasks: List of completed tasks
            commit_type: 'phase' or 'spec' to determine message format
        
        Returns:
            Formatted commit message
        """
        if not tasks:
            return "feat: Complete tasks"
        
        spec_name = tasks[0].spec_name
        task_count = len(tasks)
        
        if commit_type == 'phase':
            phase_num = tasks[0].phase_number
            # Generate phase description from task titles
            phase_desc = self._generate_phase_description(tasks)
            return f"feat: Complete {spec_name} Phase {phase_num} - {phase_desc} ({task_count} tasks)"
        
        elif commit_type == 'spec':
            # Generate spec description from all tasks
            spec_desc = self._generate_spec_description(tasks)
            return f"feat: Complete {spec_name} - {spec_desc} ({task_count} tasks)"
        
        else:
            return f"feat: Complete {task_count} tasks from {spec_name}"
    
    def _generate_phase_description(self, tasks: List[TaskContext]) -> str:
        """Generate a concise description of what was accomplished in a phase"""
        # Extract key actions from task titles
        actions = []
        for task in tasks:
            # Look for action verbs in task titles
            title_lower = task.task_title.lower()
            if 'create' in title_lower or 'implement' in title_lower:
                actions.append('implementation')
            elif 'test' in title_lower:
                actions.append('testing')
            elif 'config' in title_lower or 'setup' in title_lower:
                actions.append('configuration')
            elif 'integration' in title_lower:
                actions.append('integration')
            elif 'documentation' in title_lower or 'docs' in title_lower:
                actions.append('documentation')
        
        # Remove duplicates and create description
        unique_actions = list(set(actions))
        if unique_actions:
            return ' and '.join(unique_actions)
        else:
            return 'core functionality'
    
    def _generate_spec_description(self, tasks: List[TaskContext]) -> str:
        """Generate a concise description of the entire spec"""
        spec_name = tasks[0].spec_name.replace('-', ' ')
        
        # Create a human-readable description
        if 'git-workflow' in spec_name:
            return 'intelligent Git automation system'
        elif 'test-validation' in spec_name:
            return 'advanced test validation framework'
        else:
            # Generic description based on spec name
            return f"{spec_name} system implementation"
    
    def _load_pending_tasks(self) -> List[TaskContext]:
        """Load pending tasks from storage"""
        try:
            if self.pending_file.exists():
                with open(self.pending_file, 'r') as f:
                    data = json.load(f)
                    return [TaskContext.from_dict(task_data) for task_data in data]
        except (json.JSONDecodeError, FileNotFoundError, KeyError):
            pass
        return []
    
    def _save_pending_tasks(self) -> None:
        """Save pending tasks to storage"""
        try:
            with open(self.pending_file, 'w') as f:
                data = [task.to_dict() for task in self.pending_tasks]
                json.dump(data, f, indent=2)
        except Exception:
            # Silently fail to avoid disrupting workflow
            pass
    
    def get_status(self) -> Dict[str, Any]:
        """Get current aggregator status"""
        phases = {}
        for task in self.pending_tasks:
            phase_key = f"Phase {task.phase_number}"
            if phase_key not in phases:
                phases[phase_key] = []
            phases[phase_key].append({
                'task_id': task.task_id,
                'title': task.task_title,
                'completed_at': task.completed_at
            })
        
        return {
            'total_pending': len(self.pending_tasks),
            'phases': phases,
            'specs': list(set(task.spec_name for task in self.pending_tasks))
        }


def create_git_task_aggregator(claude_dir: str = '.claude') -> GitTaskAggregator:
    """Factory function to create a GitTaskAggregator instance"""
    return GitTaskAggregator(claude_dir)