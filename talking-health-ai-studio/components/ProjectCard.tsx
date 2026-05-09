
import React from 'react';
import { Project } from '../types';

interface ProjectCardProps {
  project: Project;
  onDelete: (id: string) => void;
  onSelect: (project: Project) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDelete, onSelect }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-3">
          <div className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider">
            {/* Fix: Accessing project.mode instead of non-existent project.tags */}
            {project.mode}
          </div>
          <button 
            onClick={() => onDelete(project.id)}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1 truncate">{project.name}</h3>
        <p className="text-sm text-slate-500 line-clamp-2 mb-4">
          {/* Fix: Removed non-existent property description and replaced with language info */}
          Language: {project.lang}
        </p>
      </div>
      
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-400 italic">
          Last modified: {new Date(project.lastModified).toLocaleDateString()}
        </span>
        <button 
          onClick={() => onSelect(project)}
          className="text-blue-600 font-medium text-sm hover:underline flex items-center gap-1"
        >
          View Details <i className="fas fa-chevron-right text-[10px]"></i>
        </button>
      </div>
    </div>
  );
};
