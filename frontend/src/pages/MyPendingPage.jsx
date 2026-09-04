// frontend/src/pages/MyPendingPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery }    from '@tanstack/react-query';
import { format }      from 'date-fns';
import { Clock, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { qk } from '../services/queryKeys';

export default function MyPendingPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: qk.myPending(),
    queryFn:  () => api.get('/documents/my-pending').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const items = data || [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Waiting for My Approval</h2>
        <p className="text-sm text-gray-500">Assigned document list</p>
      </div>

      {isLoading && <div className="text-center py-10 text-gray-400">Loading...</div>}

      {!isLoading && items.length === 0 && (
        <div className="card p-12 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No document waiting for approval</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map(a => (
          <div key={a.id} className="card p-5 flex items-center gap-5 hover:shadow-md transition-shadow">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-yellow-500 shrink-0" />
                <p className="font-semibold text-gray-900 truncate">{a.document.labelName}</p>
              </div>
              <p className="text-xs font-mono text-gray-500 mt-0.5">{a.document.regulatoryId}</p>
              <p className="text-xs text-gray-400 mt-1">
                {a.document.productCategory?.group?.name} · {a.document.productCategory?.name}
              </p>
              <p className="text-xs text-gray-400">
                Uploaded by {a.document.uploader?.name} · Level {a.level}
              </p>
              {a.createdAt && (
                <p className="text-xs text-gray-400">
                  Assigned: {format(new Date(a.createdAt), 'dd MMM yyyy HH:mm')}
                </p>
              )}
            </div>
            <button
              onClick={() => navigate(`/approvals/${a.id}`)}
              className="btn-primary shrink-0"
            >
              <CheckCircle size={16} /> Review
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
