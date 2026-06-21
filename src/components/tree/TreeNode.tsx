import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { ProposalNode } from '../../types/proposals';

export function TreeNode({ node }: { node: ProposalNode }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'directory') {
    return (
      <li className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span data-testid="proposal-tree-label">{node.name}</span>
        </button>
        {expanded && node.children?.length ? (
          <ul className="space-y-1 border-l border-slate-800 pl-3">
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const routePath = `/proposals/${node.path.replace(/^proposals\//, '')}`;
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
        <span aria-hidden="true">•</span>
        <span data-testid="proposal-tree-label">{node.name}</span>
      </Link>
    </li>
  );
}
