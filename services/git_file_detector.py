"""
Git File Detection with Enhanced Change Analysis

Handles file detection using Git status commands and provides intelligent commit type
determination based on file patterns and change analysis. Includes .gitignore respect
and empty repository handling.
"""

import os
import subprocess
import logging
from pathlib import Path
from typing import Dict, List, Set, Optional, Tuple, Any
from dataclasses import dataclass, field
from enum import Enum


# Set up logging
logger = logging.getLogger(__name__)


class CommitType(Enum):
    """Standard commit types based on conventional commits"""
    FEAT = "feat"       # New features
    FIX = "fix"         # Bug fixes
    DOCS = "docs"       # Documentation changes
    STYLE = "style"     # Code style changes (formatting, etc.)
    REFACTOR = "refactor"  # Code refactoring
    TEST = "test"       # Adding/updating tests
    CHORE = "chore"     # Maintenance tasks
    CI = "ci"           # CI/CD configuration changes
    PERF = "perf"       # Performance improvements
    BUILD = "build"     # Build system changes
    REVERT = "revert"   # Reverting changes


@dataclass
class FileChange:
    """Represents a single file change detected by git"""
    path: str
    status: str  # Git status: M (modified), A (added), D (deleted), R (renamed), etc.
    relative_path: str
    file_type: str
    commit_type_suggestion: Optional[CommitType] = None
    confidence: float = 0.0  # Confidence score for commit type (0.0-1.0)


@dataclass
class ChangeAnalysis:
    """Analysis results for a set of file changes"""
    files: List[FileChange] = field(default_factory=list)
    primary_commit_type: Optional[CommitType] = None
    commit_type_confidence: float = 0.0
    change_summary: str = ""
    affected_areas: Set[str] = field(default_factory=set)
    has_breaking_changes: bool = False
    is_merge_commit: bool = False
    total_files: int = 0
    
    def __post_init__(self):
        self.total_files = len(self.files)


class GitError(Exception):
    """Raised when git operations fail"""
    pass


