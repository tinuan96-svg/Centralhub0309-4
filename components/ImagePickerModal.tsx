'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveProductImageUrl } from '@/lib/utils/imageUrl';

const BUCKET = 'product-images';

function normalizeToFullUrl(url: string): string {
  return resolveProductImageUrl(url) ?? url;
}

interface SingleMode {
  multiple?: false;
  currentUrl: string | null;
  onSelect: (url: string) => void;
  onClose: () => void;
}

interface MultiMode {
  multiple: true;
  currentUrls: string[];
  onSelect: (urls: string[]) => void;
  onClose: () => void;
}

type ImagePickerModalProps = SingleMode | MultiMode;

interface StorageFile {
  name: string;
  url: string;
}

export default function ImagePickerModal(props: ImagePickerModalProps) {
  const isMulti = props.multiple === true;

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single mode state — normalize raw stored URL to full URL for matching
  const [selected, setSelected] = useState<string>(
    !isMulti ? normalizeToFullUrl((props as SingleMode).currentUrl || '') : ''
  );
  // Multi mode state — normalize raw stored URLs to full URLs for matching
  const [selectedMulti, setSelectedMulti] = useState<string[]>(
    isMulti ? (props as MultiMode).currentUrls.map(normalizeToFullUrl) : []
  );

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);

    const { data: { publicUrl: base } } = supabase.storage.from(BUCKET).getPublicUrl('');
    const baseUrl = base.replace(/\/$/, '');

    const listFolder = async (prefix: string): Promise<StorageFile[]> => {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error || !data) return [];
      return data
        .filter((f) => f.name !== '.emptyFolderPlaceholder' && /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f.name))
        .map((f) => ({
          name: f.name,
          url: prefix ? `${baseUrl}/${prefix}/${f.name}` : `${baseUrl}/${f.name}`,
        }));
    };

    const [rootFiles, uploadsFiles] = await Promise.all([
      listFolder(''),
      listFolder('uploads'),
    ]);

    // Deduplicate by url, uploads first (newest)
    const seen = new Set<string>();
    const all: StorageFile[] = [];
    for (const f of [...uploadsFiles, ...rootFiles]) {
      if (!seen.has(f.url)) {
        seen.add(f.url);
        all.push(f);
      }
    }

    setFiles(all);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = Array.from(e.target.files || []);
    if (!filesToUpload.length) return;

    setUploading(true);

    for (const file of filesToUpload) {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

      if (isMulti) {
        setSelectedMulti((prev) => [...prev, publicUrl]);
      } else {
        setSelected(publicUrl);
      }
    }

    await loadImages();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleMulti = (url: string) => {
    setSelectedMulti((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleConfirm = () => {
    if (isMulti) {
      (props as MultiMode).onSelect(selectedMulti);
    } else {
      if (selected) (props as SingleMode).onSelect(selected);
    }
    props.onClose();
  };

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = isMulti ? selectedMulti.length : (selected ? 1 : 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={props.onClose} />

      <div className="relative bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D]">
          <div>
            <h2 className="text-base font-semibold text-white">
              {isMulti ? 'Select Images' : 'Select Image'}
            </h2>
            {isMulti && (
              <p className="text-xs text-slate-400 mt-0.5">Click to select multiple — first selected becomes primary</p>
            )}
          </div>
          <button onClick={props.onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-[#30363D] bg-[#0D1117]">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search images..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            uploading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-cyan-600 text-white hover:bg-cyan-700'
          }`}>
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload {isMulti ? 'Images' : 'New'}
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={isMulti}
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>

        {/* Multi-select selected strip */}
        {isMulti && selectedMulti.length > 0 && (
          <div className="px-6 py-3 border-b border-[#30363D] bg-cyan-950/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-cyan-400">{selectedMulti.length} selected</span>
              <button
                onClick={() => setSelectedMulti([])}
                className="text-xs text-slate-400 hover:text-rose-400 transition-colors ml-auto"
              >
                Clear all
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {selectedMulti.map((url, idx) => (
                <div key={url} className="relative flex-shrink-0 group">
                  <img
                    src={url}
                    alt={`Selected ${idx + 1}`}
                    className="w-14 h-14 object-cover rounded-lg border-2 border-cyan-500/60"
                  />
                  {idx === 0 && (
                    <span className="absolute top-0 left-0 bg-cyan-500 text-white text-[9px] font-bold px-1 rounded-tl-lg rounded-br-lg">
                      Primary
                    </span>
                  )}
                  <button
                    onClick={() => toggleMulti(url)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single-mode current preview */}
        {!isMulti && selected && (
          <div className="px-6 py-3 border-b border-[#30363D] bg-cyan-950/20 flex items-center gap-3">
            <img src={selected} alt="Selected" className="w-12 h-12 object-cover rounded-lg border border-cyan-500/40" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-cyan-400 mb-0.5">Selected</p>
              <p className="text-xs text-slate-400 truncate">{selected.split('/').pop()}</p>
            </div>
            <button onClick={() => setSelected('')} className="text-slate-400 hover:text-rose-400 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <svg className="w-8 h-8 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">{search ? 'No images match your search' : 'No images in bucket yet. Upload one above.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {filtered.map((file) => {
                const isSelectedSingle = !isMulti && selected === file.url;
                const multiIdx = isMulti ? selectedMulti.indexOf(file.url) : -1;
                const isSelectedMulti = multiIdx !== -1;
                const isActive = isMulti ? isSelectedMulti : isSelectedSingle;

                return (
                  <button
                    key={file.name}
                    onClick={() => {
                      if (isMulti) {
                        toggleMulti(file.url);
                      } else {
                        setSelected(file.url);
                      }
                    }}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-150 hover:scale-105 focus:outline-none ${
                      isActive
                        ? 'border-cyan-500 ring-2 ring-cyan-400/40 shadow-md'
                        : 'border-transparent hover:border-slate-600'
                    }`}
                    title={file.name}
                  >
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isActive && (
                      <div className="absolute inset-0 bg-cyan-500/20 flex items-center justify-center">
                        {isMulti ? (
                          <div className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center shadow text-white text-xs font-bold">
                            {multiIdx + 1}
                          </div>
                        ) : (
                          <div className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center shadow">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}
                    {isMulti && multiIdx === 0 && (
                      <div className="absolute top-0 left-0 bg-cyan-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-br-lg">
                        1st
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#30363D] flex items-center justify-between bg-[#0D1117]">
          <p className="text-sm text-slate-400">
            {filtered.length} image{filtered.length !== 1 ? 's' : ''}
            {selectedCount > 0 && (
              <span className="ml-2 text-cyan-400 font-medium">· {selectedCount} selected</span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={props.onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isMulti
                ? selectedCount > 0 ? `Use ${selectedCount} Image${selectedCount !== 1 ? 's' : ''}` : 'Select Images'
                : 'Use Selected Image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
