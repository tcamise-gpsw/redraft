import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { DocumentNode } from '../../types/documents';

export function TreeNode({
  node,
  reviewPaths,
}: {
  node: DocumentNode;
  reviewPaths: Set<string>;
}) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);

  if (node.type === 'directory') {
    return (
      <li className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          <svg
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-150${expanded ? ' rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-amber-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span data-testid="document-tree-label">{node.name}</span>
        </button>
        {expanded && node.children?.length ? (
          <ul className="space-y-1 border-l border-slate-800 pl-3">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                reviewPaths={reviewPaths}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const routePath = `/d/${node.path}`;
  const active = location.pathname === routePath;

  return (
    <li>
      <Link
        to={routePath}
        title={node.path}
        className={[
          'flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-slate-100',
          active ? 'bg-cyan-500/10 text-cyan-200' : '',
        ].join(' ')}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-sky-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            clipRule="evenodd"
          />
        </svg>
        <span data-testid="document-tree-label">{node.name}</span>
        {reviewPaths.has(node.path) ? (
          <span className="text-cyan-300" title="Under review">
            •
          </span>
        ) : null}
      </Link>
    </li>
  );
}
