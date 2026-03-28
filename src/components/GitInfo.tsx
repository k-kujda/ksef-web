import { useEffect, useState } from 'react';
import { GitCommit } from 'lucide-react';

interface GitCommitInfo {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export default function GitInfo() {
  const [commitInfo, setCommitInfo] = useState<GitCommitInfo | null>(null);

  useEffect(() => {
    // In production (GitHub Pages), we'll embed this at build time
    // For now, showing build-time info
    const buildInfo = {
      hash: '__GIT_HASH__',
      author: '__GIT_AUTHOR__',
      message: '__GIT_MESSAGE__',
      date: '__GIT_DATE__',
    };
    
    setCommitInfo(buildInfo);
  }, []);

  if (!commitInfo) return null;

  const isNotKKujda = commitInfo.author !== 'k-kujda' && 
                      !commitInfo.author.includes('__GIT_');
  
  return (
    <div className={`fixed bottom-4 right-4 px-3 py-2 rounded-lg shadow-lg text-xs ${
      isNotKKujda ? 'bg-red-100 border-2 border-red-500' : 'bg-gray-100 border border-gray-300'
    }`}>
      <div className="flex items-center gap-2">
        <GitCommit className={`w-3 h-3 ${isNotKKujda ? 'text-red-600' : 'text-gray-600'}`} />
        <div>
          <div className={`font-mono ${isNotKKujda ? 'text-red-800 font-bold' : 'text-gray-700'}`}>
            {commitInfo.hash.substring(0, 7)}
          </div>
          <div className={`${isNotKKujda ? 'text-red-700' : 'text-gray-600'}`}>
            {commitInfo.author}
          </div>
        </div>
      </div>
    </div>
  );
}