class FileDetector:
    """
    File detection system with intelligent change analysis for commit type determination
    
    Features:
    - Uses git status to identify modified files
    - Respects .gitignore patterns
    - Handles empty repositories gracefully
    - Maps file types to appropriate commit types
    - Provides confidence scores for recommendations
    """
    
    def __init__(self, repo_path: Optional[str] = None):
        """
        Initialize FileDetector
        
        Args:
            repo_path: Optional path to git repository. Defaults to current directory.
        """
        self.repo_path = Path(repo_path) if repo_path else Path.cwd()
        self._git_root: Optional[Path] = None
        self._gitignore_patterns: Set[str] = set()
        
        # File type mappings for commit type detection
        self._file_type_mappings = {
            # Frontend files
            '.js': {'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]},
            '.jsx': {'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]},
            '.ts': {'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]},
            '.tsx': {'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]},
            '.css': {'area': 'frontend', 'types': [CommitType.STYLE, CommitType.FEAT]},
            '.scss': {'area': 'frontend', 'types': [CommitType.STYLE, CommitType.FEAT]},
            '.html': {'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]},
            
            # Backend files
            '.py': {'area': 'backend', 'types': [CommitType.FEAT, CommitType.FIX]},
            '.sql': {'area': 'backend', 'types': [CommitType.FEAT, CommitType.FIX]},
            
            # Documentation
            '.md': {'area': 'docs', 'types': [CommitType.DOCS]},
            '.rst': {'area': 'docs', 'types': [CommitType.DOCS]},
            '.txt': {'area': 'docs', 'types': [CommitType.DOCS]},
            
            # Tests
            '.test.js': {'area': 'test', 'types': [CommitType.TEST]},
            '.test.ts': {'area': 'test', 'types': [CommitType.TEST]},
            '.spec.js': {'area': 'test', 'types': [CommitType.TEST]},
            '.spec.ts': {'area': 'test', 'types': [CommitType.TEST]},
            
            # Configuration
            '.json': {'area': 'config', 'types': [CommitType.CHORE, CommitType.BUILD]},
            '.yaml': {'area': 'config', 'types': [CommitType.CI, CommitType.BUILD]},
            '.yml': {'area': 'config', 'types': [CommitType.CI, CommitType.BUILD]},
            '.toml': {'area': 'config', 'types': [CommitType.BUILD, CommitType.CHORE]},
            '.ini': {'area': 'config', 'types': [CommitType.BUILD, CommitType.CHORE]},
            
            # Build files
            'package.json': {'area': 'build', 'types': [CommitType.BUILD]},
            'package-lock.json': {'area': 'build', 'types': [CommitType.BUILD]},
            'requirements.txt': {'area': 'build', 'types': [CommitType.BUILD]},
            'Dockerfile': {'area': 'build', 'types': [CommitType.BUILD]},
            'docker-compose.yml': {'area': 'build', 'types': [CommitType.BUILD]},
        }
        
        # Path-based patterns for enhanced detection
        self._path_patterns = {
            # Test directories
            ('test/', 'tests/', '__tests__/', 'spec/'): {
                'area': 'test', 'types': [CommitType.TEST]
            },
            
            # Documentation directories
            ('docs/', 'doc/', 'documentation/'): {
                'area': 'docs', 'types': [CommitType.DOCS]
            },
            
            # CI/CD directories
            ('.github/', '.gitlab/', '.ci/', 'ci/'): {
                'area': 'ci', 'types': [CommitType.CI]
            },
            
            # Frontend directories
            ('frontend/', 'src/', 'app/', 'components/', 'pages/'): {
                'area': 'frontend', 'types': [CommitType.FEAT, CommitType.FIX]
            },
            
            # Backend directories
            ('backend/', 'api/', 'server/', 'services/'): {
                'area': 'backend', 'types': [CommitType.FEAT, CommitType.FIX]
            },
            
            # Configuration directories
            ('config/', 'configs/', 'settings/'): {
                'area': 'config', 'types': [CommitType.CHORE, CommitType.BUILD]
            },
        }
        
        self._initialize()
    
    def _initialize(self):
        """Initialize the detector by finding git root and loading gitignore"""
        try:
            self._git_root = self._find_git_root()
            if self._git_root:
                self._load_gitignore_patterns()
        except Exception as e:
            logger.warning(f"Failed to initialize FileDetector: {str(e)}")
            self._git_root = None
    
    def _find_git_root(self) -> Optional[Path]:
        """Find the git repository root"""
        try:
            result = subprocess.run(
                ['git', 'rev-parse', '--show-toplevel'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                check=True,
                timeout=10
            )
            return Path(result.stdout.strip())
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # Not a git repository or git command failed
            return None
    
    def _load_gitignore_patterns(self):
        """Load .gitignore patterns for filtering"""
        if not self._git_root:
            return
            
        gitignore_path = self._git_root / '.gitignore'
        if gitignore_path.exists():
            try:
                with open(gitignore_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            self._gitignore_patterns.add(line)
            except Exception as e:
                logger.warning(f"Failed to read .gitignore: {str(e)}")
    
    def _run_git_command(self, args: List[str], timeout: int = 30) -> str:
        """
        Execute a git command with error handling
        
        Args:
            args: Git command arguments
            timeout: Command timeout in seconds
            
        Returns:
            Command output as string
            
        Raises:
            GitError: If git command fails
        """
        try:
            result = subprocess.run(
                ['git'] + args,
                cwd=self._git_root or self.repo_path,
                capture_output=True,
                text=True,
                check=True,
                timeout=timeout
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.strip() if e.stderr else "Unknown error"
            raise GitError(f"Git command failed: git {' '.join(args)}\nError: {stderr}")
        except subprocess.TimeoutExpired:
            raise GitError(f"Git command timed out: git {' '.join(args)}")
        except FileNotFoundError:
            raise GitError("Git command not found. Ensure git is installed and in PATH.")
    
    def is_git_repository(self) -> bool:
        """Check if the current directory is a git repository"""
        return self._git_root is not None
    
    def is_empty_repository(self) -> bool:
        """Check if the repository is empty (no commits)"""
        if not self.is_git_repository():
            return False
            
        try:
            self._run_git_command(['rev-parse', 'HEAD'])
            return False
        except GitError:
            # If HEAD doesn't exist, repository is empty
            return True
    
    def get_modified_files(self, include_untracked: bool = True, 
                          include_staged: bool = True) -> List[str]:
        """
        Get list of modified files using git status
        
        Args:
            include_untracked: Whether to include untracked files
            include_staged: Whether to include staged files
            
        Returns:
            List of file paths relative to git root
            
        Raises:
            GitError: If git operations fail
        """
        if not self.is_git_repository():
            raise GitError("Not a git repository")
        
        try:
            # Use git status --porcelain for machine-readable output
            output = self._run_git_command(['status', '--porcelain'])
            
            files = []
            for line in output.split('\n'):
                if not line.strip():
                    continue
                
                # Parse git status output format: XY filename
                status = line[:2]
                filepath = line[3:]  # Skip status and space
                
                # Handle renamed files (format: "old_name -> new_name")
                if ' -> ' in filepath:
                    filepath = filepath.split(' -> ')[1]
                
                # Filter based on parameters
                index_status = status[0]  # Status in index (staged)
                worktree_status = status[1]  # Status in worktree (unstaged)
                
                should_include = False
                
                if include_staged and index_status != ' ':
                    should_include = True
                
                if include_untracked and worktree_status == '?':
                    should_include = True
                
                if worktree_status != ' ' and worktree_status != '?':
                    should_include = True
                
                if should_include and not self._is_ignored(filepath):
                    files.append(filepath)
            
            return files
            
        except GitError:
            raise
        except Exception as e:
            raise GitError(f"Failed to get modified files: {str(e)}")
    
    def _is_ignored(self, filepath: str) -> bool:
        """
        Check if a file should be ignored based on .gitignore patterns
        
        Args:
            filepath: File path to check
            
        Returns:
            True if file should be ignored
        """
        if not self._gitignore_patterns:
            return False
        
        # Simple pattern matching - could be enhanced with more sophisticated logic
        for pattern in self._gitignore_patterns:
            if pattern.endswith('/'):
                # Directory pattern
                if filepath.startswith(pattern) or f"/{pattern}" in filepath:
                    return True
            elif '*' in pattern:
                # Wildcard pattern - basic implementation
                import fnmatch
                if fnmatch.fnmatch(filepath, pattern):
                    return True
            else:
                # Exact match or contains pattern
                if pattern in filepath or filepath.endswith(pattern):
                    return True
        
        return False
    
    def _determine_file_type(self, filepath: str) -> str:
        """
        Determine file type based on extension and path
        
        Args:
            filepath: Path to the file
            
        Returns:
            File type string
        """
        path = Path(filepath)
        
        # Check for specific filename patterns first
        filename = path.name.lower()
        
        # Test files have special patterns
        if any(pattern in filename for pattern in ['.test.', '.spec.', '_test.', '_spec.']):
            return 'test'
        
        # Check for specific filenames
        specific_files = {
            'package.json': 'build',
            'package-lock.json': 'build',
            'requirements.txt': 'build',
            'dockerfile': 'build',
            'docker-compose.yml': 'build',
            'docker-compose.yaml': 'build',
            '.gitignore': 'config',
            '.env': 'config',
            'readme.md': 'docs',
        }
        
        if filename in specific_files:
            return specific_files[filename]
        
        # Check file extension
        suffix = path.suffix.lower()
        if suffix in ['.test.js', '.test.ts', '.spec.js', '.spec.ts']:
            return 'test'
        
        extension_types = {
            '.js': 'frontend',
            '.jsx': 'frontend', 
            '.ts': 'frontend',
            '.tsx': 'frontend',
            '.css': 'frontend',
            '.scss': 'frontend',
            '.sass': 'frontend',
            '.html': 'frontend',
            '.vue': 'frontend',
            '.py': 'backend',
            '.sql': 'backend',
            '.md': 'docs',
            '.rst': 'docs',
            '.txt': 'docs',
            '.json': 'config',
            '.yaml': 'config',
            '.yml': 'config',
            '.toml': 'config',
            '.ini': 'config',
        }
        
        if suffix in extension_types:
            return extension_types[suffix]
        
        # Check path patterns
        filepath_lower = filepath.lower()
        for patterns, info in self._path_patterns.items():
            if any(pattern in filepath_lower for pattern in patterns):
                return info['area']
        
        return 'other'
    
    def _suggest_commit_type(self, file_change: FileChange) -> Tuple[CommitType, float]:
        """
        Suggest commit type for a file change with confidence score
        
        Args:
            file_change: File change to analyze
            
        Returns:
            Tuple of (suggested_commit_type, confidence_score)
        """
        filepath = file_change.path.lower()
        file_type = file_change.file_type
        status = file_change.status
        
        # High confidence suggestions based on file patterns
        if file_type == 'test':
            return CommitType.TEST, 0.9
        
        if file_type == 'docs':
            return CommitType.DOCS, 0.9
        
        if file_type == 'config' and any(config in filepath for config in ['ci', '.github', '.gitlab']):
            return CommitType.CI, 0.9
        
        if file_type == 'build':
            return CommitType.BUILD, 0.8
        
        # Medium confidence based on file type and status
        if status == 'D':  # Deleted file
            if file_type in ['frontend', 'backend']:
                return CommitType.REFACTOR, 0.7
            return CommitType.CHORE, 0.6
        
        if status in ['A', 'M']:  # Added or Modified
            if file_type == 'frontend':
                return CommitType.FEAT, 0.7
            if file_type == 'backend':
                return CommitType.FEAT, 0.7
        
        # Path-specific suggestions
        if 'fix' in filepath or 'bug' in filepath:
            return CommitType.FIX, 0.8
        
        if 'style' in filepath or 'format' in filepath:
            return CommitType.STYLE, 0.7
        
        if 'perf' in filepath or 'performance' in filepath:
            return CommitType.PERF, 0.8
        
        # Default suggestions based on file type
        type_defaults = {
            'frontend': (CommitType.FEAT, 0.5),
            'backend': (CommitType.FEAT, 0.5),
            'config': (CommitType.CHORE, 0.6),
            'other': (CommitType.CHORE, 0.3),
        }
        
        return type_defaults.get(file_type, (CommitType.CHORE, 0.3))
    
    def analyze_file_changes(self, files: Optional[List[str]] = None) -> ChangeAnalysis:
        """
        Analyze file changes and determine primary commit type
        
        Args:
            files: Optional list of files to analyze. If None, gets current modified files.
            
        Returns:
            ChangeAnalysis with recommendations
            
        Raises:
            GitError: If git operations fail
        """
        if not self.is_git_repository():
            # Handle non-git directories gracefully
            return ChangeAnalysis(
                change_summary="No git repository detected",
                primary_commit_type=CommitType.CHORE,
                commit_type_confidence=0.1
            )
        
        if files is None:
            try:
                files = self.get_modified_files()
            except GitError as e:
                logger.error(f"Failed to get modified files: {str(e)}")
                return ChangeAnalysis(
                    change_summary="Failed to detect file changes",
                    primary_commit_type=CommitType.CHORE,
                    commit_type_confidence=0.1
                )
        
        if not files:
            return ChangeAnalysis(
                change_summary="No file changes detected",
                primary_commit_type=CommitType.CHORE,
                commit_type_confidence=0.1
            )
        
        analysis = ChangeAnalysis()
        commit_type_votes: Dict[CommitType, float] = {}
        
        # Analyze each file
        for filepath in files:
            try:
                # Get file status
                status_output = self._run_git_command(['status', '--porcelain', filepath])
                status = status_output[:2] if status_output else 'M'
                
                file_type = self._determine_file_type(filepath)
                
                file_change = FileChange(
                    path=filepath,
                    status=status.strip(),
                    relative_path=filepath,
                    file_type=file_type
                )
                
                # Get commit type suggestion
                suggested_type, confidence = self._suggest_commit_type(file_change)
                file_change.commit_type_suggestion = suggested_type
                file_change.confidence = confidence
                
                analysis.files.append(file_change)
                analysis.affected_areas.add(file_type)
                
                # Vote for commit type (weighted by confidence)
                if suggested_type in commit_type_votes:
                    commit_type_votes[suggested_type] += confidence
                else:
                    commit_type_votes[suggested_type] = confidence
                
            except Exception as e:
                logger.warning(f"Failed to analyze file {filepath}: {str(e)}")
                # Add file with minimal info
                analysis.files.append(FileChange(
                    path=filepath,
                    status='M',
                    relative_path=filepath,
                    file_type='other',
                    commit_type_suggestion=CommitType.CHORE,
                    confidence=0.1
                ))
        
        # Determine primary commit type
        if commit_type_votes:
            primary_type = max(commit_type_votes.keys(), key=lambda k: commit_type_votes[k])
            total_confidence = sum(commit_type_votes.values())
            type_confidence = commit_type_votes[primary_type] / total_confidence
            
            analysis.primary_commit_type = primary_type
            analysis.commit_type_confidence = min(type_confidence, 1.0)
        else:
            analysis.primary_commit_type = CommitType.CHORE
            analysis.commit_type_confidence = 0.1
        
        # Generate change summary
        analysis.change_summary = self._generate_change_summary(analysis)
        
        # Check for breaking changes (heuristic)
        analysis.has_breaking_changes = self._detect_breaking_changes(analysis)
        
        return analysis
    
    def _generate_change_summary(self, analysis: ChangeAnalysis) -> str:
        """Generate a human-readable summary of changes"""
        if not analysis.files:
            return "No changes detected"
        
        areas = list(analysis.affected_areas)
        file_count = len(analysis.files)
        
        if file_count == 1:
            file = analysis.files[0]
            return f"Modified {file.file_type} file: {Path(file.path).name}"
        
        if len(areas) == 1:
            area = areas[0]
            return f"Modified {file_count} {area} files"
        
        area_summary = ", ".join(areas[:3])
        if len(areas) > 3:
            area_summary += f" and {len(areas) - 3} other areas"
        
        return f"Modified {file_count} files across {area_summary}"
    
    def _detect_breaking_changes(self, analysis: ChangeAnalysis) -> bool:
        """Detect potential breaking changes (basic heuristic)"""
        breaking_indicators = [
            'breaking', 'major', 'remove', 'delete', 'deprecate'
        ]
        
        for file_change in analysis.files:
            filepath_lower = file_change.path.lower()
            if any(indicator in filepath_lower for indicator in breaking_indicators):
                return True
            
            # Deleted files in core areas might be breaking
            if file_change.status == 'D' and file_change.file_type in ['frontend', 'backend']:
                return True
        
        return False
    
    def get_repository_info(self) -> Dict[str, Any]:
        """
        Get general repository information
        
        Returns:
            Dictionary with repository details
        """
        info = {
            'is_git_repo': self.is_git_repository(),
            'is_empty': False,
            'git_root': str(self._git_root) if self._git_root else None,
            'current_branch': None,
            'has_uncommitted_changes': False,
            'total_files': 0
        }
        
        if not info['is_git_repo']:
            return info
        
        try:
            info['is_empty'] = self.is_empty_repository()
            
            if not info['is_empty']:
                # Get current branch
                try:
                    branch = self._run_git_command(['branch', '--show-current'])
                    info['current_branch'] = branch
                except GitError:
                    info['current_branch'] = 'unknown'
                
                # Check for uncommitted changes
                try:
                    status = self._run_git_command(['status', '--porcelain'])
                    info['has_uncommitted_changes'] = bool(status.strip())
                    info['total_files'] = len(status.strip().split('\n')) if status.strip() else 0
                except GitError:
                    info['has_uncommitted_changes'] = False
        
        except Exception as e:
            logger.warning(f"Failed to get repository info: {str(e)}")
        
        return info


def create_file_detector(repo_path: Optional[str] = None) -> FileDetector:
    """
    Factory function to create FileDetector instance
    
    Args:
        repo_path: Optional path to git repository
        
    Returns:
        FileDetector instance
    """
    return FileDetector(repo_path)


# Example usage and testing
if __name__ == "__main__":
    import json
    
    # Example usage
    detector = FileDetector()
    
    print("Repository Info:")
    repo_info = detector.get_repository_info()
    print(json.dumps(repo_info, indent=2))
    
    if repo_info['is_git_repo'] and not repo_info['is_empty']:
        print("\nAnalyzing file changes...")
        try:
            analysis = detector.analyze_file_changes()
            
            print(f"Summary: {analysis.change_summary}")
            print(f"Primary commit type: {analysis.primary_commit_type.value if analysis.primary_commit_type else 'none'}")
            print(f"Confidence: {analysis.commit_type_confidence:.2f}")
            print(f"Affected areas: {', '.join(analysis.affected_areas)}")
            print(f"Total files: {analysis.total_files}")
            
            if analysis.files:
                print("\nFile details:")
                for file_change in analysis.files[:5]:  # Show first 5 files
                    print(f"  {file_change.path} ({file_change.file_type}) -> "
                          f"{file_change.commit_type_suggestion.value if file_change.commit_type_suggestion else 'unknown'}")
                
                if len(analysis.files) > 5:
                    print(f"  ... and {len(analysis.files) - 5} more files")
                    
        except Exception as e:
            print(f"Error analyzing changes: {str(e)}")
    
    else:
        print("No git repository or empty repository - skipping change analysis")