'use client';

import { useState } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  StatGrid,
  StatCard,
  Button,
  Badge
} from '@/lib/design-system';

interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'banner';
  status: 'Active' | 'Archived';
  linkedTo: string;
  previewUrl: string;
  dimensions: string;
  size: string;
}

const MOCK_ASSETS: Asset[] = [
  {
    id: '1',
    name: 'Summer Campaign Hero',
    type: 'image',
    status: 'Active',
    linkedTo: 'Summer Sale 2024',
    previewUrl: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=400',
    dimensions: '1920x1080',
    size: '2.4 MB'
  },
  {
    id: '2',
    name: 'Product Feature Reel',
    type: 'video',
    status: 'Active',
    linkedTo: 'Wireless Earbuds X1',
    previewUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400',
    dimensions: '1080x1920',
    size: '45.8 MB'
  },
  {
    id: '3',
    name: 'Flash Sale Banner',
    type: 'banner',
    status: 'Archived',
    linkedTo: 'Winter Clearance',
    previewUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&q=80&w=400',
    dimensions: '728x90',
    size: '450 KB'
  },
  {
    id: '4',
    name: 'Instagram Story Ad',
    type: 'image',
    status: 'Active',
    linkedTo: 'New Arrival: Autumn Collection',
    previewUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=400',
    dimensions: '1080x1920',
    size: '1.2 MB'
  },
  {
    id: '5',
    name: 'Meta Feed Promotion',
    type: 'image',
    status: 'Active',
    linkedTo: 'Brand Awareness Q3',
    previewUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400',
    dimensions: '1080x1080',
    size: '1.8 MB'
  },
  {
    id: '6',
    name: 'TikTok Influencer Edit',
    type: 'video',
    status: 'Active',
    linkedTo: 'TikTok Creator Program',
    previewUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&q=80&w=400',
    dimensions: '1080x1920',
    size: '12.4 MB'
  }
];

export default function CreativeLibraryClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(MOCK_ASSETS[0]);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAssets = MOCK_ASSETS.filter(asset =>
    asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    asset.linkedTo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Digital Asset Management"
          subtitle="Centralized hub for all your marketing creatives and AI-assisted content generation."
        />
        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={() => setShowAiAssistant(!showAiAssistant)}>
            <span className="mr-2">✨</span> AI Assistant
          </Button>
          <Button variant="primary">
            <span className="mr-2">📤</span> Upload Asset
          </Button>
        </div>
      </div>

      <StatGrid columns={4}>
        <StatCard label="Total Assets" value={MOCK_ASSETS.length.toString()} icon="🖼️" />
        <StatCard label="Storage Used" value="64.1 MB" icon="💾" />
        <StatCard label="Active Creatives" value={MOCK_ASSETS.filter(a => a.status === 'Active').length.toString()} icon="🎨" />
        <StatCard label="Platforms Reached" value="5" icon="🌐" />
      </StatGrid>

      {showAiAssistant && (
        <Card className="bg-blue-900/10 border-blue-800/30 animate-in fade-in slide-in-from-top-4">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-blue-400">AI Creative Assistant</CardTitle>
                <CardDescription>Generate copy, concepts, or variations for your campaigns.</CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setShowAiAssistant(false)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Campaign Goal</label>
                <select className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Brand Awareness</option>
                  <option>Conversion / Sales</option>
                  <option>Lead Generation</option>
                  <option>Retargeting</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Platform</label>
                <select className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Instagram / Meta</option>
                  <option>TikTok</option>
                  <option>Google Display</option>
                  <option>Email Marketing</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Product Description / Context</label>
              <textarea
                placeholder="E.g. A new line of eco-friendly yoga mats targeting urban professionals..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
              />
            </div>
            <Button variant="primary" className="w-full bg-blue-600 hover:bg-blue-500">
              Generate Creative Concepts
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left Side: Asset Grid */}
        <div className="col-span-8 space-y-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>Creative Assets</CardTitle>
                <div className="relative w-64">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                  <input
                    type="text"
                    placeholder="Search assets..."
                    className="w-full bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center p-6 bg-slate-900/30 hover:bg-slate-800/30 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition-transform">➕</div>
                  <p className="text-sm font-medium text-slate-400">Upload New</p>
                  <p className="text-[10px] text-slate-600 mt-1">Images, Video, SVG</p>
                </div>

                {filteredAssets.map(asset => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`group relative rounded-xl border p-2 transition-all cursor-pointer ${
                      selectedAsset?.id === asset.id
                        ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-800 mb-3 relative">
                      <img
                        src={asset.previewUrl}
                        alt={asset.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge variant={asset.status === 'Active' ? 'success' : 'info'}>
                          {asset.status}
                        </Badge>
                      </div>
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] font-mono text-white">
                        {asset.type.toUpperCase()}
                      </div>
                    </div>
                    <h4 className="text-sm font-bold text-white truncate">{asset.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-1 truncate">Linked: {asset.linkedTo}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Details & Adaptation */}
        <div className="col-span-4 space-y-6">
          {selectedAsset ? (
            <>
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle>Asset Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="aspect-video rounded-lg overflow-hidden bg-slate-800">
                    <img src={selectedAsset.previewUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Dimensions</p>
                      <p className="text-sm font-medium text-white">{selectedAsset.dimensions}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Size</p>
                      <p className="text-sm font-medium text-white">{selectedAsset.size}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Status</p>
                      <Badge variant={selectedAsset.status === 'Active' ? 'success' : 'info'}>{selectedAsset.status}</Badge>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Type</p>
                      <p className="text-sm font-medium text-white capitalize">{selectedAsset.type}</p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Linked Campaign</p>
                    <p className="text-sm font-medium text-blue-400">{selectedAsset.linkedTo}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" className="flex-1 text-xs py-2">Download</Button>
                    <Button variant="danger" className="flex-1 text-xs py-2">Archive</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <span className="mr-2">📱</span> Platform Adaptation
                  </CardTitle>
                  <CardDescription>Preview how this asset adapts to different channels.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📘</span>
                        <span className="text-xs font-bold text-white">Meta Feed</span>
                      </div>
                      <Badge variant="success" className="text-[10px]">Optimized</Badge>
                    </div>
                    <div className="aspect-square bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center p-4">
                       <div className="w-full h-full rounded border border-slate-600 bg-slate-900 flex flex-col p-2 space-y-2">
                          <div className="flex items-center gap-2">
                             <div className="w-4 h-4 rounded-full bg-blue-600"></div>
                             <div className="h-2 w-16 bg-slate-700 rounded"></div>
                          </div>
                          <div className="flex-1 rounded bg-slate-800 overflow-hidden">
                             <img src={selectedAsset.previewUrl} alt="" className="w-full h-full object-cover opacity-50" />
                          </div>
                          <div className="h-2 w-full bg-slate-700 rounded"></div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📸</span>
                        <span className="text-xs font-bold text-white">Instagram Story</span>
                      </div>
                      <Badge variant="warning" className="text-[10px]">Resize Needed</Badge>
                    </div>
                    <div className="aspect-[9/16] h-48 mx-auto bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center p-2">
                       <div className="w-full h-full rounded bg-slate-900 overflow-hidden relative border border-slate-600">
                          <img src={selectedAsset.previewUrl} alt="" className="w-full h-full object-cover opacity-30" />
                          <div className="absolute inset-0 flex items-center justify-center">
                             <Button variant="ghost" className="text-[10px] bg-black/50 hover:bg-black/80">Auto-Resize</Button>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎵</span>
                        <span className="text-xs font-bold text-white">TikTok Reel</span>
                      </div>
                      <Badge variant="danger" className="text-[10px]">Needs Audio</Badge>
                    </div>
                    <Button variant="secondary" className="w-full text-xs py-2 bg-slate-800 border-slate-700">
                       Open in TikTok Editor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-slate-900/50 border-slate-800 h-[600px] flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-3xl mb-4 opacity-50">🖼️</div>
              <h3 className="text-lg font-bold text-white">No Asset Selected</h3>
              <p className="text-sm text-slate-500 mt-2">Select an asset from the grid to view details and platform adaptations.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
